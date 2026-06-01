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
    subtract(o: { x: number; y: number; z: number }) {
      return new Vec3Mock(this.x - o.x, this.y - o.y, this.z - o.z);
    }
    static Forward() {
      return new Vec3Mock(0, 0, 1);
    }
    static Up() {
      return new Vec3Mock(0, 1, 0);
    }
    static Minimize(
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
    ) {
      return new Vec3Mock(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
    }
    static Maximize(
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
    ) {
      return new Vec3Mock(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
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
    cubeTextureCreateFromPrefiltered: vi.fn(),
    directionalLightCtor: vi.fn(),
    shadowGeneratorCtor: vi.fn(),
    shadowAddCaster: vi.fn(),
    pbrMaterialCtor: vi.fn(),
    ssao2Ctor: vi.fn(),
    ssao2Dispose: vi.fn(),
    state: {
      lastEngine: null as null | {
        runRenderLoop: ReturnType<typeof vi.fn>;
        stopRenderLoop: ReturnType<typeof vi.fn>;
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
      lastCamera: null as null | {
        alpha: number;
        beta: number;
        radius: number;
        fov: number;
        target: { x: number; y: number; z: number; copyFrom: ReturnType<typeof vi.fn> };
      },
      // Plan-028 U1 — capture the render pipeline instance so exposure/contrast
      // (and bloom) assignments can be read back in assertions.
      lastRenderPipeline: null as null | {
        imageProcessing: {
          toneMappingEnabled: boolean;
          toneMappingType: number;
          exposure: number;
          contrast: number;
        };
      },
      // Plan-028 U2 — capture light + shadow + receiver instances for assertions.
      lastHemiLight: null as null | { intensity: number },
      lastShadowGenerator: null as null | {
        useBlurExponentialShadowMap: boolean;
        darkness: number;
        bias: number;
      },
      lastGround: null as null | { receiveShadows: boolean },
      lastRoadRibbon: null as null | { receiveShadows: boolean },
      // Plan-028 U3 — every PBRMaterial created, captured for albedo/bump asserts.
      pbrMaterials: [] as Array<{
        name: string;
        albedoTexture: unknown;
        bumpTexture: unknown;
        metallic: number;
        roughness: number;
      }>,
    },
  };
});

vi.mock('@babylonjs/loaders/glTF/index.js', () => ({}));

// Foliage loads 5 GLBs and creates instance meshes — none of which the scene
// tests care about. A resolved no-op keeps createRacetrackScene awaitable.
vi.mock('./foliage', () => ({
  createFoliage: vi.fn(() => Promise.resolve()),
}));

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
    stopRenderLoop = vi.fn();
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
    // Plan-028 U1 — IBL: SUT assigns scene.environmentTexture + environmentIntensity.
    environmentTexture: unknown = null;
    environmentIntensity = 0;
    // Plan-028 U5 — fog: SUT assigns fogMode (numeric literal 2 = FOGMODE_EXP2),
    // fogDensity, fogColor. Plain settable fields; no statics on the mock.
    fogMode = 0;
    fogDensity = 0;
    fogColor: unknown = null;
    constructor(...args: unknown[]) {
      M.sceneCtor(...args);
      M.state.lastScene = this;
    }
  }
  class ArcRotateCamera {
    alpha: number;
    beta: number;
    radius: number;
    // Plan-006 U5 — `fov` field exposed so the per-frame FOV pump branch
    // (`if (camera.fov !== undefined)`) is actually exercised in tests.
    // Default matches Babylon's ArcRotateCamera default of π/4 rad (~45°).
    fov: number = Math.PI / 4;
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
      M.state.lastCamera = this as unknown as typeof M.state.lastCamera;
    }
  }
  class HemisphericLight {
    // Plan-028 U2 — SUT now drops this to a fill intensity.
    intensity = 1;
    constructor(...args: unknown[]) {
      M.hemisphericLightCtor(...args);
      M.state.lastHemiLight = this;
    }
  }
  // Plan-028 U2 — directional key light. SUT sets its intensity; it is the
  // light a ShadowGenerator is built against.
  class DirectionalLight {
    intensity = 0;
    constructor(...args: unknown[]) {
      M.directionalLightCtor(...args);
    }
  }
  // Plan-028 U2 — shadow generator. addShadowCaster is a shared spy so tests can
  // assert exactly the car geometry parts (not __root__) were registered.
  class ShadowGenerator {
    useBlurExponentialShadowMap = false;
    darkness = 0;
    bias = 0;
    addShadowCaster = M.shadowAddCaster;
    constructor(...args: unknown[]) {
      M.shadowGeneratorCtor(...args);
      M.state.lastShadowGenerator = this;
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
    // Plan-028 U1 — exposure/contrast added so the SUT's read-back assignments
    // have keys to land on (was toneMapping-only).
    imageProcessing = {
      toneMappingEnabled: false,
      toneMappingType: 0,
      exposure: 0,
      contrast: 0,
    };
    constructor(...args: unknown[]) {
      M.defaultRenderingPipelineCtor(...args);
      M.state.lastRenderPipeline = this as unknown as typeof M.state.lastRenderPipeline;
    }
    dispose() {
      M.defaultRenderingPipelineDispose();
    }
  }
  // Plan-028 U4 — SSAO pipeline. Tracks construction (with the camera) and
  // disposal so the teardown test can assert it runs before scene.dispose().
  class SSAO2RenderingPipeline {
    // SUT gates construction on this static (real Babylon: true on WebGL2 with
    // depth/float-texture support). Default true so the on-path test runs.
    static IsSupported = true;
    totalStrength = 0;
    radius = 0;
    constructor(...args: unknown[]) {
      M.ssao2Ctor(...args);
    }
    dispose() {
      M.ssao2Dispose();
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
  // Plan-028 U3 — PBRMaterial for the visible track surfaces. Settable
  // albedo/bump/metallic/roughness; instances captured so tests can assert the
  // texture wiring landed.
  class PBRMaterial {
    albedoColor: unknown;
    albedoTexture: unknown = null;
    bumpTexture: unknown = null;
    metallic = 0;
    roughness = 1;
    constructor(public name: string, _scene: unknown) {
      M.pbrMaterialCtor(name, _scene);
      M.state.pbrMaterials.push(this);
    }
    dispose() {}
  }
  // Plan-006 polish — asphalt diffuse + normal map. Track-scene loads two
  // Texture instances and assigns uScale/vScale; tests only need the class
  // to exist as a constructor so the assignments don't throw.
  class Texture {
    uScale = 1;
    vScale = 1;
    constructor(public url: string, _scene: unknown) {}
  }
  // Plan-028 U1 — CubeTexture for IBL. The SUT calls the static
  // CreateFromPrefilteredData(url, scene) and assigns the result to
  // scene.environmentTexture. The spy lets tests assert the load happened and
  // (by overriding the implementation) exercise the graceful-degradation path.
  class CubeTexture {
    constructor(public url: string, _scene: unknown) {}
    static CreateFromPrefilteredData(url: string, scene: unknown) {
      M.cubeTextureCreateFromPrefiltered(url, scene);
      return new CubeTexture(url, scene);
    }
  }
  const MeshBuilder = {
    CreateGround: (...args: unknown[]) => {
      M.meshBuilderCreateGround(...args);
      // Plan-028 U2 — receiveShadows captured so the receiver assertion can read it.
      const ground = { material: null, position: new M.Vec3Mock(), receiveShadows: false };
      M.state.lastGround = ground;
      return ground;
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
      // Plan-028 U2 — road-ribbon receiveShadows captured for the receiver
      // assertion; the center-stripe shares the shape harmlessly.
      const mesh = { material: null, position: new M.Vec3Mock(), receiveShadows: false };
      if (name === 'road-ribbon') M.state.lastRoadRibbon = mesh;
      return mesh;
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
    // mesh at index 0 with 0 vertices, real geometry after it. KTD-2 says we
    // must skip the vertex-less root. Multi-mesh GLBs (segmented trucks:
    // chassis + wheels as separate meshes — D-077) carry MORE than one
    // geometry mesh, so the factory returns TWO geometry meshes to prove the
    // scene parents EVERY part, not just the first.
    // Plan-013 UAT: helper reads computeWorldMatrix + getBoundingInfo to
    // derive a uniform scale. Return a 2m-cube BB on each geometry mesh so
    // the helper computes scale = TARGET_CAR_LENGTH / 2 = 1.4 in the test.
    const makeGeometryMesh = () => ({
      position: new M.Vec3Mock(),
      absolutePosition: new M.Vec3Mock(),
      rotate: vi.fn(),
      getDirection: vi.fn(() => new M.Vec3Mock(0, 0, 1)),
      getTotalVertices: vi.fn(() => 1024),
      computeWorldMatrix: vi.fn(),
      getBoundingInfo: vi.fn(() => ({
        boundingBox: {
          minimumWorld: new M.Vec3Mock(-1, -1, -1),
          maximumWorld: new M.Vec3Mock(1, 1, 1),
        },
      })),
      parent: null as unknown,
    });
    const geometryMesh = makeGeometryMesh();
    const geometryMesh2 = makeGeometryMesh();
    const meshes = [
      {
        position: new M.Vec3Mock(),
        absolutePosition: new M.Vec3Mock(),
        rotate: vi.fn(),
        getDirection: vi.fn(() => new M.Vec3Mock(0, 0, 1)),
        getTotalVertices: vi.fn(() => 0),
        computeWorldMatrix: vi.fn(),
        getBoundingInfo: vi.fn(() => ({
          boundingBox: {
            minimumWorld: new M.Vec3Mock(),
            maximumWorld: new M.Vec3Mock(),
          },
        })),
        parent: null as unknown,
      },
      geometryMesh,
      geometryMesh2,
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
    DirectionalLight,
    HemisphericLight,
    ShadowGenerator,
    SSAO2RenderingPipeline,
    StandardMaterial,
    PBRMaterial,
    Texture,
    CubeTexture,
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
  M.cubeTextureCreateFromPrefiltered.mockClear();
  M.directionalLightCtor.mockClear();
  M.shadowGeneratorCtor.mockClear();
  M.shadowAddCaster.mockClear();
  M.pbrMaterialCtor.mockClear();
  M.ssao2Ctor.mockClear();
  M.ssao2Dispose.mockClear();
  M.state.lastEngine = null;
  M.state.lastScene = null;
  M.state.lastCarContainer = null;
  M.state.lastTransformNode = null;
  M.state.lastCarBody = null;
  M.state.lastCamera = null;
  M.state.lastRenderPipeline = null;
  M.state.lastHemiLight = null;
  M.state.lastShadowGenerator = null;
  M.state.lastGround = null;
  M.state.lastRoadRibbon = null;
  M.state.pbrMaterials = [];
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
    await createRacetrackScene({ canvas, carGlbBytes: fakeGlb(), dev_skipIntro: true });
    expect(M.engineCtor).toHaveBeenCalledTimes(1);
    expect(M.engineCtor.mock.calls[0]![0]).toBe(canvas);
  });

  it('enables Havok physics with gravity vector', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
    });
    expect(M.havokFactory).toHaveBeenCalledTimes(1);
    expect(M.havokPluginCtor).toHaveBeenCalledTimes(1);
    expect(M.state.lastScene?.enablePhysics).toHaveBeenCalledTimes(1);
    const [gravity] = M.state.lastScene!.enablePhysics.mock.calls[0]!;
    expect(gravity.y).toBeCloseTo(-9.81);
  });

  it('U2 — builds safety ground + road ribbon + 24 outer barrier boxes as static aggregates', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
    });
    // Safety ground (R-r4b fallback floor) — 1 CreateGround call.
    expect(M.meshBuilderCreateGround).toHaveBeenCalledTimes(1);
    // 24 outer barrier boxes (visually hidden — replaced by tree instances
    // in createFoliage; physics aggregate stays so the car still bounces).
    // Inner-side kerbs were dropped entirely (apex cuts roll onto infield).
    // Plus 1 skybox (plan-006 U3 SkyMaterial host) = 25 total CreateBox calls.
    expect(M.meshBuilderCreateBox).toHaveBeenCalledTimes(25);
    // Road ribbon extruded once along the closed sample path,
    // plus 1 center stripe ribbon (plan-006 U6) = 2 ExtrudeShape calls.
    expect(M.meshBuilderExtrudeShape).toHaveBeenCalledTimes(2);
    const extrudeNames = M.meshBuilderExtrudeShape.mock.calls.map((c) => c[0]);
    expect(extrudeNames).toContain('road-ribbon');
    expect(extrudeNames).toContain('center-stripe');
    // Total aggregates: 1 safety ground + 1 ribbon + 24 outer barriers + 1 car = 27.
    expect(M.physicsAggregateCtor).toHaveBeenCalledTimes(27);
    // First 26 (everything except the car) must all be mass:0 static.
    const staticOptions = M.physicsAggregateCtor.mock.calls
      .slice(0, 26)
      .map((args) => args[2]);
    for (const opts of staticOptions) {
      expect((opts as { mass: number }).mass).toBe(0);
    }
  });

  it('U2 — road ribbon uses a MESH-shape collider (not BOX)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
    });
    // Ribbon is the 2nd aggregate (index 1): safety ground at 0, ribbon at 1.
    const ribbonAggregateArgs = M.physicsAggregateCtor.mock.calls[1]!;
    expect(ribbonAggregateArgs[1]).toBe('MESH');
  });

  it('U2 — start/finish + checkpoint planes exist with no physics aggregate', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
    });
    expect(M.loadAssetContainer).toHaveBeenCalledTimes(1);
    expect(M.loadAssetContainer.mock.calls[0]![0]).toBe('blob:mock');
    expect(M.state.lastCarContainer?.addAllToScene).toHaveBeenCalled();
    // Car body should be a DYNAMIC aggregate with non-zero mass. It's the
    // LAST aggregate constructed (after safety ground + ribbon + 24 outer barriers).
    const calls = M.physicsAggregateCtor.mock.calls;
    const carOpts = calls[calls.length - 1]![2] as { mass: number };
    expect(carOpts.mass).toBeGreaterThan(0);
  });

  it('registers keyboard + per-frame observers for input and chase camera', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
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
    dev_skipIntro: true,
    });
    expect(M.state.lastEngine?.runRenderLoop).toHaveBeenCalledTimes(1);
  });

  // ─── Plan-028 U1: IBL environment + tonemap exposure ───

  it('U1 — loads the prefiltered .env and assigns scene.environmentTexture', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    expect(M.cubeTextureCreateFromPrefiltered).toHaveBeenCalledTimes(1);
    expect(M.cubeTextureCreateFromPrefiltered.mock.calls[0]![0]).toBe(
      '/textures/env/environment.env',
    );
    // The returned cube texture is assigned to environmentTexture and a
    // positive global IBL intensity is set (PBR car can pick up reflections).
    expect(M.state.lastScene?.environmentTexture).not.toBeNull();
    expect(M.state.lastScene!.environmentIntensity).toBeGreaterThan(0);
  });

  it('U1 — sets tonemap exposure + contrast on the render pipeline', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    // Both lifted above the ACES-default of 1.0 so midtones are no longer
    // crushed (exposure) and the lift keeps its punch (contrast).
    expect(M.state.lastRenderPipeline!.imageProcessing.exposure).toBeGreaterThan(0);
    expect(M.state.lastRenderPipeline!.imageProcessing.contrast).toBeGreaterThan(0);
  });

  it('U1 — degrades gracefully when the .env loader throws (scene still builds)', async () => {
    // Real Babylon fails a bad .env inside the async loader, not via throw —
    // but the try/catch guards the synchronous construct path. Force the
    // synchronous static to throw and assert the scene still finishes building
    // and the render loop still starts (no blanked canvas).
    M.cubeTextureCreateFromPrefiltered.mockImplementationOnce(() => {
      throw new Error('env fetch failed');
    });
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    expect(handles).toBeDefined();
    expect(M.state.lastEngine?.runRenderLoop).toHaveBeenCalledTimes(1);
    // environmentTexture stays null (IBL absent) but the scene is alive.
    expect(M.state.lastScene?.environmentTexture).toBeNull();
  });

  // ─── Plan-028 U2: directional light + contact shadows ───

  it('U2 — adds one DirectionalLight (the key) and drops the hemispheric to fill', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    expect(M.directionalLightCtor).toHaveBeenCalledTimes(1);
    // Hemispheric is now ambient fill: a positive intensity strictly below the
    // Babylon default of 1.0 (so the directional light dominates).
    expect(M.state.lastHemiLight!.intensity).toBeGreaterThan(0);
    expect(M.state.lastHemiLight!.intensity).toBeLessThan(1);
  });

  it('U2 — the sun light points DOWN (direction.y < 0), i.e. sun above the horizon', async () => {
    // Regression guard for the inverted-sun defect: SKY_INCLINATION must stay
    // below 0.5 so the derived DirectionalLight travels downward onto the
    // scene. An inclination > 0.5 flips the sun below the horizon and the key
    // light shines UP into the car's underside with the shadow cast the wrong
    // way — exactly what a first U6 tuning pass did (0.58) before review caught
    // it. The direction is ctor arg [1] (a Vector3 with a computed .y).
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    const direction = M.directionalLightCtor.mock.calls[0]![1] as { y: number };
    expect(direction.y).toBeLessThan(0);
  });

  it('U2 — builds one ShadowGenerator (blur-exponential) against the directional light', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    expect(M.shadowGeneratorCtor).toHaveBeenCalledTimes(1);
    // ctor args: (mapSize, light). Map size is a positive power-of-two-ish int.
    expect(M.shadowGeneratorCtor.mock.calls[0]![0]).toBeGreaterThan(0);
    expect(M.state.lastShadowGenerator!.useBlurExponentialShadowMap).toBe(true);
  });

  it('U2 — registers every car geometry part as a shadow caster (not __root__)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    // The mock GLB has 1 vertex-less root + 2 geometry meshes. Only the two
    // geometry parts are cast — matching the carParts vertex filter.
    expect(M.shadowAddCaster).toHaveBeenCalledTimes(2);
    const cast = M.shadowAddCaster.mock.calls.map((c) => c[0]);
    expect(cast).toContain(M.state.lastCarContainer!.meshes[1]);
    expect(cast).toContain(M.state.lastCarContainer!.meshes[2]);
    expect(cast).not.toContain(M.state.lastCarContainer!.meshes[0]); // __root__
  });

  it('U2 — road ribbon and safety ground receive shadows', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    expect(M.state.lastGround!.receiveShadows).toBe(true);
    expect(M.state.lastRoadRibbon!.receiveShadows).toBe(true);
  });

  it('U2 — adds no new per-frame observer (the "exactly 3" invariant holds)', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    // Lights + shadows are static; this guards against accidentally wiring a
    // per-frame observer (which would break the chase-cam / input / lap-tick
    // ordinal assumptions across the U1/U3 input tests).
    expect(
      M.state.lastScene?.onBeforeRenderObservable.add,
    ).toHaveBeenCalledTimes(3);
  });

  // ─── Plan-028 U3: PBR materials for the visible track surfaces ───

  it('U3 — asphalt + grass use PBRMaterial with albedo + bump textures', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    // Exactly the two VISIBLE surfaces convert to PBR; the invisible outer
    // barriers stay StandardMaterial (isVisible=false → PBR there is dead cost).
    expect(M.state.pbrMaterials).toHaveLength(2);
    const byName = (n: string) =>
      M.state.pbrMaterials.find((m) => m.name === n);
    for (const name of ['asphaltMat', 'grassMat']) {
      const mat = byName(name);
      expect(mat, `${name} should be a PBRMaterial`).toBeDefined();
      expect(mat!.albedoTexture).not.toBeNull();
      expect(mat!.bumpTexture).not.toBeNull();
    }
    // Behavioral contract that survives feel-tuning: asphalt has a sheen
    // (lower roughness) while grass is matte (higher roughness). Guards
    // against a regression that drops the roughness differentiation.
    expect(byName('asphaltMat')!.roughness).toBeLessThan(
      byName('grassMat')!.roughness,
    );
  });

  // ─── Plan-028 U4: SSAO ambient occlusion (perf-gated) ───
  // Note: SSAO_ENABLED is a compile-time kill-switch (a module const), not a
  // runtime option, so the disabled branch isn't unit-tested — flipping it is a
  // manual one-line edit for perf tuning, and adding API surface purely to test
  // a constant isn't worth it. The on-path + dispose below cover the wiring.

  it('U4 — constructs SSAO2RenderingPipeline once over the chase camera', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    expect(M.ssao2Ctor).toHaveBeenCalledTimes(1);
    // ctor args: (name, scene, ratio, [camera]). The 4th arg carries the camera
    // so SSAO attaches to the same camera as the DefaultRenderingPipeline.
    const cams = M.ssao2Ctor.mock.calls[0]![3] as unknown[];
    expect(Array.isArray(cams)).toBe(true);
    expect(cams[0]).toBe(M.state.lastCamera);
  });

  it('U4 — disposes the SSAO pipeline during scene dispose', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    handles.dispose();
    expect(M.ssao2Dispose).toHaveBeenCalledTimes(1);
    // Order is load-bearing: SSAO render targets must be released BEFORE
    // scene.dispose() tears down the pipeline manager, or a carousel switch
    // leaks them. Assert ssao dispose ran before the scene's dispose.
    const ssaoOrder = M.ssao2Dispose.mock.invocationCallOrder[0]!;
    const sceneOrder = (M.state.lastScene!.dispose as unknown as {
      mock: { invocationCallOrder: number[] };
    }).mock.invocationCallOrder[0]!;
    expect(ssaoOrder).toBeLessThan(sceneOrder);
  });

  // ─── Plan-028 U5: atmospheric fog ───

  it('U5 — enables EXP2 fog for atmospheric depth', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    // fogMode is set with the numeric literal 2 (= Scene.FOGMODE_EXP2), matching
    // the no-statics-on-the-mock convention used for TONEMAPPING_ACES.
    expect(M.state.lastScene!.fogMode).toBe(2);
    expect(M.state.lastScene!.fogDensity).toBeGreaterThan(0);
    expect(M.state.lastScene!.fogColor).not.toBeNull();
  });

  it('dispose() tears down scene + engine', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
    });
    handles.dispose();
    expect(M.state.lastCarContainer?.dispose).toHaveBeenCalled();
    expect(M.state.lastScene?.dispose).toHaveBeenCalled();
    expect(M.state.lastEngine?.dispose).toHaveBeenCalled();
  });

  // ─── U1: car physics fix (KTD-1, KTD-2) ───

  it('plan-013 UAT — applies a uniform scale derived from the GLB bounding box (no longer hardcoded)', async () => {
    // Mock GLB returns a 2m cube for the geometry mesh. TARGET_CAR_LENGTH
    // is 2.8m → expected uniform scale is 1.4. The pre-fix code hardcoded
    // 1.728; this guards against regressing back to a fixed constant that
    // makes Tripo cars ant-sized on the track.
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    const geometryMesh = M.state.lastCarContainer!.meshes[1]! as unknown as {
      scaling: { x: number; y: number; z: number };
    };
    expect(geometryMesh.scaling.x).toBeCloseTo(1.4, 6);
    expect(geometryMesh.scaling.y).toBeCloseTo(1.4, 6);
    expect(geometryMesh.scaling.z).toBeCloseTo(1.4, 6);
  });

  it('U1/KTD-2 — picks the vertex-bearing mesh for physics, not __root__', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
    });
    // Mock GLB has meshes[0] (0 verts, root-like) + meshes[1] (1024 verts,
    // geometry). The geometry mesh — not the root — must be parented to
    // the pivot so the box collider wraps the geometry's bounds.
    const rootMesh = M.state.lastCarContainer!.meshes[0]!;
    const geometryMesh = M.state.lastCarContainer!.meshes[1]!;
    expect(rootMesh.parent).toBeNull();
    expect(geometryMesh.parent).toBe(M.state.lastTransformNode);
  });

  it('parents EVERY geometry part of a multi-mesh GLB to the pivot (segmented-truck fix)', async () => {
    // Regression: a multi-mesh GLB (Tripo mesh_segmentation / D-077 uploads
    // split a truck into chassis + wheels as separate meshes) used to render
    // as a single wheel because only the first vertex-bearing mesh was
    // parented to the car pivot; the rest stayed orphaned at the native
    // origin. Both geometry meshes must now follow the car — parented to the
    // pivot AND scaled — while the vertex-less __root__ is still skipped.
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    const rootMesh = M.state.lastCarContainer!.meshes[0]!;
    const part1 = M.state.lastCarContainer!.meshes[1]! as unknown as {
      parent: unknown;
      scaling: { x: number; y: number; z: number };
    };
    const part2 = M.state.lastCarContainer!.meshes[2]! as unknown as {
      parent: unknown;
      scaling: { x: number; y: number; z: number };
    };
    expect(rootMesh.parent).toBeNull(); // __root__ stays unparented
    expect(part1.parent).toBe(M.state.lastTransformNode);
    expect(part2.parent).toBe(M.state.lastTransformNode);
    // Every part shares the same union-BB-derived uniform scale (2m cube →
    // TARGET_CAR_LENGTH 2.8 / 2 = 1.4) so the truck stays proportional.
    expect(part1.scaling.x).toBeCloseTo(1.4, 6);
    expect(part2.scaling.x).toBeCloseTo(1.4, 6);
  });

  it('U1/KTD-2 — physics aggregate binds to the car pivot (TransformNode), not a mesh', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
    });
    // Car aggregate is the LAST one constructed (after safety ground +
    // road ribbon + 24 outer barriers). Its first arg must be the pivot.
    expect(M.transformNodeCtor).toHaveBeenCalledWith('car-pivot', expect.anything());
    const calls = M.physicsAggregateCtor.mock.calls;
    const carAggregateArgs = calls[calls.length - 1]!;
    expect(carAggregateArgs[0]).toBe(M.state.lastTransformNode);
  });

  it('U1/KTD-1 — sets linear + angular damping so the car coasts to a stop', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    await createRacetrackScene({ canvas, carGlbBytes: fakeGlb(), dev_skipIntro: true });
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
    });
    expect(typeof handles.reset).toBe('function');
  });

  it('U3 — does not fire onLapStateChange before any input (state still waiting)', async () => {
    const onLapStateChange = vi.fn();
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      onLapStateChange,
    dev_skipIntro: true,
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
      dev_skipIntro: true,
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
      dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
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
    dev_skipIntro: true,
    });
    skidMarksSpy.dispose.mockClear();
    handles.dispose();
    expect(skidMarksSpy.dispose).toHaveBeenCalledTimes(1);
  });

  it('Plan-006 U2 — scene.dispose() invokes renderPipeline.dispose()', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    M.defaultRenderingPipelineDispose.mockClear();
    handles.dispose();
    expect(M.defaultRenderingPipelineDispose).toHaveBeenCalledTimes(1);
  });

  it('Plan-006 U7 — scene.dispose() invokes tireSmoke.dispose()', async () => {
    const handles = await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    tireSmokeSpy.dispose.mockClear();
    handles.dispose();
    expect(tireSmokeSpy.dispose).toHaveBeenCalledTimes(1);
  });

  it('Plan-006 U5 — FOV pump lerps camera.fov upward when forwardSpeed is non-zero', async () => {
    await createRacetrackScene({
      canvas: fakeCanvas(),
      carGlbBytes: fakeGlb(),
      dev_skipIntro: true,
    });
    // Force a non-zero forwardSpeed: car velocity along +Z, facing +Z.
    M.state.lastCarBody!.getLinearVelocity.mockReturnValue(new M.Vec3Mock(0, 0, 20));
    const renderCallbacks =
      M.state.lastScene!.onBeforeRenderObservable.add.mock.calls.map((c) => c[0]);
    const inputTick = renderCallbacks[1] as () => void;
    // Capture base FOV from the ArcRotateCamera mock; default is Math.PI/4.
    const baseFov = Math.PI / 4;
    inputTick();
    // After one tick, the camera FOV should have lerped a small amount above base.
    // (FOV_LERP_RATE = 0.05; target delta ~0.14 rad; first-frame increment ~0.007.)
    expect(M.state.lastCamera).not.toBeNull();
    expect(M.state.lastCamera!.fov).toBeGreaterThan(baseFov);
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
