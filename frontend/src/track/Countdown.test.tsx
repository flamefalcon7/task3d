import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { Countdown } from './Countdown';

// Plan-006 U8 — Countdown component tests. We inject a synchronous
// scheduler so timing assertions are deterministic without waiting for
// real setTimeout to fire. `act()` is imported from @testing-library/react
// (which re-exports React's act). Project convention: act for jsdom.

interface QueuedTask {
  cb: () => void;
  ms: number;
}

function makeScheduler(): {
  scheduler: (cb: () => void, ms: number) => () => void;
  flushOne: () => void;
  pending: QueuedTask[];
} {
  const pending: QueuedTask[] = [];
  return {
    pending,
    scheduler: (cb, ms) => {
      const task = { cb, ms };
      pending.push(task);
      return () => {
        const idx = pending.indexOf(task);
        if (idx >= 0) pending.splice(idx, 1);
      };
    },
    flushOne: () => {
      const next = pending.shift();
      if (!next) throw new Error('no scheduled task to flush');
      next.cb();
    },
  };
}

describe('Countdown', () => {
  it('renders 3, 2, 1, GO! in sequence', () => {
    const { scheduler, flushOne } = makeScheduler();
    render(<Countdown onComplete={() => {}} scheduler={scheduler} />);
    expect(screen.getByTestId('countdown-overlay').textContent).toBe('3');
    act(() => flushOne());
    expect(screen.getByTestId('countdown-overlay').textContent).toBe('2');
    act(() => flushOne());
    expect(screen.getByTestId('countdown-overlay').textContent).toBe('1');
    act(() => flushOne());
    expect(screen.getByTestId('countdown-overlay').textContent).toBe('GO!');
  });

  it('invokes onComplete after the GO! display step', () => {
    const onComplete = vi.fn();
    const { scheduler, flushOne } = makeScheduler();
    render(<Countdown onComplete={onComplete} scheduler={scheduler} />);
    // Advance: 3 → 2 → 1 → GO!
    act(() => flushOne()); // 3 → 2
    act(() => flushOne()); // 2 → 1
    act(() => flushOne()); // 1 → GO!
    expect(onComplete).not.toHaveBeenCalled();
    act(() => flushOne()); // GO! holds, then fires onComplete + fade
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('unmounts cleanly mid-countdown without firing setState-after-unmount', () => {
    const onComplete = vi.fn();
    const { scheduler, pending } = makeScheduler();
    const { unmount } = render(
      <Countdown onComplete={onComplete} scheduler={scheduler} />,
    );
    expect(pending).toHaveLength(1);
    // Unmount before the first tick fires. The component's effect cleanup
    // should cancel the pending task.
    unmount();
    expect(pending).toHaveLength(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('returns null (no rendered overlay) after the fade-out completes', () => {
    const { scheduler, flushOne } = makeScheduler();
    render(<Countdown onComplete={() => {}} scheduler={scheduler} />);
    act(() => flushOne()); // 3 → 2
    act(() => flushOne()); // 2 → 1
    act(() => flushOne()); // 1 → GO!
    act(() => flushOne()); // GO! → fading
    expect(screen.queryByTestId('countdown-overlay')).not.toBeNull();
    act(() => flushOne()); // fading → done (unmounts overlay)
    expect(screen.queryByTestId('countdown-overlay')).toBeNull();
  });
});
