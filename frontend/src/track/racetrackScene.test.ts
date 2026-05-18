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
    const meshes = [
      {
        position: new M.Vec3Mock(),
        absolutePosition: new M.Vec3Mock(),
        rotate: vi.fn(),
        getDirection: vi.fn(() => new M.Vec3Mock(0, 0, 1)),
        getTotalVertices: vi.fn(() => 0),
        parent: null as unknown,
      },
      {
        position: new M.Vec3Mock(),
        absolutePosition: new M.Vec3Mock(),
        rotate: vi.fn(),
        getDirection: vi.fn(() => new M.Vec3Mock(0, 0, 1)),
        getTotalVertices: vi.fn(() => 1024),
        parent: null as unknown,
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
  M.state.lastEngine = null;
  M.state.lastScene = null;
  M.state.lastCarContainer = null;
  M.state.lastTransformNode = null;
  M.state.lastCarBody = null;

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
  // The scene focuses the canvas to enable keyboard input (Plan-004 fix #19).
  return {
    tabIndex: 0,
    focus: () => undefined,
  } as unknown as HTMLCanvasElement;
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

  it('U2 — builds safety ground + road ribbon + 48 barrier boxes as static aggregates', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    // Safety ground (R-r4b fallback floor) — 1 CreateGround call.
    expect(M.meshBuilderCreateGround).toHaveBeenCalledTimes(1);
    // 24 outer + 24 inner barrier boxes following the curve tangent.
    expect(M.meshBuilderCreateBox).toHaveBeenCalledTimes(48);
    // Road ribbon extruded once along the closed sample path.
    expect(M.meshBuilderExtrudeShape).toHaveBeenCalledTimes(1);
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
    });
    // Ribbon is the 2nd aggregate (index 1): safety ground at 0, ribbon at 1.
    const ribbonAggregateArgs = M.physicsAggregateCtor.mock.calls[1]!;
    expect(ribbonAggregateArgs[1]).toBe('MESH');
  });

  it('U2 — start/finish + checkpoint planes exist with no physics aggregate', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    // Exactly 2 plane creates (start/finish + checkpoint), neither aggregated.
    expect(M.meshBuilderCreatePlane).toHaveBeenCalledTimes(2);
    const planeNames = M.meshBuilderCreatePlane.mock.calls.map((c) => c[0]);
    expect(planeNames).toContain('start-finish');
    expect(planeNames).toContain('checkpoint');
  });

  it('U2 — car spawns on the start/finish line (samples[0]), lifted to Y=1', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
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

  // ─── U1: car physics fix (KTD-1, KTD-2) ───

  it('U1/KTD-2 — picks the vertex-bearing mesh for physics, not __root__', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
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

  it('Plan-005 U1 — S held at zero speed for > 200ms switches to reverse impulse', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // Mock performance.now() so we can fast-forward through the 200ms hold.
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(0);
    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick(); // arms timer at t=0
    expect(M.state.lastCarBody?.applyImpulse).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(250); // 250ms later — past the 200ms threshold
    inputTick(); // reverseMode flips true AND reverse impulse fires
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);
    // Reverse impulse = forward.scale(-REVERSE_IMPULSE). Mock forward is
    // (0, 0, 1), so reverse impulse is (0, 0, -32) — opposite to facing.
    const impulse = M.state.lastCarBody!.applyImpulse.mock.calls[0]![0] as { z: number };
    expect(impulse.z).toBeLessThan(0);
    nowSpy.mockRestore();
  });

  it('Plan-005 U1 — releasing S exits reverse mode immediately', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(0);
    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick();
    nowSpy.mockReturnValue(250);
    inputTick(); // reverseMode true; reverse impulse fires
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);

    // Release S
    keyboardObserver({ event: { key: 's' }, type: 2 /* KEYUP */ });
    M.state.lastCarBody!.applyImpulse.mockClear();
    inputTick();
    expect(M.state.lastCarBody?.applyImpulse).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('Plan-005 U1 — pressing W while in reverse mode cancels reverse', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 0));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(0);
    keyboardObserver({ event: { key: 's' }, type: 1 });
    inputTick();
    nowSpy.mockReturnValue(250);
    inputTick(); // reverseMode true

    // Press W (without releasing S)
    keyboardObserver({ event: { key: 'w' }, type: 1 });
    M.state.lastCarBody!.applyImpulse.mockClear();
    inputTick();
    // Only ONE impulse should fire: the forward throttle. NOT the reverse
    // impulse from the still-held S (because W press reset reverseMode).
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalledTimes(1);
    const impulse = M.state.lastCarBody!.applyImpulse.mock.calls[0]![0] as { z: number };
    expect(impulse.z).toBeGreaterThan(0); // forward direction
    nowSpy.mockRestore();
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
    });
    // Set speed so handbrake will engage on the per-frame tick.
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    // Dispatch literal-space key — what real browsers send for the space bar.
    keyboardObserver({ event: { key: ' ' }, type: 1 /* KEYDOWN */ });
    keyboardObserver({ event: { key: 'd' }, type: 1 });
    inputTick();

    // If the shim works, D + handbrake → setAngularVelocity y magnitude is
    // boosted by HANDBRAKE_STEER_MULTIPLIER. Without the shim, no boost.
    const angVelArg = M.state.lastCarBody!.setAngularVelocity.mock
      .calls[0]![0] as { y: number };
    // STEER_ANGULAR_VELOCITY=1.4, speedFactor=clamp(12/6)=1, handbrake=1.5
    // y = 1 * 1.4 * 1 * 1.5 = 2.1. Without shim: y = 1 * 1.4 * 1 * 1 = 1.4.
    expect(angVelArg.y).toBeCloseTo(2.1, 1);
  });

  it('Plan-005 U2/AE3 — Space + D at speed boosts steering by 1.5×', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
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

  it('Plan-005 U2/R7 — throttle still applies while handbrake is held', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 12));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    const keyboardObserver = M.state.lastScene!.onKeyboardObservable.add.mock
      .calls[0]![0] as (info: { event: { key: string }; type: number }) => void;

    keyboardObserver({ event: { key: ' ' }, type: 1 });
    keyboardObserver({ event: { key: 'w' }, type: 1 });
    inputTick();

    // Forward impulse must still fire — R7 explicitly says throttle is
    // independent of handbrake state. applyImpulse called at least once
    // (could be 2 if lateral grip also fires, but throttle is one of them).
    expect(M.state.lastCarBody?.applyImpulse).toHaveBeenCalled();
    const impulses = M.state.lastCarBody!.applyImpulse.mock.calls.map(
      (c) => c[0] as { z: number },
    );
    // At least one impulse should be in the forward (+z) direction.
    expect(impulses.some((i) => i.z > 0)).toBe(true);
  });

  // ─── U3: lap state machine + trigger wiring ───

  it('U3 — exposes a reset() method on the scene handles', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    });
    expect(typeof handles.reset).toBe('function');
  });

  it('U3 — does not fire onLapStateChange before any input (state still waiting)', async () => {
    const onLapStateChange = vi.fn();
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
    });
    // No render tick yet (engine.runRenderLoop callback isn't invoked in
    // the mock), no keyboard input. Initial state never emits — emit is
    // transition-driven.
    expect(onLapStateChange).not.toHaveBeenCalled();
  });

  it('U3 — first W keypress transitions to running and fires onLapStateChange', async () => {
    const onLapStateChange = vi.fn();
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
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
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
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
});
