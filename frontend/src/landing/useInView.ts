import { useEffect, useRef, useState } from 'react';

// IntersectionObserver-based "is this element on screen" hook (U3, plan
// 2026-06-06-001). First use of IntersectionObserver in the repo — it powers
// the landing wells' lazy-mount (create the Babylon scene only when scrolled
// into view) and the typewriter prompt's start-on-scroll behaviour.
//
// Discipline mirrors useLedeRenderMode.ts: all hooks unconditional, SSR/no-IO
// safe, and the StrictMode `aliveRef` is re-asserted as the first statement of
// the effect body (not at useRef init) per
// docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref.

export interface UseInViewOptions {
  /** Passed straight to IntersectionObserver. Default '0px'. */
  rootMargin?: string;
  /** Fraction of the element that must be visible. Default 0.25. */
  threshold?: number;
  /**
   * When true, the hook latches `inView` to true on the first intersection and
   * stops observing — use for one-shot triggers (typing animation). When false
   * (default), `inView` tracks visibility both ways so a scene can pause/tear
   * down off-screen.
   */
  once?: boolean;
}

export interface UseInViewResult<T extends Element> {
  /** Attach to the element to observe (callback ref). */
  ref: (node: T | null) => void;
  inView: boolean;
}

export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {},
): UseInViewResult<T> {
  const { rootMargin = '0px', threshold = 0.25, once = false } = options;
  const [inView, setInView] = useState(false);
  const [node, setNode] = useState<T | null>(null);
  // Latches once `once` has fired so a later re-observe can't reset it.
  const latchedRef = useRef(false);

  useEffect(() => {
    // StrictMode-safe: assert liveness at the top of the effect body, not at
    // useRef init, so the mount→cleanup→mount cycle re-arms it.
    let alive = true;
    if (!node || latchedRef.current) return;

    // SSR / jsdom without an IntersectionObserver: assume visible so content
    // still renders (matches useLedeRenderMode's conservative fallback).
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      if (once) latchedRef.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!alive || latchedRef.current) return;
        const entry = entries[0];
        if (!entry) return;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) {
          latchedRef.current = true;
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(node);

    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [node, rootMargin, threshold, once]);

  return { ref: setNode, inView };
}
