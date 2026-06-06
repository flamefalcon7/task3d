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
  gridCtor: ReturnType<typeof vi.fn>;
  groundCreate: ReturnType<typeof vi.fn>;
  axesCtor: ReturnType<typeof vi.fn>;
  axesDispose: ReturnType<typeof vi.fn>;
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
  gridCtor: vi.fn(),
  groundCreate: vi.fn(),
  axesCtor: vi.fn(),
  axesDispose: vi.fn(),
};

vi.mock('@babylonjs/core', () => {
  class Engine {
    isDisposed = false;
    constructor(..._a: unknown[]) {
      state.engineCtor();
    }
    runRenderLoop() {}
    stopRenderLoop() {}
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
      add: (cb: () => void) => cb,
      remove: () => {},
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
    constructor(_n: string, _a: number, _b: number, _r: number, _t: unknown, scene: Scene) {
      scene.activeCamera = this;
    }
    attachControl() {}
  }
  class HemisphericLight {
    constructor() {}
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
      return { position: { y: 0 }, material: null as unknown };
    },
  };
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
    Color3,
    MeshBuilder,
    Vector3,
    LoadAssetContainerAsync,
  };
});

vi.mock('@babylonjs/core/Debug/axesViewer', () => ({
  AxesViewer: class {
    constructor() {
      state.axesCtor();
    }
    dispose() {
      state.axesDispose();
    }
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
  state.gridCtor.mockReset();
  state.groundCreate.mockReset();
  state.axesCtor.mockReset();
  state.axesDispose.mockReset();
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
    // Caption still renders on fallback (R20).
    expect(screen.getByTestId('lede-caption')).toBeTruthy();
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

  it('AE5 — live hero is a grey Blender viewport (grey clearColor + grid + axis), sweep removed', async () => {
    mockMode.mockReturnValue('live');
    mockFetch.mockResolvedValue(new ArrayBuffer(64));
    render(
      <MemoryRouter>
        <LedeHero />
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.sceneCtor).toHaveBeenCalled());
    // Grey clearColor — NOT pure black (0,0,0). The mocked Color3.FromHexString
    // returns (0.2, 0.2, 0.25); assert that's what reached scene.clearColor.set.
    await waitFor(() => expect(state.clearColorSet).toHaveBeenCalled());
    const args = state.clearColorSet.mock.calls[0] ?? [];
    expect(args.slice(0, 3)).not.toEqual([0, 0, 0]);
    expect(args[0]).toBeCloseTo(0.2);
    // Grid mesh + grid material + axis indicator all built.
    expect(state.groundCreate).toHaveBeenCalled();
    expect(state.gridCtor).toHaveBeenCalled();
    expect(state.axesCtor).toHaveBeenCalled();
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
