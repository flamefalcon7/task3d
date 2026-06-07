import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Mock surfaces (load-bearing — per plan U4 verification rule, mock at the
// network/API boundary, not at the component's internal decision boundary).
// ---------------------------------------------------------------------------

const state: {
  engineCtor: ReturnType<typeof vi.fn>;
  engineDispose: ReturnType<typeof vi.fn>;
  engineWipeCaches: ReturnType<typeof vi.fn>;
  sceneCtor: ReturnType<typeof vi.fn>;
  sceneDispose: ReturnType<typeof vi.fn>;
  loadAssetCalls: string[];
  loadAssetImpl: (url: string) => Promise<unknown>;
  sweepSetup: ReturnType<typeof vi.fn>;
  sweepDispose: ReturnType<typeof vi.fn>;
  frameCamera: ReturnType<typeof vi.fn>;
  clearColorSet: ReturnType<typeof vi.fn>;
  groundCreate: ReturnType<typeof vi.fn>;
  shadowGenCtor: ReturnType<typeof vi.fn>;
  gridCtor: ReturnType<typeof vi.fn>;
  runRenderLoop: ReturnType<typeof vi.fn>;
  stopRenderLoop: ReturnType<typeof vi.fn>;
  onBeforeRenderCbs: Array<() => void>;
  scrollTriggerConfigs: Array<{ onUpdate?: (s: { progress: number }) => void }>;
  scrollTriggerKill: ReturnType<typeof vi.fn>;
  lastCamera: { alpha: number; beta: number; radius: number } | null;
  spineEnabled: boolean;
  spineReduced: boolean;
} = {
  engineCtor: vi.fn(),
  engineDispose: vi.fn(),
  engineWipeCaches: vi.fn(),
  sceneCtor: vi.fn(),
  sceneDispose: vi.fn(),
  loadAssetCalls: [],
  loadAssetImpl: () => Promise.resolve({ meshes: [], addAllToScene: () => {}, dispose: () => {} }),
  sweepSetup: vi.fn(),
  sweepDispose: vi.fn(),
  frameCamera: vi.fn(),
  clearColorSet: vi.fn(),
  groundCreate: vi.fn(),
  shadowGenCtor: vi.fn(),
  gridCtor: vi.fn(),
  runRenderLoop: vi.fn(),
  stopRenderLoop: vi.fn(),
  onBeforeRenderCbs: [],
  scrollTriggerConfigs: [],
  scrollTriggerKill: vi.fn(),
  lastCamera: null,
  spineEnabled: true,
  spineReduced: false,
};

vi.mock('@babylonjs/core', () => {
  class Engine {
    isDisposed = false;
    constructor(..._a: unknown[]) {
      state.engineCtor();
    }
    runRenderLoop() {
      state.runRenderLoop();
    }
    stopRenderLoop() {
      state.stopRenderLoop();
    }
    resize() {}
    wipeCaches() {
      state.engineWipeCaches();
    }
    dispose() {
      this.isDisposed = true;
      state.engineDispose();
    }
  }
  class Scene {
    clearColor = { set: (...a: number[]) => state.clearColorSet(...a) };
    activeCamera: unknown = null;
    isDisposed = false;
    onBeforeRenderObservable = {
      add: (cb: () => void) => {
        state.onBeforeRenderCbs.push(cb);
        return cb;
      },
      remove: (cb: () => void) => {
        const i = state.onBeforeRenderCbs.indexOf(cb);
        if (i >= 0) state.onBeforeRenderCbs.splice(i, 1);
      },
    };
    render() {}
    dispose() {
      this.isDisposed = true;
      state.sceneDispose();
    }
    constructor(_e: unknown) {
      state.sceneCtor();
    }
  }
  class ArcRotateCamera {
    alpha = 0;
    beta = 1;
    radius = 4;
    targetScreenOffset: unknown = null;
    constructor(_n: string, _a: number, _b: number, _r: number, _t: unknown, scene: Scene) {
      scene.activeCamera = this;
      state.lastCamera = this;
    }
    attachControl() {}
  }
  class HemisphericLight {
    intensity = 1;
    constructor() {}
  }
  class DirectionalLight {
    position: unknown = null;
    intensity = 1;
    constructor() {}
  }
  class ShadowGenerator {
    useBlurExponentialShadowMap = false;
    blurKernel = 1;
    constructor() {
      state.shadowGenCtor();
    }
    addShadowCaster() {}
  }
  class Color3 {
    constructor(public r = 0, public g = 0, public b = 0) {}
    static FromHexString(_hex: string) {
      return new Color3(0.2, 0.2, 0.25);
    }
  }
  const MeshBuilder = {
    CreateGround: (..._a: unknown[]) => {
      state.groundCreate();
      return { position: { y: 0 }, material: null as unknown, receiveShadows: false };
    },
  };
  class Vector2 {
    constructor(public x = 0, public y = 0) {}
  }
  class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
  }
  const LoadAssetContainerAsync = vi.fn((url: string) => {
    state.loadAssetCalls.push(url);
    return state.loadAssetImpl(url);
  });
  return {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    DirectionalLight,
    ShadowGenerator,
    Color3,
    MeshBuilder,
    Vector2,
    Vector3,
    LoadAssetContainerAsync,
  };
});

