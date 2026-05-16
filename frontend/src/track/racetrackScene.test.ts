import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 3 U6 — racetrackScene wiring tests. Babylon + Havok both require a
// real WebGL context, which jsdom doesn't provide. So we mock every Babylon
// surface the scene touches and assert the wiring shape (engine built,
// physics enabled, car loaded, observers wired, dispose tears down) rather
// than the visual output. Real-WebGL coverage lives in U7's E2E smoke.

// vi.mock factories are hoisted above imports, so any variable they close
// over must come from vi.hoisted() (also hoisted). We put every spy + the
// "last instance" capture state into one hoisted bag and let both the mocks
// and the test bodies share it.
const M = vi.hoisted(() => {
  class Vec3Mock {
    constructor(public x = 0, public y = 0, public z = 0) {}
    scale(n: number) {
      return new Vec3Mock(this.x * n, this.y * n, this.z * n);
    }
    copyFrom(o: { x: number; y: number; z: number }) {
      this.x = o.x;
      this.y = o.y;
      this.z = o.z;
    }
    clone() {
      return new Vec3Mock(this.x, this.y, this.z);
    }
    static Forward() {
      return new Vec3Mock(0, 0, 1);
    }
    static Up() {
      return new Vec3Mock(0, 1, 0);
    }
  }
  return {
    Vec3Mock,
    engineCtor: vi.fn(),
    sceneCtor: vi.fn(),
    havokFactory: vi.fn(),
    havokPluginCtor: vi.fn(),
    physicsAggregateCtor: vi.fn(),
    meshBuilderCreateGround: vi.fn(),
    meshBuilderCreateBox: vi.fn(),
    arcRotateCameraCtor: vi.fn(),
    hemisphericLightCtor: vi.fn(),
    standardMaterialCtor: vi.fn(),
    color3Ctor: vi.fn(),
    loadAssetContainer: vi.fn(),
    state: {
      lastEngine: null as null | {
        runRenderLoop: ReturnType<typeof vi.fn>;
        resize: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
      },
      lastScene: null as null | {
        clearColor: { set: ReturnType<typeof vi.fn> };
        enablePhysics: ReturnType<typeof vi.fn>;
        onBeforeRenderObservable: { add: ReturnType<typeof vi.fn> };
        onKeyboardObservable: { add: ReturnType<typeof vi.fn> };
        render: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
      },
      lastCarContainer: null as null | {
        meshes: Array<{
          position: InstanceType<typeof Vec3Mock>;
          absolutePosition: InstanceType<typeof Vec3Mock>;
          rotate: ReturnType<typeof vi.fn>;
          getDirection: ReturnType<typeof vi.fn>;
        }>;
        addAllToScene: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
      },
    },
  };
});

vi.mock('@babylonjs/loaders/glTF/index.js', () => ({}));

vi.mock('@babylonjs/havok', () => ({
  default: (...args: unknown[]) => {
    M.havokFactory(...args);
    return Promise.resolve({ fake: 'havok-runtime' });
  },
}));

vi.mock('@babylonjs/core/Physics/v2/Plugins/havokPlugin', () => ({
  HavokPlugin: class {
    constructor(...args: unknown[]) {
      M.havokPluginCtor(...args);
    }
  },
}));

vi.mock('@babylonjs/core', () => {
  class Engine {
    runRenderLoop = vi.fn();
    resize = vi.fn();
    dispose = vi.fn();
    constructor(...args: unknown[]) {
      M.engineCtor(...args);
      M.state.lastEngine = this;
    }
  }
  class Scene {
    clearColor = { set: vi.fn() };
    enablePhysics = vi.fn();
    onBeforeRenderObservable = { add: vi.fn() };
    onKeyboardObservable = { add: vi.fn() };
    render = vi.fn();
    dispose = vi.fn();
    constructor(...args: unknown[]) {
      M.sceneCtor(...args);
      M.state.lastScene = this;
    }
  }
  class ArcRotateCamera {
    target: InstanceType<typeof M.Vec3Mock>;
    constructor(...args: unknown[]) {
      M.arcRotateCameraCtor(...args);
      // 5th positional arg is the initial target — capture it so the
      // chase-cam test can assert that the camera follows the car.
      this.target =
        (args[4] as InstanceType<typeof M.Vec3Mock> | undefined) ??
        new M.Vec3Mock();
    }
  }
  class HemisphericLight {
    constructor(...args: unknown[]) {
      M.hemisphericLightCtor(...args);
    }
  }
  class StandardMaterial {
    diffuseColor: unknown;
    constructor(...args: unknown[]) {
      M.standardMaterialCtor(...args);
    }
  }
  class Color3 {
    constructor(public r = 0, public g = 0, public b = 0) {
      M.color3Ctor(r, g, b);
    }
  }
  const MeshBuilder = {
    CreateGround: (...args: unknown[]) => {
      M.meshBuilderCreateGround(...args);
      return { material: null };
    },
    CreateBox: (...args: unknown[]) => {
      M.meshBuilderCreateBox(...args);
      return { material: null, position: new M.Vec3Mock() };
    },
  };
  class PhysicsAggregate {
    body = { applyImpulse: vi.fn() };
    constructor(...args: unknown[]) {
      M.physicsAggregateCtor(...args);
    }
  }
  const PhysicsShapeType = { BOX: 'BOX' as const };
  const KeyboardEventTypes = { KEYDOWN: 1 as const, KEYUP: 2 as const };
  const LoadAssetContainerAsync = (...args: unknown[]) => {
    M.loadAssetContainer(...args);
    const meshes = [
      {
        position: new M.Vec3Mock(),
        absolutePosition: new M.Vec3Mock(),
        rotate: vi.fn(),
        getDirection: vi.fn(() => new M.Vec3Mock(0, 0, 1)),
      },
    ];
    const container = {
      meshes,
      addAllToScene: vi.fn(),
      dispose: vi.fn(),
    };
    M.state.lastCarContainer = container;
    return Promise.resolve(container);
  };
  return {
    Engine,
    Scene,
    ArcRotateCamera,
    HemisphericLight,
    StandardMaterial,
    Color3,
    MeshBuilder,
    PhysicsAggregate,
    PhysicsShapeType,
    KeyboardEventTypes,
    LoadAssetContainerAsync,
    Vector3: M.Vec3Mock,
  };
});

