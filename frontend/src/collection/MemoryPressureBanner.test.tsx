import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import {
  HEAP_WARN_OFF_BYTES,
  HEAP_WARN_ON_BYTES,
  MemoryPressureBanner,
} from './MemoryPressureBanner';

// Stash + restore the (Chromium-only) performance.memory API. jsdom's
// performance object doesn't expose memory, so each test sets it explicitly
// and the afterEach undoes it.
function stubHeap(usedBytes: number | null) {
  const perf = performance as unknown as { memory?: unknown };
  if (usedBytes === null) {
    delete perf.memory;
  } else {
    perf.memory = {
      usedJSHeapSize: usedBytes,
      jsHeapSizeLimit: 4 * 1024 * 1024 * 1024,
    };
  }
}

beforeEach(() => {
  stubHeap(null);
});

afterEach(() => {
  cleanup();
  stubHeap(null);
});

describe('MemoryPressureBanner', () => {
  it('visible when usedJSHeapSize > HEAP_WARN_ON_BYTES (3 GB)', () => {
    stubHeap(3 * 1024 * 1024 * 1024);
    render(<MemoryPressureBanner />);
    expect(screen.getByTestId('memory-pressure-banner')).toBeTruthy();
  });

  it('hidden when usedJSHeapSize < HEAP_WARN_OFF_BYTES (1 GB)', () => {
    stubHeap(1 * 1024 * 1024 * 1024);
    render(<MemoryPressureBanner />);
    expect(screen.queryByTestId('memory-pressure-banner')).toBeNull();
  });

  it('threshold edge: usedJSHeapSize exactly at HEAP_WARN_ON_BYTES → visible (>=)', () => {
    stubHeap(HEAP_WARN_ON_BYTES);
    render(<MemoryPressureBanner />);
    expect(screen.getByTestId('memory-pressure-banner')).toBeTruthy();
  });

  it('returns null when performance.memory is undefined (Firefox/Safari)', () => {
    stubHeap(null);
    const { container } = render(<MemoryPressureBanner />);
    // Component returns null — no banner, no error.
    expect(container.firstChild).toBeNull();
  });

  it('dismiss button hides the banner', () => {
    stubHeap(3 * 1024 * 1024 * 1024);
    render(<MemoryPressureBanner />);
    expect(screen.getByTestId('memory-pressure-banner')).toBeTruthy();

    fireEvent.click(screen.getByTestId('memory-pressure-banner-dismiss'));
    expect(screen.queryByTestId('memory-pressure-banner')).toBeNull();
  });

  it('dismissed banner re-appears when recheckSignal changes AND heap still over threshold', () => {
    stubHeap(3 * 1024 * 1024 * 1024);
    const { rerender } = render(<MemoryPressureBanner recheckSignal={0} />);
    fireEvent.click(screen.getByTestId('memory-pressure-banner-dismiss'));
    expect(screen.queryByTestId('memory-pressure-banner')).toBeNull();

    // LAUNCH click bumps recheckSignal; heap still over threshold → re-surface.
    rerender(<MemoryPressureBanner recheckSignal={1} />);
    expect(screen.getByTestId('memory-pressure-banner')).toBeTruthy();
  });

  it('dismissed banner stays hidden when recheckSignal changes AND heap dropped below OFF', () => {
    stubHeap(3 * 1024 * 1024 * 1024);
    const { rerender } = render(<MemoryPressureBanner recheckSignal={0} />);
    fireEvent.click(screen.getByTestId('memory-pressure-banner-dismiss'));

    // Heap dropped below OFF threshold; recheckSignal bumped.
    stubHeap(1 * 1024 * 1024 * 1024);
    rerender(<MemoryPressureBanner recheckSignal={1} />);
    expect(screen.queryByTestId('memory-pressure-banner')).toBeNull();
  });

  it('hysteresis: shown banner stays visible when heap dips into the hysteresis band on recheck', () => {
    // Initial: above ON → shown.
    stubHeap(3 * 1024 * 1024 * 1024);
    const { rerender } = render(<MemoryPressureBanner recheckSignal={0} />);
    expect(screen.getByTestId('memory-pressure-banner')).toBeTruthy();

    // Recheck with heap in the hysteresis band (between OFF and ON) → still shown.
    const inBand = Math.round((HEAP_WARN_OFF_BYTES + HEAP_WARN_ON_BYTES) / 2);
    stubHeap(inBand);
    rerender(<MemoryPressureBanner recheckSignal={1} />);
    expect(screen.getByTestId('memory-pressure-banner')).toBeTruthy();

    // Recheck with heap below OFF → hidden.
    stubHeap(1 * 1024 * 1024 * 1024);
    rerender(<MemoryPressureBanner recheckSignal={2} />);
    expect(screen.queryByTestId('memory-pressure-banner')).toBeNull();
  });

  it('hysteresis: hidden banner does NOT appear when heap is in the hysteresis band on first check', () => {
    // First mount with heap in the hysteresis band (between OFF and ON).
    // showing starts false, so the band keeps it false. Only crossing ON
    // can flip showing true.
    const inBand = Math.round((HEAP_WARN_OFF_BYTES + HEAP_WARN_ON_BYTES) / 2);
    stubHeap(inBand);
    render(<MemoryPressureBanner />);
    expect(screen.queryByTestId('memory-pressure-banner')).toBeNull();
  });
});
