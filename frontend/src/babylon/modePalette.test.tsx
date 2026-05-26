import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  MODE_PALETTE,
  MODE_SEQUENCE,
  partsColor,
  partsColorHex,
  PARTS_PALETTE_HUE_COUNT,
  useModeCycle,
} from './modePalette';

describe('useModeCycle', () => {
  it('defaults to pbr and cycles PBR → PARTS → SOLO → WIREFRAME → PBR', () => {
    const { result } = renderHook(() => useModeCycle());
    expect(result.current.mode).toBe('pbr');
    expect(result.current.entry.label).toBe('MODE: PBR');

    act(() => result.current.cycle());
    expect(result.current.mode).toBe('parts');
    expect(result.current.entry.label).toBe('MODE: PARTS');

    act(() => result.current.cycle());
    expect(result.current.mode).toBe('solo');

    act(() => result.current.cycle());
    expect(result.current.mode).toBe('wireframe');

    act(() => result.current.cycle());
    expect(result.current.mode).toBe('pbr');
  });

  it('honors the initial mode argument', () => {
    const { result } = renderHook(() => useModeCycle('parts'));
    expect(result.current.mode).toBe('parts');
    expect(result.current.entry.label).toBe('MODE: PARTS');
  });

  it('exposes MODE_SEQUENCE in display order with matching MODE_PALETTE entries', () => {
    expect(MODE_SEQUENCE).toEqual(['pbr', 'parts', 'solo', 'wireframe']);
    for (const m of MODE_SEQUENCE) {
      expect(MODE_PALETTE[m].mode).toBe(m);
      expect(MODE_PALETTE[m].label).toMatch(/^MODE: /);
    }
  });
});

describe('partsColor', () => {
  it('returns RGB tuples in 0..1', () => {
    for (let i = 0; i < 24; i++) {
      const c = partsColor(i);
      expect(c).toHaveLength(3);
      for (const v of c) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic and stable per index', () => {
    expect(partsColor(0)).toEqual(partsColor(0));
    expect(partsColor(5)).toEqual(partsColor(5));
  });

  it('wraps past the 12-hue count (index N and N + 12 produce identical colors)', () => {
    expect(partsColor(0)).toEqual(partsColor(PARTS_PALETTE_HUE_COUNT));
    expect(partsColor(3)).toEqual(partsColor(PARTS_PALETTE_HUE_COUNT + 3));
  });

  it('hue 0 (index 0) is a saturated red', () => {
    const [r, g, b] = partsColor(0);
    // HSL(0, 0.7, 0.5) ≈ rgb(0.85, 0.15, 0.15)
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    expect(Math.abs(g - b)).toBeLessThan(0.01); // symmetric around red
  });

  it('handles negative indices defensively (no NaN)', () => {
    const c = partsColor(-1);
    for (const v of c) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('partsColorHex', () => {
  it('returns "#RRGGBB" hex strings (lowercase, 7 chars)', () => {
    for (let i = 0; i < 24; i++) {
      const hex = partsColorHex(i);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('matches the RGB tuple from partsColor at the same index', () => {
    const [r, g, b] = partsColor(0);
    const hex = partsColorHex(0);
    expect(hex.slice(1, 3)).toBe(Math.round(r * 255).toString(16).padStart(2, '0'));
    expect(hex.slice(3, 5)).toBe(Math.round(g * 255).toString(16).padStart(2, '0'));
    expect(hex.slice(5, 7)).toBe(Math.round(b * 255).toString(16).padStart(2, '0'));
  });

  it('is deterministic and wraps past the 12-hue count', () => {
    expect(partsColorHex(3)).toBe(partsColorHex(PARTS_PALETTE_HUE_COUNT + 3));
  });
});
