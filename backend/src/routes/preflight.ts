// Tripo generate pre-flight (plan-002 U4, D-083).
//
// GET /api/generate/preflight — a lightweight, JWT-gated availability check the
// frontend calls BEFORE charging the SUI service fee (R1). It answers one boolean:
// is there enough spendable Tripo credit to attempt a generation right now?
//
// Reads the poller-warmed cache (U4); on a cold OR stale cache it does ONE live
// balance query (single-flighted across concurrent callers to avoid a thundering
// herd) and refreshes the cache (R4). The response is a bare `{ available, reason? }`
// — it carries NO quantitative balance (never leak the operator's credit level). On
// any balance-check failure it fails CLOSED (`available:false`), never a 500.
//
// TOCTOU is a known, accepted limitation (D-083): the balance can drop between this
// snapshot and the ~2–4-min two-step chain, so R1 is a "not charged when we already
// know it will fail" guarantee, not an absolute no-charge promise. The threshold is
// sized for per-chain-cost × concurrency + buffer; U5's refundable message is the
// residual backstop.
import { Hono, type Context } from 'hono';
import type { JwtSigner } from '../lib/jwt.js';
import { getQuotaStore, type QuotaStore } from '../lib/quota-store.js';
import { balanceStaleMs, type BalanceProvider } from '../events/tripoBalancePoller.js';

/** Conservative default — exact Turbo-v1.0 + mesh_segmentation cost is unpublished
 *  (~100–110cr/chain). Sized for concurrency; calibrate via a live balance diff and
 *  set TRIPO_PREFLIGHT_MIN_CREDITS from that. */
export const DEFAULT_PREFLIGHT_MIN_CREDITS = 120;

export interface PreflightRouteDeps {
  jwt?: JwtSigner;
  /** Live balance source (a TripoClient). Absent (Tripo disabled/keyless) → fail-closed. */
  balanceProvider?: BalanceProvider;
  /** Durable quota store; defaults to the shared singleton (same handle the poller writes). */
  store?: QuotaStore;
  /** Spendable-credit threshold; default from env TRIPO_PREFLIGHT_MIN_CREDITS. */
  thresholdCredits?: number;
  /** Cache staleness TTL (ms); default from TRIPO_BALANCE_POLL_MS × 2.5. */
  staleMs?: number;
}

// Per-address fixed-window limiter — mirrors copilot/caption. Applied BEFORE any live
// query so churned/cheap new wallets can't fan out live Tripo balance calls (review:
// security). Synchronous (the store is synchronous too).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(address: string, now = Date.now()): boolean {
  const entry = hits.get(address);
  if (!entry || now >= entry.resetAt) {
    hits.set(address, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}
/** Test-only: clear the rate-limit window. */
export function resetPreflightRateLimitForTest(): void {
  hits.clear();
}

function envThreshold(): number {
  const n = Number(process.env.TRIPO_PREFLIGHT_MIN_CREDITS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PREFLIGHT_MIN_CREDITS;
}
function envStaleMs(): number {
  const poll = Number(process.env.TRIPO_BALANCE_POLL_MS);
  return balanceStaleMs(Number.isFinite(poll) && poll > 0 ? poll : undefined);
}

export function buildPreflightRoute(deps: PreflightRouteDeps) {
  const route = new Hono();
  const getStore = () => deps.store ?? getQuotaStore();

  // Single-flight the live balance fetch: one in-flight promise shared across
  // concurrent cold/stale callers, so they don't stampede Tripo's balance endpoint.
  let inFlight: Promise<number> | null = null;
  function liveFetch(provider: BalanceProvider): Promise<number> {
    if (inFlight) return inFlight;
    inFlight = provider.getBalance().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  // Mirror generate's auth gate (JWT → token subject).
  async function bindAddress(c: Context): Promise<string | Response> {
    if (!deps.jwt) {
      return c.json({ error: 'auth_unavailable', message: 'Pre-flight requires server-side JWT configuration' }, 503);
    }
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
    if (!token) {
      return c.json({ error: 'auth_required', message: 'Pre-flight requires Authorization: Bearer <jwt>' }, 401);
    }
    try {
      const claims = await deps.jwt.verifySession(token);
      return claims.sub;
    } catch {
      return c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401);
    }
  }

  route.get('/', async (c) => {
    const address = await bindAddress(c);
    if (address instanceof Response) return address;
    if (rateLimited(address)) return c.json({ error: 'rate_limited' }, 429);

    const threshold = deps.thresholdCredits ?? envThreshold();
    const stale = deps.staleMs ?? envStaleMs();
    const store = getStore();
    const now = Date.now();

    const cached = store.getTripoBalance();
    let spendable: number;
    if (cached && now - cached.syncedAt < stale) {
      // Warm cache — use it.
      spendable = cached.spendable;
    } else {
      // Cold OR stale → live re-query (single-flighted). No provider wired → fail closed.
      if (!deps.balanceProvider) {
        return c.json({ available: false, reason: 'unknown' });
      }
      try {
        spendable = await liveFetch(deps.balanceProvider);
        store.setTripoBalance(spendable, Date.now());
      } catch (e) {
        // Fail CLOSED — never a 500, never leak the upstream error.
        console.warn('[preflight] live balance check failed (fail-closed):', e instanceof Error ? e.message : e);
        return c.json({ available: false, reason: 'unknown' });
      }
    }

    // Boolean only — `reason` is qualitative, never the credit level.
    if (spendable >= threshold) return c.json({ available: true });
    return c.json({ available: false, reason: 'insufficient' });
  });

  return route;
}
