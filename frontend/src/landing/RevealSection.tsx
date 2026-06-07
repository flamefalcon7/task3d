import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import gsap from 'gsap';

import { SPINE_FLAG_ENABLED, prefersReducedMotion, registerScrollTrigger } from './spineConfig';
import { useLedeRenderMode } from './useLedeRenderMode';
import styles from './RevealSection.module.css';

// Per-section reveal choreography for the landing scroll spine (D-098, R3/R5/R6).
// Wraps a landing section; when the spine is engaged it eases the section in once
// as it enters the viewport (restrained fade + small upward translate). The
// reveal only touches opacity/transform — it spends ZERO #FF4500 accent (R10/D-099).
//
// Degradation (R7/R8): when the spine is not engaged (build flag off,
// static-fallback render mode, or prefers-reduced-motion) the wrapper renders the
// section fully visible with no ScrollTrigger and no hidden initial state — so
// content is never opacity:0 without the JS that reveals it.

const REVEAL_Y = 24;
const REVEAL_DURATION = 0.5;
const REVEAL_START = 'top 85%';

export interface RevealSectionProps {
  children: ReactNode;
  className?: string;
}

export function RevealSection({ children, className }: RevealSectionProps): JSX.Element {
  // Hooks unconditional, above any branch (react-hooks-after-early-return).
  const renderMode = useLedeRenderMode();
  const engaged = SPINE_FLAG_ENABLED && renderMode === 'live' && !prefersReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    const el = containerRef.current;
    if (!engaged || !el) {
      return () => {
        aliveRef.current = false;
      };
    }
    registerScrollTrigger();
    // gsap.context scopes + tracks every tween/ScrollTrigger so ctx.revert()
    // fully tears them down (StrictMode-safe; no leaked trigger on double-mount).
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: REVEAL_Y },
        {
          opacity: 1,
          y: 0,
          duration: REVEAL_DURATION,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: REVEAL_START,
            // Play once on first enter; never reverse/replay on scroll-up/down.
            toggleActions: 'play none none none',
            once: true,
          },
        },
      );
    }, containerRef);
    return () => {
      aliveRef.current = false;
      ctx.revert();
    };
  }, [engaged]);

  const composedClassName = [styles.section, className].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={composedClassName}
      // Hidden initial state applied at render ONLY when engaged, so there is no
      // flash-then-hide before the effect runs. Never set when not engaged.
      style={engaged ? { opacity: 0 } : undefined}
      data-testid="reveal-section"
      data-reveal-engaged={engaged ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}