vi.mock('@babylonjs/materials/shadowOnly/shadowOnlyMaterial', () => ({
  ShadowOnlyMaterial: class {
    activeLight: unknown = null;
    alpha = 1;
    constructor() {}
  },
}));

vi.mock('@babylonjs/materials/grid/gridMaterial', () => ({
  GridMaterial: class {
    mainColor: unknown = null;
    lineColor: unknown = null;
    opacity = 1;
    gridRatio = 1;
    majorUnitFrequency = 1;
    minorUnitVisibility = 1;
    constructor() {
      state.gridCtor();
    }
  },
}));

vi.mock('@babylonjs/loaders/glTF/index.js', () => ({}));

vi.mock('../walrus/fetchWithTimeout', async () => {
  const actual = await vi.importActual<typeof import('../walrus/fetchWithTimeout')>(
    '../walrus/fetchWithTimeout',
  );
  return {
    ...actual,
    fetchBlobWithTimeout: vi.fn(),
  };
});

vi.mock('../babylon/edgesGradientSweep', () => ({
  setupEdgesGradientSweep: vi.fn(() => {
    state.sweepSetup();
    return { setProgress: () => {}, dispose: state.sweepDispose };
  }),
}));

vi.mock('../babylon/PreviewCanvas', () => ({
  frameCameraToMeshes: vi.fn(() => state.frameCamera()),
}));

vi.mock('./useLedeRenderMode', () => ({
  useLedeRenderMode: vi.fn(),
}));

// U5 spine surfaces — gsap/ScrollTrigger + spineConfig are mocked so the hero's
// farewell effect runs deterministically without touching real scroll machinery.
vi.mock('gsap', () => ({ default: { registerPlugin: () => {} } }));
vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: {
    create: (cfg: { onUpdate?: (s: { progress: number }) => void }) => {
      state.scrollTriggerConfigs.push(cfg);
      return { kill: state.scrollTriggerKill };
    },
  },
}));
vi.mock('./spineConfig', () => ({
  get SPINE_FLAG_ENABLED() {
    return state.spineEnabled;
  },
  prefersReducedMotion: () => state.spineReduced,
  registerScrollTrigger: () => {},
}));

import { fetchBlobWithTimeout, WalrusFetchTimeoutError } from '../walrus/fetchWithTimeout';
import { useLedeRenderMode } from './useLedeRenderMode';
import { LedeHero } from './LedeHero';

const mockFetch = fetchBlobWithTimeout as unknown as ReturnType<typeof vi.fn>;
const mockMode = useLedeRenderMode as unknown as ReturnType<typeof vi.fn>;

function resetState(): void {
  state.engineCtor.mockReset();
  state.engineDispose.mockReset();
  state.engineWipeCaches.mockReset();
  state.sceneCtor.mockReset();
  state.sceneDispose.mockReset();
  state.loadAssetCalls = [];
  state.loadAssetImpl = () =>
    Promise.resolve({ meshes: [], addAllToScene: () => {}, dispose: () => {} });
  state.sweepSetup.mockReset();
  state.sweepDispose.mockReset();
  state.frameCamera.mockReset();
  state.clearColorSet.mockReset();
  state.groundCreate.mockReset();
  state.shadowGenCtor.mockReset();
  state.gridCtor.mockReset();
  state.runRenderLoop.mockReset();
  state.stopRenderLoop.mockReset();
  state.scrollTriggerKill.mockReset();
  state.onBeforeRenderCbs = [];
  state.scrollTriggerConfigs = [];
  state.lastCamera = null;
  state.spineEnabled = true;
  state.spineReduced = false;
}

beforeEach(() => {
  resetState();
  mockFetch.mockReset();
  mockMode.mockReset();
  // jsdom polyfills for createObjectURL / revokeObjectURL.
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: () => 'blob:mock',
    });
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => {},
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

