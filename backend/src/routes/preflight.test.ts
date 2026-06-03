import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildPreflightRoute, resetPreflightRateLimitForTest, type PreflightRouteDeps } from './preflight.js';
import { buildQuotaStore, type QuotaStore } from '../lib/quota-store.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';

const stubJwt: JwtSigner = {
  async signSession() {
    return 'valid';
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token === 'valid') return { sub: WALLET } as SessionClaims;
    throw new Error('invalid');
  },
};

function auth(token = 'valid') {
  return { Authorization: `Bearer ${token}` };
}

let store: QuotaStore;
function mk(over: Partial<PreflightRouteDeps> = {}) {
  return buildPreflightRoute({
    jwt: stubJwt,
    store,
    thresholdCredits: 120,
    staleMs: 150_000,
    ...over,
  });
}
const get = (route: ReturnType<typeof buildPreflightRoute>, headers: Record<string, string> = auth()) =>
  route.request('/', { method: 'GET', headers });

beforeEach(() => {
  resetPreflightRateLimitForTest();
  vi.restoreAllMocks();
  store = buildQuotaStore({ path: ':memory:' });
});
afterEach(() => {
  store.close();
});

describe('GET /api/generate/preflight — auth', () => {
  it('401 without a token', async () => {
    const res = await get(mk(), {});
    expect(res.status).toBe(401);
  });

  it('401 on an invalid token', async () => {
    const res = await get(mk(), auth('nope'));
    expect(res.status).toBe(401);
  });

  it('503 when no JWT is configured', async () => {
    const res = await get(mk({ jwt: undefined }));
    expect(res.status).toBe(503);
  });
});

describe('GET /api/generate/preflight — availability', () => {
  it('AE1: a fresh cached balance below threshold → available:false (no live call)', async () => {
    store.setTripoBalance(50, Date.now()); // < 120, fresh
    const getBalance = vi.fn(async () => 9999);
    const res = await get(mk({ balanceProvider: { getBalance } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: 'insufficient' });
    expect(getBalance).not.toHaveBeenCalled(); // warm cache → no live query
  });

  it('fresh cached balance at/above threshold → available:true', async () => {
    store.setTripoBalance(200, Date.now());
    const res = await get(mk({ balanceProvider: { getBalance: vi.fn() } }));
    expect(await res.json()).toEqual({ available: true });
  });

  it('AE2: empty cache + healthy live balance → live query runs, caches, available:true', async () => {
    const getBalance = vi.fn(async () => 300);
    const res = await get(mk({ balanceProvider: { getBalance } }));
    expect(await res.json()).toEqual({ available: true });
    expect(getBalance).toHaveBeenCalledTimes(1);
    // cache was refreshed
    expect(store.getTripoBalance()?.spendable).toBe(300);
  });

  it('a STALE cache forces a live re-query (covers a silently-dead poller)', async () => {
    // Cached value is old (synced 10 min ago, staleMs=150s) → must re-query.
    store.setTripoBalance(50, Date.now() - 10 * 60_000);
    const getBalance = vi.fn(async () => 500);
    const res = await get(mk({ balanceProvider: { getBalance } }));
    expect(getBalance).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ available: true });
  });

  it('fails CLOSED (available:false, reason unknown) when the live balance check throws — never 500', async () => {
    const getBalance = vi.fn(async () => {
      throw new Error('tripo balance 503');
    });
    const res = await get(mk({ balanceProvider: { getBalance } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: 'unknown' });
  });

  it('fails CLOSED when no balance provider is wired and the cache is cold', async () => {
    const res = await get(mk({ balanceProvider: undefined }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: 'unknown' });
  });

  it('the response carries NO quantitative balance (no spendable/threshold leak)', async () => {
    store.setTripoBalance(50, Date.now());
    const res = await get(mk({ balanceProvider: { getBalance: vi.fn() } }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('50');
    expect(text).not.toContain('120');
  });

  it('single-flights concurrent cold-cache callers into one live fetch', async () => {
    let resolve: (n: number) => void = () => {};
    const getBalance = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const route = mk({ balanceProvider: { getBalance } });
    const p1 = get(route);
    const p2 = get(route);
    // Both requests are mid-flight against the same shared in-flight promise.
    await vi.waitFor(() => expect(getBalance).toHaveBeenCalled());
    resolve(300);
    await Promise.all([p1, p2]);
    expect(getBalance).toHaveBeenCalledTimes(1);
  });

  it('rate-limits after the per-address window (before any live query)', async () => {
    const getBalance = vi.fn(async () => 300);
    const route = mk({ balanceProvider: { getBalance } });
    let last = 200;
    for (let i = 0; i < 35; i++) last = (await get(route)).status;
    expect(last).toBe(429);
  });
});
