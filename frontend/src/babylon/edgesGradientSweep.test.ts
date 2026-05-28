import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @babylonjs/core before importing edgesGradientSweep so the static
// `import { Plane }` resolves to the stub. The Plane constructor signature
// mirrors @babylonjs/core/Maths/math.plane.d.ts (a, b, c, d == normal.x/y/z, d)
// so test assertions can read .normal.x / .d directly.
//
// Mirrors the PreviewCanvas.test.tsx pattern: a `state` object captures
// constructor/observer/dispose call counts so individual tests can assert
// against the Babylon API surface without spinning up jsdom WebGL.
const state: {
  beforeRenderCbs: Array<() => void>;
  removedObservers: number;
  clipPlanesSet: { scene: number; scene2: number };
} = {
  beforeRenderCbs: [],
  removedObservers: 0,
  clipPlanesSet: { scene: 0, scene2: 0 },
};

vi.mock('@babylonjs/core', () => {
  class Plane {
    normal: { x: number; y: number; z: number };
    d: number;
    constructor(a: number, b: number, c: number, d: number) {
      this.normal = { x: a, y: b, z: c };
      this.d = d;
    }
  }
  return { Plane };
});

// The implementation imports '@babylonjs/core/Rendering/edgesRenderer' purely
// for its augmentation side-effect. Mock the import so vitest doesn't try to
// resolve the real Babylon entry (which pulls in WebGL).
vi.mock('@babylonjs/core/Rendering/edgesRenderer', () => ({}));

import { setupEdgesGradientSweep } from './edgesGradientSweep';

interface FakeMaterial {
  alpha: number;
  disableLighting: boolean;
  clipPlane: { normal: { x: number; y: number; z: number }; d: number } | null;
  cloneCalls: number;
  disposed: boolean;
  clone: (name: string) => FakeMaterial;
  dispose: () => void;
}

function makeMaterial(): FakeMaterial {
  const mat: FakeMaterial = {
    alpha: 1,
    disableLighting: false,
    clipPlane: null,
    cloneCalls: 0,
    disposed: false,
    clone(_name: string) {
      // Each call mints a fresh independent material (matches Babylon contract).
      const child = makeMaterial();
      mat.cloneCalls++;
      return child;
    },
    dispose() {
      mat.disposed = true;
    },
  };
  return mat;
}

interface FakeMesh {
  name: string;
  vertexCount: number;
  bbox: { min: number; max: number };
  material: FakeMaterial | null;
  cloned: boolean;
  edgesEnabled: boolean;
  edgesEpsilon: number | undefined;
  disposed: boolean;
  computeCalls: number;
  clone: (name?: string, _parent?: unknown) => FakeMesh;
  enableEdgesRendering: (epsilon?: number) => FakeMesh;
  computeWorldMatrix: (force?: boolean) => void;
  getTotalVertices: () => number;
  getBoundingInfo: () => {
    boundingBox: {
      minimumWorld: { x: number; y: number; z: number };
      maximumWorld: { x: number; y: number; z: number };
    };
  };
  dispose: () => void;
}

function makeMesh(
  name: string,
  minX: number,
  maxX: number,
  opts: { vertexCount?: number; material?: FakeMaterial | null } = {},
): FakeMesh {
  const mesh: FakeMesh = {
    name,
    vertexCount: opts.vertexCount ?? 100,
    bbox: { min: minX, max: maxX },
    material: opts.material === undefined ? makeMaterial() : opts.material,
    cloned: false,
    edgesEnabled: false,
    edgesEpsilon: undefined,
    disposed: false,
    computeCalls: 0,
    clone(_name?: string, _parent?: unknown) {
      // Cloned mesh shares the source bbox (it IS structurally identical).
      // It starts referencing the parent's material; setupEdgesGradientSweep
      // overwrites this with the cloned material.
      const child = makeMesh(_name ?? `${name}_clone`, minX, maxX, {
        vertexCount: mesh.vertexCount,
        material: mesh.material,
      });
      child.cloned = true;
      mesh.cloned = true;
      return child;
    },
    enableEdgesRendering(epsilon?: number) {
      mesh.edgesEnabled = true;
      mesh.edgesEpsilon = epsilon;
      return mesh;
    },
    computeWorldMatrix(_force?: boolean) {
      mesh.computeCalls++;
    },
    getTotalVertices() {
      return mesh.vertexCount;
    },
    getBoundingInfo() {
      return {
        boundingBox: {
          minimumWorld: { x: mesh.bbox.min, y: 0, z: 0 },
          maximumWorld: { x: mesh.bbox.max, y: 0, z: 0 },
        },
      };
    },
    dispose() {
      mesh.disposed = true;
    },
  };
  return mesh;
}

