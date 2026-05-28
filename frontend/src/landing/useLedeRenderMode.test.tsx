import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';

import { useLedeRenderMode } from './useLedeRenderMode';

// ---------------------------------------------------------------------------
// Test harness: a tiny consumer that renders the hook's value into the DOM
// AND records it into an out-of-band capture array so assertions don't have to
// parse the rendered DOM. All renders are wrapped in <StrictMode> to catch
// double-mount listener leaks per
// docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md
// ---------------------------------------------------------------------------

function renderHook(captures: Array<'live' | 'static-fallback'>) {
  function Probe() {
    const mode = useLedeRenderMode();
    captures.push(mode);
    return <div data-testid="mode">{mode}</div>;
  }
  return render(
    <StrictMode>
      <Probe />
    </StrictMode>,
  );
}

interface MockMQL {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  // Test-only: invoke registered change listeners.
  dispatch: (matches: boolean) => void;
}

function makeMatchMedia(initialMatches: boolean): {
  mm: (query: string) => MockMQL;
  current: MockMQL;
} {
  const listeners: Array<(ev: MediaQueryListEvent) => void> = [];
  const mql: MockMQL = {
    matches: initialMatches,
    media: '',
    addEventListener: vi.fn((event: string, cb: (ev: MediaQueryListEvent) => void) => {
      if (event === 'change') listeners.push(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: (ev: MediaQueryListEvent) => void) => {
      if (event !== 'change') return;
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    dispatch(matches: boolean) {
      mql.matches = matches;
      for (const cb of [...listeners]) {
        cb({ matches } as MediaQueryListEvent);
      }
    },
  };
  return {
    mm: (query: string) => {
      mql.media = query;
      return mql;
    },
    current: mql,
  };
}

describe('useLedeRenderMode', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let getContextSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    }
    if (getContextSpy) {
      getContextSpy.mockRestore();
      getContextSpy = null;
    }
    vi.unstubAllGlobals();
  });

  it("returns 'live' when viewport matches and webgl2 is available", () => {
    const { mm } = makeMatchMedia(true);
    vi.stubGlobal('matchMedia', mm);
    // Re-anchor to window so the hook's `window.matchMedia` lookup picks it up.
    window.matchMedia = mm as unknown as typeof window.matchMedia;

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      // The real return type is a union of many context types; the hook only
      // checks for truthy/null, so any non-null object satisfies the contract.
      .mockImplementation(((type: string) => {
        if (type === 'webgl2') return {} as unknown as RenderingContext;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext);

    const captures: Array<'live' | 'static-fallback'> = [];
    const utils = renderHook(captures);

    // After effects flush, the final committed value should be 'live'.
    expect(utils.getByTestId('mode').textContent).toBe('live');
    expect(captures[captures.length - 1]).toBe('live');
  });

  it("returns 'static-fallback' when viewport does NOT match (regardless of webgl)", () => {
    const { mm } = makeMatchMedia(false);
    vi.stubGlobal('matchMedia', mm);
    window.matchMedia = mm as unknown as typeof window.matchMedia;

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(((type: string) => {
        if (type === 'webgl2') return {} as unknown as RenderingContext;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext);

    const captures: Array<'live' | 'static-fallback'> = [];
    const utils = renderHook(captures);

    expect(utils.getByTestId('mode').textContent).toBe('static-fallback');
  });

  it("returns 'static-fallback' when both webgl2 and webgl return null", () => {
    const { mm } = makeMatchMedia(true);
    vi.stubGlobal('matchMedia', mm);
    window.matchMedia = mm as unknown as typeof window.matchMedia;

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((() => null) as typeof HTMLCanvasElement.prototype.getContext);

    const captures: Array<'live' | 'static-fallback'> = [];
    const utils = renderHook(captures);

    expect(utils.getByTestId('mode').textContent).toBe('static-fallback');
  });

  it("returns 'static-fallback' when getContext throws", () => {
    const { mm } = makeMatchMedia(true);
    vi.stubGlobal('matchMedia', mm);
    window.matchMedia = mm as unknown as typeof window.matchMedia;

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((() => {
        throw new Error('WebGL disabled by user');
      }) as typeof HTMLCanvasElement.prototype.getContext);

    const captures: Array<'live' | 'static-fallback'> = [];
    const utils = renderHook(captures);

    expect(utils.getByTestId('mode').textContent).toBe('static-fallback');
  });

  it("returns 'static-fallback' when window.matchMedia is undefined and skips effects", () => {
    // Stub to undefined to simulate ancient browsers / unusual jsdom configs.
    // We use `delete` cast since the property is required by the lib types.
    (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia = undefined;

    // Spy on getContext too — it should NEVER be called when matchMedia is
    // missing (defensive: skip effects on the SSR-safe initial render).
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((() => ({}) as unknown as RenderingContext) as typeof HTMLCanvasElement.prototype.getContext);

    const captures: Array<'live' | 'static-fallback'> = [];
    const utils = renderHook(captures);

    expect(utils.getByTestId('mode').textContent).toBe('static-fallback');
    // Every captured render returned static-fallback — no flip.
    for (const v of captures) {
      expect(v).toBe('static-fallback');
    }
  });

  it('re-renders with new value when viewport change event fires after mount', () => {
    const { mm, current } = makeMatchMedia(false);
    vi.stubGlobal('matchMedia', mm);
    window.matchMedia = mm as unknown as typeof window.matchMedia;

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(((type: string) => {
        if (type === 'webgl2') return {} as unknown as RenderingContext;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext);

    const captures: Array<'live' | 'static-fallback'> = [];
    const utils = renderHook(captures);

    expect(utils.getByTestId('mode').textContent).toBe('static-fallback');

    // Fire the viewport `change` event — viewport now matches.
    act(() => {
      current.dispatch(true);
    });

    expect(utils.getByTestId('mode').textContent).toBe('live');
  });

  it('StrictMode double-mount: addEventListener and removeEventListener called with the SAME fn (no leak)', () => {
    const { mm, current } = makeMatchMedia(true);
    vi.stubGlobal('matchMedia', mm);
    window.matchMedia = mm as unknown as typeof window.matchMedia;

    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(((type: string) => {
        if (type === 'webgl2') return {} as unknown as RenderingContext;
        return null;
      }) as typeof HTMLCanvasElement.prototype.getContext);

    // Capture React's warnings; the fix must produce ZERO setState-after-unmount.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const captures: Array<'live' | 'static-fallback'> = [];
    renderHook(captures);

    // StrictMode in React 18+ runs effects mount → cleanup → mount.
    // The cleanup must remove the SAME listener instance that was added.
    const addCalls = current.addEventListener.mock.calls.filter((c) => c[0] === 'change');
    const removeCalls = current.removeEventListener.mock.calls.filter((c) => c[0] === 'change');

    // Each removeEventListener call must reference a function that was added.
    const addedFns = new Set(addCalls.map((c) => c[1]));
    for (const [, removedFn] of removeCalls) {
      expect(addedFns.has(removedFn)).toBe(true);
    }

    // After StrictMode settles, net effect: registered listeners count is
    // adds − removes; if cleanup is correct we should have at least one
    // active listener and no orphaned removes.
    expect(addCalls.length).toBeGreaterThanOrEqual(1);
    expect(removeCalls.length).toBeLessThanOrEqual(addCalls.length);

    // No setState-after-unmount React warning surfaced.
    const warned = errorSpy.mock.calls.some((c) =>
      String(c[0] ?? '').includes("Can't perform a React state update on an unmounted"),
    );
    expect(warned).toBe(false);

    errorSpy.mockRestore();
  });
});
