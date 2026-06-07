import { StrictMode, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSmoothScroll } from './useSmoothScroll';

// --- Mocks -----------------------------------------------------------------
// Capture every Lenis instance so we can assert create/destroy symmetry.
const { lenisInstances, ticker } = vi.hoisted(() => ({
  lenisInstances: [] as Array<{ destroy: ReturnType<typeof vi.fn> }>,
  ticker: { add: vi.fn(), remove: vi.fn(), lagSmoothing: vi.fn() },
}));

vi.mock('lenis', () => ({
  default: class LenisMock {
    on = vi.fn();
    off = vi.fn();
    raf = vi.fn();
    destroy = vi.fn();
    constructor() {
      lenisInstances.push(this);
    }
  },
}));

vi.mock('gsap', () => ({ default: { ticker, registerPlugin: vi.fn() } }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { update: vi.fn() } }));

// Drive the three gates directly via a mutable mock state.
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

const strictWrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

beforeEach(() => {
  lenisInstances.length = 0;
  spineState.enabled = true;
  spineState.reduced = false;
  mockRenderMode.mockReturnValue('live');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSmoothScroll', () => {
  it('creates exactly one Lenis instance when engaged and destroys it on unmount', () => {
    const { unmount } = renderHook(() => useSmoothScroll());
    expect(lenisInstances).toHaveLength(1);
    const [instance] = lenisInstances;
    expect(instance).toBeDefined();
    expect(instance!.destroy).not.toHaveBeenCalled();
    unmount();
    expect(instance!.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not engage when prefers-reduced-motion is set', () => {
    spineState.reduced = true;
    renderHook(() => useSmoothScroll());
    expect(lenisInstances).toHaveLength(0);
  });

  it('does not engage when render mode is static-fallback (mobile / no-WebGL)', () => {
    mockRenderMode.mockReturnValue('static-fallback');
    renderHook(() => useSmoothScroll());
    expect(lenisInstances).toHaveLength(0);
  });

  it('does not engage when the build flag is off', () => {
    spineState.enabled = false;
    renderHook(() => useSmoothScroll());
    expect(lenisInstances).toHaveLength(0);
  });

  it('leaves exactly one live Lenis instance under StrictMode double-mount', () => {
    renderHook(() => useSmoothScroll(), { wrapper: strictWrapper });
    const alive = lenisInstances.filter((l) => l.destroy.mock.calls.length === 0);
    expect(alive).toHaveLength(1);
  });
});
