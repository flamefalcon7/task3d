// Plan-004 U3 — pure reducer for the /track game-state machine.
//
// Pure module: no Babylon, no React. Owned by TrackPage as React state
// (useState) and fed actions by the racetrack scene's physics observers.
// Keeping this reducer pure means lap logic stays unit-testable without
// a WebGL context, and Retry can be a single `reset` action — no need
// to re-create the scene.

export type LapStatus = 'waiting' | 'running' | 'finished';

export interface LapState {
  status: LapStatus;
  startedAtMs: number | null;
  /** Time elapsed since throttle while running; frozen at finishedLapMs once finished. */
  currentLapMs: number;
  finishedLapMs: number | null;
  /** True after the car has crossed the mid-track checkpoint trigger this lap. */
  checkpointHit: boolean;
}

export type LapAction =
  | { type: 'throttle'; nowMs: number }
  | { type: 'tick'; nowMs: number }
  | { type: 'checkpoint' }
  | { type: 'finishCrossed'; nowMs: number }
  | { type: 'reset' };

export function initialLapState(): LapState {
  return {
    status: 'waiting',
    startedAtMs: null,
    currentLapMs: 0,
    finishedLapMs: null,
    checkpointHit: false,
  };
}

export function lapReducer(state: LapState, action: LapAction): LapState {
  switch (action.type) {
    case 'throttle':
      // First W keypress kicks the timer off. Subsequent throttle while
      // already running is a no-op so we don't restart mid-lap.
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
      return initialLapState();
  }
}