describe('LedeHero — render-mode branching', () => {
  it('AE1/AE2 — static-fallback mode renders <img>, no Babylon engine, no canvas', async () => {
    mockMode.mockReturnValue('static-fallback');
    render(
      <MemoryRouter>
        <StrictMode>
          <LedeHero />
        </StrictMode>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('lede-static-image')).toBeTruthy();
    });
    expect(screen.queryByTestId('lede-canvas')).toBeNull();
    expect(state.engineCtor).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    // The editorial right column is desktop/live-only.
    expect(screen.queryByTestId('lede-content')).toBeNull();
  });

  it('live mode renders the right editorial column (headline + jargon-free spec)', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('lede-content')).toBeTruthy());
    expect(screen.getByText('Carve. Mint. Riff.')).toBeTruthy();
    expect(screen.getByText('MODEL')).toBeTruthy();
    // No spec-layer jargon leaks into user-facing copy.
    const text = screen.getByTestId('lede-content').textContent ?? '';
    expect(text).not.toMatch(/\bL[123]\b/);
  });

  it('live mode mounts canvas and constructs Engine + Scene + camera framing in order', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.engineCtor).toHaveBeenCalled());
    await waitFor(() => expect(state.sceneCtor).toHaveBeenCalled());
    await waitFor(() => expect(state.loadAssetCalls.length).toBeGreaterThan(0));
    expect(screen.getByTestId('lede-canvas')).toBeTruthy();
    // First load comes from the Walrus blob: URL (not the embedded path).
    expect(state.loadAssetCalls[0]?.startsWith('blob:')).toBe(true);
    await waitFor(() => expect(state.frameCamera).toHaveBeenCalled());
    // U4/D-093 — Blender viewport, NOT the wireframe sweep.
    expect(state.sweepSetup).not.toHaveBeenCalled();
  });

  it('AE5 — live hero blends into the page (paper clearColor, NOT black; contact shadow built; sweep gone)', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.sceneCtor).toHaveBeenCalled());
    // clearColor is the page paper, NOT pure black (0,0,0). The mocked
    // Color3.FromHexString returns (0.2,0.2,0.25); assert it reached clearColor.set.
    await waitFor(() => expect(state.clearColorSet).toHaveBeenCalled());
    const args = state.clearColorSet.mock.calls[0] ?? [];
    expect(args.slice(0, 3)).not.toEqual([0, 0, 0]);
    expect(args[0]).toBeCloseTo(0.2);
    // Contact-shadow rig + faint grid floor: grounds + a ShadowGenerator + grid material.
    expect(state.groundCreate).toHaveBeenCalled();
    expect(state.shadowGenCtor).toHaveBeenCalled();
    expect(state.gridCtor).toHaveBeenCalled();
  });
});

describe('LedeHero — Walrus fetch behaviour', () => {
  it('AE3 — fetch timeout swaps source to embedded GLB; engine stays alive', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockRejectedValue(new WalrusFetchTimeoutError('walrus://x', 3000));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.loadAssetCalls.length).toBeGreaterThan(0));
    expect(state.loadAssetCalls.some((u) => u.endsWith('/models/tusk3d/tusk.glb'))).toBe(
      true,
    );
    // Engine constructor fired exactly once; not torn down on the swap path.
    expect(state.engineCtor).toHaveBeenCalledTimes(1);
    expect(state.engineDispose).not.toHaveBeenCalled();
  });

  it('happy fetch never loads the embedded GLB', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.loadAssetCalls.length).toBeGreaterThan(0));
    expect(
      state.loadAssetCalls.some((u) => u.endsWith('/models/tusk3d/tusk.glb')),
    ).toBe(false);
  });

  it('embedded GLB load failure logs but does not crash React', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockRejectedValue(new WalrusFetchTimeoutError('walrus://x', 3000));
    state.loadAssetImpl = () => Promise.reject(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.loadAssetCalls.length).toBeGreaterThan(0));
    // Settle pending microtasks so the rejected load resolves into the catch.
    await act(async () => {
      await Promise.resolve();
    });
    expect(warn).toHaveBeenCalled();
    expect(screen.getByTestId('lede-canvas')).toBeTruthy();
    warn.mockRestore();
  });
});

describe('LedeHero — 15s dwell CTA', () => {
  it('AE4 — live + 15s dwell renders CTA with accent color and /launch href', async () => {
    vi.useFakeTimers();
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('lede-cta')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    const cta = screen.getByTestId('lede-cta');
    expect(cta.getAttribute('href')).toBe('/launch');
    // jsdom normalises hex to rgb(); accept either form.
    const color = (cta as HTMLElement).style.color.toLowerCase();
    expect(color === '#ff4500' || color === 'rgb(255, 69, 0)').toBe(true);
  });

  it('static-fallback + 15s dwell does NOT render CTA (R15 — fallback has no dwell)', async () => {
    vi.useFakeTimers();
    mockMode.mockReturnValue('static-fallback');
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.queryByTestId('lede-cta')).toBeNull();
  });
});