beforeEach(() => {
  M.engineCtor.mockClear();
  M.sceneCtor.mockClear();
  M.havokFactory.mockClear();
  M.havokPluginCtor.mockClear();
  M.physicsAggregateCtor.mockClear();
  M.meshBuilderCreateGround.mockClear();
  M.meshBuilderCreateBox.mockClear();
  M.arcRotateCameraCtor.mockClear();
  M.hemisphericLightCtor.mockClear();
  M.standardMaterialCtor.mockClear();
  M.color3Ctor.mockClear();
  M.loadAssetContainer.mockClear();
  M.state.lastEngine = null;
  M.state.lastScene = null;
  M.state.lastCarContainer = null;

  // jsdom 25 ships URL but tests need deterministic createObjectURL output.
  vi.stubGlobal(
    'URL',
    class {
      static createObjectURL = vi.fn(() => 'blob:mock');
      static revokeObjectURL = vi.fn();
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Import AFTER vi.mock so the SUT picks up the mocks.
import { createRacetrackScene } from './racetrackScene';

function fakeCanvas(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

function fakeGlb(): Uint8Array {
  return new Uint8Array([0x67, 0x6c, 0x54, 0x46]); // 'glTF'
}

describe('createRacetrackScene', () => {
  it('constructs an Engine with the provided canvas', async () => {
    const canvas = fakeCanvas();
    await createRacetrackScene({ canvas, carGlbBytes: fakeGlb() });
    expect(M.engineCtor).toHaveBeenCalledTimes(1);
    expect(M.engineCtor.mock.calls[0]![0]).toBe(canvas);
  });

  it('enables Havok physics with gravity vector', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    expect(M.havokFactory).toHaveBeenCalledTimes(1);
    expect(M.havokPluginCtor).toHaveBeenCalledTimes(1);
    expect(M.state.lastScene?.enablePhysics).toHaveBeenCalledTimes(1);
    const [gravity] = M.state.lastScene!.enablePhysics.mock.calls[0]!;
    expect(gravity.y).toBeCloseTo(-9.81);
  });

  it('builds ground + 4 perimeter walls as static physics aggregates', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    expect(M.meshBuilderCreateGround).toHaveBeenCalledTimes(1);
    expect(M.meshBuilderCreateBox).toHaveBeenCalledTimes(4); // 4 walls
    // 1 ground aggregate + 4 wall aggregates + 1 car aggregate = 6
    expect(M.physicsAggregateCtor).toHaveBeenCalledTimes(6);
    // The first 5 aggregates (ground + 4 walls) must all be mass:0.
    const staticOptions = M.physicsAggregateCtor.mock.calls
      .slice(0, 5)
      .map((args) => args[2]);
    for (const opts of staticOptions) {
      expect((opts as { mass: number }).mass).toBe(0);
    }
  });

  it('loads the car GLB via LoadAssetContainerAsync', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    expect(M.loadAssetContainer).toHaveBeenCalledTimes(1);
    expect(M.loadAssetContainer.mock.calls[0]![0]).toBe('blob:mock');
    expect(M.state.lastCarContainer?.addAllToScene).toHaveBeenCalled();
    // Car body should be a DYNAMIC aggregate with non-zero mass.
    const carOpts = M.physicsAggregateCtor.mock.calls[5]![2] as {
      mass: number;
    };
    expect(carOpts.mass).toBeGreaterThan(0);
  });

  it('registers keyboard + per-frame observers for input and chase camera', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    // Two onBeforeRender observers: chase-cam tracker + input dispatcher.
    expect(
      M.state.lastScene?.onBeforeRenderObservable.add,
    ).toHaveBeenCalledTimes(2);
    // One keyboard observer.
    expect(M.state.lastScene?.onKeyboardObservable.add).toHaveBeenCalledTimes(
      1,
    );
  });

  it('starts the render loop', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    expect(M.state.lastEngine?.runRenderLoop).toHaveBeenCalledTimes(1);
  });

  it('dispose() tears down scene + engine', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    handles.dispose();
    expect(M.state.lastCarContainer?.dispose).toHaveBeenCalled();
    expect(M.state.lastScene?.dispose).toHaveBeenCalled();
    expect(M.state.lastEngine?.dispose).toHaveBeenCalled();
  });
});
