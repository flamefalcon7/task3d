import { describe, expect, it } from 'vitest';
import {
  generateVariantColors,
  harmonicColors,
  HARMONIC_SCHEMES,
  hexToHsl,
  hslToHex,
  hslToRgb,
  hueOffsetFor,
  rgbToHex,
  wrapHue,
} from './harmonics';

describe('wrapHue', () => {
  it('keeps in-range hues unchanged', () => {
    expect(wrapHue(0)).toBe(0);
    expect(wrapHue(180)).toBe(180);
    expect(wrapHue(359)).toBe(359);
  });

  it('wraps above 360°', () => {
    expect(wrapHue(360)).toBe(0);
    expect(wrapHue(540)).toBe(180);
    expect(wrapHue(720)).toBe(0);
  });

  it('wraps negative hues into [0, 360)', () => {
    expect(wrapHue(-15)).toBe(345);
    expect(wrapHue(-180)).toBe(180);
    expect(wrapHue(-720)).toBe(0);
  });
});

describe('hueOffsetFor', () => {
  it('analogous spreads ±15° per step centered around 0', () => {
    // K=3: offsets at -15, 0, +15
    expect(hueOffsetFor('analogous', 0, 3)).toBe(-15);
    expect(hueOffsetFor('analogous', 1, 3)).toBe(0);
    expect(hueOffsetFor('analogous', 2, 3)).toBe(15);
    // K=5: offsets at -30, -15, 0, +15, +30
    expect(hueOffsetFor('analogous', 0, 5)).toBe(-30);
    expect(hueOffsetFor('analogous', 4, 5)).toBe(30);
  });

  it('complementary alternates between seed and seed+180°', () => {
    expect(hueOffsetFor('complementary', 0, 4)).toBe(0);
    expect(hueOffsetFor('complementary', 1, 4)).toBe(180);
    expect(hueOffsetFor('complementary', 2, 4)).toBe(0);
    expect(hueOffsetFor('complementary', 3, 4)).toBe(180);
  });

  it('triadic cycles seed, +120°, +240°', () => {
    expect(hueOffsetFor('triadic', 0, 3)).toBe(0);
    expect(hueOffsetFor('triadic', 1, 3)).toBe(120);
    expect(hueOffsetFor('triadic', 2, 3)).toBe(240);
    expect(hueOffsetFor('triadic', 3, 4)).toBe(0); // wraps via modulo
  });

  it('tetradic cycles seed, +90°, +180°, +270°', () => {
    expect(hueOffsetFor('tetradic', 0, 4)).toBe(0);
    expect(hueOffsetFor('tetradic', 1, 4)).toBe(90);
    expect(hueOffsetFor('tetradic', 2, 4)).toBe(180);
    expect(hueOffsetFor('tetradic', 3, 4)).toBe(270);
    expect(hueOffsetFor('tetradic', 4, 5)).toBe(0); // wraps
  });
});

describe('harmonicColors', () => {
  it('returns K colors with consistent saturation + lightness from the seed', () => {
    const seed = { h: 0, s: 0.7, l: 0.5 };
    const colors = harmonicColors(seed, 'analogous', 5);
    expect(colors).toHaveLength(5);
    for (const c of colors) {
      expect(c.s).toBe(0.7);
      expect(c.l).toBe(0.5);
    }
  });

  it('analogous hues spread around the seed', () => {
    const colors = harmonicColors({ h: 120, s: 0.7, l: 0.5 }, 'analogous', 3);
    expect(colors[0]!.h).toBe(105); // 120 - 15
    expect(colors[1]!.h).toBe(120); // 120
    expect(colors[2]!.h).toBe(135); // 120 + 15
  });

  it('triadic hues are seed + 120° steps (wrapped past 360)', () => {
    const colors = harmonicColors({ h: 300, s: 0.7, l: 0.5 }, 'triadic', 3);
    expect(colors[0]!.h).toBe(300);
    expect(colors[1]!.h).toBe(60); // 300 + 120 = 420 wrapped to 60
    expect(colors[2]!.h).toBe(180); // 300 + 240 = 540 wrapped to 180
  });

  it('wraps negative analogous offsets past 0° into [0, 360)', () => {
    const colors = harmonicColors({ h: 10, s: 0.7, l: 0.5 }, 'analogous', 3);
    expect(colors[0]!.h).toBe(355); // 10 - 15 = -5 → 355
  });

  it('handles K > scheme native count by wrapping modulo (triadic K=5)', () => {
    const colors = harmonicColors({ h: 0, s: 0.7, l: 0.5 }, 'triadic', 5);
    expect(colors[0]!.h).toBe(0);
    expect(colors[1]!.h).toBe(120);
    expect(colors[2]!.h).toBe(240);
    expect(colors[3]!.h).toBe(0); // wraps
    expect(colors[4]!.h).toBe(120);
  });
});

