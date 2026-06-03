import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTripoBalancePoller } from './tripoBalancePoller.js';
import { buildQuotaStore, type QuotaStore } from '../lib/quota-store.js';
import { TripoFailedError } from '../lib/tripo-client.js';

const stores: QuotaStore[] = [];
function store(): QuotaStore {
  const s = buildQuotaStore({ path: ':memory:' });
  stores.push(s);
  return s;
}
afterEach(() => {
  while (stores.length) stores.pop()!.close();
});

describe('tripoBalancePoller', () => {
  it('pollOnce writes spendable + syncedAt to the store', async () => {
    const s = store();
    const getBalance = vi.fn(async () => 420);
    const poller = createTripoBalancePoller({ client: { getBalance }, store: s, pollMs: 10_000 });
    await poller.pollOnce();
    const cached = s.getTripoBalance();
    expect(cached?.spendable).toBe(420);
    expect(typeof cached?.syncedAt).toBe('number');
  });

  it('start performs an immediate poll; double start is idempotent (no double poll)', async () => {
    const s = store();
    const getBalance = vi.fn(async () => 200);
    const poller = createTripoBalancePoller({ client: { getBalance }, store: s, pollMs: 10_000 });
    poller.start();
    poller.start(); // idempotent — must not kick off a second immediate poll / interval
    await vi.waitFor(() => expect(getBalance).toHaveBeenCalled());
    expect(getBalance).toHaveBeenCalledTimes(1);
    expect(s.getTripoBalance()?.spendable).toBe(200);
    poller.stop();
  });

  it('a failing tick is swallowed and leaves the prior cached value intact', async () => {
    const s = store();
    s.setTripoBalance(150, 1000);
    const getBalance = vi.fn(async () => {
      throw new TripoFailedError('balance API down');
    });
    const poller = createTripoBalancePoller({ client: { getBalance }, store: s, pollMs: 10_000 });
    await expect(poller.pollOnce()).resolves.toBeUndefined(); // does NOT throw
    expect(s.getTripoBalance()).toEqual({ spendable: 150, syncedAt: 1000 }); // unchanged
  });

  it('reentrancy guard: a second pollOnce while one is in flight is a no-op', async () => {
    const s = store();
    let resolveFirst: (n: number) => void = () => {};
    const getBalance = vi
      .fn()
      .mockImplementationOnce(() => new Promise<number>((r) => (resolveFirst = r)))
      .mockImplementation(async () => 999);
    const poller = createTripoBalancePoller({ client: { getBalance }, store: s, pollMs: 10_000 });
    const p1 = poller.pollOnce(); // in flight, not resolved
    const p2 = poller.pollOnce(); // should early-return (reentrancy guard)
    await p2;
    expect(getBalance).toHaveBeenCalledTimes(1);
    resolveFirst(500);
    await p1;
    expect(s.getTripoBalance()?.spendable).toBe(500);
  });
});
