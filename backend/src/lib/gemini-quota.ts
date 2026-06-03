// Gemini quota guard (plan-002 U2, D-083).
//
// Pure decision/record helpers over the durable quota store (U1) for the two
// operator-paid Gemini features (copilot + caption). Three responsibilities:
//   - checkBudget: may this call proceed? (active 429 cooldown, then the global
//     daily operator budget R9, then the optional per-address daily cap R8).
//   - recordSuccess: increment the self-count (the PRIMARY signal — Google does
//     not guarantee `x-ratelimit-remaining` on 200s) and opportunistically persist
//     header remaining/reset; a `remaining:0` header trips an early cooldown.
//   - recordRateLimited: on a 429, derive the reset and set the authoritative
//     recovery cooldown (D-083: the 429 reset is the true recovery signal; the
//     self-count is only an overspend bound).
//
// Pure: the store + `now` are injected, so this whole module is deterministically
// testable and has no import-time side effects (R12). Env (budget/cap) is resolved
// by the route (U3) and passed in.
import type { Capability, QuotaStore } from './quota-store.js';

/** The widened return shape of the clients' `generate` seam: the text plus the
 *  rate-limit signal carried out of the closure (where the raw SDK response is in
 *  scope) so the quota recorder can see headers/usage before withTimeout masks them. */
export interface GeminiGenerateResult {
  text: string;
  headers?: Record<string, string>;
  usage?: unknown;
}

/** Default cooldown when a 429 carries no parseable reset. */
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

/** Ceiling for a derived cooldown. A parsed reset outside (now, now+MAX] is treated
 *  as bogus (a relative value misread as a past epoch → would silently DISABLE the
 *  cooldown; an absolute epoch misread as a delta → would STICK for hours) and
 *  collapses to the default window (review: correctness + adversarial). */
const MAX_COOLDOWN_MS = 60 * 60_000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Clamp a derived cooldown target to a sane window, else fall back to the default. */
function safeCooldown(resetAt: number | null, now: number): number {
  if (resetAt !== null && resetAt > now && resetAt <= now + MAX_COOLDOWN_MS) return resetAt;
  return now + DEFAULT_RATE_LIMIT_COOLDOWN_MS;
}

export interface CheckBudgetOpts {
  now: number;
  /** Global daily operator budget (R9). Undefined / non-finite = off. */
  budget?: number;
  /** Address bucket for the per-address cap (R8). */
  scope?: string;
  /** Per-address daily cap (R8). Undefined / non-finite = off. */
  perAddressCap?: number;
}

export type BudgetResult = { ok: true } | { ok: false; reason: 'quota_exhausted'; retryAfterMs: number };

/** ms from `now` until the next UTC midnight (when the self-count rolls over). */
function msUntilUtcMidnight(now: number): number {
  return MS_PER_DAY - (now % MS_PER_DAY);
}

/**
 * Decide whether a Gemini call may proceed. Order matters: a live 429 cooldown is
 * the authoritative recovery signal, so it wins over the self-counted budgets.
 */
export function checkBudget(capability: Capability, store: QuotaStore, opts: CheckBudgetOpts): BudgetResult {
  const { now } = opts;

  const globalState = store.getGeminiState(capability, { now });
  if (globalState.cooldownUntil !== null) {
    return { ok: false, reason: 'quota_exhausted', retryAfterMs: Math.max(0, globalState.cooldownUntil - now) };
  }

  if (opts.budget !== undefined && Number.isFinite(opts.budget) && globalState.dailyCount >= opts.budget) {
    return { ok: false, reason: 'quota_exhausted', retryAfterMs: msUntilUtcMidnight(now) };
  }

  if (opts.scope && opts.perAddressCap !== undefined && Number.isFinite(opts.perAddressCap)) {
    const addrCount = store.getGeminiState(capability, { now, scope: opts.scope }).dailyCount;
    if (addrCount >= opts.perAddressCap) {
      return { ok: false, reason: 'quota_exhausted', retryAfterMs: msUntilUtcMidnight(now) };
    }
  }

  return { ok: true };
}

export interface RecordSuccessOpts {
  now: number;
  /** Address bucket so the per-address counter (R8) advances alongside the global one. */
  scope?: string;
  /** Response rate-limit headers (lowercased keys), when the SDK surfaced them. */
  headers?: Record<string, string>;
  /** Token usage (unused for now; calls-only is the simpler default). */
  usage?: unknown;
}

/** Record one successful Gemini call: advance the self-count (primary signal) and
 *  enrich from headers when present. A `remaining:0` header trips an early cooldown. */
