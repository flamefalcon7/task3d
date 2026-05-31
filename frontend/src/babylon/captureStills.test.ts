import { describe, it, expect, vi } from 'vitest';
import { captureStillsWith } from './captureStills';

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