describe('generateVariantColors', () => {
  it('returns N variants × K colors as hex strings', () => {
    const result = generateVariantColors({ h: 0, s: 0.7, l: 0.5 }, 'analogous', 5, 10);
    expect(result).toHaveLength(10);
    for (const variant of result) {
      expect(variant).toHaveLength(5);
      for (const hex of variant) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('rotates each variant seed by (v * 360 / N) — siblings are distinct', () => {
    const result = generateVariantColors(
      { h: 0, s: 0.7, l: 0.5 },
      'triadic',
      3,
      4,
    );
    // For triadic K=3: each variant's first color is the rotated seed hue.
    // N=4 → rotations of 0°, 90°, 180°, 270°.
    // Variant 0 first color: H=0 → red-leaning. Variant 2 first color: H=180
    // → cyan. They should differ in hex.
    expect(result[0]![0]).not.toBe(result[1]![0]);
    expect(result[1]![0]).not.toBe(result[2]![0]);
    expect(result[2]![0]).not.toBe(result[3]![0]);
  });

  it('is deterministic — same inputs produce the same output', () => {
    const a = generateVariantColors({ h: 50, s: 0.6, l: 0.5 }, 'tetradic', 4, 5);
    const b = generateVariantColors({ h: 50, s: 0.6, l: 0.5 }, 'tetradic', 4, 5);
    expect(a).toEqual(b);
  });

  it('returns empty for N=0 or K=0', () => {
    expect(generateVariantColors({ h: 0, s: 0.7, l: 0.5 }, 'analogous', 5, 0)).toEqual([]);
    expect(generateVariantColors({ h: 0, s: 0.7, l: 0.5 }, 'analogous', 0, 5)).toEqual([]);
  });

  it('handles all four schemes exposed via HARMONIC_SCHEMES', () => {
    for (const scheme of HARMONIC_SCHEMES) {
      const result = generateVariantColors(
        { h: 0, s: 0.7, l: 0.5 },
        scheme,
        4,
        4,
      );
      expect(result).toHaveLength(4);
      expect(result[0]).toHaveLength(4);
    }
  });
});

describe('hslToRgb / hslToHex', () => {
  it('hslToRgb returns RGB in 0..1 for known points', () => {
    // Pure red: H=0, S=1, L=0.5
    const [r, g, b] = hslToRgb({ h: 0, s: 1, l: 0.5 });
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(0);
  });

  it('hslToRgb produces grayscale at S=0', () => {
    const [r, g, b] = hslToRgb({ h: 123, s: 0, l: 0.5 });
    expect(r).toBeCloseTo(0.5);
    expect(g).toBeCloseTo(0.5);
    expect(b).toBeCloseTo(0.5);
  });

  it('hslToHex returns 7-char hex (#rrggbb)', () => {
    const hex = hslToHex({ h: 240, s: 1, l: 0.5 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    // Pure blue should be near #0000ff
    expect(hex).toBe('#0000ff');
  });
});

describe('rgbToHex', () => {
  it('clamps out-of-range values', () => {
    expect(rgbToHex(-0.5, 0.5, 1.5)).toBe('#0080ff');
  });
});

describe('hexToHsl', () => {
  it('round-trips pure red, green, blue hues', () => {
    expect(hexToHsl('#ff0000').h).toBeCloseTo(0);
    expect(hexToHsl('#00ff00').h).toBeCloseTo(120);
    expect(hexToHsl('#0000ff').h).toBeCloseTo(240);
  });

  it('returns S=0 for grayscale inputs', () => {
    const gray = hexToHsl('#808080');
    expect(gray.s).toBeCloseTo(0);
    expect(gray.l).toBeCloseTo(128 / 255);
  });

  it('falls back to a sensible seed on malformed input', () => {
    const fallback = hexToHsl('not-a-hex');
    expect(fallback.s).toBeGreaterThan(0);
  });

  it('round-trips through hslToHex → hexToHsl with low drift', () => {
    const seed = { h: 200, s: 0.7, l: 0.5 };
    const hex = hslToHex(seed);
    const back = hexToHsl(hex);
    expect(back.h).toBeCloseTo(seed.h, 0); // 1-degree tolerance for sRGB rounding
    expect(back.s).toBeCloseTo(seed.s, 1);
    expect(back.l).toBeCloseTo(seed.l, 1);
  });
});
