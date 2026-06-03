// Tripo balance poller (plan-002 U4, D-083).
//
// Background loop that syncs spendable Tripo credit into the durable quota store so
// the generate pre-flight reads a warm cache instead of hitting Tripo on every
// request. Mirrors integrationIndexer's factory/start/stop/reentrancy/try-catch-swallow
// shape — but with ONE deliberate deviation: it `unref()`s the interval handle.
// integrationIndexer omits unref(), which would hold the event loop open and block a
// clean exit / SQLite-lock handoff to a replacement process (review: scope-guardian,
// security). Constructed + started ONLY in server.ts's invokedDirectly block (R12);
// test imports never poll.
import type { QuotaStore } from '../lib/quota-store.js';

/** Default poll cadence. Balance changes slowly; 60s keeps the cache warm cheaply.
 *  Drives the pre-flight's staleness TTL (BALANCE_STALE_MS ≈ 2.5×). */
export const DEFAULT_TRIPO_BALANCE_POLL_MS = 60_000;

/** Staleness window the pre-flight treats as "must re-query live" — covers cold start
 *  AND a silently-dead poller (the swallow-per-tick guard means a durably-down balance
 *  API would otherwise leave a confidently-wrong fresh-looking cache forever). */
export function balanceStaleMs(pollMs: number = DEFAULT_TRIPO_BALANCE_POLL_MS): number {
  return Math.round(pollMs * 2.5);
}

/** Minimal slice of TripoClient the poller needs (keeps tests free of HTTP). */
export interface BalanceProvider {
  getBalance(): Promise<number>;
}

export interface TripoBalancePollerDeps {
  client: BalanceProvider;
  store: QuotaStore;
  pollMs?: number;
}

export interface TripoBalancePoller {
  start(): void;
  stop(): void;
  /** Run a single sync tick — exposed for tests + manual triggering. */
  pollOnce(): Promise<void>;
}

export function createTripoBalancePoller(deps: TripoBalancePollerDeps): TripoBalancePoller {
  const pollMs = deps.pollMs ?? DEFAULT_TRIPO_BALANCE_POLL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling = false;

  async function pollOnce(): Promise<void> {
    if (polling) return; // reentrancy guard (mirrors integrationIndexer)
    polling = true;
    try {
      const spendable = await deps.client.getBalance();
      deps.store.setTripoBalance(spendable, Date.now());
    } catch (err) {
      // Swallow per tick — a transient Tripo balance outage must not crash the loop.
      // The prior cached value is left intact; the pre-flight's staleness TTL turns a
      // durably-stale cache into a forced live re-query (so we never serve a confidently
      // wrong fresh-looking value forever).
      console.warn(`[tripo-balance] poll failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      polling = false;
    }
  }

  return {
    start() {
      if (timer) return; // idempotent
      void pollOnce(); // immediate warm-up so the cache isn't cold on first request
      timer = setInterval(() => void pollOnce(), pollMs);
      // CRITICAL (see header): do not hold the event loop open / block clean exit.
      timer.unref?.();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    pollOnce,
  };
}
