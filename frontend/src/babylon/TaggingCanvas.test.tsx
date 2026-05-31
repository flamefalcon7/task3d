import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// Track per-test instances of the mocked Babylon primitives so tests can
// inspect calls and drive the pointer observable callback manually.
const state: {
  engineDispose: ReturnType<typeof vi.fn>;
  sceneDispose: ReturnType<typeof vi.fn>;
  hlDispose: ReturnType<typeof vi.fn>;
  hlRemoveAll: ReturnType<typeof vi.fn>;
  hlAddMesh: ReturnType<typeof vi.fn>;
  pointerCb: ((info: unknown) => void) | null;
  // plan-015 F14 — auto-rotate registers a SECOND pointer observable
  // alongside the picker one + an onBeforeRenderObservable. Track them
  // separately so the tests can drive the per-frame callback directly
  // and assert observer registration/removal.
  beforeRenderCbs: Array<() => void>;
  removedBeforeRenderCbs: number;
  camera: { alpha: number } | null;
  meshes: Array<{
    name: string;
    getTotalVertices: () => number;
    material?: { wireframe?: boolean; alpha?: number; albedoColor?: { r: number; g: number; b: number; clone: () => any; copyFrom: (c: any) => any } };
  }>;
} = {
  engineDispose: vi.fn(),
  sceneDispose: vi.fn(),
  hlDispose: vi.fn(),
  hlRemoveAll: vi.fn(),
  hlAddMesh: vi.fn(),
  pointerCb: null,
  beforeRenderCbs: [],
  removedBeforeRenderCbs: 0,
  camera: null,
  meshes: [],
};

vi.mock('@babylonjs/core', () => {
  class Engine {
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
        // The picker observable registers FIRST. Subsequent .add calls
        // (auto-rotate) don't overwrite the picker — they just append.
        if (!state.pointerCb) state.pointerCb = cb;
        return cb;
      },
      remove: (_cb: unknown) => {},
    };
    // plan-015 F14 — onBeforeRenderObservable surface for auto-rotate.
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
    static FromHexString(hex: string) {
      return { __hex: hex };
    }
  }
  class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
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

// Avoid touching PreviewCanvas's Babylon imports for the helper reuse.
vi.mock('./PreviewCanvas', () => ({
  frameCameraToMeshes: vi.fn(),
}));

import { TaggingCanvas } from './TaggingCanvas';

