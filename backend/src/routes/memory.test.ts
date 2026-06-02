import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodeMemory } from '@overflow2026/shared';
import { buildMemoryRoute, resetMemoryRateLimitForTest } from './memory.js';
import type { MemwalClient } from '../lib/memwal-client.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';
const MODEL = '0x00000000000000000000000000000000000000000000000000000000000000a5';

// token 'valid' → bound to WALLET; 'badsub' → a malformed subject; else throws.
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

function fakeClient(over: Partial<MemwalClient> = {}): MemwalClient {
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

beforeEach(() => {
  resetMemoryRateLimitForTest();
  vi.restoreAllMocks();
});

describe('POST /recall', () => {
  it('derives namespace from the token address; ignores client-supplied namespace (R7)', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ query: 'fast car', namespace: '0xEVIL' }),
    });
    expect(res.status).toBe(200);
    expect(client.recall).toHaveBeenCalledWith(WALLET, 'fast car', { limit: undefined });
  });

  it('maps recalled records through parseMemory → {prompt, modelId, distance}', async () => {
    const client = fakeClient({
      recall: vi.fn(async () => ({
        results: [{ blob_id: 'b', text: encodeMemory('a red car', { m: MODEL }), distance: 0.4 }],
        errored: false,
      })),
    });
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ query: 'car' }),
    });
    expect(await res.json()).toEqual({ results: [{ prompt: 'a red car', modelId: MODEL, distance: 0.4 }] });
  });

  it('missing JWT → 401, no MemWal call', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'x' }),
    });
    expect(res.status).toBe(401);
    expect(client.recall).not.toHaveBeenCalled();
  });

  it('invalid JWT → 401, no MemWal call', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth('garbage'), body: JSON.stringify({ query: 'x' }) });
    expect(res.status).toBe(401);
    expect(client.recall).not.toHaveBeenCalled();
  });

  it('malformed derived namespace → 401 (NOT empty 200)', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth('badsub'), body: JSON.stringify({ query: 'x' }) });
    expect(res.status).toBe(401);
    expect(client.recall).not.toHaveBeenCalled();
  });

  it('MemWal degraded → 200 + [] with operator header (R10)', async () => {
    const client = fakeClient({ recall: vi.fn(async () => ({ results: [], errored: true })) });
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
    expect(res.headers.get('x-memwal-degraded')).toBe('1');
  });

  it('malformed body → 400 before any MemWal call', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ notquery: 1 }) });
    expect(res.status).toBe(400);
    expect(client.recall).not.toHaveBeenCalled();
  });
});

describe('POST /remember', () => {
  it('returns 202 immediately without awaiting the job', async () => {
    const client = fakeClient({ remember: vi.fn(() => new Promise<void>(() => {})) }); // never resolves
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/remember', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ prompt: 'a truck', modelId: MODEL }),
    });
    expect(res.status).toBe(202);
    expect(client.remember).toHaveBeenCalledWith(WALLET, encodeMemory('a truck', { m: MODEL }));
  });

  it('rejects a non-address modelId (400)', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'x', modelId: 'nope' }) });
    expect(res.status).toBe(400);
    expect(client.remember).not.toHaveBeenCalled();
  });

  it('missing JWT → 401', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/remember', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'x', modelId: MODEL }) });
    expect(res.status).toBe(401);
  });
});

describe('auth_unavailable when no jwt configured', () => {
  it('503 when jwt dep missing', async () => {
    const route = buildMemoryRoute({ client: fakeClient() });
    const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x' }) });
    expect(res.status).toBe(503);
  });
});

describe('rate limit (per address)', () => {
  it('429 after exceeding the window', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    let last = 200;
    for (let i = 0; i < 130; i++) {
      const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x' }) });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
