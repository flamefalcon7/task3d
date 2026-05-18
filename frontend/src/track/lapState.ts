// Plan-004 U3 — pure reducer for the /track game-state machine.
// Plan-006 U8 — extended with an `intro` status for cinematic scene mount.
//
// Pure module: no Babylon, no React. Owned by TrackPage as React state
// (useState) and fed actions by the racetrack scene's physics observers.
// Keeping this reducer pure means lap logic stays unit-testable without
// a WebGL context, and Retry can be a single `reset` action — no need
// to re-create the scene.
//
// Lifecycle:
//   intro (scene mount, camera orbit + countdown)
//     ↓ INTRO_COMPLETE (countdown finishes) | INTRO_SKIP (dev shortcut)
//   waiting (input enabled, lap timer not started)
//     ↓ throttle
//   running (lap timer ticking, checkpoint flip, finish-line gated)
//     ↓ finishCrossed (after checkpointHit)
//   finished (lap result frozen)
//     ↓ reset (Retry button) → waiting
//     ↓ scene rebuild (carousel switch) → re-instantiates state → intro

/**
 * Closed discriminated union — adding a new status value is a breaking
 * change for every consumer of onLapStateChange. Update all reducer cases
 * AND every status-branching consumer (TrackPage HUD/overlay gating, etc.)
 * together. The reducer's explicit `: LapState` return type guarantees the
 * compiler catches missing case branches if this union grows.
 */
export type LapStatus = 'intro' | 'waiting' | 'running' | 'finished';

export interface LapState {
  status: LapStatus;
  startedAtMs: number | null;
  /** Time elapsed since throttle while running; frozen at finishedLapMs once finished. */
  currentLapMs: number;
  finishedLapMs: number | null;
  /** True after the car has crossed the mid-track checkpoint trigger this lap. */
  checkpointHit: boolean;
  /**
   * Set when the scene mounts in `intro` state; nulled out on transition
   * to `waiting`. Useful for the intro screen to display elapsed-time
   * UI if needed. null in any non-intro state.
   */
  introStartedAtMs: number | null;
}

export type LapAction =
  | { type: 'throttle'; nowMs: number }
  | { type: 'tick'; nowMs: number }
  // checkpoint intentionally carries no nowMs — it only records zone entry.
  // Extend with nowMs if split-time recording is ever added; all dispatch
  // sites (currently only racetrackScene.ts's onBeforeRender observer)
  // must be updated together.
  | { type: 'checkpoint' }
  | { type: 'finishCrossed'; nowMs: number }
  | { type: 'reset' }
  // Plan-006 U8 — intro state actions. INTRO_COMPLETE fires when the
  // countdown overlay reaches GO; INTRO_SKIP is the dev shortcut (hold-W).
  // Both transition intro → waiting and are no-ops in any other state.
  | { type: 'introComplete' }
  | { type: 'introSkip' };

/**
 * Initial state on scene mount: `intro`. Optional `nowMs` records when
 * the intro began (typically `performance.now()` at scene init); callers
 * without a meaningful timestamp (e.g., tests, SSR) can omit it.
 *
 * Use `waitingLapState()` for the post-intro entry point — that's where
 * the racing state machine starts. Use `reset` action to return there
 * after a lap finishes.
 */
export function initialLapState(nowMs: number | null = null): LapState {
  return {
    status: 'intro',
    startedAtMs: null,
    currentLapMs: 0,
    finishedLapMs: null,
    checkpointHit: false,
    introStartedAtMs: nowMs,
  };
}

// Post-intro entry point. Distinct from initialLapState() (which returns
// 'intro'). Used for scene rebuilds where you want to skip the cinematic —
// currently only the `reset` reducer action.
/**
 * Post-intro entry point: the racing state machine's "ready to drive"
 * state. The `reset` action returns to this shape; scene rebuild (e.g.,
 * carousel switch) returns to `initialLapState()` (intro).
 */
export function waitingLapState(): LapState {
  return {
    status: 'waiting',
    startedAtMs: null,
    currentLapMs: 0,
    finishedLapMs: null,
    checkpointHit: false,
    introStartedAtMs: null,
  };
}

export function lapReducer(state: LapState, action: LapAction): LapState {
  // Explicit return type is load-bearing: without it, TS infers
  // `LapState | undefined` from the implicit switch fall-through, and a
  // future LapAction variant added without a matching case would silently
  // return undefined to the scene's dispatch wrapper at runtime.
  switch (action.type) {
    case 'throttle':
      // First W keypress kicks the timer off. Subsequent throttle while
      // already running is a no-op so we don't restart mid-lap. Throttle
      // is also gated during `intro` — input is disabled while the camera
      // orbits and the countdown runs.
      if (state.status !== 'waiting') return state;
      return {
        ...state,
        status: 'running',
        startedAtMs: action.nowMs,
        currentLapMs: 0,
      };

    case 'tick':
      if (state.status !== 'running' || state.startedAtMs === null) return state;
      return {
        ...state,
        currentLapMs: action.nowMs - state.startedAtMs,
      };

    case 'checkpoint':
      // Only matters mid-lap. Lap-state machines only advance the
      // checkpoint flag when the car is actually running.
      if (state.status !== 'running') return state;
      if (state.checkpointHit) return state;
      return { ...state, checkpointHit: true };

    case 'finishCrossed':
      // AE4 — must have hit the checkpoint to count this as a lap finish.
      // Otherwise the driver could reverse across start/finish for a 0-second
      // lap. Silent no-op if conditions aren't met.
      if (state.status !== 'running') return state;
      if (!state.checkpointHit) return state;
      if (state.startedAtMs === null) return state;
      return {
        ...state,
        status: 'finished',
        finishedLapMs: action.nowMs - state.startedAtMs,
        currentLapMs: action.nowMs - state.startedAtMs,
      };

    case 'reset':
      // Retry from `finished` returns to `waiting` — NOT to `intro`. Scene
      // rebuild (carousel switch) is what re-enters intro; the Retry button
      // is for replaying a lap on the same car without re-watching the orbit.
      return waitingLapState();

    case 'introComplete':
    case 'introSkip':
      // Both transitions are intro → waiting. Distinguishing them at the
      // reducer is intentionally a no-op: the SCENE owns the difference
      // (orbit completion vs hold-W skip) and dispatches whichever fits.
      if (state.status !== 'intro') return state;
      return {
        ...state,
        status: 'waiting',
        introStartedAtMs: null,
      };

    default: {
      // Plan-006 review fix — exhaustiveness guard. If a new LapAction
      // variant is added without a case branch above, this assignment
      // fails to compile (variant is no longer narrowable to `never`).
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
