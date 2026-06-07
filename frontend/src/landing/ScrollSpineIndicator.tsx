import { useEffect, useRef, useState, type JSX } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { SPINE_FLAG_ENABLED, prefersReducedMotion, registerScrollTrigger } from './spineConfig';
import { useLedeRenderMode } from './useLedeRenderMode';
import styles from './ScrollSpineIndicator.module.css';

// Persistent stage indicator for the landing scroll spine (D-098, R4/R6). A fixed
// left rail of the three product beats (CARVE / MINT / RIFF) that tracks the
// visitor's position in the page as they scroll. Restrained, mono, ZERO #FF4500
// accent (D-099 / KTD-6 — enforced by ScrollSpineIndicator.test.tsx asserting the
// CSS module spends no accent).
//
// Degradation:
//   - static-fallback (mobile / no-WebGL): renders nothing — no spine, no rail.
//   - live but flag-off or reduced-motion: the rail renders statically (all beats
//     shown, first beat marked) with no ScrollTrigger — informative, no motion.
//   - engaged: a single page-progress ScrollTrigger advances the active beat.

const STAGES = ['Carve', 'Mint', 'Riff'] as const;

export function ScrollSpineIndicator(): JSX.Element | null {
  // Hooks unconditional, above any branch (react-hooks-after-early-return).
  const renderMode = useLedeRenderMode();
  const engaged = SPINE_FLAG_ENABLED && renderMode === 'live' && !prefersReducedMotion();
  const [active, setActive] = useState(0);
  const aliveRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    if (!engaged) {
      return () => {
        aliveRef.current = false;
      };
    }
    registerScrollTrigger();
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self: { progress: number }) => {
          if (!aliveRef.current) return;
          const idx = Math.min(STAGES.length - 1, Math.floor(self.progress * STAGES.length));
          setActive(idx);
        },
      });
    });
    return () => {
      aliveRef.current = false;
      ctx.revert();
    };
  }, [engaged]);

  // Mobile / no-WebGL: no spine surface at all.
  if (renderMode === 'static-fallback') return null;

  return (
    <nav
      className={styles.rail}
      aria-label="Page progress"
      data-testid="scroll-spine-indicator"
      data-engaged={engaged ? 'true' : 'false'}
    >
      <ol className={styles.list}>
        {STAGES.map((label, i) => {
          // When not engaged the rail is static; show the first beat, never a
          // stale index carried over from a prior engaged scroll session.
          const isActive = i === (engaged ? active : 0);
          return (
            <li
              key={label}
              className={isActive ? styles.active : styles.tick}
              data-active={isActive ? 'true' : 'false'}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className={styles.dash} aria-hidden="true" />
              {label}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
