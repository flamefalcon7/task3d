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
    meshBuilderExtrudeShape: vi.fn(),
    meshBuilderCreatePlane: vi.fn(),
    arcRotateCameraCtor: vi.fn(),
    hemisphericLightCtor: vi.fn(),
    standardMaterialCtor: vi.fn(),
    color3Ctor: vi.fn(),
    loadAssetContainer: vi.fn(),
    transformNodeCtor: vi.fn(),
    defaultRenderingPipelineCtor: vi.fn(),
    defaultRenderingPipelineDispose: vi.fn(),
    skyMaterialCtor: vi.fn(),
    state: {
      lastEngine: null as null | {
        runRenderLoop: ReturnType<typeof vi.fn>;
        resize: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
        getDeltaTime: ReturnType<typeof vi.fn>;
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
          getTotalVertices: ReturnType<typeof vi.fn>;
          parent: unknown;
        }>;
        addAllToScene: ReturnType<typeof vi.fn>;
        dispose: ReturnType<typeof vi.fn>;
      },
      lastTransformNode: null as null | {
        name: string;
        position: InstanceType<typeof Vec3Mock>;
        absolutePosition: InstanceType<typeof Vec3Mock>;
        getDirection: ReturnType<typeof vi.fn>;
      },
      lastCarBody: null as null | {
        applyImpulse: ReturnType<typeof vi.fn>;
        setLinearDamping: ReturnType<typeof vi.fn>;
        setAngularDamping: ReturnType<typeof vi.fn>;
        getAngularVelocity: ReturnType<typeof vi.fn>;
        setAngularVelocity: ReturnType<typeof vi.fn>;
        setLinearVelocity: ReturnType<typeof vi.fn>;
        getLinearVelocity: ReturnType<typeof vi.fn>;
      },
    },
  };
});

vi.mock('@babylonjs/loaders/glTF/index.js', () => ({}));

// Plan-006 U3 — SkyMaterial is loaded from @babylonjs/materials, which
// internally extends @babylonjs/core base classes that the core mock
// above replaces with no-op stubs. Importing the real SkyMaterial under
// a stubbed core throws at module-eval time, so we mock the subpath here.
// The SUT just assigns Preetham tunables to the instance — a plain
// settable-properties class satisfies the wiring contract.
vi.mock('@babylonjs/materials/sky/skyMaterial', () => ({
  SkyMaterial: class {
    backFaceCulling = true;
    turbidity = 0;
    luminance = 0;
    inclination = 0;
    azimuth = 0;
    rayleigh = 0;
    constructor(...args: unknown[]) {
      M.skyMaterialCtor(...args);
    }
  },
}));

// Plan-005 U3 — mock skidMarks so wiring tests can spy on the lifecycle.
const skidMarksSpy = vi.hoisted(() => ({
  ctor: vi.fn(),
  tick: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./skidMarks', () => ({
  createSkidMarks: (scene: unknown, threshold: number, options: unknown) => {
    skidMarksSpy.ctor(scene, threshold, options);
    return {
      tick: skidMarksSpy.tick,
      reset: skidMarksSpy.reset,
      dispose: skidMarksSpy.dispose,
    };
  },
}));

