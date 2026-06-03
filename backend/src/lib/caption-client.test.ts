import { describe, it, expect, vi } from 'vitest';
import {
  buildCaptionClient,
  CaptionDegradedError,
  CAPTION_MAX_CHARS,
  type CaptionGenerateFn,
  type CaptionFrame,
} from './caption-client.js';
import { buildQuotaStore } from './quota-store.js';
import type { GeminiGenerateResult } from './gemini-quota.js';

const KEY = 'test-gemini-key';
const frame = (b: string): CaptionFrame => ({ base64: b, mediaType: 'image/webp' });
const frames = (n: number): CaptionFrame[] => Array.from({ length: n }, (_, i) => frame(`b64-${i}`));

/** The widened generate seam returns { text, headers?, usage? } (U2). */
const ok = (text: string): GeminiGenerateResult => ({ text });

describe('caption-client', () => {
  it('returns the model description for the given frames', async () => {
    const generate: CaptionGenerateFn = vi.fn(async () => ok('low-poly red pickup truck'));
    const client = buildCaptionClient({ apiKey: KEY }, { generate });
    const r = await client.caption({ frames: frames(4) });
    expect(r).toBe('low-poly red pickup truck');
  });

  it('sends one text instruction + one image part per frame, all image/webp (AE2)', async () => {
    let captured: { type: string; mediaType?: string }[] = [];
    const generate: CaptionGenerateFn = vi.fn(async ({ content }) => {
      captured = content;
      return ok('low-poly spaceship');
    });
    const client = buildCaptionClient({ apiKey: KEY }, { generate });
    await client.caption({ frames: frames(4) });
    const texts = captured.filter((p) => p.type === 'text');
    const images = captured.filter((p) => p.type === 'image');
    expect(texts).toHaveLength(1);
    expect(images).toHaveLength(4);
    expect(images.every((p) => p.mediaType === 'image/webp')).toBe(true);
  });

  it('sends IMAGES ONLY — no filename/mesh/caller text beyond the fixed instruction (AE5, R6)', async () => {
    let captured: { type: string; text?: string; image?: string }[] = [];
    const generate: CaptionGenerateFn = vi.fn(async ({ content }) => {
      captured = content;
      return ok('low-poly chair');
    });
    const client = buildCaptionClient({ apiKey: KEY }, { generate });
    await client.caption({ frames: frames(3) });
    const texts = captured.filter((p) => p.type === 'text');
    // Exactly one text part, and it is the fixed instruction — nothing caller-supplied.
    expect(texts).toHaveLength(1);
    expect(texts[0]!.text).toMatch(/turntable views/i);
    expect(texts[0]!.text).not.toMatch(/\.glb|filename|mesh|segmentation/i);
  });

  it('clamps an over-long caption to the limit', async () => {
    const huge = 'x'.repeat(CAPTION_MAX_CHARS + 400);
    const generate: CaptionGenerateFn = vi.fn(async () => ok(huge));
    const client = buildCaptionClient({ apiKey: KEY }, { generate });
    const r = await client.caption({ frames: frames(4) });
    expect(r.length).toBeLessThanOrEqual(CAPTION_MAX_CHARS);
  });

  it('throws degraded on empty model output', async () => {
    const generate: CaptionGenerateFn = vi.fn(async () => ok('   '));
    const client = buildCaptionClient({ apiKey: KEY }, { generate });
    await expect(client.caption({ frames: frames(4) })).rejects.toBeInstanceOf(CaptionDegradedError);
  });

  it('throws degraded when the model rejects', async () => {
    const generate: CaptionGenerateFn = vi.fn(async () => {
      throw new Error('gemini 500');
    });
    const client = buildCaptionClient({ apiKey: KEY }, { generate });
    await expect(client.caption({ frames: frames(4) })).rejects.toBeInstanceOf(CaptionDegradedError);
  });

  it('throws degraded on timeout', async () => {
    const generate: CaptionGenerateFn = vi.fn(() => new Promise<GeminiGenerateResult>(() => {}));
    const client = buildCaptionClient({ apiKey: KEY }, { generate, timeoutMs: 20 });
    await expect(client.caption({ frames: frames(4) })).rejects.toBeInstanceOf(CaptionDegradedError);
  });

  it('throws degraded when no frames are supplied', async () => {
    const generate: CaptionGenerateFn = vi.fn(async () => ok('should not be called'));
    const client = buildCaptionClient({ apiKey: KEY }, { generate });
    await expect(client.caption({ frames: [] })).rejects.toBeInstanceOf(CaptionDegradedError);
    expect(generate).not.toHaveBeenCalled();
  });

  it('is inert without an API key — never calls the model (AE7)', async () => {
    const generate: CaptionGenerateFn = vi.fn(async () => ok('should not be called'));
    const client = buildCaptionClient({}, { generate });
    expect(client.configured).toBe(false);
    await expect(client.caption({ frames: frames(4) })).rejects.toBeInstanceOf(CaptionDegradedError);
    expect(generate).not.toHaveBeenCalled();
  });

  // --- U2: quota recording inside the generate closure ---

  it('records a self-count on success when a store is injected (no headers required)', async () => {
    const store = buildQuotaStore({ path: ':memory:' });
    const generate: CaptionGenerateFn = vi.fn(async () => ok('low-poly boat'));
    const client = buildCaptionClient({ apiKey: KEY }, { generate, store });
    await client.caption({ frames: frames(3) });
    expect(store.getGeminiState('caption', { now: Date.now() }).dailyCount).toBe(1);
    store.close();
  });

  it('records a 429 cooldown then still throws degraded (slow-429 capture)', async () => {
    const store = buildQuotaStore({ path: ':memory:' });
    const rateLimit = Object.assign(new Error('429 Too Many Requests'), {
      name: 'APICallError',
      statusCode: 429,
      responseHeaders: { 'retry-after': '90' },
    });
    const generate: CaptionGenerateFn = vi.fn(async () => {
      throw rateLimit;
    });
    const client = buildCaptionClient({ apiKey: KEY }, { generate, store });
    await expect(client.caption({ frames: frames(3) })).rejects.toBeInstanceOf(CaptionDegradedError);
    expect(store.getGeminiState('caption', { now: Date.now() }).cooldownUntil).not.toBeNull();
    store.close();
  });
});
