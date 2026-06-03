// plan-026 U4 — client-side preview stills for ENCRYPTED ALLOW_LIST bases.
//
// A prospective forker must be able to evaluate an encrypted base before paying
// the fork fee (R6/R12). We can't serve the (ciphertext) GLB, so at publish time
// — while the PLAINTEXT base is still rendered in the preview canvas — we capture
// a few watermarked turntable stills, upload them as PUBLIC Walrus blobs, and
// record their ids in the Model3D's `preview_blob_ids` (R13: public + watermarked).
//
// The actual Babylon screenshot + canvas watermark is browser-only (needs WebGL),
// so the orchestration here is dependency-injected: `captureStillsWith` takes a
// `screenshot(alpha)` and a `watermark(dataUrl)` and is fully unit-testable; the
// PreviewCanvas handle wires the real Babylon/canvas implementations in (see
// `captureStillsFromScene`). Default treatment is the FULL look (treatment "B");
// reduced treatments (clay / part-reveal) are deferred follow-up work.

import { Tools } from '@babylonjs/core/Misc/tools';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';

/**
 * Number of turntable angles captured by default (evenly spaced around alpha).
 * WebP keeps each frame ~5 KB (~40 KB for 8, a rounding error next to the
 * multi-MB ciphertext); the whole set + the ciphertext ride in ONE Walrus quilt
 * (publish forces a single quilt via uploadFiles' quiltSize option), so the
 * popup count stays at 3.
 *
 * ⚠️ LOCKSTEP: must stay ≤ the contract's `MAX_PREVIEW_BLOBS` (model3d.move = 8).
 * Exceeding it aborts `ETooManyPreviews` (code 44) in `validate_seal_publish` at
 * publish. Raising this past 8 requires bumping that on-chain const + a redeploy.
 */
export const DEFAULT_STILL_COUNT = 8;
/** Square still resolution (px). Small — these are evaluation thumbnails, not the asset. */
export const STILL_SIZE = 512;
/** Visible watermark text (R13). */
export const WATERMARK_TEXT = 'tusk3d';

export interface StillCaptureDeps {
  /** Render a screenshot at the given camera `alpha` (radians); returns a PNG data URL. */
  screenshot: (alpha: number) => Promise<string>;
  /** Composite the watermark onto a PNG data URL; returns the watermarked PNG bytes. */
  watermark: (dataUrl: string) => Promise<Uint8Array>;
}

/**
 * Capture `count` evenly-spaced turntable stills, watermark each, restore the
 * camera. Pure orchestration over the injected deps — no Babylon/DOM here.
 */
export async function captureStillsWith(
  count: number,
  startAlpha: number,
  deps: StillCaptureDeps,
): Promise<Uint8Array[]> {
  const stills: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const alpha = startAlpha + (i * 2 * Math.PI) / count;
    const dataUrl = await deps.screenshot(alpha);
    stills.push(await deps.watermark(dataUrl));
  }
  return stills;
}

/** WebP quality for the watermarked stills — small + visually clean for thumbnails. */
const WEBP_QUALITY = 0.85;

/**
 * Number of clean frames captured by default for Upload Captioning (D-082).
 * Vision identification only needs a few angles; 4 keeps the multimodal payload
 * tiny (each 512px WebP ~5 KB). Independent of DEFAULT_STILL_COUNT (which is in
 * lockstep with the contract's MAX_PREVIEW_BLOBS — irrelevant to this read path).
 */
export const CAPTION_FRAME_COUNT = 4;

/** Decode a base64 data URL (`data:image/<type>;base64,....`) to bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Browser implementation: draw the screenshot onto a 2D canvas, stamp the
 * watermark in the lower-right, and return WebP bytes (~4× smaller than PNG for
 * these 3D-render stills, so we can afford 12 turntable frames). Browser-only.
 */
export async function watermarkStill(dataUrl: string): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('captureStills: failed to load screenshot'));
    el.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width || STILL_SIZE;
  canvas.height = img.height || STILL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('captureStills: 2D context unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const fontPx = Math.round(canvas.height * 0.05);
  ctx.font = `600 ${fontPx}px sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const pad = Math.round(canvas.height * 0.03);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(WATERMARK_TEXT, canvas.width - pad + 1, canvas.height - pad + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(WATERMARK_TEXT, canvas.width - pad, canvas.height - pad);
  return dataUrlToBytes(canvas.toDataURL('image/webp', WEBP_QUALITY));
}

/**
 * Browser implementation: re-encode a screenshot to WebP WITHOUT the watermark
 * (D-082). Upload Captioning feeds these frames to Gemini vision (R6: clean
 * frames, no stamped text that could distract the model). Same WebP encoding as
 * `watermarkStill`, minus the lower-right text stamp. Browser-only.
 */
export async function frameStill(dataUrl: string): Promise<Uint8Array> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('captureStills: failed to load screenshot'));
    el.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width || STILL_SIZE;
  canvas.height = img.height || STILL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('captureStills: 2D context unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return dataUrlToBytes(canvas.toDataURL('image/webp', WEBP_QUALITY));
}

/**
 * Browser implementation: capture CLEAN (un-watermarked) turntable frames from a
 * live Babylon engine + ArcRotateCamera for Upload Captioning (D-082). Restores
 * the camera alpha afterward. Mirrors `captureStillsFromScene` but injects
 * `frameStill` (no watermark). Unit tests exercise `captureStillsWith` instead.
 */
export async function captureFramesFromScene(
  engine: Engine,
  camera: ArcRotateCamera,
  count: number = CAPTION_FRAME_COUNT,
): Promise<Uint8Array[]> {
  const startAlpha = camera.alpha;
  try {
    return await captureStillsWith(count, startAlpha, {
      screenshot: async (alpha) => {
        camera.alpha = alpha;
        camera.getScene().render();
        return Tools.CreateScreenshotAsync(engine, camera, { width: STILL_SIZE, height: STILL_SIZE });
      },
      watermark: frameStill,
    });
  } finally {
    camera.alpha = startAlpha;
    camera.getScene().render();
  }
}

/**
 * Browser implementation: capture watermarked turntable stills from a live
 * Babylon engine + ArcRotateCamera. Restores the camera alpha afterward. Used by
 * the PreviewCanvas handle; unit tests exercise `captureStillsWith` instead.
 */
export async function captureStillsFromScene(
  engine: Engine,
  camera: ArcRotateCamera,
  count: number = DEFAULT_STILL_COUNT,
): Promise<Uint8Array[]> {
  const startAlpha = camera.alpha;
  try {
    return await captureStillsWith(count, startAlpha, {
      screenshot: async (alpha) => {
        camera.alpha = alpha;
        camera.getScene().render();
        return Tools.CreateScreenshotAsync(engine, camera, { width: STILL_SIZE, height: STILL_SIZE });
      },
      watermark: watermarkStill,
    });
  } finally {
    camera.alpha = startAlpha;
    camera.getScene().render();
  }
}