// Plan-006 U7 — mock tireSmoke (same shape as skidMarks). The wiring tests
// assert it gets the same lateral-speed threshold and runs on each frame.
const tireSmokeSpy = vi.hoisted(() => ({
  ctor: vi.fn(),
  tick: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./tireSmoke', () => ({
  createTireSmoke: (scene: unknown, threshold: number) => {
    tireSmokeSpy.ctor(scene, threshold);
    return {
      tick: tireSmokeSpy.tick,
      dispose: tireSmokeSpy.dispose,
    };
  },
}));

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
    // Default 16.67ms frame delta (60fps). Tests can override via
    // M.state.lastEngine.getDeltaTime.mockReturnValue(...) to drive the
    // brake-to-reverse frame-delta accumulator.
    getDeltaTime = vi.fn(() => 16.67);
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
    alpha: number;
    beta: number;
    radius: number;
    target: InstanceType<typeof M.Vec3Mock>;
    constructor(...args: unknown[]) {
      M.arcRotateCameraCtor(...args);
      // Positional args mirror the real constructor: (name, alpha, beta,
      // radius, target, scene). Initializing alpha/beta/radius lets the
      // chase-cam observer's `camera.alpha += delta * LERP` math run
      // without NaN propagation if a test ever fires the observer.
      this.alpha = (args[1] as number | undefined) ?? 0;
      this.beta = (args[2] as number | undefined) ?? 0;
      this.radius = (args[3] as number | undefined) ?? 0;
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
  // Plan-006 U2 — DefaultRenderingPipeline mock. The SUT reads back
  // properties it just wrote (bloomThreshold etc.), so these are plain
  // mutable fields, not vi.fn() setters. imageProcessing is a nested
  // sub-object because the SUT writes to its toneMappingEnabled /
  // toneMappingType properties. Dispose is tracked via M.defaultRenderingPipelineDispose
  // so the teardown test can verify it ran before scene.dispose().
  class DefaultRenderingPipeline {
    bloomEnabled = false;
    bloomThreshold = 0;
    bloomWeight = 0;
    bloomKernel = 0;
    fxaaEnabled = false;
    imageProcessing = { toneMappingEnabled: false, toneMappingType: 0 };
    constructor(...args: unknown[]) {
      M.defaultRenderingPipelineCtor(...args);
    }
    dispose() {
      M.defaultRenderingPipelineDispose();
    }
  }
  class StandardMaterial {
    diffuseColor: unknown;
    specularColor: unknown;
    alpha = 1;
    constructor(...args: unknown[]) {
      M.standardMaterialCtor(...args);
    }
    dispose() {
      // Mock — counts via the standardMaterialCtor spy isn't needed here.
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
      return { material: null, position: new M.Vec3Mock() };
    },
    CreateBox: (...args: unknown[]) => {
      M.meshBuilderCreateBox(...args);
      return {
        material: null,
        position: new M.Vec3Mock(),
        rotation: new M.Vec3Mock(),
      };
    },
    ExtrudeShape: (name: string, _opts: unknown, _scene: unknown) => {
      M.meshBuilderExtrudeShape(name, _opts, _scene);
      return { material: null };
    },
    CreatePlane: (name: string, _opts: unknown, _scene: unknown) => {
      M.meshBuilderCreatePlane(name, _opts, _scene);
      return {
        material: null,
        position: new M.Vec3Mock(),
        rotation: new M.Vec3Mock(),
      };
    },
  };
  class PhysicsAggregate {
    body = {
      applyImpulse: vi.fn(),
      setLinearDamping: vi.fn(),
      setAngularDamping: vi.fn(),
      // Default mocked velocities: car at rest. Tests can override
      // via M.state.lastCarBody to simulate non-zero motion.
      getAngularVelocity: vi.fn(() => new M.Vec3Mock(0, 0, 0)),
      getLinearVelocity: vi.fn(() => new M.Vec3Mock(0, 0, 0)),
      setAngularVelocity: vi.fn(),
      setLinearVelocity: vi.fn(),
      // U6 Havok-v2 teleport flag toggled by reset() (see racetrackScene.ts).
      disablePreStep: true,
    };
    constructor(...args: unknown[]) {
      M.physicsAggregateCtor(...args);
      // Car aggregate is the LAST one constructed (after ground + walls).
      // Capture every aggregate's body; the last write wins so post-create
      // the captured body is the car's.
      M.state.lastCarBody = this.body;
    }
  }
  const PhysicsShapeType = { BOX: 'BOX' as const, MESH: 'MESH' as const };
  const KeyboardEventTypes = { KEYDOWN: 1 as const, KEYUP: 2 as const };
  class TransformNode {
    position = new M.Vec3Mock();
    absolutePosition = new M.Vec3Mock();
    getDirection = vi.fn(() => new M.Vec3Mock(0, 0, 1));
    constructor(public name: string, _scene: unknown) {
      M.transformNodeCtor(name, _scene);
      M.state.lastTransformNode = this;
    }
  }
  const LoadAssetContainerAsync = (...args: unknown[]) => {
    M.loadAssetContainer(...args);
    // Simulate the typical Tripo/Babylon shape: __root__ TransformNode-ish
    // mesh at index 0 with 0 vertices, real geometry at index 1. KTD-2 says
    // we must pick the vertex-bearing one.
    const geometryMesh = {
      position: new M.Vec3Mock(),
      absolutePosition: new M.Vec3Mock(),
      rotate: vi.fn(),
      getDirection: vi.fn(() => new M.Vec3Mock(0, 0, 1)),
      getTotalVertices: vi.fn(() => 1024),
      parent: null as unknown,
    };
    const meshes = [
      {
        position: new M.Vec3Mock(),
        absolutePosition: new M.Vec3Mock(),
        rotate: vi.fn(),
        getDirection: vi.fn(() => new M.Vec3Mock(0, 0, 1)),
        getTotalVertices: vi.fn(() => 0),
        parent: null as unknown,
      },
      geometryMesh,
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
    DefaultRenderingPipeline,
    HemisphericLight,
    StandardMaterial,
    Color3,
    MeshBuilder,
    PhysicsAggregate,
    PhysicsShapeType,
    KeyboardEventTypes,
    TransformNode,
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
  M.meshBuilderExtrudeShape.mockClear();
  M.meshBuilderCreatePlane.mockClear();
  M.arcRotateCameraCtor.mockClear();
  M.hemisphericLightCtor.mockClear();
  M.standardMaterialCtor.mockClear();
  M.color3Ctor.mockClear();
  M.loadAssetContainer.mockClear();
  M.transformNodeCtor.mockClear();
  M.defaultRenderingPipelineCtor.mockClear();
  M.defaultRenderingPipelineDispose.mockClear();
  M.skyMaterialCtor.mockClear();
  M.state.lastEngine = null;
  M.state.lastScene = null;
  M.state.lastCarContainer = null;
  M.state.lastTransformNode = null;
  M.state.lastCarBody = null;
  skidMarksSpy.ctor.mockClear();
  skidMarksSpy.tick.mockClear();
  skidMarksSpy.reset.mockClear();
  skidMarksSpy.dispose.mockClear();
  tireSmokeSpy.ctor.mockClear();
  tireSmokeSpy.tick.mockClear();
  tireSmokeSpy.dispose.mockClear();

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
import type { LapState } from './lapState';

function fakeCanvas(): HTMLCanvasElement {
  // Provide just enough HTMLCanvasElement surface for the scene init path.
  // - tabIndex / focus: plan-004 fix #19 (canvas focusable so WASD works)
  // - addEventListener / removeEventListener: plan-005 code-review #1
  //   (blur handler clears keys Set on focus loss)
  return {
    tabIndex: 0,
    focus: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLCanvasElement;
}

function fakeGlb(): Uint8Array {
  return new Uint8Array([0x67, 0x6c, 0x54, 0x46]); // 'glTF'
}

describe('createRacetrackScene', () => {
  it('constructs an Engine with the provided canvas', async () => {
    const canvas = fakeCanvas();
    await createRacetrackScene({ canvas, carGlbBytes: fakeGlb(), skipIntro: true });
    expect(M.engineCtor).toHaveBeenCalledTimes(1);
    expect(M.engineCtor.mock.calls[0]![0]).toBe(canvas);
  });

  it('enables Havok physics with gravity vector', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    expect(M.havokFactory).toHaveBeenCalledTimes(1);
    expect(M.havokPluginCtor).toHaveBeenCalledTimes(1);
    expect(M.state.lastScene?.enablePhysics).toHaveBeenCalledTimes(1);
    const [gravity] = M.state.lastScene!.enablePhysics.mock.calls[0]!;
    expect(gravity.y).toBeCloseTo(-9.81);
  });

  it('U2 — builds safety ground + road ribbon + 48 barrier boxes as static aggregates', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Safety ground (R-r4b fallback floor) — 1 CreateGround call.
    expect(M.meshBuilderCreateGround).toHaveBeenCalledTimes(1);
    // 24 outer + 24 inner barrier boxes following the curve tangent,
    // plus 1 skybox (plan-006 U3 SkyMaterial host) = 49 total CreateBox calls.
    expect(M.meshBuilderCreateBox).toHaveBeenCalledTimes(49);
    // Road ribbon extruded once along the closed sample path,
    // plus 1 center stripe ribbon (plan-006 U6) = 2 ExtrudeShape calls.
    expect(M.meshBuilderExtrudeShape).toHaveBeenCalledTimes(2);
    const extrudeNames = M.meshBuilderExtrudeShape.mock.calls.map((c) => c[0]);
    expect(extrudeNames).toContain('road-ribbon');
    expect(extrudeNames).toContain('center-stripe');
    // Total aggregates: 1 safety ground + 1 ribbon + 48 barriers + 1 car = 51.
    expect(M.physicsAggregateCtor).toHaveBeenCalledTimes(51);
    // First 50 (everything except the car) must all be mass:0 static.
    const staticOptions = M.physicsAggregateCtor.mock.calls
      .slice(0, 50)
      .map((args) => args[2]);
    for (const opts of staticOptions) {
      expect((opts as { mass: number }).mass).toBe(0);
    }
  });

  it('U2 — road ribbon uses a MESH-shape collider (not BOX)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Ribbon is the 2nd aggregate (index 1): safety ground at 0, ribbon at 1.
    const ribbonAggregateArgs = M.physicsAggregateCtor.mock.calls[1]!;
    expect(ribbonAggregateArgs[1]).toBe('MESH');
  });

  it('U2 — start/finish + checkpoint planes exist with no physics aggregate', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Plan-006 U6 replaced the single white start-finish plane with a 4×2
    // checker grid (8 cells), so plane creates are now 8 checker + 1
    // checkpoint = 9. None of them are physics-aggregated.
    expect(M.meshBuilderCreatePlane).toHaveBeenCalledTimes(9);
    const planeNames = M.meshBuilderCreatePlane.mock.calls.map((c) => c[0]);
    expect(planeNames).toContain('checkpoint');
    const checkerNames = planeNames.filter((n) =>
      typeof n === 'string' && n.startsWith('start-checker-'),
    );
    expect(checkerNames).toHaveLength(8);
  });

  it('U2 — car spawns on the start/finish line (samples[0]), lifted to Y=1', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // With the default TRACK config (35×50, r=10), samples[0] sits on the
    // east straight at x≈17.5. The pivot must be raised to Y=1 so the
    // box collider doesn't clip the road surface on the first frame.
    expect(M.state.lastTransformNode?.position.y).toBe(1);
    expect(Math.abs(M.state.lastTransformNode!.position.x)).toBeGreaterThan(1);
  });

  it('loads the car GLB via LoadAssetContainerAsync', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    expect(M.loadAssetContainer).toHaveBeenCalledTimes(1);
    expect(M.loadAssetContainer.mock.calls[0]![0]).toBe('blob:mock');
    expect(M.state.lastCarContainer?.addAllToScene).toHaveBeenCalled();
    // Car body should be a DYNAMIC aggregate with non-zero mass. It's the
    // LAST aggregate constructed (after safety ground + ribbon + 48 barriers).
    const calls = M.physicsAggregateCtor.mock.calls;
    const carOpts = calls[calls.length - 1]![2] as { mass: number };
    expect(carOpts.mass).toBeGreaterThan(0);
  });

  it('registers keyboard + per-frame observers for input and chase camera', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Three onBeforeRender observers: [0] chase-cam follow, [1] keyboard
    // input + throttle dispatch, [2] lap-state tick + trigger checks.
    expect(
      M.state.lastScene?.onBeforeRenderObservable.add,
    ).toHaveBeenCalledTimes(3);
    // One keyboard observer.
    expect(M.state.lastScene?.onKeyboardObservable.add).toHaveBeenCalledTimes(
      1,
    );
  });

  it('starts the render loop', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    expect(M.state.lastEngine?.runRenderLoop).toHaveBeenCalledTimes(1);
  });

  it('dispose() tears down scene + engine', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    handles.dispose();
    expect(M.state.lastCarContainer?.dispose).toHaveBeenCalled();
    expect(M.state.lastScene?.dispose).toHaveBeenCalled();
    expect(M.state.lastEngine?.dispose).toHaveBeenCalled();
  });

  // ─── U1: car physics fix (KTD-1, KTD-2) ───

  it('U1/KTD-2 — picks the vertex-bearing mesh for physics, not __root__', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Mock GLB has meshes[0] (0 verts, root-like) + meshes[1] (1024 verts,
    // geometry). The geometry mesh — not the root — must be parented to
    // the pivot so the box collider wraps the geometry's bounds.
    const rootMesh = M.state.lastCarContainer!.meshes[0]!;
    const geometryMesh = M.state.lastCarContainer!.meshes[1]!;
    expect(rootMesh.parent).toBeNull();
    expect(geometryMesh.parent).toBe(M.state.lastTransformNode);
  });

  it('U1/KTD-2 — physics aggregate binds to the car pivot (TransformNode), not a mesh', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Car aggregate is the LAST one constructed (after safety ground +
    // road ribbon + 48 barriers). Its first arg must be the pivot.
    expect(M.transformNodeCtor).toHaveBeenCalledWith('car-pivot', expect.anything());
    const calls = M.physicsAggregateCtor.mock.calls;
    const carAggregateArgs = calls[calls.length - 1]!;
    expect(carAggregateArgs[0]).toBe(M.state.lastTransformNode);
  });

  it('U1/KTD-1 — sets linear + angular damping so the car coasts to a stop', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    expect(M.state.lastCarBody?.setLinearDamping).toHaveBeenCalledTimes(1);
    expect(M.state.lastCarBody?.setAngularDamping).toHaveBeenCalledTimes(1);
    // Damping factor must be > 0 (otherwise car slides/spins forever).
    expect(M.state.lastCarBody!.setLinearDamping.mock.calls[0]![0]).toBeGreaterThan(0);
    expect(M.state.lastCarBody!.setAngularDamping.mock.calls[0]![0]).toBeGreaterThan(0);
  });

  it('U1 — W keypress applies a forward impulse', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    // Three render observers in registration order: [0] chase-cam follow,
    // [1] keyboard-driven input (the one we want here), [2] U3 lap-state
    // tick + trigger checks. If a 4th observer is added later, update this
    // count assertion AND the ordinal accesses across U1/U3 tests.
    expect(renderCallbacks).toHaveLength(3);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: 'w' }, type: 1 /* KEYDOWN */ });
    inputTick();

    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);
  });

  it('U1/KTD-1 — A keypress drives angular velocity Y (and never calls mesh.rotate)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: 'a' }, type: 1 /* KEYDOWN */ });
    inputTick();

    expect(M.state.lastCarBody?.setAngularVelocity).toHaveBeenCalledTimes(1);
    // A = counter-clockwise around Y (negative).
    const angVelArg = M.state.lastCarBody!.setAngularVelocity.mock.calls[0]![0] as {
      x: number;
      y: number;
      z: number;
    };
    expect(angVelArg.y).toBeLessThan(0);
    expect(angVelArg.x).toBe(0);
    expect(angVelArg.z).toBe(0);
    // KTD-1 regression guard: mesh.rotate must NEVER be invoked. mesh.rotate
    // was the U6 root cause — it mutated the mesh transform while Havok kept
    // its own angular velocity, so they diverged into runaway spin.
    for (const mesh of M.state.lastCarContainer!.meshes) {
      expect(mesh.rotate).not.toHaveBeenCalled();
    }
  });

  it('U1/KTD-1 — D keypress drives angular velocity Y in the opposite direction', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: 'd' }, type: 1 /* KEYDOWN */ });
    inputTick();

    const angVelArg = M.state.lastCarBody!.setAngularVelocity.mock.calls[0]![0] as {
      y: number;
    };
    // D = clockwise around Y (positive).
    expect(angVelArg.y).toBeGreaterThan(0);
  });

  it('U1 — W+A held simultaneously fires both impulse and angular velocity', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: 'w' }, type: 1 });
    keyboardObserver({ event: { key: 'a' }, type: 1 });
    inputTick();

    // Forward-left motion: forward impulse + CCW yaw, same tick.
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);
    expect(M.state.lastCarBody?.setAngularVelocity).toHaveBeenCalledTimes(1);
  });

  // ─── Plan-005 U1: brake state machine ───

  it('Plan-005 U1/AE1 — S held at forward speed applies brake (no reverse impulse interleaved)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Simulate the car moving forward at 12 u/s (in the +Z direction; the
    // mock forward vector from getDirection() is (0, 0, 1)).
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: 's' }, type: 1 /* KEYDOWN */ });
    inputTick();
    inputTick();
    inputTick();

    // 3 ticks of brake force, no reverse impulse (still moving forward).
    // Brake impulse is along -forward (negative Z), so impulse.z < 0 each call.
    const applyImpulseCalls = M.state.lastCarBody!.applyImpulse.mock.calls;
    expect(applyImpulseCalls.length).toBe(3);
    for (const call of applyImpulseCalls) {
      const impulse = call[0] as { z: number };
      expect(impulse.z).toBeLessThan(0); // opposing the +Z forward motion
    }
  });

  it('Plan-005 U1/AE2 — S tap at high forward speed does NOT enter reverse mode', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 15));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick();
    keyboardObserver({ event: { key: 's' }, type: 2 /* KEYUP */ });
    // Even if we keep ticking, reverse mode must NOT have engaged — the brake
    // timer never armed because forward speed was always above the threshold.
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    M.state.lastCarBody!.applyImpulse.mockClear();
    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick(); // arms the brake timer (speed is 0 now)
    // No reverse impulse should fire on this tick — timer just armed.
    expect(M.state.lastCarBody?.applyImpulse).not.toHaveBeenCalled();
  });

  it('Plan-005 U1 — S held at zero speed for > 200ms switches to reverse impulse (frame-delta accumulator)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // Code-review #2: brake-to-reverse uses engine.getDeltaTime() frame-delta
    // accumulator, NOT performance.now() wall-clock. Drive the accumulator
    // by setting the per-frame delta directly; hidden-tab time naturally
    // contributes nothing because the engine returns 0 during throttled RAF.
    M.state.lastEngine!.getDeltaTime.mockReturnValue(50); // 50ms per frame
    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick(); // brakeHeldMs = 50
    inputTick(); // brakeHeldMs = 100
    inputTick(); // brakeHeldMs = 150
    inputTick(); // brakeHeldMs = 200 (not strictly > 200, no flip yet)
    expect(M.state.lastCarBody?.applyImpulse).not.toHaveBeenCalled();

    inputTick(); // brakeHeldMs = 250 > 200 → flip + apply reverse impulse
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);
    // Reverse impulse = forward.scale(-REVERSE_IMPULSE). Mock forward is
    // (0, 0, 1), so reverse impulse is (0, 0, -32) — opposite to facing.
    const impulse = M.state.lastCarBody!.applyImpulse.mock.calls[0]![0] as { z: number };
    expect(impulse.z).toBeLessThan(0);
  });

  it('Plan-005 U1 — frame-delta brake timer does NOT elapse during simulated tab-hide (hidden RAF returns 0)', async () => {
    // Code-review #2 regression guard: with the old wall-clock implementation,
    // a 500ms tab-hide while S was held would flip reverseMode on the first
    // post-return tick. With frame-delta accumulation, hidden frames return
    // 0 from engine.getDeltaTime() and the accumulator does not advance.
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    M.state.lastEngine!.getDeltaTime.mockReturnValue(0); // simulated hidden RAF
    keyboardObserver({ event: { key: 's' }, type: 1 });
    for (let i = 0; i < 100; i++) inputTick(); // many "hidden" frames
    expect(M.state.lastCarBody?.applyImpulse).not.toHaveBeenCalled();
    // Only AFTER frames start delivering real deltas does the accumulator move.
  });

  it('Plan-005 U1 — releasing S exits reverse mode immediately', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    M.state.lastEngine!.getDeltaTime.mockReturnValue(250); // one large frame
    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick(); // brakeHeldMs = 250 > 200 → reverseMode true, fires reverse
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);

    // Release S
    keyboardObserver({ event: { key: 's' }, type: 2 /* KEYUP */ });
    M.state.lastCarBody!.applyImpulse.mockClear();
    inputTick();
    expect(M.state.lastCarBody?.applyImpulse).not.toHaveBeenCalled();
  });

  it('Plan-005 U1 — pressing W while in reverse mode cancels reverse', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // Get into reverseMode with one large frame, then switch to realistic
    // frame delta so W's accumulator-reset survives at least 12 ticks (the
    // ~200ms needed for S to re-accumulate past the threshold). With a
    // sustained large frame delta, W and S would toggle every tick; that's
    // a pathological case, not the realistic per-frame behavior.
    M.state.lastEngine!.getDeltaTime.mockReturnValue(250);
    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick(); // brakeHeldMs = 250 > 200 → reverseMode true

    M.state.lastEngine!.getDeltaTime.mockReturnValue(16.67); // realistic 60fps
    keyboardObserver({ event: { key: 'w' }, type: 1 });
    M.state.lastCarBody!.applyImpulse.mockClear();
    inputTick();
    // Only ONE impulse should fire: the forward throttle. W reset
    // brakeHeldMs to 0; S adds 16.67ms (well below 200ms), reverseMode
    // stays false, reverse impulse does NOT fire.
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);
    const impulse = M.state.lastCarBody!.applyImpulse.mock.calls[0]![0] as { z: number };
    expect(impulse.z).toBeGreaterThan(0); // forward direction
  });

  it('Plan-005 code-review #1 — canvas blur clears the keys Set (no ghost-key state)', async () => {
    // Regression guard for the alt-tab-leaves-handbrake-stuck demo-day hazard.
    // If the blur handler is ever removed, holding Space and alt-tabbing would
    // leave 'space' permanently in the keys Set — handbrake fires on every
    // tick after return regardless of physical key state.
    const blurHandlers: Array<(e: unknown) => void> = [];
    const canvas = {
      tabIndex: 0,
      focus: () => undefined,
      addEventListener: (event: string, handler: (e: unknown) => void) => {
        if (event === 'blur') blurHandlers.push(handler);
      },
      removeEventListener: () => undefined,
    } as unknown as HTMLCanvasElement;
    await createRacetrackScene({ canvas, carGlbBytes: fakeGlb(), skipIntro: true });
    expect(blurHandlers).toHaveLength(1);

    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;
    keyboardObserver({ event: { key: ' ' }, type: 1 /* KEYDOWN */ });
    // After blur fires, the keys Set is cleared. Subsequent ticks see no
    // 'space' even though the physical KEYUP never arrived.
    blurHandlers[0]!(new Event('blur'));

    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    keyboardObserver({ event: { key: 'd' }, type: 1 });
    M.state.lastCarBody!.setAngularVelocity.mockClear();
    inputTick();
    // D alone (post-blur) should produce the un-boosted steering rate.
    // 1.4 * speedFactor(12/6=1) * 1 (no handbrake) = 1.4.
    const angVelArg = M.state.lastCarBody!.setAngularVelocity.mock
      .calls[0]![0] as { y: number };
    expect(angVelArg.y).toBeCloseTo(1.4, 1);
  });

  // ─── Plan-005 U2: handbrake mode ───

  it('Plan-005 U2 — space-key normalization (KeyboardEvent.key is \' \' not \'space\')', async () => {
    // Regression guard: KeyboardEvent.key for the space bar is the literal
    // ' ' character. Without the `if (k === ' ') k = 'space'` shim, the
    // per-frame observer's keys.has('space') check never matches and the
    // handbrake feature silently fails. If this test starts failing, check
    // the keyboard observer for that normalization line.
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Set speed so handbrake will engage on the per-frame tick.
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // Dispatch literal-space key — what real browsers send for the space bar.
    // Capture baseline D-only y magnitude first (D without Space).
    keyboardObserver({ event: { key: 'd' }, type: 1 });
    inputTick();
    const baselineY = (
      M.state.lastCarBody!.setAngularVelocity.mock.calls[0]![0] as { y: number }
    ).y;

    // Now add the literal ' ' (which the shim normalizes to 'space').
    M.state.lastCarBody!.setAngularVelocity.mockClear();
    keyboardObserver({ event: { key: ' ' }, type: 1 /* KEYDOWN */ });
    inputTick();
    const shimmedY = (
      M.state.lastCarBody!.setAngularVelocity.mock.calls[0]![0] as { y: number }
    ).y;

    // If the shim works, ' ' → 'space' → handbrake active → 1.5× boost.
    // Without the shim, 'space' never matches, no boost, ratio = 1.
    // Asserting the RATIO (not the absolute value) decouples the test from
    // STEER_ANGULAR_VELOCITY which is an explicit feel knob (code-review #9).
    expect(shimmedY / baselineY).toBeCloseTo(1.5, 2);
  });

  it('Plan-005 U2/AE3 — Space + D at speed boosts steering by 1.5×', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // First: D alone, capture baseline y angular velocity.
    keyboardObserver({ event: { key: 'd' }, type: 1 });
    inputTick();
    const baselineY = (
      M.state.lastCarBody!.setAngularVelocity.mock.calls[0]![0] as { y: number }
    ).y;

    // Now add Space.
    M.state.lastCarBody!.setAngularVelocity.mockClear();
    keyboardObserver({ event: { key: ' ' }, type: 1 });
    inputTick();
    const handbrakeY = (
      M.state.lastCarBody!.setAngularVelocity.mock.calls[0]![0] as { y: number }
    ).y;

    // The boost factor is exactly HANDBRAKE_STEER_MULTIPLIER (1.5).
    expect(handbrakeY / baselineY).toBeCloseTo(1.5, 2);
  });

  it('Plan-005 U2/AE4 — Space at zero speed does NOT engage handbrake (no boost)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: ' ' }, type: 1 });
    keyboardObserver({ event: { key: 'd' }, type: 1 });
    inputTick();

    // Gate off — y magnitude is the unboosted STEER_MIN_FACTOR rate.
    // STEER_ANGULAR_VELOCITY=1.4, speedFactor=STEER_MIN_FACTOR=0.3, boost=1
    // y = 1 * 1.4 * 0.3 * 1 = 0.42. NOT 0.42 * 1.5 = 0.63.
    const angVelArg = M.state.lastCarBody!.setAngularVelocity.mock
      .calls[0]![0] as { y: number };
    expect(angVelArg.y).toBeCloseTo(0.42, 2);
  });

  it('Plan-005 U2/R7 — throttle still applies while handbrake is held (exactly one impulse, forward direction)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Mock velocity (0,0,12): forwardSpeed=12, lateralSpeed=0 (rightX=1
    // gives velocity.x*rightX = 0*1 = 0). Lateral-grip branch gates on
    // |lateralSpeed| > 0.01, so it stays inactive. Only the throttle
    // applyImpulse fires — exactly one call, deterministic.
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: ' ' }, type: 1 });
    keyboardObserver({ event: { key: 'w' }, type: 1 });
    inputTick();

    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);
    const impulse = M.state.lastCarBody!.applyImpulse.mock.calls[0]![0] as { z: number };
    expect(impulse.z).toBeGreaterThan(0); // forward direction
  });

  it('Plan-005 U2/AE3 — handbrake reduces lateral grip impulse magnitude by HANDBRAKE_GRIP_MULTIPLIER', async () => {
    // Code-review #12: this scenario was in plan-005's U2 test list but
    // never implemented. It guards the behavioral CORE of handbrake mode
    // (the slide physics) — a regression that used the multiplier
    // additively instead of multiplicatively would not be caught without it.
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    // Set velocity (5, 0, 12): forwardSpeed=12 (above HANDBRAKE_MIN_SPEED),
    // lateralSpeed = velocity.x * rightX + velocity.z * rightZ = 5*1 + 12*0 = 5.
    // Lateral-grip branch fires.
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(5, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // Capture baseline: no Space → full lateral grip impulse fires.
    inputTick();
    const baseline = M.state.lastCarBody!.applyImpulse.mock.calls.map(
      (c) => c[0] as { x: number },
    );
    // Lateral-grip impulse opposes the lateral velocity; with rightX=1 and
    // lateralSpeed=5, impulse.x = -rightX * lateralSpeed * grip * mass < 0.
    const baselineGripImpulse = baseline.find((i) => i.x < 0);
    expect(baselineGripImpulse).toBeDefined();
    const baselineMag = Math.abs(baselineGripImpulse!.x);

    // Now Space held — grip multiplier kicks in.
    keyboardObserver({ event: { key: ' ' }, type: 1 });
    M.state.lastCarBody!.applyImpulse.mockClear();
    inputTick();
    const handbrake = M.state.lastCarBody!.applyImpulse.mock.calls.map(
      (c) => c[0] as { x: number },
    );
    const handbrakeGripImpulse = handbrake.find((i) => i.x < 0);
    expect(handbrakeGripImpulse).toBeDefined();
    const handbrakeMag = Math.abs(handbrakeGripImpulse!.x);

    // Ratio is HANDBRAKE_GRIP_MULTIPLIER (0.13). Multiplicative-vs-additive
    // regression would either not fire (additive→same magnitude, ratio=1) or
    // wildly miss (e.g., subtract instead of multiply).
    expect(handbrakeMag / baselineMag).toBeCloseTo(0.13, 2);
  });

  // ─── U3: lap state machine + trigger wiring ───

  it('U3 — exposes a reset() method on the scene handles', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    expect(typeof handles.reset).toBe('function');
  });

  it('U3 — does not fire onLapStateChange before any input (state still waiting)', async () => {
    const onLapStateChange = vi.fn();
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
    skipIntro: true,
    });
    // No render tick yet (engine.runRenderLoop callback isn't invoked in
    // the mock), no keyboard input. Initial state never emits — emit is
    // transition-driven.
    expect(onLapStateChange).not.toHaveBeenCalled();
  });

  it('U3 — first W keypress transitions to running and fires onLapStateChange', async () => {
    const onLapStateChange = vi.fn();
    // Plan-006 U8 — skip the cinematic intro for this race-input test.
    // Intro gating is covered by separate plan-006 U8 tests below.
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
      skipIntro: true,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: 'w' }, type: 1 /* KEYDOWN */ });
    inputTick();

    // Reducer transitioned waiting → running on the throttle dispatch.
    const firstRunningCall = onLapStateChange.mock.calls.find(
      ([s]) => (s as LapState).status === 'running',
    );
    expect(firstRunningCall).toBeDefined();
    expect((firstRunningCall![0] as LapState).startedAtMs).not.toBeNull();
  });

  it('U3/AE5 — reset() zeroes linear + angular velocity and dispatches reset to onLapStateChange', async () => {
    const onLapStateChange = vi.fn();
    // skipIntro: this test exercises the racing → retry path, not the intro flow.
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
      skipIntro: true,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // Get into the running state first so reset has a transition to fire.
    keyboardObserver({ event: { key: 'w' }, type: 1 });
    inputTick();
    onLapStateChange.mockClear();
    // Isolate the reset() call's velocity-write contribution from any
    // earlier steer/forward keypresses. Without this, a future test that
    // also presses A/D before reset would inflate the expected count.
    M.state.lastCarBody!.setLinearVelocity.mockClear();
    M.state.lastCarBody!.setAngularVelocity.mockClear();

    handles.reset();

    // Velocities zeroed before the reducer dispatch — guarantees the car
    // is stationary on the next render frame after Retry.
    expect(M.state.lastCarBody?.setLinearVelocity).toHaveBeenCalledTimes(1);
    expect(M.state.lastCarBody?.setAngularVelocity).toHaveBeenCalledTimes(1);
    const linArg = M.state.lastCarBody!.setLinearVelocity.mock.calls[0]![0] as {
      x: number; y: number; z: number;
    };
    expect(linArg.x).toBe(0);
    expect(linArg.y).toBe(0);
    expect(linArg.z).toBe(0);
    // State reset back to waiting.
    const resetCall = onLapStateChange.mock.calls.find(
      ([s]) => (s as LapState).status === 'waiting',
    );
    expect(resetCall).toBeDefined();
    expect((resetCall![0] as LapState).startedAtMs).toBeNull();
  });

  // ─── Plan-005 U3: skid marks wiring ───

  it('Plan-005 U3 — instantiates skidMarks with the scene threshold', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    expect(skidMarksSpy.ctor).toHaveBeenCalledTimes(1);
    const [scene, threshold] = skidMarksSpy.ctor.mock.calls[0]!;
    expect(scene).toBeDefined();
    expect(threshold).toBe(1.5); // SKID_LATERAL_SPEED_THRESHOLD
  });

  it('Plan-005 U3 — lap-state observer ticks skidMarks each frame with car pos + forward + lateralSpeed', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    // [0] chase cam, [1] input observer, [2] lap-state + skidMarks tick.
    expect(renderCallbacks).toHaveLength(3);
    const lapTick = renderCallbacks[2] as () => void;
    skidMarksSpy.tick.mockClear();
    lapTick();
    expect(skidMarksSpy.tick).toHaveBeenCalledTimes(1);
    const [carPos, carForward, lateralSpeed] = skidMarksSpy.tick.mock.calls[0]!;
    expect(carPos).toBeDefined();
    expect(carForward).toBeDefined();
    expect(typeof lateralSpeed).toBe('number');
  });

  it('Plan-005 U3/AE6 — scene.reset() invokes skidMarks.reset() before dispatching reset action', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    skidMarksSpy.reset.mockClear();
    handles.reset();
    expect(skidMarksSpy.reset).toHaveBeenCalledTimes(1);
  });

  it('Plan-005 U3 — lap-state observer computes lateralSpeed from the lateral axis (not forward axis)', async () => {
    // Code-review #14: previous wiring test only asserted typeof === 'number'.
    // An axis swap (skidRightX ↔ skidRightZ) would produce skid marks on
    // straights and not on slides — feature silently broken with passing test.
    // This test sets velocity (5, 0, 0) and forward (0, 0, 1) so the
    // expected lateralSpeed = velocity.x*rightX + velocity.z*rightZ
    // = 5*1 + 0*0 = 5. Any axis swap yields a different value.
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(5, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const lapTick = renderCallbacks[2] as () => void;
    skidMarksSpy.tick.mockClear();
    lapTick();
    expect(skidMarksSpy.tick).toHaveBeenCalledTimes(1);
    const [, , lateralSpeed] = skidMarksSpy.tick.mock.calls[0]!;
    expect(lateralSpeed).toBeCloseTo(5, 2);
  });

  it('Plan-005 U3 — scene.dispose() invokes skidMarks.dispose()', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    skipIntro: true,
    });
    skidMarksSpy.dispose.mockClear();
    handles.dispose();
    expect(skidMarksSpy.dispose).toHaveBeenCalledTimes(1);
  });

  // ─── Plan-006 U8: intro orbit + countdown wiring ───

  it('Plan-006 U8 — mounts in `intro` state by default (no skipIntro)', async () => {
    const onLapStateChange = vi.fn();
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
    });
    // Initial state is not emitted, but the scene's reducer is intro.
    // Verify by pressing W and confirming it doesn't transition to running:
    // the input gate suppresses driving actions during intro.
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;
    keyboardObserver({ event: { key: 'w' }, type: 1 /* KEYDOWN */ });
    inputTick();
    const ranToRunning = onLapStateChange.mock.calls.find(
      ([s]) => (s as LapState).status === 'running',
    );
    expect(ranToRunning).toBeUndefined();
  });

  it('Plan-006 U8 — handles.dispatchIntroComplete transitions intro → waiting', async () => {
    const onLapStateChange = vi.fn();
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
    });
    handles.dispatchIntroComplete();
    const waitingCall = onLapStateChange.mock.calls.find(
      ([s]) => (s as LapState).status === 'waiting',
    );
    expect(waitingCall).toBeDefined();
    // Same transition flips the input gate — pressing W after intro
    // completion now starts the lap timer.
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;
    keyboardObserver({ event: { key: 'w' }, type: 1 });
    inputTick();
    const ranToRunning = onLapStateChange.mock.calls.find(
      ([s]) => (s as LapState).status === 'running',
    );
    expect(ranToRunning).toBeDefined();
  });

  it('Plan-006 U8 — handles.dispatchIntroSkip transitions intro → waiting', async () => {
    const onLapStateChange = vi.fn();
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
    });
    handles.dispatchIntroSkip();
    const waitingCall = onLapStateChange.mock.calls.find(
      ([s]) => (s as LapState).status === 'waiting',
    );
    expect(waitingCall).toBeDefined();
  });

  it('Plan-006 U8 — holding W during intro fires onIntroSkipRequested once after ~200ms', async () => {
    const onIntroSkipRequested = vi.fn();
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onIntroSkipRequested,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;
    keyboardObserver({ event: { key: 'w' }, type: 1 /* KEYDOWN */ });
    // Engine default delta is 16.67ms; 13 ticks = 216.7ms > 200ms threshold.
    for (let i = 0; i < 13; i++) inputTick();
    expect(onIntroSkipRequested).toHaveBeenCalledTimes(1);
    // Continuing to hold W does NOT re-fire the callback; it's edge-triggered
    // on threshold crossing.
    for (let i = 0; i < 10; i++) inputTick();
    expect(onIntroSkipRequested).toHaveBeenCalledTimes(1);
  });

  it('Plan-006 U8 — brief W tap during intro (< 200ms) does NOT fire onIntroSkipRequested', async () => {
    const onIntroSkipRequested = vi.fn();
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onIntroSkipRequested,
    });
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;
    keyboardObserver({ event: { key: 'w' }, type: 1 });
    for (let i = 0; i < 5; i++) inputTick(); // ~83ms held
    keyboardObserver({ event: { key: 'w' }, type: 2 /* KEYUP */ });
    inputTick();
    expect(onIntroSkipRequested).not.toHaveBeenCalled();
  });
});
