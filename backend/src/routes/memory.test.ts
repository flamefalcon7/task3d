import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encodeMemory } from '@overflow2026/shared';
import { buildMemoryRoute, resetMemoryRateLimitForTest, setMemoryDenylistForTest } from './memory.js';
import type { MemwalClient } from '../lib/memwal-client.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';
const CREATOR2 = '0x0000000000000000000000000000000000000000000000000000000000000002';
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
  setMemoryDenylistForTest([]);
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
    expect(client.recall).toHaveBeenCalledWith(WALLET, 'fast car', { limit: undefined, maxDistance: 0.66 });
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

// The global mirror is verified ON-CHAIN before writing (review SEC-1): type
// must be our Model3D, creator must equal the JWT wallet, and the mirrored
// decision uses the CHAIN policy, not the client-sent one.
const PKG = `0x${'9'.repeat(64)}`;

function fakeSui(
  over: { creator?: string; policy?: number; type?: string; throws?: boolean } = {},
) {
  return {
    getObject: vi.fn(async () => {
      if (over.throws) throw new Error('rpc boom');
      return {
        data: {
          content: {
            dataType: 'moveObject',
            type: over.type ?? `${PKG}::model3d::Model3D`,
            fields: {
              creator: over.creator ?? WALLET,
              license: { type: `${PKG}::model3d::LicenseTerms`, fields: { policy: over.policy ?? 2 } },
            },
          },
        },
      };
    }),
  };
}

describe('U8 — global dual-write (on-chain verified, review SEC-1)', () => {
  it('PERMISSIONLESS publish writes BOTH personal and global after chain verification', async () => {
    const client = fakeClient();
    const suiClient = fakeSui({ policy: 2 });
    const route = buildMemoryRoute({ jwt: stubJwt, client, suiClient, packageId: PKG });
    const res = await route.request('/remember', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ prompt: 'p', modelId: MODEL, policy: 2 }),
    });
    expect(res.status).toBe(202);
    expect(suiClient.getObject).toHaveBeenCalledWith({ id: MODEL, options: { showContent: true } });
    expect(client.remember).toHaveBeenCalledWith(WALLET, encodeMemory('p', { m: MODEL }));
    expect(client.remember).toHaveBeenCalledWith('global', encodeMemory('p', { m: MODEL, c: WALLET }));
    expect(client.remember).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({ status: 'accepted', globalMirror: 'written' });
  });

  it('ALLOW_LIST publish also dual-writes', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client, suiClient: fakeSui({ policy: 1 }), packageId: PKG });
    await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'p', modelId: MODEL, policy: 1 }) });
    expect(client.remember).toHaveBeenCalledTimes(2);
  });

  it('RESTRICTED publish writes personal ONLY — no chain read needed', async () => {
    const client = fakeClient();
    const suiClient = fakeSui();
    const route = buildMemoryRoute({ jwt: stubJwt, client, suiClient, packageId: PKG });
    await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'p', modelId: MODEL, policy: 0 }) });
    expect(client.remember).toHaveBeenCalledTimes(1);
    expect(client.remember).toHaveBeenCalledWith(WALLET, encodeMemory('p', { m: MODEL }));
    expect(suiClient.getObject).not.toHaveBeenCalled();
  });

  it('policy omitted → personal only (back-compat), no chain read', async () => {
    const client = fakeClient();
    const suiClient = fakeSui();
    const route = buildMemoryRoute({ jwt: stubJwt, client, suiClient, packageId: PKG });
    await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'p', modelId: MODEL }) });
    expect(client.remember).toHaveBeenCalledTimes(1);
    expect(suiClient.getObject).not.toHaveBeenCalled();
  });

  it('creator mismatch on-chain → global mirror SKIPPED (personal still written)', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({
      jwt: stubJwt,
      client,
      suiClient: fakeSui({ creator: CREATOR2 }),
      packageId: PKG,
    });
    const res = await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'p', modelId: MODEL, policy: 2 }) });
    expect(client.remember).toHaveBeenCalledTimes(1);
    expect(client.remember).toHaveBeenCalledWith(WALLET, encodeMemory('p', { m: MODEL }));
    expect(await res.json()).toEqual({ status: 'accepted', globalMirror: 'skipped' });
  });

  it('client claims PERMISSIONLESS but chain says RESTRICTED → mirror SKIPPED', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client, suiClient: fakeSui({ policy: 0 }), packageId: PKG });
    await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'p', modelId: MODEL, policy: 2 }) });
    expect(client.remember).toHaveBeenCalledTimes(1);
  });

  it('foreign-package lookalike Model3D → mirror SKIPPED', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({
      jwt: stubJwt,
      client,
      suiClient: fakeSui({ type: `0x${'f'.repeat(64)}::model3d::Model3D` }),
      packageId: PKG,
    });
    await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'p', modelId: MODEL, policy: 2 }) });
    expect(client.remember).toHaveBeenCalledTimes(1);
  });

  it('chain read RPC error → mirror SKIPPED (fail-closed), personal unaffected', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client, suiClient: fakeSui({ throws: true }), packageId: PKG });
    const res = await route.request('/remember', { method: 'POST', headers: auth(), body: JSON.stringify({ prompt: 'p', modelId: MODEL, policy: 2 }) });
    expect(res.status).toBe(202);
    expect(client.remember).toHaveBeenCalledTimes(1);
  });
});

