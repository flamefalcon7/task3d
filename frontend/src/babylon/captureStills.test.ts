import { describe, it, expect, vi } from 'vitest';
import { captureStillsWith, DEFAULT_STILL_COUNT } from './captureStills';

// Lockstep guard: capturing more preview stills than the contract's
// MAX_PREVIEW_BLOBS aborts ETooManyPreviews (code 44) at publish. Keep this in
// sync with contracts/model3d/sources/model3d.move (MAX_PREVIEW_BLOBS).
const CONTRACT_MAX_PREVIEW_BLOBS = 8;
describe('DEFAULT_STILL_COUNT ↔ contract cap', () => {
  it('never exceeds the on-chain MAX_PREVIEW_BLOBS', () => {
    expect(DEFAULT_STILL_COUNT).toBeLessThanOrEqual(CONTRACT_MAX_PREVIEW_BLOBS);
  });
});

describe('captureStillsWith', () => {
  it('captures N stills at evenly-spaced alphas and watermarks each, preserving order', async () => {
    const seenAlphas: number[] = [];
    const screenshot = vi.fn(async (alpha: number) => {
      seenAlphas.push(alpha);
      return `data:image/png;base64,frame-${alpha}`;
    });
    const watermark = vi.fn(async (dataUrl: string) => new Uint8Array([dataUrl.length]));

    const out = await captureStillsWith(3, 1, { screenshot, watermark });

    expect(out).toHaveLength(3);
    expect(screenshot).toHaveBeenCalledTimes(3);
    expect(watermark).toHaveBeenCalledTimes(3);
    // Evenly spaced from startAlpha=1 by 2π/3.
    expect(seenAlphas).toEqual([1, 1 + (2 * Math.PI) / 3, 1 + (4 * Math.PI) / 3]);
    // Each watermark fed the matching screenshot output (order preserved).
    expect(watermark.mock.calls.map((c) => c[0])).toEqual([
      'data:image/png;base64,frame-1',
      `data:image/png;base64,frame-${1 + (2 * Math.PI) / 3}`,
      `data:image/png;base64,frame-${1 + (4 * Math.PI) / 3}`,
    ]);
  });

  it('count 0 → no stills and no screenshot/watermark calls', async () => {
    const screenshot = vi.fn();
    const watermark = vi.fn();
    const out = await captureStillsWith(0, 0, { screenshot, watermark });
    expect(out).toEqual([]);
    expect(screenshot).not.toHaveBeenCalled();
    expect(watermark).not.toHaveBeenCalled();
  });
});
