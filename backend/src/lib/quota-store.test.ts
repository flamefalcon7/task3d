import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildQuotaStore, type QuotaStore } from './quota-store.js';

// A fixed UTC instant + the same instant shifted across the UTC day boundary.
const DAY1 = Date.UTC(2026, 5, 3, 12, 0, 0); // 2026-06-03 12:00 UTC
const DAY1_LATE = Date.UTC(2026, 5, 3, 23, 59, 0); // same UTC day
const DAY2 = Date.UTC(2026, 5, 4, 0, 1, 0); // next UTC day

const tmpDirs: string[] = [];
const openStores: QuotaStore[] = [];

function memStore(): QuotaStore {
  const s = buildQuotaStore({ path: ':memory:' });
  openStores.push(s);
  return s;
}

function tempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tusk-quota-'));
  tmpDirs.push(dir);
  return join(dir, 'quota.db');
}

afterEach(() => {
  while (openStores.length) {
    try {
      openStores.pop()!.close();
    } catch {
      /* already closed */
    }
  }
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe('quota-store: Tripo balance', () => {
  it('round-trips spendable + syncedAt', () => {
    const s = memStore();
    expect(s.getTripoBalance()).toBeNull();
    s.setTripoBalance(140, DAY1);
    expect(s.getTripoBalance()).toEqual({ spendable: 140, syncedAt: DAY1 });
  });

  it('setTripoBalance overwrites the prior value (single cached row)', () => {
    const s = memStore();
    s.setTripoBalance(140, DAY1);
    s.setTripoBalance(80, DAY1_LATE);
    expect(s.getTripoBalance()).toEqual({ spendable: 80, syncedAt: DAY1_LATE });
  });
});

describe('quota-store: Gemini daily usage', () => {
  it('recordGeminiUsage increments the per-capability daily counter', () => {
    const s = memStore();
    expect(s.getGeminiState('copilot', { now: DAY1 }).dailyCount).toBe(0);
    s.recordGeminiUsage('copilot', { now: DAY1 });
    s.recordGeminiUsage('copilot', { now: DAY1 });
    expect(s.getGeminiState('copilot', { now: DAY1 }).dailyCount).toBe(2);
  });

  it('daily rollover: yesterday usage does not count toward today', () => {
    const s = memStore();
    s.recordGeminiUsage('copilot', { now: DAY1 });
    s.recordGeminiUsage('copilot', { now: DAY1_LATE });
    expect(s.getGeminiState('copilot', { now: DAY1 }).dailyCount).toBe(2);
    expect(s.getGeminiState('copilot', { now: DAY2 }).dailyCount).toBe(0);
  });

  it('distinct capabilities keep independent counters', () => {
    const s = memStore();
    s.recordGeminiUsage('copilot', { now: DAY1 });
    s.recordGeminiUsage('caption', { now: DAY1 });
    s.recordGeminiUsage('caption', { now: DAY1 });
    expect(s.getGeminiState('copilot', { now: DAY1 }).dailyCount).toBe(1);
    expect(s.getGeminiState('caption', { now: DAY1 }).dailyCount).toBe(2);
  });

  it('distinct scopes (global vs address) keep independent counters', () => {
    const s = memStore();
    s.recordGeminiUsage('copilot', { now: DAY1 }); // default scope = global
    s.recordGeminiUsage('copilot', { now: DAY1, scope: '0xabc' });
    s.recordGeminiUsage('copilot', { now: DAY1, scope: '0xabc' });
    expect(s.getGeminiState('copilot', { now: DAY1 }).dailyCount).toBe(1); // global
    expect(s.getGeminiState('copilot', { now: DAY1, scope: '0xabc' }).dailyCount).toBe(2);
    expect(s.getGeminiState('copilot', { now: DAY1, scope: '0xother' }).dailyCount).toBe(0);
  });
});

describe('quota-store: Gemini cooldown + header enrichment', () => {
  it('setGeminiCooldown round-trips; expired cooldown reads as not-in-cooldown', () => {
    const s = memStore();
    expect(s.getGeminiState('caption', { now: DAY1 }).cooldownUntil).toBeNull();
    s.setGeminiCooldown('caption', DAY1 + 60_000);
    expect(s.getGeminiState('caption', { now: DAY1 }).cooldownUntil).toBe(DAY1 + 60_000);
    // After it elapses, state reports null (not-in-cooldown).
    expect(s.getGeminiState('caption', { now: DAY1 + 61_000 }).cooldownUntil).toBeNull();
  });

  it('cooldown is per-capability', () => {
    const s = memStore();
    s.setGeminiCooldown('caption', DAY1 + 60_000);
    expect(s.getGeminiState('caption', { now: DAY1 }).cooldownUntil).toBe(DAY1 + 60_000);
    expect(s.getGeminiState('copilot', { now: DAY1 }).cooldownUntil).toBeNull();
  });

  it('setGeminiRemaining persists header enrichment (remaining + resetAt)', () => {
    const s = memStore();
    s.setGeminiRemaining('copilot', { remaining: 7, resetAt: DAY1 + 30_000 });
    const st = s.getGeminiState('copilot', { now: DAY1 });
    expect(st.remaining).toBe(7);
    expect(st.resetAt).toBe(DAY1 + 30_000);
  });
});

describe('quota-store: spent payments (D-088 durable replay guard)', () => {
  const DIGEST = 'AuzWcL4fUbgLL3uvaqPfwpuzYU5p9EGa4Uqr1fVk2yab';

  it('isPaymentSpent is false until marked, true after', () => {
    const s = memStore();
    expect(s.isPaymentSpent(DIGEST)).toBe(false);
    expect(s.markPaymentSpent(DIGEST, DAY1)).toBe(true); // newly inserted
    expect(s.isPaymentSpent(DIGEST)).toBe(true);
  });

  it('markPaymentSpent returns false on a second (replay) mark — the atomic signal', () => {
    const s = memStore();
    expect(s.markPaymentSpent(DIGEST, DAY1)).toBe(true);
    expect(s.markPaymentSpent(DIGEST, DAY1_LATE)).toBe(false);
  });

  it('distinct digests are tracked independently', () => {
    const s = memStore();
    s.markPaymentSpent(DIGEST, DAY1);
    expect(s.isPaymentSpent('a-different-digest')).toBe(false);
  });

  it('spent digests survive a re-open (durable across restart / instances)', () => {
    const path = tempPath();
    const a = buildQuotaStore({ path });
    expect(a.markPaymentSpent(DIGEST, DAY1)).toBe(true);
    a.close();

    const b = buildQuotaStore({ path });
    openStores.push(b);
    expect(b.isPaymentSpent(DIGEST)).toBe(true);
    expect(b.markPaymentSpent(DIGEST, DAY2)).toBe(false); // still rejected after "restart"
  });
});

describe('quota-store: cold/empty + durability', () => {
  it('empty store returns zero/null sentinels, never throws', () => {
    const s = memStore();
    expect(s.getTripoBalance()).toBeNull();
    const st = s.getGeminiState('copilot', { now: DAY1 });
    expect(st).toEqual({ dailyCount: 0, cooldownUntil: null, remaining: null, resetAt: null });
  });

  it('persists across re-open of a real temp-file DB (AE6)', () => {
    const path = tempPath();
    const a = buildQuotaStore({ path });
    a.setTripoBalance(123, DAY1);
    a.recordGeminiUsage('caption', { now: DAY1 });
    a.recordGeminiUsage('caption', { now: DAY1 });
    a.setGeminiCooldown('caption', DAY1 + 120_000);
    a.close();

    const b = buildQuotaStore({ path });
    openStores.push(b);
    expect(b.getTripoBalance()).toEqual({ spendable: 123, syncedAt: DAY1 });
    expect(b.getGeminiState('caption', { now: DAY1 }).dailyCount).toBe(2);
    expect(b.getGeminiState('caption', { now: DAY1 }).cooldownUntil).toBe(DAY1 + 120_000);
  });
});