describe('U8 — global recall', () => {
  function globalClient(results: Array<{ blob_id: string; text: string; distance: number }>) {
    return fakeClient({ recall: vi.fn(async () => ({ results, errored: false })) });
  }

  it('excludes caller-authored entries and drops missing/unparseable c', async () => {
    const client = globalClient([
      { blob_id: '1', text: encodeMemory('mine', { m: '0xm1', c: WALLET }), distance: 0.2 }, // self
      { blob_id: '2', text: encodeMemory('theirs', { m: '0xm2', c: CREATOR2 }), distance: 0.3 }, // keep
      { blob_id: '3', text: encodeMemory('nocreator', { m: '0xm3' }), distance: 0.4 }, // no c → drop
      { blob_id: '4', text: 'plain, no trailer', distance: 0.5 }, // unparseable → drop
    ]);
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x', scope: 'global' }) });
    expect(await res.json()).toEqual({
      results: [{ prompt: 'theirs', modelId: '0xm2', creator: CREATOR2, distance: 0.3 }],
    });
    // over-fetch: default n=10 → asks the relayer for 40.
    expect(client.recall).toHaveBeenCalledWith('global', 'x', { limit: 40, maxDistance: 0.66 });
  });

  it('over-fetches so exclude-self does not empty the page', async () => {
    const client = globalClient([
      { blob_id: '1', text: encodeMemory('mine1', { m: '0xa', c: WALLET }), distance: 0.1 },
      { blob_id: '2', text: encodeMemory('mine2', { m: '0xb', c: WALLET }), distance: 0.2 },
      { blob_id: '3', text: encodeMemory('mine3', { m: '0xc', c: WALLET }), distance: 0.3 },
      { blob_id: '4', text: encodeMemory('theirs', { m: '0xd', c: CREATOR2 }), distance: 0.4 },
    ]);
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x', scope: 'global', limit: 1 }) });
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toHaveLength(1);
    expect(client.recall).toHaveBeenCalledWith('global', 'x', { limit: 4, maxDistance: 0.66 });
  });

  it('suppresses denylisted authors', async () => {
    setMemoryDenylistForTest([CREATOR2]);
    const client = globalClient([
      { blob_id: '2', text: encodeMemory('theirs', { m: '0xm2', c: CREATOR2 }), distance: 0.3 },
    ]);
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x', scope: 'global' }) });
    expect(await res.json()).toEqual({ results: [] });
  });

  it('global recall failure → 200 + [] (fail-soft)', async () => {
    const client = fakeClient({ recall: vi.fn(async () => ({ results: [], errored: true })) });
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x', scope: 'global' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
    expect(res.headers.get('x-memwal-degraded')).toBe('1');
  });

  it('global recall still binds namespace (401 on bad sub)', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    const res = await route.request('/recall', { method: 'POST', headers: auth('badsub'), body: JSON.stringify({ query: 'x', scope: 'global' }) });
    expect(res.status).toBe(401);
    expect(client.recall).not.toHaveBeenCalled();
  });
});

describe('rate limit (per address)', () => {
  it('429 after exceeding the window', async () => {
    const client = fakeClient();
    const route = buildMemoryRoute({ jwt: stubJwt, client });
    let last = 200;
    for (let i = 0; i < 605; i++) {
      const res = await route.request('/recall', { method: 'POST', headers: auth(), body: JSON.stringify({ query: 'x' }) });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
