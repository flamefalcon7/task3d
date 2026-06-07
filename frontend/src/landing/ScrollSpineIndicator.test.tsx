import { readFileSync } from 'node:fs';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollSpineIndicator } from './ScrollSpineIndicator';

// --- Mocks -----------------------------------------------------------------
const { gsapMock, stCreate, contextRevert, capturedCreate } = vi.hoisted(() => {
  const contextRevert = vi.fn();
  const capturedCreate: Array<{ onUpdate: (self: { progress: number }) => void }> = [];
  const stCreate = vi.fn((cfg: { onUpdate: (self: { progress: number }) => void }) => {
    capturedCreate.push(cfg);
    return { kill: vi.fn() };
  });
  const gsapMock = {
    registerPlugin: vi.fn(),
    context: vi.fn((fn: () => void) => {
      fn();
      return { revert: contextRevert };
    }),
  };
  return { gsapMock, stCreate, contextRevert, capturedCreate };
});
vi.mock('gsap', () => ({ default: gsapMock }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { create: stCreate } }));

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
  vi.clearAllMocks();
  capturedCreate.length = 0;
  spineState.enabled = true;
  spineState.reduced = false;
  mockRenderMode.mockReturnValue('live');
});

function activeLabel(): string | null {
  return document.querySelector('[data-active="true"]')?.textContent?.trim() ?? null;
}

describe('ScrollSpineIndicator', () => {
  it('renders all three beats and advances the active beat with scroll progress when engaged', () => {
    render(<ScrollSpineIndicator />);
    expect(screen.getByTestId('scroll-spine-indicator').getAttribute('data-engaged')).toBe('true');
    expect(screen.getByText('Carve')).toBeDefined();
    expect(screen.getByText('Mint')).toBeDefined();
    expect(screen.getByText('Riff')).toBeDefined();
    expect(stCreate).toHaveBeenCalledTimes(1);

    const cfg = capturedCreate[0]!;
    act(() => cfg.onUpdate({ progress: 0.5 }));
    expect(activeLabel()).toBe('Mint');
    act(() => cfg.onUpdate({ progress: 0.95 }));
    expect(activeLabel()).toBe('Riff');
    act(() => cfg.onUpdate({ progress: 0.0 }));
    expect(activeLabel()).toBe('Carve');
  });

  it('renders a static rail with no ScrollTrigger under reduced-motion', () => {
    spineState.reduced = true;
    render(<ScrollSpineIndicator />);
    expect(screen.getByTestId('scroll-spine-indicator').getAttribute('data-engaged')).toBe('false');
    expect(screen.getByText('Carve')).toBeDefined();
    expect(screen.getByText('Riff')).toBeDefined();
    expect(stCreate).not.toHaveBeenCalled();
    expect(activeLabel()).toBe('Carve'); // default, no scrubbing
  });

  it('renders nothing in static-fallback (mobile / no-WebGL)', () => {
    mockRenderMode.mockReturnValue('static-fallback');
    render(<ScrollSpineIndicator />);
    expect(screen.queryByTestId('scroll-spine-indicator')).toBeNull();
    expect(stCreate).not.toHaveBeenCalled();
  });

  it('does not create a ScrollTrigger when the build flag is off', () => {
    spineState.enabled = false;
    render(<ScrollSpineIndicator />);
    expect(screen.getByTestId('scroll-spine-indicator')).toBeDefined();
    expect(stCreate).not.toHaveBeenCalled();
  });

  it('reverts its gsap context on unmount (StrictMode-safe teardown)', () => {
    const { unmount } = render(<ScrollSpineIndicator />);
    expect(contextRevert).not.toHaveBeenCalled();
    unmount();
    expect(contextRevert).toHaveBeenCalled();
  });

  it('spends zero #FF4500 accent — the CSS module is accent-free (D-099 / KTD-6)', () => {
    const css = readFileSync('src/landing/ScrollSpineIndicator.module.css', 'utf8');
    expect(css.toLowerCase()).not.toContain('ff4500');
  });
});
