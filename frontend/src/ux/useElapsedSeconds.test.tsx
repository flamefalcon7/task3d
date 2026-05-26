import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useElapsedSeconds } from './useElapsedSeconds';

describe('useElapsedSeconds', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }));
  afterEach(() => vi.useRealTimers());

  it('returns 0 when inactive', () => {
    const { result } = renderHook(({ active }) => useElapsedSeconds(active), {
      initialProps: { active: false },
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it('ticks at 1Hz while active', () => {
    const { result } = renderHook(() => useElapsedSeconds(true));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(3);
  });

  it('resets to 0 when active goes false', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useElapsedSeconds(active),
      { initialProps: { active: true } },
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(5);
    rerender({ active: false });
    expect(result.current).toBe(0);
  });

  it('PRESERVES the counter when the gating predicate stays true across a re-render', () => {
    // Regression guard for the CreateModelPage uploading→signing reset bug.
    // Three reviewers caught this independently: the prior keyed-on-status
    // effect re-ran on every transition WITHIN the active set, snapping
    // elapsed back to 0 right before the wallet popup.
    let triggerToggle = 0;
    const { result, rerender } = renderHook(
      // 'active' boolean is what useElapsedSeconds sees — the prop name
      // here is unrelated. Simulate a parent that re-renders without
      // changing active.
      ({ _toggle: _ }: { _toggle: number }) => useElapsedSeconds(true),
      { initialProps: { _toggle: triggerToggle } },
    );
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current).toBe(8);

    // Parent rerenders (e.g., status transitioned within the active set).
    triggerToggle = 1;
    rerender({ _toggle: triggerToggle });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(10); // would have been 2 under the old bug
  });

  it('restarts the counter when active toggles false → true', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useElapsedSeconds(active),
      { initialProps: { active: true } },
    );
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current).toBe(4);

    rerender({ active: false });
    expect(result.current).toBe(0);

    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
  });
});
