import { useEffect, useRef, useState } from 'react';

// 1Hz elapsed-seconds counter that survives status transitions within an
// active window. The `start` timestamp lives in a ref so re-running the
// effect (because the gating predicate's source state changed without the
// predicate itself going false) does NOT reset the displayed seconds. Only
// transitioning out of the active window — predicate goes false, or unmount
// — clears the counter and the start timestamp.
//
// Why a ref and not a plain `let start = Date.now()` inside the effect:
// effects re-run on every gating-state change; CreateModelPage flips
// mintStatus from 'uploading' → 'signing' mid-flow, and the pre-fix code
// snapped the visible elapsed back to 0 right before the wallet popup —
// exactly when reassurance matters most. Three reviewers (adversarial /
// julik / correctness) flagged it independently.
export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();
    const start = startRef.current;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}
