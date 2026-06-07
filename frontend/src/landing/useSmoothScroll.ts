import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import { useLedeRenderMode } from './useLedeRenderMode';
import { SPINE_FLAG_ENABLED, prefersReducedMotion, registerScrollTrigger } from './spineConfig';

/**
 * Landing scroll spine — eased inertial smooth-scroll (Lenis) bridged to
 * ScrollTrigger (D-098). Page-level: Lenis wraps the window scroller, so the
 * hook takes no ref — call it once from LandingPage.
 *
 * Engages only when all three gates pass (KTD-1):
 *   SPINE_FLAG_ENABLED && useLedeRenderMode() === 'live' && !prefersReducedMotion()
 * Otherwise it is a complete no-op — native scroll is left untouched, so mobile /
 * no-WebGL (R8) and reduced-motion (R7) visitors get a plain page.
 *
 * Lifecycle is StrictMode-safe (one effect, symmetric create/destroy, never a
 * cleanup-only effect; `aliveRef` re-asserted in the body) per
 * docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md.
 * Exactly ONE scroll ticker drives Lenis (KTD-3): gsap.ticker — the spine never
 * starts its own rAF render loop and never touches the Babylon render loops.
 */
export function useSmoothScroll(): void {
  // Hook is unconditional and above any branch (react-hooks-after-early-return).
  const renderMode = useLedeRenderMode();
  const aliveRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    const engaged =
      SPINE_FLAG_ENABLED && renderMode === 'live' && !prefersReducedMotion();
    if (!engaged) {
      return () => {
        aliveRef.current = false;
      };
    }

    registerScrollTrigger();

    const lenis = new Lenis();
    const onScroll = (): void => {
      ScrollTrigger.update();
    };
    lenis.on('scroll', onScroll);

    // Single ticker: drive Lenis from gsap's rAF so scroll + ScrollTrigger share
    // one clock. lagSmoothing(0) keeps Lenis from being throttled after a stall.
    const tick = (time: number): void => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Re-measure ScrollTrigger start/end after async layout settles. Triggers are
    // created in child effects against the INITIAL layout; the hero GLB loads
    // async, the dwell CTA inserts at 15s, web fonts reflow below-fold sections,
    // and lifecycle wells swap static↔live — all AFTER measurement. Without a
    // refresh, reveals can strand at opacity:0 and the stage indicator desyncs.
    // Debounced to one call per frame so a reflowing ResizeObserver can't thrash.
    let refreshQueued = false;
    let refreshRaf = 0;
    const refresh = (): void => {
      if (refreshQueued) return;
      refreshQueued = true;
      refreshRaf = requestAnimationFrame(() => {
        refreshQueued = false;
        if (aliveRef.current) ScrollTrigger.refresh();
      });
    };
    refresh(); // initial settle after first paint
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (aliveRef.current) refresh();
      });
    }
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => refresh());
      ro.observe(document.body);
    }

    return () => {
      aliveRef.current = false;
      if (refreshRaf) cancelAnimationFrame(refreshRaf);
      ro?.disconnect();
      gsap.ticker.remove(tick);
      // Restore gsap's documented ticker default (we disabled lag smoothing for
      // Lenis); leaving it at 0 would leak to any later gsap consumer.
      gsap.ticker.lagSmoothing(500, 33);
      lenis.off('scroll', onScroll);
      lenis.destroy();
    };
  }, [renderMode]);
}
