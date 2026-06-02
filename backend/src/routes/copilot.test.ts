import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodeMemory } from '@overflow2026/shared';
import { buildCopilotRoute, resetCopilotRateLimitForTest } from './copilot.js';
import type { CopilotClient } from '../lib/copilot-client.js';
import { CopilotDegradedError } from '../lib/copilot-client.js';
import type { MemwalClient } from '../lib/memwal-client.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';
const MODEL = '0x00000000000000000000000000000000000000000000000000000000000000a5';

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

function fakeCopilot(over: Partial<CopilotClient> = {}): CopilotClient {
  return {
    configured: true,
    turn: vi.fn(async () => ({ kind: 'question', text: 'What color?' })),
    ...over,
  };
}
function fakeMemory(over: Partial<MemwalClient> = {}): MemwalClient {
  return {
    configured: true,
    remember: vi.fn(async () => {}),
    recall: vi.fn(async () => ({ results: [], errored: false })),
    ...over,
  };
}
function auth(token = 'valid') {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
const post = (route: ReturnType<typeof buildCopilotRoute>, body: unknown, headers = auth()) =>
  route.request('/turn', { method: 'POST', headers, body: JSON.stringify(body) });

beforeEach(() => {
  resetCopilotRateLimitForTest();
  vi.restoreAllMocks();
});

describe('POST /turn — auth & validation', () => {
  it('401 without a token', async () => {
    const route = buildCopilotRoute({ jwt: stubJwt, client: fakeCopilot(), memory: fakeMemory() });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] }, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('401 on an invalid token (hard-fail, never degraded-200)', async () => {
    const route = buildCopilotRoute({ jwt: stubJwt, client: fakeCopilot(), memory: fakeMemory() });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] }, auth('nope'));
    expect(res.status).toBe(401);
  });

  it('401 when the token subject is not an address', async () => {
    const route = buildCopilotRoute({ jwt: stubJwt, client: fakeCopilot(), memory: fakeMemory() });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] }, auth('badsub'));
    expect(res.status).toBe(401);
  });

  it('400 on a malformed body', async () => {
    const route = buildCopilotRoute({ jwt: stubJwt, client: fakeCopilot(), memory: fakeMemory() });
    const res = await post(route, { messages: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST /turn — behavior', () => {
  it('returns a question on an early turn and recalls the caller’s own namespace', async () => {
    const memory = fakeMemory();
    const client = fakeCopilot();
    const route = buildCopilotRoute({ jwt: stubJwt, client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a spaceship' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, result: { kind: 'question', text: 'What color?' }, turnIndex: 0 });
    expect(memory.recall).toHaveBeenCalledWith(WALLET, 'a spaceship', { limit: 5 });
  });

  it('derives turnIndex from assistant-message count (server-enforced cap, AE2)', async () => {
    const client = fakeCopilot({ turn: vi.fn(async () => ({ kind: 'prompt', text: 'low-poly ship' })) });
    const route = buildCopilotRoute({ jwt: stubJwt, client, memory: fakeMemory() });
    const messages = [
      { role: 'user', content: 'a ship' },
      { role: 'assistant', content: 'color?' },
      { role: 'user', content: 'red' },
      { role: 'assistant', content: 'size?' },
      { role: 'user', content: 'big' },
    ];
    await post(route, { messages });
    expect(client.turn).toHaveBeenCalledWith(expect.objectContaining({ turnIndex: 2 }));
  });

  it('passes forceSynthesize through (AE1)', async () => {
    const client = fakeCopilot({ turn: vi.fn(async () => ({ kind: 'prompt', text: 'p' })) });
    const route = buildCopilotRoute({ jwt: stubJwt, client, memory: fakeMemory() });
    await post(route, { messages: [{ role: 'user', content: 'a ship' }], forceSynthesize: true });
    expect(client.turn).toHaveBeenCalledWith(expect.objectContaining({ forceSynthesize: true }));
  });

  it('folds recalled prompts (parsed) into the copilot memory context (R6)', async () => {
    const memory = fakeMemory({
      recall: vi.fn(async () => ({
        results: [
          { blob_id: 'b1', text: encodeMemory('low-poly red sports car', { m: MODEL }), distance: 0.4 },
          { blob_id: 'b2', text: encodeMemory('off-road truck', { m: MODEL }), distance: 0.5 },
        ],
        errored: false,
      })),
    });
    const client = fakeCopilot();
    const route = buildCopilotRoute({ jwt: stubJwt, client, memory });
    await post(route, { messages: [{ role: 'user', content: 'a vehicle' }] });
    expect(client.turn).toHaveBeenCalledWith(
      expect.objectContaining({ memoryContext: ['low-poly red sports car', 'off-road truck'] }),
    );
  });

  it('is fail-soft when recall fails — still drives the copilot with empty context (R10)', async () => {
    const memory = fakeMemory({ recall: vi.fn(async () => ({ results: [], errored: true })) });
    const client = fakeCopilot();
    const route = buildCopilotRoute({ jwt: stubJwt, client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    expect(client.turn).toHaveBeenCalledWith(expect.objectContaining({ memoryContext: [] }));
  });

  it('returns available:false (clean) when the copilot is INERT — no recall, no leak', async () => {
    const memory = fakeMemory();
    const client = fakeCopilot({ configured: false });
    const route = buildCopilotRoute({ jwt: stubJwt, client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
    expect(res.headers.get('x-copilot-degraded')).toBe('1');
    expect(memory.recall).not.toHaveBeenCalled();
  });

  it('returns available:false when the copilot throws degraded (AE7) — never 5xx, never leaks', async () => {
    const client = fakeCopilot({
      turn: vi.fn(async () => {
        throw new CopilotDegradedError('gemini exploded with SECRET');
      }),
    });
    const route = buildCopilotRoute({ jwt: stubJwt, client, memory: fakeMemory() });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ available: false });
    expect(JSON.stringify(json)).not.toContain('SECRET');
    expect(res.headers.get('x-copilot-degraded')).toBe('1');
  });

  it('ignores a client-supplied namespace; recalls the JWT address only', async () => {
    const memory = fakeMemory();
    const route = buildCopilotRoute({ jwt: stubJwt, client: fakeCopilot(), memory });
    // @ts-expect-error namespace is not in the schema; it must be ignored regardless
    await post(route, { messages: [{ role: 'user', content: 'a car' }], namespace: '0xEVIL' });
    expect(memory.recall).toHaveBeenCalledWith(WALLET, 'a car', { limit: 5 });
  });

  it('429 after exceeding the per-address window', async () => {
    const route = buildCopilotRoute({ jwt: stubJwt, client: fakeCopilot(), memory: fakeMemory() });
    let last = 200;
    for (let i = 0; i < 35; i++) {
      const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
