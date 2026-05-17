import { describe, expect, it } from 'vitest';

import { initialLapState, lapReducer } from './lapState';

describe('lapReducer', () => {
  it('covers AE1 — throttle from waiting transitions to running with startedAtMs set', () => {
    const s0 = initialLapState();
    expect(s0.status).toBe('waiting');
    const s1 = lapReducer(s0, { type: 'throttle', nowMs: 1000 });
    expect(s1.status).toBe('running');
    expect(s1.startedAtMs).toBe(1000);
    expect(s1.currentLapMs).toBe(0);
  });

  it('tick while running advances currentLapMs to (now - startedAt)', () => {
    let s = initialLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    s = lapReducer(s, { type: 'tick', nowMs: 1750 });
    expect(s.currentLapMs).toBe(750);
    s = lapReducer(s, { type: 'tick', nowMs: 2000 });
    expect(s.currentLapMs).toBe(1000);
  });

  it('throttle while running is a no-op (no timer restart)', () => {
    let s = initialLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    const before = s;
    s = lapReducer(s, { type: 'throttle', nowMs: 5000 });
    expect(s).toBe(before);
    expect(s.startedAtMs).toBe(1000);
  });

  it('checkpoint while running flips checkpointHit', () => {
    let s = initialLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 0 });
    expect(s.checkpointHit).toBe(false);
    s = lapReducer(s, { type: 'checkpoint' });
    expect(s.checkpointHit).toBe(true);
  });

  it('checkpoint outside running state is a no-op', () => {
    const s0 = initialLapState();
    const s1 = lapReducer(s0, { type: 'checkpoint' });
    expect(s1).toBe(s0);
  });

  it('covers AE4 — finishCrossed while running but checkpointHit=false is a no-op (reverse-cross guard)', () => {
    let s = initialLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 0 });
    const before = s;
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 5000 });
    // Without crossing the checkpoint first, finish-line crossings don't
    // count — prevents reversing across start/finish to fake a 0-second lap.
    expect(s).toBe(before);
    expect(s.status).toBe('running');
    expect(s.finishedLapMs).toBe(null);
  });

  it('finishCrossed after checkpoint while running → finished with finishedLapMs set', () => {
    let s = initialLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    s = lapReducer(s, { type: 'checkpoint' });
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 26000 });
    expect(s.status).toBe('finished');
    expect(s.finishedLapMs).toBe(25000);
  });

  it('reset returns to initial state from any prior state', () => {
    let s = initialLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    s = lapReducer(s, { type: 'checkpoint' });
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 10000 });
    expect(s.status).toBe('finished');
    s = lapReducer(s, { type: 'reset' });
    expect(s).toEqual(initialLapState());
    expect(s.checkpointHit).toBe(false);
    expect(s.startedAtMs).toBe(null);
  });

  it('tick while waiting is a no-op (timer doesn\'t advance before throttle)', () => {
    const s0 = initialLapState();
    const s1 = lapReducer(s0, { type: 'tick', nowMs: 5000 });
    expect(s1).toBe(s0);
    expect(s1.currentLapMs).toBe(0);
  });

  it('tick while finished is a no-op (timer freezes on lap completion)', () => {
    let s = initialLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 0 });
    s = lapReducer(s, { type: 'checkpoint' });
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 20000 });
    const finishedAt = s.finishedLapMs;
    s = lapReducer(s, { type: 'tick', nowMs: 99999 });
    expect(s.finishedLapMs).toBe(finishedAt);
    expect(s.currentLapMs).toBe(20000); // frozen at final lap value
  });
});
