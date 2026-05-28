// plan-017 U5 — MemoryPressureBanner
//
// Best-effort pre-flight signal. When `performance.memory.usedJSHeapSize`
// (Chromium-only) crosses HEAP_WARN_ON_BYTES, surface a dismissable banner
// recommending the user close other tabs before LAUNCH. The check fires on
// mount and again whenever the `recheckSignal` prop changes (the parent
// bumps it on LAUNCH click) — a re-check after dismissal can re-surface
// the warning if heap is still over threshold.
//
// Hysteresis: once shown, the banner stays visible until heap drops below
// HEAP_WARN_OFF_BYTES. Prevents on/off flicker when usedJSHeapSize sits
// near the boundary across Brave's fingerprint-protection rounding.
//
// Per D-064: Chromium-only is acceptable scope (Slush wallet is Chromium-
// only too). On Firefox / Safari the readHeapMb() helper returns null and
// this component renders nothing — graceful no-op.

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { tokens } from '../ux/tokens';
import { readHeapMb } from '../walrus/uploadTrail';

// Exported for tests. The "_BYTES" suffix is canonical; tests construct
// usedJSHeapSize values relative to these constants to verify the
// threshold behavior across the hysteresis band.
export const HEAP_WARN_ON_BYTES = 2_500 * 1024 * 1024; // 2.5 GB
export const HEAP_WARN_OFF_BYTES = 2_200 * 1024 * 1024; // 2.2 GB

export interface MemoryPressureBannerProps {
  /**
   * A monotonically increasing token. The parent bumps it on LAUNCH click
   * so a previously-dismissed banner can re-fire if the new check still
   * trips the threshold. Default 0 → checks only on mount.
   */
  recheckSignal?: number;
}

const banner: CSSProperties = {
  margin: '12px 0',
  padding: '10px 12px',
  border: `1.5px solid ${tokens.color.warn}`,
  color: tokens.color.warn,
  fontFamily: tokens.font.mono,
  fontSize: 12,
  letterSpacing: '0.5px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const dismissButton: CSSProperties = {
  marginLeft: 'auto',
  background: 'transparent',
  border: 'none',
  color: tokens.color.warn,
  fontFamily: tokens.font.mono,
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 0,
};

// plan-017 P1-C: one-time probe so we can verify on the user's actual Brave
// whether `performance.memory.usedJSHeapSize` is being capped or quantized
// by fingerprint protection. Known Brave behaviors include (a) coarse
// 100 MB bucketing and (b) capping at a small constant (~10 MB) regardless
// of real heap. If (b) is in effect on the user's Brave, this banner
// will never fire — defeating R4. The probe logs once per page load so
// the user can read the raw values in DevTools after loading /launch.
let probedThisLoad = false;

export function MemoryPressureBanner({ recheckSignal = 0 }: MemoryPressureBannerProps) {
  const [showing, setShowing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Probe runs ONCE per page load on first mount of any MemoryPressureBanner.
  // The output lets the user (or dev) verify that Brave isn't capping the
  // heap reading below the threshold this component checks.
  useEffect(() => {
    if (probedThisLoad) return;
    probedThisLoad = true;
    const perf = performance as unknown as {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    };
    if (!perf.memory) {
      // eslint-disable-next-line no-console
      console.info('[plan-017 P1-C heap probe] performance.memory unavailable (Firefox/Safari/strict-privacy). MemoryPressureBanner will be a no-op.');
      return;
    }
    const mb = (b: number) => Math.round(b / 1024 / 1024);
    // eslint-disable-next-line no-console
    console.info(
      '[plan-017 P1-C heap probe] performance.memory readings — usedJSHeapSize=%d MB, totalJSHeapSize=%d MB, jsHeapSizeLimit=%d MB. ' +
        'If usedJSHeapSize stays ≤ ~10 MB regardless of real usage, Brave is capping the read and the 2.5 GB threshold will never fire ' +
        '(R4 banner effectively disabled — close other tabs manually before LAUNCH on heavy sessions).',
      mb(perf.memory.usedJSHeapSize),
      mb(perf.memory.totalJSHeapSize),
      mb(perf.memory.jsHeapSizeLimit),
    );
  }, []);

  useEffect(() => {
    const heap = readHeapMb();
    if (!heap) {
      // Firefox / Safari / non-Chromium — graceful no-op for the life
      // of the component.
      setShowing(false);
      return;
    }
    const usedBytes = heap.used * 1024 * 1024;
    if (usedBytes >= HEAP_WARN_ON_BYTES) {
      setShowing(true);
      // A fresh recheck after the user dismissed the banner re-surfaces
      // it if heap is still over threshold (R4 intent).
      setDismissed(false);
    } else if (usedBytes < HEAP_WARN_OFF_BYTES) {
      setShowing(false);
    }
    // Between OFF and ON — hysteresis band: keep current showing state
    // and don't touch dismissed (already-dismissed stays dismissed).
  }, [recheckSignal]);

  if (!showing || dismissed) return null;

  return (
    <div role="alert" data-testid="memory-pressure-banner" style={banner}>
      <span>
        High memory usage detected — close other tabs to reduce crash risk
        during upload.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        data-testid="memory-pressure-banner-dismiss"
        aria-label="Dismiss memory warning"
        style={dismissButton}
      >
        ×
      </button>
    </div>
  );
}
