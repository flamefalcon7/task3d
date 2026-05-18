import { describe, expect, it } from 'vitest';

import { initialLapState, lapReducer, waitingLapState } from './lapState';

// Plan-006 U8 — extended lifecycle: intro → waiting → running → finished.
// initialLapState() now returns `intro` (the natural pre-waiting state on
// scene mount); waitingLapState() returns the post-intro shape used as
// the entry point for racing actions. Retry from `finished` resets to
// `waiting`, NOT `intro` — scene rebuild owns the intro re-entry.

describe('lapReducer — intro lifecycle (plan-006 U8)', () => {
  it('initial state is intro with introStartedAtMs set', () => {
    const s0 = initialLapState(2_000);
    expect(s0.status).toBe('intro');
    expect(s0.introStartedAtMs).toBe(2_000);
    expect(s0.startedAtMs).toBe(null);
    expect(s0.checkpointHit).toBe(false);
  });

  it('initialLapState() omitted timestamp defaults to null and is filled later', () => {
    // SSR / test contexts may not have a meaningful timestamp at init.
    // The reducer accepts a null introStartedAtMs and the intro screen
    // can derive elapsed time from its own timer instead.
    const s0 = initialLapState();
    expect(s0.status).toBe('intro');
    expect(s0.introStartedAtMs).toBe(null);
  });

  it('INTRO_COMPLETE while status is intro → status transitions to waiting', () => {
    let s = initialLapState(0);
    s = lapReducer(s, { type: 'introComplete' });
    expect(s.status).toBe('waiting');
    // introStartedAtMs nulled out on transition — the field is only
    // meaningful while the intro is running.
    expect(s.introStartedAtMs).toBe(null);
    // Other lap fields unaffected.
    expect(s.startedAtMs).toBe(null);
    expect(s.currentLapMs).toBe(0);
    expect(s.finishedLapMs).toBe(null);
  });

  it('INTRO_SKIP while status is intro → status transitions to waiting (dev shortcut)', () => {
    let s = initialLapState(500);
    s = lapReducer(s, { type: 'introSkip' });
    expect(s.status).toBe('waiting');
    expect(s.introStartedAtMs).toBe(null);
  });

  it('INTRO_COMPLETE while status is waiting → no-op', () => {
    const waiting = waitingLapState();
    const next = lapReducer(waiting, { type: 'introComplete' });
    expect(next).toBe(waiting);
  });

  it('INTRO_COMPLETE while status is running → no-op', () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    const before = s;
    s = lapReducer(s, { type: 'introComplete' });
    expect(s).toBe(before);
    expect(s.status).toBe('running');
  });

  it('INTRO_SKIP while status is waiting → no-op', () => {
    const waiting = waitingLapState();
    const next = lapReducer(waiting, { type: 'introSkip' });
    expect(next).toBe(waiting);
  });

  it('throttle while status is intro → no-op (input is gated during intro)', () => {
    const s0 = initialLapState(0);
    const s1 = lapReducer(s0, { type: 'throttle', nowMs: 1000 });
    // Pre-intro-complete throttle does NOT start the lap timer.
    expect(s1).toBe(s0);
    expect(s1.status).toBe('intro');
    expect(s1.startedAtMs).toBe(null);
  });

  it('reset from any prior state returns to waiting (NOT intro — scene rebuild owns intro)', () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    s = lapReducer(s, { type: 'checkpoint' });
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 10000 });
    expect(s.status).toBe('finished');
    s = lapReducer(s, { type: 'reset' });
    expect(s).toEqual(waitingLapState());
    expect(s.status).toBe('waiting');
    expect(s.introStartedAtMs).toBe(null);
  });
});

describe('lapReducer — racing transitions (post-intro)', () => {
  it('covers AE1 — throttle from waiting transitions to running with startedAtMs set', () => {
    const s0 = waitingLapState();
    expect(s0.status).toBe('waiting');
    const s1 = lapReducer(s0, { type: 'throttle', nowMs: 1000 });
    expect(s1.status).toBe('running');
    expect(s1.startedAtMs).toBe(1000);
    expect(s1.currentLapMs).toBe(0);
  });

  it('tick while running advances currentLapMs to (now - startedAt)', () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    s = lapReducer(s, { type: 'tick', nowMs: 1750 });
    expect(s.currentLapMs).toBe(750);
    s = lapReducer(s, { type: 'tick', nowMs: 2000 });
    expect(s.currentLapMs).toBe(1000);
  });

  it('throttle while running is a no-op (no timer restart)', () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    const before = s;
    s = lapReducer(s, { type: 'throttle', nowMs: 5000 });
    expect(s).toBe(before);
    expect(s.startedAtMs).toBe(1000);
  });

  it('checkpoint while running flips checkpointHit', () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 0 });
    expect(s.checkpointHit).toBe(false);
    s = lapReducer(s, { type: 'checkpoint' });
    expect(s.checkpointHit).toBe(true);
  });

  it('checkpoint outside running state is a no-op', () => {
    const s0 = waitingLapState();
    const s1 = lapReducer(s0, { type: 'checkpoint' });
    expect(s1).toBe(s0);
  });

  it("covers AE4 — finishCrossed while running but checkpointHit=false is a no-op (reverse-cross guard)", () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 0 });
    const before = s;
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 5000 });
    expect(s).toBe(before);
    expect(s.status).toBe('running');
    expect(s.finishedLapMs).toBe(null);
  });

  it('finishCrossed after checkpoint while running → finished with finishedLapMs set', () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 1000 });
    s = lapReducer(s, { type: 'checkpoint' });
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 26000 });
    expect(s.status).toBe('finished');
    expect(s.finishedLapMs).toBe(25000);
  });

  it("tick while waiting is a no-op (timer doesn't advance before throttle)", () => {
    const s0 = waitingLapState();
    const s1 = lapReducer(s0, { type: 'tick', nowMs: 5000 });
    expect(s1).toBe(s0);
    expect(s1.currentLapMs).toBe(0);
  });

  it('tick while finished is a no-op (timer freezes on lap completion)', () => {
    let s = waitingLapState();
    s = lapReducer(s, { type: 'throttle', nowMs: 0 });
    s = lapReducer(s, { type: 'checkpoint' });
    s = lapReducer(s, { type: 'finishCrossed', nowMs: 20000 });
    const finishedAt = s.finishedLapMs;
    s = lapReducer(s, { type: 'tick', nowMs: 99999 });
    expect(s.finishedLapMs).toBe(finishedAt);
    expect(s.currentLapMs).toBe(20000);
  });
});