export function recordSuccess(capability: Capability, store: QuotaStore, opts: RecordSuccessOpts): void {
  store.recordGeminiUsage(capability, { now: opts.now });
  if (opts.scope) store.recordGeminiUsage(capability, { now: opts.now, scope: opts.scope });

  const parsed = parseRateLimitHeaders(opts.headers, opts.now);
  if (parsed.remaining !== null) {
    store.setGeminiRemaining(capability, {
      remaining: parsed.remaining,
      resetAt: parsed.resetAt ?? undefined,
    });
    // Headroom is gone — degrade proactively until the reset (clamped) or a default.
    if (parsed.remaining <= 0) {
      store.setGeminiCooldown(capability, safeCooldown(parsed.resetAt, opts.now));
    }
  }
}

export interface RecordRateLimitedOpts {
  now: number;
  /** The thrown error (AI SDK APICallError carries `responseHeaders`). */
  error?: unknown;
  /** Headers, if available separately from the error. */
  headers?: Record<string, string>;
}

/** Record a 429: set the authoritative recovery cooldown from the reset, or a default. */
export function recordRateLimited(capability: Capability, store: QuotaStore, opts: RecordRateLimitedOpts): void {
  const fromError = errorResponseHeaders(opts.error);
  const headers = { ...(fromError ?? {}), ...(opts.headers ?? {}) };
  const parsed = parseRateLimitHeaders(headers, opts.now);
  store.setGeminiCooldown(capability, safeCooldown(parsed.resetAt, opts.now));
}

/** Duck-typed 429 detection across AI SDK APICallError + Google RESOURCE_EXHAUSTED
 *  shapes. The STRUCTURED signal (statusCode 429 / a RESOURCE_EXHAUSTED status field)
 *  is primary. The message fallback is intentionally NARROW — only unambiguous tokens
 *  (`429`, `too many requests`, `resource_exhausted`) — so a stray "rate limit" /
 *  "quota" substring in a non-429 error can't trip a cross-user global cooldown
 *  (review: adversarial — over-broad classifier amplifies one error into a global lock). */
export function isRateLimited(e: unknown): boolean {
  if (e && typeof e === 'object') {
    const status = (e as { statusCode?: unknown; status?: unknown }).statusCode ?? (e as { status?: unknown }).status;
    if (status === 429) return true;
    const googleStatus = (e as { data?: { error?: { status?: unknown } } }).data?.error?.status;
    if (typeof googleStatus === 'string' && /resource_exhausted/i.test(googleStatus)) return true;
  }
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /\b429\b|too many requests|resource_exhausted/i.test(msg);
}

interface ParsedRateLimit {
  remaining: number | null;
  /** Epoch ms, or null when not parseable. */
  resetAt: number | null;
}

/** Parse `x-ratelimit-remaining` and a reset hint (`retry-after` seconds, or
 *  `x-ratelimit-reset` as epoch seconds/ms) into a remaining count + reset epoch-ms. */
export function parseRateLimitHeaders(
  headers: Record<string, string> | undefined,
  now: number,
): ParsedRateLimit {
  if (!headers) return { remaining: null, resetAt: null };
  const lower = lowerKeys(headers);

  let remaining: number | null = null;
  const rem = lower['x-ratelimit-remaining'];
  if (rem !== undefined && rem !== '') {
    const n = Number(rem);
    if (Number.isFinite(n)) remaining = n;
  }

  let resetAt: number | null = null;
  const retryAfter = lower['retry-after'];
  if (retryAfter !== undefined && retryAfter !== '') {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) resetAt = now + secs * 1000;
  }
  if (resetAt === null) {
    const reset = lower['x-ratelimit-reset'];
    if (reset !== undefined && reset !== '') {
      const n = Number(reset);
      if (Number.isFinite(n)) {
        // Heuristic: a value < 1e12 is epoch SECONDS; otherwise epoch ms.
        resetAt = n < 1e12 ? n * 1000 : n;
      }
    }
  }

  return { remaining, resetAt };
}

function lowerKeys(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(h)) out[k.toLowerCase()] = h[k]!;
  return out;
}

/** Pull `responseHeaders` off an AI SDK APICallError-shaped error, if present. */
function errorResponseHeaders(e: unknown): Record<string, string> | null {
  if (e && typeof e === 'object') {
    const h = (e as { responseHeaders?: unknown }).responseHeaders;
    if (h && typeof h === 'object') return h as Record<string, string>;
  }
  return null;
}
