// Plan-006 U8 — pre-race countdown overlay. Plays "3 → 2 → 1 → GO!"
// with ~700ms per step, then invokes onComplete and fades out.
//
// React-owned animation (setTimeout chain). The scene's intro orbit ends
// and TrackPage mounts this; on GO display, TrackPage routes the
// onComplete callback back to the scene as `dispatchIntroComplete()`.

import { useEffect, useState, type ReactElement } from 'react';

const STEPS = ['3', '2', '1', 'GO!'] as const;
const STEP_DURATION_MS = 700;
const FADE_DURATION_MS = 400;

type Phase = number /* 0..3 = STEPS index */ | 'fading' | 'done';

interface CountdownProps {
  onComplete: () => void;
  /** Hook for tests to swap setTimeout (deterministic timing). */
  scheduler?: (cb: () => void, ms: number) => () => void;
}

const defaultScheduler = (cb: () => void, ms: number): (() => void) => {
  const id = setTimeout(cb, ms);
  return () => clearTimeout(id);
};

export function Countdown({
  onComplete,
  scheduler = defaultScheduler,
}: CountdownProps): ReactElement | null {
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    if (phase === 'done') return;
    if (phase === 'fading') {
      const cancel = scheduler(() => setPhase('done'), FADE_DURATION_MS);
      return cancel;
    }
    // Numeric phase 0..3
    if (phase < STEPS.length - 1) {
      const cancel = scheduler(() => setPhase(phase + 1), STEP_DURATION_MS);
      return cancel;
    }
    // Phase is at the final step (GO!). Hold for STEP_DURATION_MS, then
    // notify caller and begin fade-out. onComplete fires BEFORE the fade
    // so the scene's input can unblock the instant the player sees GO.
    const cancel = scheduler(() => {
      onComplete();
      setPhase('fading');
    }, STEP_DURATION_MS);
    return cancel;
  }, [phase, onComplete, scheduler]);

  if (phase === 'done') return null;

  const isFading = phase === 'fading';
  const label = isFading ? STEPS[STEPS.length - 1]! : STEPS[phase as number]!;

  return (
    <div
      data-testid="countdown-overlay"
      data-phase={String(phase)}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: isFading ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        zIndex: 30,
      }}
    >
      <span
        style={{
          fontSize: '15vw',
          fontWeight: 800,
          color: '#fff',
          textShadow: '0 4px 24px rgba(0,0,0,0.6)',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          letterSpacing: '-0.02em',
        }}
      >
        {label}
      </span>
    </div>
  );
}
