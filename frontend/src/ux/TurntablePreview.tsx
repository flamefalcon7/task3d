import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

// plan-026 — faux-turntable for an encrypted base's preview stills. The publish
// captures a few evenly-spaced angles (DEFAULT_STILL_COUNT) and the catalog /
// detail / forge surfaces CYCLE them here to fake a 360° spin (ideation
// 2026-05-30: "no interactivity needed, so faux-turntable = cycle the stills").
// One url → static. Respects prefers-reduced-motion (holds the first frame).
// Renders a single <img> carrying the caller's testId so existing surface tests
// (which assert the still's testid + src) keep passing.

export interface TurntablePreviewProps {
  /** Preview-still URLs in turntable order (e.g. previewStillUrlsForSummary). */
  urls: string[];
  testId?: string;
  alt?: string;
  style?: CSSProperties;
  /** Frame dwell time (ms). */
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
  intervalMs = 700,
}: TurntablePreviewProps) {
  const [i, setI] = useState(0);

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
    const t = setInterval(() => setI((p) => (p + 1) % urls.length), intervalMs);
    return () => clearInterval(t);
  }, [urls, intervalMs]);

  if (urls.length === 0) return null;
  const src = urls[i % urls.length] ?? urls[0]!;
  return <img data-testid={testId} src={src} alt={alt} style={style} />;
}
