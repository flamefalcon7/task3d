import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const state: {
  engineCtor: ReturnType<typeof vi.fn>;
  engineDispose: ReturnType<typeof vi.fn>;
  engineStopLoop: ReturnType<typeof vi.fn>;
  engineRunLoop: ReturnType<typeof vi.fn>;
  sceneDispose: ReturnType<typeof vi.fn>;
  loadAssetCalls: string[];
  frameCamera: ReturnType<typeof vi.fn>;
  sceneReady: ReturnType<typeof vi.fn>;
  sceneReadyCleanup: ReturnType<typeof vi.fn>;
} = {
  engineCtor: vi.fn(),
  engineDispose: vi.fn(),
  engineStopLoop: vi.fn(),
  engineRunLoop: vi.fn(),
  sceneDispose: vi.fn(),
  loadAssetCalls: [],
  frameCamera: vi.fn(),
  sceneReady: vi.fn(),
  sceneReadyCleanup: vi.fn(),
};

vi.mock('@babylonjs/core', () => {
  class Engine {
    isDisposed = false;
    constructor() {
      state.engineCtor();
    }
    runRenderLoop() {
      state.engineRunLoop();
    }
    stopRenderLoop() {
      state.engineStopLoop();
    }
    resize() {}
    wipeCaches() {}
    dispose() {
      this.isDisposed = true;
      state.engineDispose();
    }
  }
  class Scene {
    clearColor = { set: vi.fn() };
    activeCamera: unknown = null;
    onBeforeRenderObservable = { add: (cb: () => void) => cb, remove: () => {} };
    isDisposed = false;
    render() {}
    dispose() {
      this.isDisposed = true;
      state.sceneDispose();
    }
  }
  class ArcRotateCamera {
    alpha = 0;
    constructor(_n: string, _a: number, _b: number, _r: number, _t: unknown, scene: Scene) {
      scene.activeCamera = this;
    }
  }
  class HemisphericLight {}
  class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
  }
  const LoadAssetContainerAsync = vi.fn((url: string) => {
    state.loadAssetCalls.push(url);
    return Promise.resolve({
      meshes: [{ getTotalVertices: () => 12 }],
      addAllToScene: () => {},
      dispose: () => {},
    });
  });
  return { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, LoadAssetContainerAsync };
});

vi.mock('@babylonjs/loaders/glTF/index.js', () => ({}));

vi.mock('./PreviewCanvas', () => ({
  frameCameraToMeshes: vi.fn(() => state.frameCamera()),
}));

vi.mock('../landing/useLedeRenderMode', () => ({ useLedeRenderMode: vi.fn() }));

let mockInView = false;
vi.mock('../landing/useInView', () => ({
  useInView: () => ({ ref: vi.fn(), inView: mockInView }),
}));

import { useLedeRenderMode } from '../landing/useLedeRenderMode';
import { LiveWell, type LiveWellSceneContext } from './LiveWell';

const mockMode = useLedeRenderMode as unknown as ReturnType<typeof vi.fn>;

const baseProps = {
  glbUrl: '/models/tusk3d/tusk.glb',
  staticSrc: '/lifecycle/model.svg',
  staticAlt: 'tusk',
  ariaLabel: 'A walrus tusk 3D model',
  testIdBase: 'well-x',
};

function reset(): void {
  Object.values(state).forEach((v) => {
    if (typeof v === 'function' && 'mockReset' in v) (v as ReturnType<typeof vi.fn>).mockReset();
  });
  state.loadAssetCalls = [];
  mockInView = false;
}

beforeEach(reset);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LiveWell', () => {
  it('renders only the static image in static-fallback mode (no canvas, no engine)', () => {
    mockMode.mockReturnValue('static-fallback');
    mockInView = true;
    const { queryByTestId } = render(<LiveWell {...baseProps} />);
    expect(queryByTestId('well-x-static-image')).not.toBeNull();
    expect(queryByTestId('well-x-canvas')).toBeNull();
    expect(state.engineCtor).not.toHaveBeenCalled();
  });

  it('does not build the scene while off-screen, even when live', () => {
    mockMode.mockReturnValue('live');
    mockInView = false;
    render(<LiveWell {...baseProps} />);
    expect(state.engineCtor).not.toHaveBeenCalled();
  });

  it('builds the scene, frames the camera, and fires onSceneReady when live + in-view', async () => {
    mockMode.mockReturnValue('live');
    mockInView = true;
    const onSceneReady = vi.fn((_ctx: LiveWellSceneContext) => state.sceneReadyCleanup);
    const { queryByTestId } = render(
      <LiveWell {...baseProps} onSceneReady={onSceneReady} ariaLabel="tusk model" />,
    );
    expect(queryByTestId('well-x-canvas')).not.toBeNull();
    await waitFor(() => expect(state.frameCamera).toHaveBeenCalled());
    expect(onSceneReady).toHaveBeenCalledTimes(1);
    expect(state.loadAssetCalls).toContain('/models/tusk3d/tusk.glb');
    // canvas carries the accessible label
    expect(queryByTestId('well-x-canvas')?.getAttribute('aria-label')).toBe('tusk model');
  });

  it('AE2 — dispose policy tears the engine down when scrolled off-screen', async () => {
    mockMode.mockReturnValue('live');
    mockInView = true;
    const { rerender } = render(<LiveWell {...baseProps} offscreenPolicy="dispose" />);
    await waitFor(() => expect(state.engineCtor).toHaveBeenCalled());
    mockInView = false;
    rerender(<LiveWell {...baseProps} offscreenPolicy="dispose" />);
    await waitFor(() => expect(state.engineDispose).toHaveBeenCalled());
  });

  it('AE2 — pause policy stops the render loop but does NOT dispose the engine off-screen', async () => {
    mockMode.mockReturnValue('live');
    mockInView = true;
    const { rerender } = render(<LiveWell {...baseProps} offscreenPolicy="pause" />);
    await waitFor(() => expect(state.engineCtor).toHaveBeenCalled());
    state.engineDispose.mockClear();
    mockInView = false;
    rerender(<LiveWell {...baseProps} offscreenPolicy="pause" />);
    await waitFor(() => expect(state.engineStopLoop).toHaveBeenCalled());
    expect(state.engineDispose).not.toHaveBeenCalled();
  });

  it('StrictMode: no leaked engine — every constructed engine is disposed on unmount', async () => {
    mockMode.mockReturnValue('live');
    mockInView = true;
    const { unmount } = render(
      <StrictMode>
        <LiveWell {...baseProps} />
      </StrictMode>,
    );
    await waitFor(() => expect(state.engineCtor).toHaveBeenCalled());
    unmount();
    // Balanced: as many disposes as constructions — nothing left holding a context.
    expect(state.engineDispose.mock.calls.length).toBe(state.engineCtor.mock.calls.length);
  });
});
