import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// Babylon needs WebGL — jsdom doesn't have it. Mock @babylonjs/core entirely
// so the smoke test verifies the React shell renders + mount/unmount lifecycle,
// not actual GL rendering (that requires e2e in a real browser).
//
// plan-015 U2 — mock surface extended with HighlightLayer, POINTERPICK
// observable, Color3, and onBeforeRenderObservable (for auto-rotate). Mirrors
// the TaggingCanvas.test.tsx setup so the two canvases share a single mocking
// pattern.
const state: {
  engineDispose: ReturnType<typeof vi.fn>;
  sceneDispose: ReturnType<typeof vi.fn>;
  hlDispose: ReturnType<typeof vi.fn>;
  hlRemoveAll: ReturnType<typeof vi.fn>;
  hlAddMesh: ReturnType<typeof vi.fn>;
  pointerCbs: Array<(info: unknown) => void>;
  beforeRenderCbs: Array<() => void>;
  removedPointerCbs: number;
  removedBeforeRenderCbs: number;
  meshes: Array<{
    name: string;
    getTotalVertices: () => number;
    material: {
      alpha: number;
      wireframe: boolean;
      albedoColor: { r: number; g: number; b: number; clone: () => any; copyFrom: (c: any) => any } | null;
    };
  }>;
  camera: { alpha: number };
} = {
  engineDispose: vi.fn(),
  sceneDispose: vi.fn(),
  hlDispose: vi.fn(),
  hlRemoveAll: vi.fn(),
  hlAddMesh: vi.fn(),
  pointerCbs: [],
  beforeRenderCbs: [],
  removedPointerCbs: 0,
  removedBeforeRenderCbs: 0,
  meshes: [],
  camera: { alpha: 0 },
};

vi.mock('@babylonjs/core', () => {
  class Engine {
    constructor(..._a: unknown[]) {}
    runRenderLoop() {}
    resize() {}
    dispose() {
      state.engineDispose();
    }
  }
  class Scene {
    clearColor = { set: () => {} };
    activeCamera: unknown = null;
    onPointerObservable = {
      add: (cb: (info: unknown) => void) => {
        state.pointerCbs.push(cb);
        return cb;
      },
      remove: (_cb: unknown) => {
        state.removedPointerCbs++;
      },
    };
    onBeforeRenderObservable = {
      add: (cb: () => void) => {
        state.beforeRenderCbs.push(cb);
        return cb;
      },
      remove: (_cb: unknown) => {
        state.removedBeforeRenderCbs++;
      },
    };
    render() {}
    dispose() {
      state.sceneDispose();
    }
    constructor(_e: unknown) {}
  }
  class ArcRotateCamera {
    wheelDeltaPercentage = 0;
    alpha = 0;
    fov = Math.PI / 4;
    setTarget() {}
    radius = 4;
    lowerRadiusLimit = 0;
    upperRadiusLimit = 100;
    minZ = 0.001;
    maxZ = 1000;
    attachControl() {}
    constructor(...args: unknown[]) {
      const scene = args[args.length - 1] as { activeCamera: unknown };
      if (scene) scene.activeCamera = this;
      state.camera = this;
    }
  }
  class HemisphericLight {
    constructor(..._a: unknown[]) {}
  }
  class HighlightLayer {
    addMesh(mesh: unknown, color: unknown) {
      state.hlAddMesh(mesh, color);
    }
    removeAllMeshes() {
      state.hlRemoveAll();
    }
    dispose() {
      state.hlDispose();
    }
    constructor(..._a: unknown[]) {}
  }
  class Color3 {
    constructor(public r: number, public g: number, public b: number) {}
    static FromHexString(hex: string) {
      return { __hex: hex };
    }
    clone() {
      return new Color3(this.r, this.g, this.b);
    }
    copyFrom(c: { r: number; g: number; b: number }) {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
      return this;
    }
  }
  class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
    add() {
      return new Vector3();
    }
    subtract() {
      return new Vector3();
    }
    scale() {
      return new Vector3();
    }
    length() {
      return 1;
    }
    clone() {
      return new Vector3();
    }
    static Minimize(a: Vector3, _b: Vector3) {
      return a.clone();
    }
    static Maximize(a: Vector3, _b: Vector3) {
      return a.clone();
    }
  }
  class AssetContainer {
    meshes = state.meshes;
    addAllToScene() {}
    dispose() {}
  }
  const LoadAssetContainerAsync = vi.fn(async () => new AssetContainer());
  const PointerEventTypes = { POINTERPICK: 4 };
  return {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    HighlightLayer,
    Color3,
    Vector3,
    AssetContainer,
    LoadAssetContainerAsync,
    PointerEventTypes,
  };
});

vi.mock('@babylonjs/loaders/glTF/index.js', () => ({}));

import { PreviewCanvas } from './PreviewCanvas';