function makeMesh(name: string, verts = 12) {
  return {
    name,
    getTotalVertices: () => verts,
    // plan-015 F14 — applyCanvasMode (called by the combined mode-and-
    // selection effect) reads material.{alpha, wireframe, albedoColor}.
    // Provide a minimal stub so it can mutate without throwing.
    // plan A2 — `name` lets renderableMaterialNames (onLoaded) report per-part
    // names; each part gets a distinct material name derived from the node name.
    material: {
      name: `mat_${name}`,
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
  // Two microtask flushes covers the await + addAllToScene/setState chain.
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
  state.pointerCb = null;
  state.beforeRenderCbs = [];
  state.removedBeforeRenderCbs = 0;
  state.camera = null;
  state.meshes = [
    makeMesh('__root__', 0),
    makeMesh('tripo_part_0'),
    makeMesh('tripo_part_1'),
    makeMesh('tripo_part_2'),
  ];
});

afterEach(() => {
  cleanup();
});

describe('TaggingCanvas', () => {
  it('renders a canvas element', () => {
    render(<TaggingCanvas glbUrl={null} selectedIndex={null} onPartSelect={() => {}} />);
    expect(screen.getByTestId('tagging-canvas').tagName).toBe('CANVAS');
  });

  it('UX-G2 — renders loading overlay until a GLB has loaded; clears after', async () => {
    const { rerender } = render(
      <TaggingCanvas glbUrl={null} selectedIndex={null} onPartSelect={() => {}} />,
    );
    // No glbUrl → overlay stays up (nothing to load).
    expect(screen.getByTestId('tagging-canvas-loading')).toBeTruthy();
    // Provide a glbUrl → overlay clears once the async load resolves +
    // React commits the setMeshLoaded(true) re-render.
    rerender(
      <TaggingCanvas glbUrl="blob:http://localhost/abc" selectedIndex={null} onPartSelect={() => {}} />,
    );
    expect(screen.getByTestId('tagging-canvas-loading')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByTestId('tagging-canvas-loading')).toBeNull(),
    );
  });

  it('calls LoadAssetContainerAsync with pluginExtension when glbUrl is provided', async () => {
    const babylon = await import('@babylonjs/core');
    const spy = babylon.LoadAssetContainerAsync as unknown as ReturnType<typeof vi.fn>;
    spy.mockClear();
    render(<TaggingCanvas glbUrl="blob:http://localhost/abc" selectedIndex={null} onPartSelect={() => {}} />);
    await flushAsync();
    expect(spy).toHaveBeenCalledWith(
      'blob:http://localhost/abc',
      expect.anything(),
      { pluginExtension: '.glb' },
    );
  });

  it('fires onPartSelect with filtered mesh index when a part is clicked', async () => {
    const babylon = await import('@babylonjs/core');
    const onPartSelect = vi.fn();
    render(<TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={null} onPartSelect={onPartSelect} />);
    await flushAsync();

    expect(state.pointerCb).toBeTruthy();
    // Filtered list drops __root__, so meshes[1] in the raw container is
    // index 0 in the filtered list. Picking tripo_part_1 → expect onPartSelect(1).
    state.pointerCb!({
      type: babylon.PointerEventTypes.POINTERPICK,
      pickInfo: { pickedMesh: state.meshes[2] },
    });
    expect(onPartSelect).toHaveBeenCalledTimes(1);
    expect(onPartSelect).toHaveBeenCalledWith(1);
  });

  it('fires onLoaded with the filtered part count + per-part material names once the GLB loads', async () => {
    const onLoaded = vi.fn();
    render(
      <TaggingCanvas
        glbUrl="blob:http://localhost/glb"
        selectedIndex={null}
        onPartSelect={() => {}}
        onLoaded={onLoaded}
      />,
    );
    await flushAsync();
    // Fixture has 4 raw meshes (__root__ + 3 parts); filtered count = 3, with
    // each part's material name surfaced in filtered order (plan A2).
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith({
      partCount: 3,
      materialNames: ['mat_tripo_part_0', 'mat_tripo_part_1', 'mat_tripo_part_2'],
    });
  });

  it('ignores non-POINTERPICK pointer events', async () => {
    const onPartSelect = vi.fn();
    render(<TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={null} onPartSelect={onPartSelect} />);
    await flushAsync();
    state.pointerCb!({ type: 1, pickInfo: { pickedMesh: state.meshes[1] } });
    expect(onPartSelect).not.toHaveBeenCalled();
  });

  it('drives HighlightLayer.removeAllMeshes then addMesh when selectedIndex changes', async () => {
    const { rerender } = render(
      <TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={null} onPartSelect={() => {}} />,
    );
    await flushAsync();
    state.hlRemoveAll.mockClear();
    state.hlAddMesh.mockClear();

    rerender(
      <TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={0} onPartSelect={() => {}} />,
    );
    await flushAsync();
    expect(state.hlRemoveAll).toHaveBeenCalled();
    expect(state.hlAddMesh).toHaveBeenCalledTimes(1);
    // First filtered mesh (index 0) is tripo_part_0.
    const call = state.hlAddMesh.mock.calls[0]!;
    expect(call[0]).toBe(state.meshes[1]);
    expect(call[1]).toEqual({ __hex: '#FF4500' });
  });

  it('clears highlight when selectedIndex returns to null', async () => {
    const { rerender } = render(
      <TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={1} onPartSelect={() => {}} />,
    );
    await flushAsync();
    state.hlRemoveAll.mockClear();
    state.hlAddMesh.mockClear();

    rerender(
      <TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={null} onPartSelect={() => {}} />,
    );
    expect(state.hlRemoveAll).toHaveBeenCalled();
    expect(state.hlAddMesh).not.toHaveBeenCalled();
  });

  it('disposes Engine, Scene, and HighlightLayer on unmount', async () => {
    const { unmount } = render(
      <TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={null} onPartSelect={() => {}} />,
    );
    await flushAsync();
    state.engineDispose.mockClear();
    state.sceneDispose.mockClear();
    state.hlDispose.mockClear();

    unmount();
    expect(state.engineDispose).toHaveBeenCalled();
    expect(state.sceneDispose).toHaveBeenCalled();
    expect(state.hlDispose).toHaveBeenCalled();
  });

  // -- plan-015 U2 — mode-toggle pill -------------------------------------

  it('omits the mode-toggle pill by default', () => {
    render(<TaggingCanvas glbUrl={null} selectedIndex={null} onPartSelect={() => {}} />);
    expect(screen.queryByTestId('tagging-mode-toggle-pill')).toBeNull();
  });

  it('renders the mode-toggle pill when modeToggle + onModeCycle are provided', () => {
    render(
      <TaggingCanvas
        glbUrl={null}
        selectedIndex={null}
        onPartSelect={() => {}}
        mode="parts"
        onModeCycle={() => {}}
        modeToggle
      />,
    );
    expect(screen.getByTestId('tagging-mode-toggle-pill').textContent).toBe('MODE: PARTS');
  });

  it('does NOT render the mode-toggle pill when modeToggle=true but onModeCycle is missing', () => {
    render(
      <TaggingCanvas
        glbUrl={null}
        selectedIndex={null}
        onPartSelect={() => {}}
        mode="parts"
        modeToggle
      />,
    );
    expect(screen.queryByTestId('tagging-mode-toggle-pill')).toBeNull();
  });

  it('mode="solo" with highlightedParts adds matching meshes to HighlightLayer alongside selectedIndex', async () => {
    const { rerender } = render(
      <TaggingCanvas
        glbUrl="blob:http://localhost/glb"
        selectedIndex={null}
        onPartSelect={() => {}}
      />,
    );
    await flushAsync();
    state.hlAddMesh.mockClear();
    state.hlRemoveAll.mockClear();

    rerender(
      <TaggingCanvas
        glbUrl="blob:http://localhost/glb"
        selectedIndex={2}
        onPartSelect={() => {}}
        mode="solo"
        highlightedParts={[0]}
      />,
    );
    await flushAsync();

    expect(state.hlRemoveAll).toHaveBeenCalled();
    // Two HL additions: highlightedParts[0]=0 (mesh idx 1: tripo_part_0)
    // AND selectedIndex=2 (mesh idx 3: tripo_part_2).
    expect(state.hlAddMesh).toHaveBeenCalledTimes(2);
    const addedMeshes = state.hlAddMesh.mock.calls.map((c) => c[0]);
    expect(addedMeshes).toContain(state.meshes[1]);
    expect(addedMeshes).toContain(state.meshes[3]);
  });

  // -- plan-015 F14 — mode + auto-rotate test coverage ---------------------

  it('F14: mode="wireframe" sets material.wireframe=true on every filtered mesh', async () => {
    const { rerender } = render(
      <TaggingCanvas
        glbUrl="blob:http://localhost/glb"
        selectedIndex={null}
        onPartSelect={() => {}}
        mode="pbr"
      />,
    );
    await waitFor(() =>
      // PBR mount with no overlay keeps wireframe false on the loaded meshes.
      expect(state.meshes[1].material!.wireframe).toBe(false),
    );
    rerender(
      <TaggingCanvas
        glbUrl="blob:http://localhost/glb"
        selectedIndex={null}
        onPartSelect={() => {}}
        mode="wireframe"
      />,
    );
    // Filtered meshes 1-3 (skipping __root__) all have wireframe=true.
    await waitFor(() =>
      expect(state.meshes[1].material!.wireframe).toBe(true),
    );
    expect(state.meshes[2].material!.wireframe).toBe(true);
    expect(state.meshes[3].material!.wireframe).toBe(true);
    // __root__ (filtered out) stays untouched.
    expect(state.meshes[0].material!.wireframe).toBe(false);
  });

  it('F14: mode="pbr" restores baseline alpha and wireframe after a SOLO transition', async () => {
    const { rerender } = render(
      <TaggingCanvas
        glbUrl="blob:http://localhost/glb"
        selectedIndex={null}
        onPartSelect={() => {}}
        mode="solo"
        highlightedParts={[0]}
      />,
    );
    // SOLO dims non-highlighted meshes to alpha 0.2 after the load + mode
    // effect resolve. waitFor handles the multi-tick async chain.
    await waitFor(() =>
      expect(state.meshes[2].material!.alpha).toBeCloseTo(0.2),
    );
    rerender(
      <TaggingCanvas
        glbUrl="blob:http://localhost/glb"
        selectedIndex={null}
        onPartSelect={() => {}}
        mode="pbr"
      />,
    );
    // PBR restores baseline alpha (1) on every mesh.
    await waitFor(() =>
      expect(state.meshes[2].material!.alpha).toBeCloseTo(1),
    );
    expect(state.meshes[1].material!.alpha).toBeCloseTo(1);
    expect(state.meshes[3].material!.alpha).toBeCloseTo(1);
  });

  it('F14: omits auto-rotate observers when autoRotate=false (default)', async () => {
    render(
      <TaggingCanvas
        glbUrl={null}
        selectedIndex={null}
        onPartSelect={() => {}}
      />,
    );
    await flushAsync();
    // No before-render observer registered for the non-auto-rotate path.
    expect(state.beforeRenderCbs.length).toBe(0);
  });

  it('F14: autoRotate=true registers a per-frame observer and removes it on unmount', async () => {
    const { unmount } = render(
      <TaggingCanvas
        glbUrl={null}
        selectedIndex={null}
        onPartSelect={() => {}}
        autoRotate
      />,
    );
    await flushAsync();
    expect(state.beforeRenderCbs.length).toBe(1);
    unmount();
    expect(state.removedBeforeRenderCbs).toBeGreaterThanOrEqual(1);
  });

  it('F14: autoRotate observer advances camera.alpha after the 3s idle gate', async () => {
    vi.useFakeTimers();
    const start = 1_000_000;
    vi.setSystemTime(start);
    render(
      <TaggingCanvas
        glbUrl={null}
        selectedIndex={null}
        onPartSelect={() => {}}
        autoRotate
      />,
    );
    await flushAsync();

    expect(state.beforeRenderCbs.length).toBe(1);
    const renderCb = state.beforeRenderCbs[0]!;

    // First tick — lastPointerMs == lastTickMs == start, idle gate not
    // tripped (0 < 3000), no rotation.
    renderCb();
    expect(state.camera!.alpha).toBe(0);

    // Advance 4s; tick → 4s since lastPointer (gate trips), 4s deltaSec.
    vi.setSystemTime(start + 4000);
    renderCb();
    // 0.2 rad/sec × 4 sec = 0.8 rad.
    expect(state.camera!.alpha).toBeCloseTo(0.8);
    vi.useRealTimers();
  });

  it('survives StrictMode double-mount: pointer callback still fires after the cycle', async () => {
    const onPartSelect = vi.fn();
    render(
      <StrictMode>
        <TaggingCanvas glbUrl="blob:http://localhost/glb" selectedIndex={null} onPartSelect={onPartSelect} />
      </StrictMode>,
    );
    await flushAsync();

    expect(state.pointerCb).toBeTruthy();
    // After the StrictMode mount→cleanup→mount cycle, the live engine/scene
    // belong to the second mount. Driving the (latest) pointer callback should
    // still resolve to a fresh meshes ref and fire onPartSelect.
    const babylon = await import('@babylonjs/core');
    state.pointerCb!({
      type: babylon.PointerEventTypes.POINTERPICK,
      pickInfo: { pickedMesh: state.meshes[1] },
    });
    expect(onPartSelect).toHaveBeenCalledWith(0);
  });
});
