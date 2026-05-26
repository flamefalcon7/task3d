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
  meshes: Array<{ getTotalVertices: () => number; name: string }>;
} = {
  engineDispose: vi.fn(),
  sceneDispose: vi.fn(),
  hlDispose: vi.fn(),
  hlRemoveAll: vi.fn(),
  hlAddMesh: vi.fn(),
  pointerCb: null,
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
        state.pointerCb = cb;
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
    attachControl() {}
    constructor(...args: unknown[]) {
      const scene = args[args.length - 1] as { activeCamera: unknown };
      if (scene) scene.activeCamera = this;
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
  return { name, getTotalVertices: () => verts };
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

  it('fires onLoaded with the filtered mesh count once the GLB loads', async () => {
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
    // Fixture has 4 raw meshes (__root__ + 3 parts); filtered count = 3.
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledWith(3);
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