function vec3Mock() {
  return {
    x: 0,
    y: 0,
    z: 0,
    clone() {
      return vec3Mock();
    },
    add() {
      return vec3Mock();
    },
    subtract() {
      return vec3Mock();
    },
    scale() {
      return vec3Mock();
    },
    length() {
      return 1;
    },
  };
}

function makeMesh(name: string, verts = 12) {
  return {
    name,
    getTotalVertices: () => verts,
    // frameCameraToMeshes (called by the load effect after a successful load)
    // walks computeWorldMatrix + getBoundingInfo. Stub them so the load
    // sequence completes cleanly — without these the load throws BEFORE
    // setLoadEpoch fires and the mode effect never re-runs against fresh
    // meshes.
    computeWorldMatrix() {},
    getBoundingInfo() {
      return { boundingBox: { minimumWorld: vec3Mock(), maximumWorld: vec3Mock() } };
    },
    material: {
      alpha: 1,
      wireframe: false,
      albedoColor: {
        r: 0.5,
        g: 0.5,
        b: 0.5,
        clone() {
          return { ...this, clone: this.clone, copyFrom: this.copyFrom };
        },
        copyFrom(c: { r: number; g: number; b: number }) {
          this.r = c.r;
          this.g = c.g;
          this.b = c.b;
          return this;
        },
      },
    },
  };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  state.engineDispose = vi.fn();
  state.sceneDispose = vi.fn();
  state.hlDispose = vi.fn();
  state.hlRemoveAll = vi.fn();
  state.hlAddMesh = vi.fn();
  state.pointerCbs = [];
  state.beforeRenderCbs = [];
  state.removedPointerCbs = 0;
  state.removedBeforeRenderCbs = 0;
  state.meshes = [
    makeMesh('__root__', 0),
    makeMesh('tripo_part_0'),
    makeMesh('tripo_part_1'),
    makeMesh('tripo_part_2'),
  ];
  state.camera = { alpha: 0 };
});

afterEach(() => cleanup());

