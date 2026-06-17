import type { CSSProperties, ReactNode } from 'react';
import { useInView } from '../landing/useInView';
import { monoLabel } from '../ux/tokens';

// plan 2026-06-17-001 U1 — defer-mount a heavy (WebGL) child until its card
// scrolls into view, and unmount it when it scrolls away. Card grids render one
// PreviewCanvas per card, and each PreviewCanvas creates its own Babylon Engine
// (a live WebGL context). Browsers cap concurrent contexts (~8-16); a full grid
// blows past that and the oldest context gets dropped (black/lost canvas).
//
// This is a thin wrapper, NOT a re-implementation of Babylon lifecycle: when
// `inView` goes false we stop rendering `children`, and React unmounting
// PreviewCanvas fires its own Engine-effect cleanup (engine.dispose()) — that
// React unmount IS the context release. (PreviewCanvas's internal mounted/
// dispose handle keeps the Engine warm, so it would NOT relieve context
// pressure — we rely on the React unmount instead.) See KTD-1/KTD-2.
//
// Built on the existing `useInView` hook (no second IntersectionObserver):
// callback-ref, StrictMode-safe, and jsdom-safe (inView=true when IO is
// undefined) so page tests that stub PreviewCanvas keep rendering it eagerly.

interface Props {
  /** The heavy child to mount only while in view (typically a PreviewCanvas). */
  children: ReactNode;
  /** Shown while off-screen. Defaults to a quiet token-styled placeholder. */
  placeholder?: ReactNode;
  /**
   * Latch: once mounted, stay mounted even after scrolling away. Default false
   * (dispose off-screen — bounds concurrent WebGL contexts, KTD-2). Set true to
   * cap creation rate instead, if mount/unmount thrash shows on the demo box.
   */
  keepMounted?: boolean;
  /** Pre-mount buffer so the scene is warm just before it scrolls in. */
  rootMargin?: string;
  /** data-testid for the container (callers use distinct ids per grid). */
  testId?: string;
}

const container: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
};

const defaultPlaceholder: CSSProperties = {
  ...monoLabel,
  color: 'rgba(255,255,255,0.35)',
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  letterSpacing: '2px',
};

export function LazyCanvasMount({
  children,
  placeholder,
  keepMounted = false,
  rootMargin = '300px 0px',
  testId,
}: Props) {
  // `once` latches inView=true on first intersection — exactly keepMounted.
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin, once: keepMounted });

  return (
    <div ref={ref} data-testid={testId} style={container}>
      {inView
        ? children
        : (placeholder ?? <span style={defaultPlaceholder} aria-hidden>— PREVIEW</span>)}
    </div>
  );
}
