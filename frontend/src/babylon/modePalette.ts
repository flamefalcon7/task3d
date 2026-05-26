// plan-015 U2 — canvas mode infrastructure (D-055). 4-mode standard for every
// viewer well: PBR (existing textured render), PARTS (deterministic per-index
// rainbow palette as visual proof of segments), SOLO (HighlightLayer + alpha
// dim on others, driven by `highlightedParts`), WIREFRAME (mesh.wireframe).
//
// Module is pure-TS — no Babylon import — so the math and cycle hook are
// unit-testable without a WebGL context. `applyCanvasMode.ts` consumes the
// numeric output and bridges into Babylon materials.

import { useCallback, useState } from 'react';

export type CanvasMode = 'pbr' | 'parts' | 'solo' | 'wireframe';

export type Rgb01 = readonly [number, number, number];

export interface ModePaletteEntry {
  /** Visible mono-pill label, e.g. "MODE: PBR". Matches the BG pill format
   *  (`BG: BLACK`) for visual symmetry at top-left vs top-right of the well. */
  label: string;
  mode: CanvasMode;
}

export const MODE_SEQUENCE: readonly CanvasMode[] = [
  'pbr',
  'parts',
  'solo',
  'wireframe',
];

export const MODE_PALETTE: Record<CanvasMode, ModePaletteEntry> = {
  pbr: { label: 'MODE: PBR', mode: 'pbr' },
  parts: { label: 'MODE: PARTS', mode: 'parts' },
  solo: { label: 'MODE: SOLO', mode: 'solo' },
  wireframe: { label: 'MODE: WIREFRAME', mode: 'wireframe' },
};

// 12-hue deterministic rainbow. Same index → same color across loads, so a
// re-mount of the same segmented GLB produces the same colored part-list
// swatches (PartListPanel relies on this).
export const PARTS_PALETTE_HUE_COUNT = 12;
const PARTS_SAT = 0.7;
const PARTS_LIGHT = 0.5;

export function partsColor(index: number): Rgb01 {
  // JS `%` is sign-preserving for negative inputs; double-mod to clamp
  // negatives into [0, HUE_COUNT) deterministically. Index < 0 shouldn't
  // happen in practice, but a stray −1 produced by an off-by-one upstream
  // would otherwise return NaN colors.
  const wrapped =
    ((index % PARTS_PALETTE_HUE_COUNT) + PARTS_PALETTE_HUE_COUNT) %
    PARTS_PALETTE_HUE_COUNT;
  const hueDeg = wrapped * (360 / PARTS_PALETTE_HUE_COUNT);
  return hslToRgb(hueDeg / 360, PARTS_SAT, PARTS_LIGHT);
}

// Hex-string variant of partsColor — convenience for PartListPanel swatches
// and any other DOM consumer that needs CSS color literals rather than
// Babylon's RGB 0..1 tuples.
export function partsColorHex(index: number): string {
  const [r, g, b] = partsColor(index);
  return rgbToHex(r, g, b);
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Standard HSL → sRGB. Inline rather than pull in `chroma.js` or similar
// — sub-ms cost, zero new dep. Returns RGB in 0..1 (Babylon Color3 native).
function hslToRgb(h: number, s: number, l: number): Rgb01 {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}

export function useModeCycle(initial: CanvasMode = 'pbr'): {
  mode: CanvasMode;
  entry: ModePaletteEntry;
  cycle: () => void;
} {
  const [mode, setMode] = useState<CanvasMode>(initial);
  const cycle = useCallback(() => {
    setMode((prev) => {
      const i = MODE_SEQUENCE.indexOf(prev);
      return MODE_SEQUENCE[(i + 1) % MODE_SEQUENCE.length]!;
    });
  }, []);
  return { mode, entry: MODE_PALETTE[mode], cycle };
}