describe('PreviewCanvas', () => {
  it('renders a canvas element with default mode and bg attributes', () => {
    render(<PreviewCanvas glbUrl={null} />);
    const canvas = screen.getByTestId('preview-canvas');
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.getAttribute('data-mode')).toBe('pbr');
    expect(canvas.getAttribute('data-bg')).toBe('black');
  });

  it('calls LoadAssetContainerAsync when glbUrl is provided', async () => {
    const babylon = await import('@babylonjs/core');
    const spy = babylon.LoadAssetContainerAsync as unknown as ReturnType<typeof vi.fn>;
    spy.mockClear();
    render(<PreviewCanvas glbUrl="blob:http://localhost/abc" />);
    await flushAsync();
    expect(spy).toHaveBeenCalledWith(
      'blob:http://localhost/abc',
      expect.anything(),
      { pluginExtension: '.glb' },
    );
  });

  // -- plan-015 U2 — mode toggle pill rendering -----------------------------

  it('omits the mode-toggle pill by default (backward-compatible call sites)', () => {
    render(<PreviewCanvas glbUrl={null} />);
    expect(screen.queryByTestId('mode-toggle-pill')).toBeNull();
  });

  it('renders the mode-toggle pill when modeToggle + onModeCycle are provided', () => {
    render(
      <PreviewCanvas
        glbUrl={null}
        mode="parts"
        onModeCycle={() => {}}
        modeToggle
      />,
    );
    expect(screen.getByTestId('mode-toggle-pill').textContent).toBe('MODE: PARTS');
  });

  it('does NOT render the mode-toggle pill when modeToggle=true but onModeCycle is missing', () => {
    render(<PreviewCanvas glbUrl={null} mode="parts" modeToggle />);
    expect(screen.queryByTestId('mode-toggle-pill')).toBeNull();
  });

  // -- plan-015 U2 — picking observable -------------------------------------

  it('fires onPartClick with filtered mesh index when a part is clicked', async () => {
    const babylon = await import('@babylonjs/core');
    const onPartClick = vi.fn();
    render(
      <PreviewCanvas
        glbUrl="blob:http://localhost/glb"
        onPartClick={onPartClick}
      />,
    );
    await flushAsync();

    // The mount effect registers the POINTERPICK observable unconditionally.
    expect(state.pointerCbs.length).toBeGreaterThanOrEqual(1);
    // Pick tripo_part_1 (raw index 2; filtered index 1 because __root__ is dropped).
    state.pointerCbs[0]!({
      type: babylon.PointerEventTypes.POINTERPICK,
      pickInfo: { pickedMesh: state.meshes[2] },
    });
    expect(onPartClick).toHaveBeenCalledTimes(1);
    expect(onPartClick).toHaveBeenCalledWith(1);
  });

  it('does NOT fire onPartClick when no handler was provided at pick time', async () => {
    const babylon = await import('@babylonjs/core');
    render(<PreviewCanvas glbUrl="blob:http://localhost/glb" />);
    await flushAsync();
    expect(state.pointerCbs.length).toBeGreaterThanOrEqual(1);
    // Fire a POINTERPICK without an onPartClick prop — the handler gate
    // inside the observable should swallow it.
    expect(() =>
      state.pointerCbs[0]!({
        type: babylon.PointerEventTypes.POINTERPICK,
        pickInfo: { pickedMesh: state.meshes[1] },
      }),
    ).not.toThrow();
  });

  it('ignores non-POINTERPICK pointer events', async () => {
    const onPartClick = vi.fn();
    render(
      <PreviewCanvas
        glbUrl="blob:http://localhost/glb"
        onPartClick={onPartClick}
      />,
    );
    await flushAsync();
    state.pointerCbs[0]!({ type: 1, pickInfo: { pickedMesh: state.meshes[1] } });
    expect(onPartClick).not.toHaveBeenCalled();
  });

  // -- plan-015 U2 — HighlightLayer driven by SOLO mode ---------------------

  it('SOLO mode + highlightedParts adds matching meshes to HighlightLayer', async () => {
    const { rerender } = render(
      <PreviewCanvas glbUrl="blob:http://localhost/glb" mode="pbr" />,
    );
    await flushAsync();
    state.hlAddMesh.mockClear();
    state.hlRemoveAll.mockClear();

    rerender(
      <PreviewCanvas
        glbUrl="blob:http://localhost/glb"
        mode="solo"
        highlightedParts={[0, 2]}
      />,
    );
    await flushAsync();

    expect(state.hlRemoveAll).toHaveBeenCalled();
    expect(state.hlAddMesh).toHaveBeenCalledTimes(2);
    // First filtered mesh (index 0) is tripo_part_0 (raw index 1).
    expect(state.hlAddMesh.mock.calls[0]![0]).toBe(state.meshes[1]);
    expect(state.hlAddMesh.mock.calls[1]![0]).toBe(state.meshes[3]);
    // Accent color hex.
    expect(state.hlAddMesh.mock.calls[0]![1]).toEqual({ __hex: '#FF4500' });
  });

  it('non-SOLO mode does not add to HighlightLayer even when highlightedParts is set', async () => {
    const { rerender } = render(
      <PreviewCanvas
        glbUrl="blob:http://localhost/glb"
        mode="parts"
      />,
    );
    await flushAsync();
    state.hlAddMesh.mockClear();
    state.hlRemoveAll.mockClear();

    rerender(
      <PreviewCanvas
        glbUrl="blob:http://localhost/glb"
        mode="parts"
        highlightedParts={[0, 1]}
      />,
    );
    await flushAsync();
    expect(state.hlRemoveAll).toHaveBeenCalled();
    expect(state.hlAddMesh).not.toHaveBeenCalled();
  });

  // -- plan-015 U2 — auto-rotate --------------------------------------------

  it('omits auto-rotate observers when autoRotate=false (default)', async () => {
    render(<PreviewCanvas glbUrl={null} />);
    await flushAsync();
    // Mount registers 1 pointer observable (the POINTERPICK). No render
    // observable for the non-auto-rotate path.
    expect(state.beforeRenderCbs.length).toBe(0);
  });

  it('registers a per-frame observer when autoRotate=true and removes it on cleanup', async () => {
    const { unmount } = render(<PreviewCanvas glbUrl={null} autoRotate />);
    await flushAsync();
    expect(state.beforeRenderCbs.length).toBe(1);
    unmount();
    expect(state.removedBeforeRenderCbs).toBeGreaterThanOrEqual(1);
  });

  it('autoRotate observer advances camera.alpha after the idle gate elapses', async () => {
    vi.useFakeTimers();
    const start = 1_000_000;
    vi.setSystemTime(start);
    render(<PreviewCanvas glbUrl={null} autoRotate />);
    await flushAsync();

    expect(state.beforeRenderCbs.length).toBe(1);
    const renderCb = state.beforeRenderCbs[0]!;

    // First tick — closures' lastPointerMs and lastTickMs both equal start.
    // Idle gate = now - lastPointerMs > 3000 → still 0; no rotation.
    renderCb();
    expect(state.camera.alpha).toBe(0);

    // Advance 4s; tick → 4s since lastPointer, 4s deltaSec.
    vi.setSystemTime(start + 4000);
    renderCb();
    // 0.2 rad/sec × 4 sec = 0.8 rad.
    expect(state.camera.alpha).toBeCloseTo(0.8);
    vi.useRealTimers();
  });

  // -- plan-015 U2 — disposal -----------------------------------------------

  it('disposes Engine, Scene, and HighlightLayer on unmount', async () => {
    const { unmount } = render(<PreviewCanvas glbUrl={null} />);
    await flushAsync();
    unmount();
    expect(state.engineDispose).toHaveBeenCalled();
    expect(state.sceneDispose).toHaveBeenCalled();
    expect(state.hlDispose).toHaveBeenCalled();
  });
});