function makeScene() {
  const scene = {
    clipPlane: null as unknown,
    clipPlane2: null as unknown,
    onBeforeRenderObservable: {
      add(cb: () => void) {
        state.beforeRenderCbs.push(cb);
        return cb;
      },
      remove(_cb: unknown) {
        state.removedObservers++;
        const idx = state.beforeRenderCbs.indexOf(_cb as () => void);
        if (idx >= 0) state.beforeRenderCbs.splice(idx, 1);
      },
    },
  };
  return scene;
}

beforeEach(() => {
  state.beforeRenderCbs = [];
  state.removedObservers = 0;
  state.clipPlanesSet = { scene: 0, scene2: 0 };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setupEdgesGradientSweep', () => {
  it('happy path — clones mesh, clones material, enables edges, registers observer', () => {
    const scene = makeScene();
    const mesh = makeMesh('tusk', 0, 10);
    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);

    expect(control).toBeTruthy();
    expect(typeof control.setProgress).toBe('function');
    expect(typeof control.dispose).toBe('function');
    // mesh.clone was invoked exactly once
    expect(mesh.cloned).toBe(true);
    // material.clone was invoked at least once (independent material for the clone)
    expect(mesh.material!.cloneCalls).toBe(1);
    // enableEdgesRendering called with a defined epsilon
    // (the clone, not the original — so check the recorded epsilon on a fresh
    // mesh we can intercept via state). The simpler check: at least one mesh
    // somewhere has edges enabled — but we want to be specific. Trace via the
    // beforeRenderCb registration as the canonical signal.
    expect(state.beforeRenderCbs.length).toBe(1);

    control.dispose();
  });

  it('enableEdgesRendering is called on the clone with a defined epsilon', () => {
    const scene = makeScene();
    // Wire up a sentinel: the clone calls enableEdgesRendering on itself, and
    // because our makeMesh.clone() returns a fresh FakeMesh, capture it.
    let cloneRef: FakeMesh | null = null;
    const mesh = makeMesh('tusk', 0, 10);
    const origClone = mesh.clone;
    mesh.clone = (n?: string, p?: unknown) => {
      const child = origClone.call(mesh, n, p);
      cloneRef = child;
      return child;
    };

    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);
    expect(cloneRef).not.toBeNull();
    expect(cloneRef!.edgesEnabled).toBe(true);
    expect(cloneRef!.edgesEpsilon).toBeDefined();
    expect(typeof cloneRef!.edgesEpsilon).toBe('number');

    control.dispose();
  });

  it('setProgress(0) → next observer fire applies clipPlane at bbox.minX', () => {
    const scene = makeScene();
    const mesh = makeMesh('tusk', -5, 5);
    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);
    control.setProgress(0);

    const cb = state.beforeRenderCbs[0]!;
    cb();

    // PBR plane: normal=(+1,0,0), d=-sweepX. sweepX = -5 + 0*(5-(-5)) = -5 → d = 5.
    const pbrClip = mesh.material!.clipPlane;
    expect(pbrClip).not.toBeNull();
    expect(pbrClip!.normal.x).toBe(1);
    expect(pbrClip!.d).toBeCloseTo(5);

    control.dispose();
  });

  it('setProgress(0.45) → clipPlane.d reflects 45% interpolation', () => {
    const scene = makeScene();
    const mesh = makeMesh('tusk', 0, 10);
    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);
    control.setProgress(0.45);

    state.beforeRenderCbs[0]!();
    // sweepX = 0 + 0.45 * 10 = 4.5 → pbrPlane.d = -4.5
    const pbrClip = mesh.material!.clipPlane;
    expect(pbrClip).not.toBeNull();
    expect(pbrClip!.d).toBeCloseTo(-4.5);

    control.dispose();
  });

  it('setProgress(1) → clipPlane at bbox.maxX', () => {
    const scene = makeScene();
    const mesh = makeMesh('tusk', 0, 10);
    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);
    control.setProgress(1);

    state.beforeRenderCbs[0]!();
    // sweepX = 0 + 1*10 = 10 → pbrPlane.d = -10
    expect(mesh.material!.clipPlane!.d).toBeCloseTo(-10);

    control.dispose();
  });

  it('empty meshes → returns no-op control, no observer registered, nothing cloned', () => {
    const scene = makeScene();
    const control = setupEdgesGradientSweep(scene as never, []);

    expect(state.beforeRenderCbs.length).toBe(0);
    // setProgress + dispose are safe to call on the no-op control
    expect(() => control.setProgress(0.5)).not.toThrow();
    expect(() => control.dispose()).not.toThrow();
    expect(() => control.dispose()).not.toThrow();
  });

  it('double dispose → observer.remove called once, no exceptions', () => {
    const scene = makeScene();
    const mesh = makeMesh('tusk', 0, 10);
    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);

    control.dispose();
    control.dispose();

    expect(state.removedObservers).toBe(1);
  });

  it('integration — after dispose, observer is removed, clone disposed, scene.clipPlane null', () => {
    const scene = makeScene();
    const mesh = makeMesh('tusk', 0, 10);
    // Capture the clone created internally so we can assert its disposal.
    let cloneRef: FakeMesh | null = null;
    const origClone = mesh.clone;
    mesh.clone = (n?: string, p?: unknown) => {
      const child = origClone.call(mesh, n, p);
      cloneRef = child;
      return child;
    };

    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);
    control.setProgress(0.5);
    state.beforeRenderCbs[0]!();
    // Pre-dispose sanity: clipPlane was set on original's material
    expect(mesh.material!.clipPlane).not.toBeNull();

    control.dispose();

    // Observer detached
    expect(state.beforeRenderCbs.length).toBe(0);
    // Cloned mesh disposed
    expect(cloneRef!.disposed).toBe(true);
    // scene clipPlane slots cleared (strategy b leaves them null throughout,
    // but dispose explicitly nulls them as a safety contract)
    expect(scene.clipPlane).toBeNull();
    expect(scene.clipPlane2).toBeNull();
    // Original's clipPlane override cleared so the source mesh returns to
    // pre-mount render state.
    expect(mesh.material!.clipPlane).toBeNull();
  });

  it('setProgress(null) after frozen → next frame uses auto-loop value', () => {
    vi.useFakeTimers();
    const scene = makeScene();
    const mesh = makeMesh('tusk', 0, 10);
    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);

    // Freeze, fire, capture frozen value
    control.setProgress(0.25);
    state.beforeRenderCbs[0]!();
    const frozenD = mesh.material!.clipPlane!.d; // = -2.5

    // Resume auto-loop; advance Date.now via fake timers
    control.setProgress(null);
    // Pick a "now" where Date.now() % 6000 / 6000 != 0.25 — set system time
    // explicitly so the math is deterministic.
    vi.setSystemTime(new Date(3000)); // 3000 % 6000 / 6000 = 0.5 → sweepX=5 → d=-5
    state.beforeRenderCbs[0]!();
    const liveD = mesh.material!.clipPlane!.d;

    expect(liveD).not.toBeCloseTo(frozenD);
    expect(liveD).toBeCloseTo(-5);

    control.dispose();
  });

  it('transparency — clone material has alpha 0 so PBR-pass is invisible (only edges render)', () => {
    const scene = makeScene();
    // Capture the cloned material the implementation produced.
    let observedCloneMat: FakeMaterial | null = null;
    let cloneRef: FakeMesh | null = null;
    const mesh = makeMesh('tusk', 0, 10);
    const origClone = mesh.clone;
    mesh.clone = (n?: string, p?: unknown) => {
      const child = origClone.call(mesh, n, p);
      cloneRef = child;
      return child;
    };

    const control = setupEdgesGradientSweep(scene as never, [mesh as never]);

    // After setup, the clone's material was replaced with the cloned one and
    // its alpha was driven to 0.
    observedCloneMat = cloneRef!.material;
    expect(observedCloneMat).not.toBeNull();
    expect(observedCloneMat!.alpha).toBe(0);
    // Original mesh's material is NOT mutated to alpha 0 (that would hide the
    // PBR pass we want to keep on the original).
    expect(mesh.material!.alpha).toBe(1);

    control.dispose();
  });

  it('union bbox spans multiple meshes — sweep midpoint is in the combined range', () => {
    const scene = makeScene();
    const meshA = makeMesh('a', -10, -5); // X range: [-10, -5]
    const meshB = makeMesh('b', 5, 10); // X range: [5, 10]
    const control = setupEdgesGradientSweep(scene as never, [meshA as never, meshB as never]);

    control.setProgress(0.5);
    state.beforeRenderCbs[0]!();

    // union bbox: minX=-10, maxX=10 → sweepX at t=0.5 is 0 → pbrPlane.d = 0
    expect(meshA.material!.clipPlane!.d).toBeCloseTo(0);
    expect(meshB.material!.clipPlane!.d).toBeCloseTo(0);

    control.dispose();
  });
});
