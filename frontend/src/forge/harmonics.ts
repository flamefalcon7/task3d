// plan-015 U8 — pure HSL harmonic-color math for Random Gen (D-056). No
// dependencies (no chroma.js); sub-ms cost; test-first so the scheme
// offsets and seed-rotation behavior are mechanically verified before
// any React wiring.
//
// Algorithm:
//   • harmonicColors(seed, scheme, K) → K coherent colors using the scheme's
//     hue-offset pattern (analogous spread, complementary alternation,
//     triadic 120°, tetradic 90°). Saturation and lightness inherit from
//     the seed so the user controls the overall tonality.
//   • generateVariantColors(seed, scheme, K, N) → N variants × K colors,
//     each variant's seed rotated by (v * 360 / N) so siblings are
//     palette-coherent but visually distinct (R11, AE5).

export type HSL = { h: number; s: number; l: number };

export type HarmonicScheme = 'analogous' | 'complementary' | 'triadic' | 'tetradic';

export const HARMONIC_SCHEMES: readonly HarmonicScheme[] = [
  'analogous',
  'complementary',
  'triadic',
  'tetradic',
];

// Hue offset for the i-th color in a K-color palette under `scheme`.
// Exported for the swatch preview row in RandomGenControls — picking a
// scheme should visually show what hue rotation it produces.
export function hueOffsetFor(
  scheme: HarmonicScheme,
  i: number,
  K: number,
): number {
  switch (scheme) {
    case 'analogous':
      // Spread ±15° per step centered around 0 — K colors fit within
      // (K - 1) * 15° total. The center sits at the seed hue.
      return (i - (K - 1) / 2) * 15;
    case 'complementary':
      return (i % 2) * 180;
    case 'triadic':
      return (i % 3) * 120;
    case 'tetradic':
      return (i % 4) * 90;
  }
}

// Generate K coherent colors from a seed using the given scheme.
export function harmonicColors(
  seed: HSL,
  scheme: HarmonicScheme,
  K: number,
): readonly HSL[] {
  const out: HSL[] = [];
  for (let i = 0; i < K; i++) {
    out.push({
      h: wrapHue(seed.h + hueOffsetFor(scheme, i, K)),
      s: seed.s,
      l: seed.l,
    });
  }
  return out;
}

// Generate N variants × K colors. Each variant's seed is rotated by
// (v * 360 / N) so sibling palettes are distinct but share scheme
// structure. Returns hex strings (#rrggbb) ready for VariantEditor /
// PreviewCanvas consumption.
export function generateVariantColors(
  seed: HSL,
  scheme: HarmonicScheme,
  K: number,
  N: number,
): readonly (readonly string[])[] {
  const result: string[][] = [];
  if (N <= 0 || K <= 0) return result;
  for (let v = 0; v < N; v++) {
    const rotatedSeed: HSL = {
      h: wrapHue(seed.h + (v * 360) / N),
      s: seed.s,
      l: seed.l,
    };
    const colors = harmonicColors(rotatedSeed, scheme, K);
    result.push(colors.map(hslToHex));
  }
  return result;
}

// ---- color-space utilities ---------------------------------------------

export function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

// Standard HSL → sRGB (0..1). Mirrors modePalette's inline hue2rgb so the
// two modules stay independent — harmonics could move to a /color subdir
// later without dragging Babylon deps.
export function hslToRgb(hsl: HSL): readonly [number, number, number] {
  const { h, s, l } = hsl;
  const hh = wrapHue(h) / 360;
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
  return [hue2rgb(hh + 1 / 3), hue2rgb(hh), hue2rgb(hh - 1 / 3)];
}

// Hex helpers — keep here rather than reuse modePalette's so harmonics
// stays a self-contained module.
export function hslToHex(hsl: HSL): string {
  const [r, g, b] = hslToRgb(hsl);
  return rgbToHex(r, g, b);
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// hex (#rrggbb) → HSL. Used by RandomGenControls to convert the HTML5
// color picker's hex output into the HSL seed harmonics consumes.
export function hexToHsl(hex: string): HSL {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0.7, l: 0.5 };
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    case b:
      h = ((r - g) / d + 4) * 60;
      break;
  }
  return { h, s, l };
}
