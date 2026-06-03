import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildCaptionRoute, resetCaptionRateLimitForTest, MAX_FRAMES } from './caption.js';
import type { CaptionClient } from '../lib/caption-client.js';
import { CaptionDegradedError } from '../lib/caption-client.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';

const stubJwt: JwtSigner = {
  async signSession() {
    return 'valid';
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token === 'valid') return { sub: WALLET } as SessionClaims;
    if (token === 'badsub') return { sub: 'not-an-address' } as SessionClaims;
    throw new Error('invalid');
  },
};

function fakeCaption(over: Partial<CaptionClient> = {}): CaptionClient {
  return {
    configured: true,
    caption: vi.fn(async () => 'low-poly red pickup truck'),
    ...over,
  };
}
function auth(token = 'valid') {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
const frame = (b = 'b64') => ({ base64: b, mediaType: 'image/webp' as const });
const post = (route: ReturnType<typeof buildCaptionRoute>, body: unknown, headers: Record<string, string> = auth()) =>
  route.request('/', { method: 'POST', headers, body: JSON.stringify(body) });

beforeEach(() => {
  resetCaptionRateLimitForTest();
  vi.restoreAllMocks();
});

describe('POST /api/caption — auth & validation', () => {
  it('401 without a token', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await post(route, { frames: [frame()] }, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('401 on an invalid token (hard-fail, never degraded-200)', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await post(route, { frames: [frame()] }, auth('nope'));
    expect(res.status).toBe(401);
  });

  it('401 when the token subject is not an address', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await post(route, { frames: [frame()] }, auth('badsub'));
    expect(res.status).toBe(401);
  });

  it('400 with zero frames', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await post(route, { frames: [] });
    expect(res.status).toBe(400);
  });

  it('400 with more than MAX_FRAMES frames', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await post(route, { frames: Array.from({ length: MAX_FRAMES + 1 }, () => frame()) });
    expect(res.status).toBe(400);
  });

  it('400 when a frame is not image/webp', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await post(route, { frames: [{ base64: 'x', mediaType: 'image/png' }] });
    expect(res.status).toBe(400);
  });

  it('rejects a text hint — schema accepts frames only, no caption reaches the client from extra fields (AE5, R6)', async () => {
    const client = fakeCaption();
    const route = buildCaptionRoute({ jwt: stubJwt, client });
    const res = await post(route, { frames: [frame()], hint: 'a red car', filename: 'car.glb' });
    // extra keys are stripped by the schema; the client only ever sees frames.
    expect(res.status).toBe(200);
    expect(client.caption).toHaveBeenCalledWith({ frames: [frame()] });
  });

  it('400 on a malformed JSON body', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await route.request('/', { method: 'POST', headers: auth(), body: '{not json' });
    expect(res.status).toBe(400);
  });

  it('413 when the body exceeds the size limit BEFORE buffering/parsing (OOM guard)', async () => {
    const client = fakeCaption();
    const route = buildCaptionRoute({ jwt: stubJwt, client });
    // > 3 MB body — rejected by bodyLimit middleware before the handler/zod runs.
    const big = 'x'.repeat(3 * 1024 * 1024 + 1024);
    const res = await post(route, { frames: [{ base64: big, mediaType: 'image/webp' }] });
    expect(res.status).toBe(413);
    expect(client.caption).not.toHaveBeenCalled();
  });
});

describe('POST /api/caption — behavior', () => {
  it('returns the caption for valid frames', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    const res = await post(route, { frames: [frame('a'), frame('b')] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, caption: 'low-poly red pickup truck' });
  });

  it('returns available:false (clean) when the client is INERT — no leak (AE7)', async () => {
    const client = fakeCaption({ configured: false });
    const route = buildCaptionRoute({ jwt: stubJwt, client });
    const res = await post(route, { frames: [frame()] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
    expect(res.headers.get('x-caption-degraded')).toBe('1');
    expect(client.caption).not.toHaveBeenCalled();
  });

  it('a configured-but-failed call is TRANSIENT (retryable), not "off" — never 5xx, never leaks (AE6)', async () => {
    const client = fakeCaption({
      caption: vi.fn(async () => {
        throw new CaptionDegradedError('gemini exploded with SECRET');
      }),
    });
    const route = buildCaptionRoute({ jwt: stubJwt, client });
    const res = await post(route, { frames: [frame()] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ available: true, error: 'unavailable', retryable: true });
    expect(JSON.stringify(json)).not.toContain('SECRET');
    expect(res.headers.get('x-caption-degraded')).toBe('1');
  });

  it('429 after exceeding the per-address window', async () => {
    const route = buildCaptionRoute({ jwt: stubJwt, client: fakeCaption() });
    let last = 200;
    for (let i = 0; i < 35; i++) {
      const res = await post(route, { frames: [frame()] });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
