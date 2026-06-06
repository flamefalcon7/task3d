import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ inView: true }));
vi.mock('./useInView', () => ({
  useInView: () => ({ ref: () => {}, inView: h.inView }),
}));

import { TypewriterPrompt } from './TypewriterPrompt';

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  h.inView = true;
  vi.useFakeTimers();
  // Default: motion allowed (reduced-motion off).
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe('TypewriterPrompt', () => {
  it('AE1 — starts empty on in-view, types char-by-char, then loops', () => {
    render(<TypewriterPrompt text="abc" />);
    const el = screen.getByTestId('lifecycle-typewriter');
    expect(el.getAttribute('aria-label')).toBe('abc');
    // Empty before any timer fires (starts from empty string, not pre-filled).
    expect(el.textContent).not.toContain('a');

    act(() => vi.advanceTimersByTime(60 * 3)); // type a, b, c
    expect(el.textContent).toContain('abc');

    // Hold at full, then loop: reset to empty and retype from 'a'.
    act(() => vi.advanceTimersByTime(1900)); // HOLD_MS → reset to empty
    act(() => vi.advanceTimersByTime(850)); // RESTART_MS → first char again
    act(() => vi.advanceTimersByTime(60));
    expect(el.textContent).toContain('a');
    expect(el.textContent).not.toContain('abc'); // looped back to the short form
  });

  it('shows a blinking cursor while animating', () => {
    render(<TypewriterPrompt text="abc" />);
    expect(screen.getByTestId('lifecycle-typewriter').textContent).toContain('▋');
  });

  it('respects prefers-reduced-motion — renders the full string statically, no cursor, no timer', () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<TypewriterPrompt text="abc" />);
    const el = screen.getByTestId('lifecycle-typewriter');
    expect(el.textContent).toContain('abc'); // full string immediately
    expect(el.textContent).not.toContain('▋'); // no cursor
    expect(vi.getTimerCount()).toBe(0); // no animation timer scheduled
  });

  it('exposes the full prompt to AT via aria-label; animated span is aria-hidden', () => {
    render(<TypewriterPrompt text="abc" />);
    const el = screen.getByTestId('lifecycle-typewriter');
    expect(el.getAttribute('aria-label')).toBe('abc');
    expect(el.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('does not type while off-screen (inView false)', () => {
    h.inView = false;
    render(<TypewriterPrompt text="abc" />);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByTestId('lifecycle-typewriter').textContent).not.toContain('a');
  });

  it('clears its timer on unmount without throwing', () => {
    const { unmount } = render(<TypewriterPrompt text="abc" />);
    act(() => vi.advanceTimersByTime(60));
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(2000))).not.toThrow();
  });
});
