import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { ResultOverlay } from './ResultOverlay';

afterEach(() => cleanup());

describe('ResultOverlay', () => {
  it('renders the lap time formatted as seconds (sub-minute case)', () => {
    render(
      <ResultOverlay
        lapMs={24310}
        previousPbMs={null}
        isNewPb={true}
        onRetry={() => undefined}
      />,
    );
    // 24310ms → 24.31s (rounded to hundredths).
    expect(screen.getByTestId('track-result-time').textContent).toMatch(/24\.31s/);
  });

  it('renders MM:SS.cc for minute-or-longer laps', () => {
    render(
      <ResultOverlay
        lapMs={75500}
        previousPbMs={null}
        isNewPb={true}
        onRetry={() => undefined}
      />,
    );
    // 75500ms = 1m 15.50s.
    expect(screen.getByTestId('track-result-time').textContent).toMatch(/1:15\.50/);
  });

  it('covers AE2 — first lap with no prior PB shows "NEW PB!"', () => {
    render(
      <ResultOverlay
        lapMs={23420}
        previousPbMs={null}
        isNewPb={true}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/NEW PB/);
  });

  it('covers AE3 — improvement shows NEW PB banner + negative delta vs prior PB', () => {
    render(
      <ResultOverlay
        lapMs={23420}
        previousPbMs={25100}
        isNewPb={true}
        onRetry={() => undefined}
      />,
    );
    // Delta = 23420 - 25100 = -1680ms = -1.68s. Banner + delta must both
    // appear; prior version of this test only asserted NEW PB and never
    // exercised formatPbDelta's negative-delta path.
    const delta = screen.getByTestId('track-result-delta').textContent;
    expect(delta).toMatch(/NEW PB/);
    expect(delta).toMatch(/-1\.68s/);
  });

  it('covers AE3 — regression shows positive delta vs prior PB', () => {
    render(
      <ResultOverlay
        lapMs={26500}
        previousPbMs={25100}
        isNewPb={false}
        onRetry={() => undefined}
      />,
    );
    // Delta = 26500 - 25100 = +1400ms = +1.40s.
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/\+1\.40s/);
  });

  it('shows em-dash when no PB and not a new PB (defensive — shouldn\'t normally occur)', () => {
    render(
      <ResultOverlay
        lapMs={20000}
        previousPbMs={null}
        isNewPb={false}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByTestId('track-result-delta').textContent).toMatch(/—/);
  });

  it('formatResultTime handles edge values: zero-ms renders 0.00s, non-finite renders em-dash', () => {
    // Zero-ms is reachable if Retry fires before any tick propagates.
    // Negative/NaN/Infinity guard against broken upstream state.
    const { unmount } = render(
      <ResultOverlay lapMs={0} previousPbMs={null} isNewPb={true} onRetry={() => undefined} />,
    );
    expect(screen.getByTestId('track-result-time').textContent).toMatch(/0\.00s/);
    unmount();

    render(
      <ResultOverlay
        lapMs={Number.NaN}
        previousPbMs={null}
        isNewPb={true}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByTestId('track-result-time').textContent).toMatch(/—/);
  });

  it('Retry button click invokes onRetry exactly once', () => {
    const onRetry = vi.fn();
    render(
      <ResultOverlay
        lapMs={20000}
        previousPbMs={null}
        isNewPb={true}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByTestId('track-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