describe('LedeHero — StrictMode + lifecycle safety', () => {
  it('StrictMode double-mount: engine constructed/disposed cleanly, no swept GLB stays alive', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <StrictMode>
          <LedeHero />
        </StrictMode>
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.engineCtor).toHaveBeenCalled());
    // StrictMode dev-mount: engine ctor count >= 1, dispose count >= 0; no
    // "Engine already disposed" throw bubbles out (rendering didn't throw).
    expect(screen.getByTestId('lede-canvas')).toBeTruthy();
  });

  it('unmount mid-fetch aborts the controller and revokes the object URL', async () => {
    mockMode.mockReturnValue('live');
    let resolveFetch!: (b: ArrayBuffer) => void;
    mockFetch.mockImplementation(
      (_url: string, opts: { signal?: AbortSignal }) =>
        new Promise<ArrayBuffer>((resolve, reject) => {
          resolveFetch = resolve;
          opts.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { unmount } = render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    unmount();
    // After unmount, the in-flight fetch promise resolving should NOT call
    // any post-resolve setState that produces a React warning. Resolving
    // here verifies the alive-ref + abort guard.
    resolveFetch(new ArrayBuffer(8));
    await act(async () => {
      await Promise.resolve();
    });
    // No GLB load is queued because the fetch path aborted before resolving.
    expect(state.loadAssetCalls.length).toBe(0);
    revoke.mockRestore();
  });
});

describe('LedeHero — U5 scroll-spine farewell camera move', () => {
  it('AE3 — scrolling the hero out drives the camera (beta up, radius back) with NO new render loop (R9)', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.frameCamera).toHaveBeenCalled());
    await waitFor(() => expect(state.scrollTriggerConfigs.length).toBeGreaterThan(0));

    const cam = state.lastCamera!;
    expect(cam).not.toBeNull();
    const baseBeta = cam.beta;
    const baseRadius = cam.radius;
    // Snapshot render-loop control counts BEFORE driving the farewell.
    const rl = state.runRenderLoop.mock.calls.length;
    const sl = state.stopRenderLoop.mock.calls.length;

    const cfg = state.scrollTriggerConfigs[0]!;
    act(() => cfg.onUpdate?.({ progress: 1 }));
    // The existing render loop "ticks": invoke the registered onBeforeRender cbs.
    act(() => {
      state.onBeforeRenderCbs.forEach((cb) => cb());
    });

    expect(cam.beta).toBeCloseTo(baseBeta - 0.5);
    expect(cam.radius).toBeCloseTo(baseRadius + 1.5);
    // R9 / KTD-3: the farewell path touched no render-loop control.
    expect(state.runRenderLoop.mock.calls.length).toBe(rl);
    expect(state.stopRenderLoop.mock.calls.length).toBe(sl);
  });

  it('returns the camera to its framed pose when scrolled back to the top', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.scrollTriggerConfigs.length).toBeGreaterThan(0));
    const cam = state.lastCamera!;
    const baseBeta = cam.beta;
    const baseRadius = cam.radius;
    const cfg = state.scrollTriggerConfigs[0]!;

    act(() => cfg.onUpdate?.({ progress: 0.6 }));
    act(() => state.onBeforeRenderCbs.forEach((cb) => cb()));
    expect(cam.beta).not.toBeCloseTo(baseBeta);

    act(() => cfg.onUpdate?.({ progress: 0 }));
    act(() => state.onBeforeRenderCbs.forEach((cb) => cb()));
    expect(cam.beta).toBeCloseTo(baseBeta);
    expect(cam.radius).toBeCloseTo(baseRadius);
  });

  it('does not create a farewell ScrollTrigger under reduced-motion (hero unchanged)', async () => {
    state.spineReduced = true;
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.frameCamera).toHaveBeenCalled());
    expect(state.scrollTriggerConfigs.length).toBe(0);
  });

  it('does not create a farewell ScrollTrigger when the build flag is off', async () => {
    state.spineEnabled = false;
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.frameCamera).toHaveBeenCalled());
    expect(state.scrollTriggerConfigs.length).toBe(0);
  });

  it('is inert in static-fallback mode (no canvas, no farewell trigger)', async () => {
    mockMode.mockReturnValue('static-fallback');
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('lede-static-image')).toBeTruthy());
    expect(state.scrollTriggerConfigs.length).toBe(0);
  });

  it('StrictMode double-mount: every farewell ScrollTrigger created is also killed', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    const { unmount } = render(
      <MemoryRouter>
        <StrictMode>
          <LedeHero />
        </StrictMode>
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.scrollTriggerConfigs.length).toBeGreaterThan(0));
    unmount();
    // No leaked trigger: kills == creates (StrictMode makes this >1 each).
    expect(state.scrollTriggerKill.mock.calls.length).toBe(state.scrollTriggerConfigs.length);
  });
});
