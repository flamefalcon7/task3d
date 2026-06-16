// Viewer-well backgrounds. The 3D clearColor DEFAULTS to mid-gray per D-107
// (amends D-044's original pure-black default): near-black PBR Tripo meshes
// disappear against black, and gray is the documented middle ground that reads
// across light + dark meshes. A tiny 3-state cycle (GRAY → BLACK → PAPER → GRAY)
// lets the user toggle when a specific model wants a different backdrop. Single
// source of truth used by both PreviewCanvas and TaggingCanvas — and by the
// encrypted-base snapshot, which inherits scene.clearColor at capture time.

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

// D-107 — global default well background. Mid-gray (amends D-044's black).
// Both PreviewCanvas and TaggingCanvas default their `defaultBg` prop to this,
// and useBgCycle falls back to it, so there is one place to change the default.
export const DEFAULT_BG: BgKey = 'gray';

export function useBgCycle(initial: BgKey = DEFAULT_BG): {
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
