import { useEffect, useRef, useState, type JSX } from 'react';

import { useInView } from './useInView';

// PROMPT lifecycle panel content (U8) — types out the prompt char-by-char with
// a blinking cursor, holds, then loops. Pure text/CSS, no Babylon. Starts when
// scrolled into view; respects prefers-reduced-motion (renders the full string
// statically). Accessibility: the outer element carries the full string as a
// static aria-label and the animated span is aria-hidden, so screen readers
// announce the prompt once — not character by character (and not silently).

export const DEFAULT_PROMPT = 'a low-poly walrus tusk';
const TYPE_MS = 60;
const HOLD_MS = 1900;
const RESTART_MS = 850;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface TypewriterPromptProps {
  text?: string;
  className?: string;
  cursorClassName?: string;
}

export function TypewriterPrompt({
  text = DEFAULT_PROMPT,
  className,
  cursorClassName,
}: TypewriterPromptProps): JSX.Element {
  const reduced = prefersReducedMotion();
  const { ref, inView } = useInView<HTMLSpanElement>({ once: true });
  const [count, setCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced || !inView) return;
    let n = 0;
    let holding = false;
    const step = () => {
      if (!holding) {
        n += 1;
        setCount(n);
        if (n >= text.length) {
          holding = true;
          timerRef.current = window.setTimeout(step, HOLD_MS);
        } else {
          timerRef.current = window.setTimeout(step, TYPE_MS);
        }
      } else {
        holding = false;
        n = 0;
        setCount(0);
        timerRef.current = window.setTimeout(step, RESTART_MS);
      }
    };
    timerRef.current = window.setTimeout(step, TYPE_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [reduced, inView, text]);

  const shown = reduced ? text : text.slice(0, count);

  return (
    <span ref={ref} className={className} aria-label={text} data-testid="lifecycle-typewriter">
      <span aria-hidden="true">&ldquo;{shown}&rdquo;</span>
      {!reduced && (
        <span aria-hidden="true" className={cursorClassName}>
          ▋
        </span>
      )}
    </span>
  );
}
