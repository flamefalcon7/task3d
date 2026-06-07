import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RevealSection } from './RevealSection';

// --- Mocks -----------------------------------------------------------------
const { gsapMock, contextRevert, capturedTo } = vi.hoisted(() => {
  const contextRevert = vi.fn();
  const capturedTo: Array<Record<string, unknown>> = [];
  const gsapMock = {
    registerPlugin: vi.fn(),
    context: vi.fn((fn: () => void) => {
      fn();
      return { revert: contextRevert };
    }),
    fromTo: vi.fn((_el: unknown, _from: unknown, to: Record<string, unknown>) => {
      capturedTo.push(to);
    }),
  };
  return { gsapMock, contextRevert, capturedTo };
});
vi.mock('gsap', () => ({ default: gsapMock }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }));

const { spineState } = vi.hoisted(() => ({ spineState: { enabled: true, reduced: false } }));
vi.mock('./spineConfig', () => ({
  get SPINE_FLAG_ENABLED() {
    return spineState.enabled;
  },
  prefersReducedMotion: () => spineState.reduced,
  registerScrollTrigger: vi.fn(),
}));

const { mockRenderMode } = vi.hoisted(() => ({ mockRenderMode: vi.fn() }));
vi.mock('./useLedeRenderMode', () => ({ useLedeRenderMode: mockRenderMode }));

beforeEach(() => {
  // Clear first — testing-library's auto-cleanup unmounts the prior test's
  // component in its own afterEach, which fires ctx.revert(); clearing here (not
  // in afterEach) guarantees that call doesn't leak into the next test's counts.
  vi.clearAllMocks();
  capturedTo.length = 0;
  spineState.enabled = true;
  spineState.reduced = false;
  mockRenderMode.mockReturnValue('live');
});

describe('RevealSection', () => {
  it('reveals once on enter and never replays when engaged', () => {
    render(
      <RevealSection>
        <p>inner content</p>
      </RevealSection>,
    );
    expect(screen.getByText('inner content')).toBeDefined();
    expect(gsapMock.fromTo).toHaveBeenCalledTimes(1);
    const to = capturedTo[0]!;
    const trigger = to.scrollTrigger as Record<string, unknown>;
    expect(trigger.once).toBe(true);
    expect(trigger.toggleActions).toBe('play none none none');
    expect(screen.getByTestId('reveal-section').getAttribute('data-reveal-engaged')).toBe('true');
  });

  it('keeps children in the DOM and visible (no hidden state) when reduced-motion is set', () => {
    spineState.reduced = true;
    render(
      <RevealSection>
        <p>inner content</p>
      </RevealSection>,
    );
    expect(screen.getByText('inner content')).toBeDefined();
    expect(gsapMock.fromTo).not.toHaveBeenCalled();
    const el = screen.getByTestId('reveal-section');
    expect(el.getAttribute('data-reveal-engaged')).toBe('false');
    expect(el.style.opacity).toBe(''); // not forced to 0
  });

  it('does not animate when the build flag is off', () => {
    spineState.enabled = false;
    render(
      <RevealSection>
        <p>inner content</p>
      </RevealSection>,
    );
    expect(gsapMock.fromTo).not.toHaveBeenCalled();
    expect(screen.getByText('inner content')).toBeDefined();
  });

  it('does not animate in static-fallback render mode', () => {
    mockRenderMode.mockReturnValue('static-fallback');
    render(
      <RevealSection>
        <p>inner content</p>
      </RevealSection>,
    );
    expect(gsapMock.fromTo).not.toHaveBeenCalled();
  });

  it('animates only opacity/transform — spends no #FF4500 accent (R10/D-099)', () => {
    render(
      <RevealSection>
        <p>inner content</p>
      </RevealSection>,
    );
    const to = capturedTo[0]!;
    // Only opacity/transform are animated — no color/background/fill key exists,
    // so the reveal cannot spend the #FF4500 accent budget.
    expect(Object.keys(to).sort()).toEqual(
      ['duration', 'ease', 'opacity', 'scrollTrigger', 'y'].sort(),
    );
    expect(to.ease).toBe('power2.out');
    // Hidden initial state is opacity-only, never a color.
    expect(screen.getByTestId('reveal-section').style.opacity).toBe('0');
  });

  it('reverts its gsap context on unmount (StrictMode-safe teardown)', () => {
    const { unmount } = render(
      <RevealSection>
        <p>inner content</p>
      </RevealSection>,
    );
    expect(contextRevert).not.toHaveBeenCalled();
    unmount();
    expect(contextRevert).toHaveBeenCalled();
  });
});
