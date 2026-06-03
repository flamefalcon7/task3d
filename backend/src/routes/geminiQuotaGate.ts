// Gemini quota gating for the copilot + caption routes (plan-002 U3, D-083).
//
// The minimal shared piece the two Gemini routes now duplicate: resolve the env
// budget config, run the pre-call budget check, and (after a client failure) decide
// whether it was a quota 429 (→ a visible "quota_exhausted" state with a reset hint,
// R6) or a generic transient error (→ the existing retryable shape). The full
// bindNamespace/limiter dedupe across routes stays a follow-up (Scope Boundaries).
//
// `available:false` is NOT produced here — it remains reserved for the keyless case
// in each route (the one sanctioned hide, AE7/R10).
import { checkBudget, type BudgetResult } from '../lib/gemini-quota.js';
import type { Capability, QuotaStore } from '../lib/quota-store.js';

/** The visible quota-exhaustion response body (R6/R10): the feature stays available,
 *  the client renders a "retry ~X" message and auto-recovers. */
export interface QuotaExhaustedBody {
  available: true;
  error: 'quota_exhausted';
  retryAfterMs: number;
}

function numEnv(raw: string | undefined, fallback?: number): number | undefined {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Budget config from env:
 * - GEMINI_DAILY_BUDGET: global operator daily budget (R9). Default OFF (undefined)
 *   so nothing changes unless configured — needs live calibration.
 * - GEMINI_PER_ADDRESS_DAILY: per-address daily cap (R8). Default-ON at 50 — a
 *   generous bound real users never hit, but it blocks cheap zkLogin-wallet churn
 *   from draining the (uncalibrated) global budget. Set to a blank/non-numeric value
 *   to disable.
 */
export function geminiBudgetFromEnv(): { budget?: number; perAddressCap?: number } {
  return {
    budget: numEnv(process.env.GEMINI_DAILY_BUDGET),
    perAddressCap: numEnv(process.env.GEMINI_PER_ADDRESS_DAILY, 50),
  };
}

/** Pre-call gate: is this capability within budget for this address right now? */
export function checkGeminiQuota(
  capability: Capability,
  store: QuotaStore,
  scope: string,
  now: number = Date.now(),
): BudgetResult {
  const { budget, perAddressCap } = geminiBudgetFromEnv();
  return checkBudget(capability, store, { now, budget, scope, perAddressCap });
}

/** After a client failure: was a 429 cooldown recorded (by the client closure)? If so
 *  this is quota, not a generic hiccup — surface the visible quota state instead. */
export function quotaStateAfterFailure(
  capability: Capability,
  store: QuotaStore,
  now: number = Date.now(),
): { quota: true; retryAfterMs: number } | { quota: false } {
  const st = store.getGeminiState(capability, { now });
  if (st.cooldownUntil !== null) {
    return { quota: true, retryAfterMs: Math.max(0, st.cooldownUntil - now) };
  }
  return { quota: false };
}

/** Build the visible quota-exhausted response body (never available:false). */
export function quotaExhaustedBody(retryAfterMs: number): QuotaExhaustedBody {
  return { available: true, error: 'quota_exhausted', retryAfterMs: Math.max(0, retryAfterMs) };
}
