import { describe, it, expect } from 'vitest';
import { buildQuotaStore, type QuotaStore } from './quota-store.js';
import {
  checkBudget,
  recordSuccess,
  recordRateLimited,
  isRateLimited,
} from './gemini-quota.js';

const NOW = Date.UTC(2026, 5, 3, 12, 0, 0);

function store(): QuotaStore {
  return buildQuotaStore({ path: ':memory:' });
}

/** A 429 shaped like the AI SDK's APICallError (statusCode + responseHeaders). */
function rateLimitError(headers: Record<string, string> = {}): Error {
  return Object.assign(new Error('429 Too Many Requests'), {
    name: 'APICallError',
    statusCode: 429,
    responseHeaders: headers,
  });
}

describe('gemini-quota: checkBudget', () => {
  it('ok when under budget and no cooldown', () => {
    const s = store();
    expect(checkBudget('copilot', s, { now: NOW, budget: 100 })).toEqual({ ok: true });
  });

  it('ok when budget is undefined (off) regardless of count', () => {
    const s = store();
    for (let i = 0; i < 5; i++) s.recordGeminiUsage('copilot', { now: NOW });
    expect(checkBudget('copilot', s, { now: NOW })).toEqual({ ok: true });
  });

  it('quota_exhausted with retryAfterMs when daily count >= global budget', () => {
    const s = store();
    s.recordGeminiUsage('copilot', { now: NOW });
    s.recordGeminiUsage('copilot', { now: NOW });
    const r = checkBudget('copilot', s, { now: NOW, budget: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('quota_exhausted');
      expect(r.retryAfterMs).toBeGreaterThan(0); // until next UTC midnight
    }
  });

  it('quota_exhausted when a cooldown is active; retryAfterMs derives from it', () => {
    const s = store();
    s.setGeminiCooldown('copilot', NOW + 90_000);
    const r = checkBudget('copilot', s, { now: NOW, budget: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterMs).toBe(90_000);
  });

  it('per-address cap exhausts independently of the global budget (R8)', () => {
    const s = store();
    const addr = '0xabc';
    s.recordGeminiUsage('caption', { now: NOW, scope: addr });
    s.recordGeminiUsage('caption', { now: NOW, scope: addr });
    // Global budget high, but the address cap of 2 is hit.
    const r = checkBudget('caption', s, { now: NOW, budget: 1000, scope: addr, perAddressCap: 2 });
    expect(r.ok).toBe(false);
    // A different address is still fine.
    expect(checkBudget('caption', s, { now: NOW, budget: 1000, scope: '0xdef', perAddressCap: 2 })).toEqual({
      ok: true,
    });
  });
});

describe('gemini-quota: recordSuccess', () => {
  it('increments the global counter; with a scope also increments the per-address counter', () => {
    const s = store();
    recordSuccess('copilot', s, { now: NOW, scope: '0xabc' });
    expect(s.getGeminiState('copilot', { now: NOW }).dailyCount).toBe(1);
    expect(s.getGeminiState('copilot', { now: NOW, scope: '0xabc' }).dailyCount).toBe(1);
  });

  it('persists header remaining/reset when present', () => {
    const s = store();
    recordSuccess('copilot', s, {
      now: NOW,
      headers: { 'x-ratelimit-remaining': '7', 'x-ratelimit-reset': String(Math.floor((NOW + 30_000) / 1000)) },
    });
    const st = s.getGeminiState('copilot', { now: NOW });
    expect(st.remaining).toBe(7);
  });

  it('remaining:0 header trips early-degrade (next checkBudget is not ok)', () => {
    const s = store();
    recordSuccess('copilot', s, {
      now: NOW,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor((NOW + 45_000) / 1000)) },
    });
    const r = checkBudget('copilot', s, { now: NOW, budget: 1000 });
    expect(r.ok).toBe(false);
  });

  it('missing headers: still increments the self-count and does not throw', () => {
    const s = store();
    expect(() => recordSuccess('caption', s, { now: NOW })).not.toThrow();
    expect(s.getGeminiState('caption', { now: NOW }).dailyCount).toBe(1);
  });
});

describe('gemini-quota: recordRateLimited', () => {
  it('reads retry-after seconds and sets a cooldown checkBudget honors', () => {
    const s = store();
    recordRateLimited('copilot', s, { now: NOW, error: rateLimitError({ 'retry-after': '60' }) });
    const r = checkBudget('copilot', s, { now: NOW, budget: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterMs).toBe(60_000);
  });

  it('falls back to a default cooldown when no reset is parseable', () => {
    const s = store();
    recordRateLimited('caption', s, { now: NOW, error: rateLimitError() });
    const r = checkBudget('caption', s, { now: NOW, budget: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('clamps a bogus PAST reset (relative value misread as epoch) to the default cooldown, not a disabled one', () => {
    const s = store();
    // x-ratelimit-reset:'30' parses as epoch-seconds 30 → 1970 (a past instant).
    // Without the clamp this would set cooldownUntil in 1970 → reads as not-in-cooldown
    // → silently DISABLES the 429 backoff. The clamp must keep a real cooldown.
    recordRateLimited('copilot', s, { now: NOW, error: rateLimitError({ 'x-ratelimit-reset': '30' }) });
    const r = checkBudget('copilot', s, { now: NOW, budget: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
      expect(r.retryAfterMs).toBeLessThanOrEqual(60_000); // collapsed to the default window
    }
  });

  it('clamps an absurd FAR-FUTURE reset to the default cooldown (no multi-hour stuck state)', () => {
    const s = store();
    // retry-after as a huge delta → resetAt way beyond the 1h ceiling → clamp to default.
    recordRateLimited('copilot', s, { now: NOW, error: rateLimitError({ 'retry-after': '999999' }) });
    const r = checkBudget('copilot', s, { now: NOW, budget: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});

describe('gemini-quota: isRateLimited', () => {
  it('detects a 429 statusCode error', () => {
    expect(isRateLimited(rateLimitError())).toBe(true);
  });
  it('detects a RESOURCE_EXHAUSTED message', () => {
    expect(isRateLimited(new Error('google says RESOURCE_EXHAUSTED'))).toBe(true);
  });
  it('detects a structured Google RESOURCE_EXHAUSTED status field', () => {
    expect(isRateLimited({ data: { error: { status: 'RESOURCE_EXHAUSTED' } } })).toBe(true);
  });
  it('does not flag a generic error', () => {
    expect(isRateLimited(new Error('gemini 500 internal'))).toBe(false);
    expect(isRateLimited(new Error('timeout after 15000ms'))).toBe(false);
  });
  it('does NOT flag a non-429 error that merely mentions "rate limit" (no global-lock amplification)', () => {
    // The narrowed classifier drops the loose "rate.?limit" / "quota exceeded" tokens
    // so a benign error string can't trip a cross-user cooldown.
    expect(isRateLimited(new Error('failed to configure rate limiting middleware'))).toBe(false);
    expect(isRateLimited(new Error('daily quota exceeded for the docs API'))).toBe(false);
  });
});
