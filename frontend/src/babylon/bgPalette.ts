// Plan-013 UAT polish: viewer wells are pure black per D-044, but black-PBR
// Tripo meshes become invisible against a black background. Expose a tiny
// 3-state cycle (BLACK → PAPER → GRAY → BLACK) so the user can toggle the
// well bg when a model is hard to see. Single source of truth used by both
// PreviewCanvas and TaggingCanvas.

import { useCallback, useState } from 'react';

export type BgKey = 'black' | 'paper' | 'gray';

export interface BgPaletteEntry {
  /** Visible mono-pill label, e.g. "BG: BLACK". */
  label: string;
  /** Babylon-native [r,g,b] in 0..1 — fed straight to `scene.clearColor.set`. */
  rgb: [number, number, number];
}

export const BG_PALETTE: Record<BgKey, BgPaletteEntry> = {
  // Pure black per D-044 — default. Some PBR Tripo outputs are
  // near-black and disappear against this.
  black: { label: 'BG: BLACK', rgb: [0, 0, 0] },
  // tokens.color.paper (#F5F5F0). Inverts the well so dark meshes pop.
  paper: { label: 'BG: PAPER', rgb: [0.96, 0.96, 0.941] },
  // Mid gray — middle ground for medium-toned PBR meshes that lose against
  // either extreme.
  gray: { label: 'BG: GRAY', rgb: [0.5, 0.5, 0.5] },
};

const CYCLE: readonly BgKey[] = ['black', 'paper', 'gray'];

export function useBgCycle(initial: BgKey = 'black'): {
  bg: BgKey;
  entry: BgPaletteEntry;
  cycle: () => void;
} {
  const [bg, setBg] = useState<BgKey>(initial);
  const cycle = useCallback(() => {
    setBg((prev) => {
      const i = CYCLE.indexOf(prev);
      return CYCLE[(i + 1) % CYCLE.length]!;
    });
  }, []);
  return { bg, entry: BG_PALETTE[bg], cycle };
}
