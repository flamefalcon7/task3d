import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BG_PALETTE, useBgCycle } from './bgPalette';

describe('useBgCycle', () => {
  it('defaults to gray (D-107) and cycles GRAY → BLACK → PAPER → GRAY', () => {
    const { result } = renderHook(() => useBgCycle());
    expect(result.current.bg).toBe('gray');
    expect(result.current.entry.label).toBe('BG: GRAY');

    act(() => result.current.cycle());
    expect(result.current.bg).toBe('black');
    expect(result.current.entry.label).toBe('BG: BLACK');

    act(() => result.current.cycle());
    expect(result.current.bg).toBe('paper');
    expect(result.current.entry.label).toBe('BG: PAPER');

    act(() => result.current.cycle());
    expect(result.current.bg).toBe('gray');
  });

  it('honors the initial bg argument', () => {
    const { result } = renderHook(() => useBgCycle('paper'));
    expect(result.current.bg).toBe('paper');
  });

  it('exposes [r,g,b] tuples in 0..1 for Babylon clearColor.set', () => {
    for (const key of ['black', 'paper', 'gray'] as const) {
      const { rgb } = BG_PALETTE[key];
      expect(rgb).toHaveLength(3);
      for (const c of rgb) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
