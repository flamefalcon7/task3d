import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

// plan-026 — faux-turntable for an encrypted base's preview stills. The publish
// captures a few evenly-spaced angles (DEFAULT_STILL_COUNT) and the catalog /
// detail / forge surfaces CYCLE them here to fake a 360° spin (ideation
// 2026-05-30: "no interactivity needed, so faux-turntable = cycle the stills").
// One url → static. Respects prefers-reduced-motion (holds the first frame).
// Renders a single <img> carrying the caller's testId so existing surface tests
// (which assert the still's testid + src) keep passing.

// Target time for one full faux-revolution. The per-frame dwell is derived from
// this and the frame count, so 3 angles and 12 angles spin at the SAME speed —
// more frames just look smoother, not faster.
const REVOLUTION_MS = 1800;
const MIN_DWELL_MS = 80;

export interface TurntablePreviewProps {
  /** Preview-still URLs in turntable order (e.g. previewStillUrlsForSummary). */
  urls: string[];
  testId?: string;
  alt?: string;
  style?: CSSProperties;
  /** Override the per-frame dwell (ms). Defaults to REVOLUTION_MS / frames. */
  intervalMs?: number;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function TurntablePreview({
  urls,
  testId,
  alt = '',
  style,
  intervalMs,
}: TurntablePreviewProps) {
  const [i, setI] = useState(0);
  const dwell = intervalMs ?? Math.max(MIN_DWELL_MS, Math.round(REVOLUTION_MS / Math.max(1, urls.length)));

  // Preload every frame so cycling doesn't flash a blank while the next loads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    urls.forEach((u) => {
      const img = new window.Image();
      img.src = u;
    });
  }, [urls]);

  // Cycle — only with ≥2 frames and motion allowed.
  useEffect(() => {
    if (urls.length <= 1 || prefersReducedMotion()) return;
    const t = setInterval(() => setI((p) => (p + 1) % urls.length), dwell);
    return () => clearInterval(t);
  }, [urls, dwell]);

  if (urls.length === 0) return null;
  const src = urls[i % urls.length] ?? urls[0]!;
  return <img data-testid={testId} src={src} alt={alt} style={style} />;
}
