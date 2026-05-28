import { useEffect, useRef, useState } from 'react';

/**
 * Decides whether the Tusk3D landing lede should mount the live Babylon scene
 * or render the pre-rendered static SVG fallback.
 *
 * Returns:
 *   - `'live'`             — viewport ≥ 768px AND WebGL available
 *   - `'static-fallback'`  — otherwise
 *
 * Implementation notes (load-bearing — see docs/solutions/integration-issues/):
 *   - All hook calls are declared UNCONDITIONALLY at the top of the function
 *     body — no early returns before hooks (react-hooks-after-early-return-
 *     oauth-mask-2026-05-28.md).
 *   - StrictMode-safe `aliveRef` discipline: `aliveRef.current = true` is set
 *     in each effect body's FIRST statement, not just at the `useRef` init
 *     (react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md).
 *   - Viewport initial value is read SYNCHRONOUSLY inside `useState(() => ...)`
 *     so the first paint reflects the real state — no live → fallback → live
 *     flicker chain.
 *   - If `typeof window === 'undefined'` or `window.matchMedia` is undefined,
 *     the hook returns `'static-fallback'` and effects skip entirely.
 */
export function useLedeRenderMode(): 'live' | 'static-fallback' {
  // SSR / no-matchMedia detection — captured once on first render.
  // Read synchronously so the value is stable for the lifetime of the hook.
  const hasMatchMedia =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function';

  // -------------------------------------------------------------------------
  // ALL HOOKS declared unconditionally at the top of the function body.
  // -------------------------------------------------------------------------
  const aliveRef = useRef(false);

  const [viewportMatches, setViewportMatches] = useState<boolean>(() => {
    if (!hasMatchMedia) return false;
    try {
      return window.matchMedia('(min-width: 768px)').matches;
    } catch {
      return false;
    }
  });

  // WebGL is assumed-available until we run the detection effect. On platforms
  // without `window` we'll just never run the effect and `webglAvailable`
  // remains true — the `hasMatchMedia` short-circuit at the bottom routes
  // those environments to static-fallback anyway.
  const [webglAvailable, setWebglAvailable] = useState<boolean>(true);

  // Viewport reactive effect — register matchMedia change listener.
  useEffect(() => {
    aliveRef.current = true;
    if (!hasMatchMedia) {
      return () => {
        aliveRef.current = false;
      };
    }

    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(min-width: 768px)');
    } catch {
      return () => {
        aliveRef.current = false;
      };
    }

    const handleChange = (event: MediaQueryListEvent) => {
      if (aliveRef.current) {
        setViewportMatches(event.matches);
      }
    };

    mql.addEventListener('change', handleChange);
    return () => {
      aliveRef.current = false;
      mql.removeEventListener('change', handleChange);
    };
  }, [hasMatchMedia]);

  // WebGL detection effect — run once.
  useEffect(() => {
    aliveRef.current = true;
    if (typeof document === 'undefined') {
      return () => {
        aliveRef.current = false;
      };
    }

    let supported = false;
    try {
      const canvas = document.createElement('canvas');
      let ctx: RenderingContext | null = null;
      try {
        ctx = canvas.getContext('webgl2');
      } catch {
        ctx = null;
      }
      if (!ctx) {
        try {
          ctx = canvas.getContext('webgl');
        } catch {
          ctx = null;
        }
      }
      supported = ctx !== null;
    } catch {
      supported = false;
    }

    if (aliveRef.current) {
      setWebglAvailable(supported);
    }

    return () => {
      aliveRef.current = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Branch lives ONLY in the return value — no hooks below this line.
  // -------------------------------------------------------------------------
  if (!hasMatchMedia) {
    return 'static-fallback';
  }

  return viewportMatches && webglAvailable ? 'live' : 'static-fallback';
}
