import { describe, expect, it, vi } from 'vitest';

// Plan-005 U3 — skidMarks unit tests. Mock @babylonjs/core surface used by
// the module: Vector3, Color3, StandardMaterial, Mesh.dispose, and
// MeshBuilder.ExtrudeShape (which we want to count + capture path lengths).

const M = vi.hoisted(() => {
  class Vec3Mock {
    constructor(public x = 0, public y = 0, public z = 0) {}
    clone() {
      return new Vec3Mock(this.x, this.y, this.z);
    }
  }
  return {
    Vec3Mock,
    extrudeShape: vi.fn(),
    meshDispose: vi.fn(),
    materialDispose: vi.fn(),
    lastMaterial: null as null | { diffuseColor: { r: number; g: number; b: number } | unknown; alpha: number },
  };
});

vi.mock('@babylonjs/core', () => {
  class StandardMaterial {
    diffuseColor: unknown;
    specularColor: unknown;
    alpha = 1;
    constructor(_name: string, _scene: unknown) {
      M.lastMaterial = this;
    }
    dispose() {
      M.materialDispose();
    }
  }
  class Color3 {
    constructor(public r = 0, public g = 0, public b = 0) {}
  }
  const MeshBuilder = {
    ExtrudeShape: (name: string, opts: { path: unknown[] }, _scene: unknown) => {
      M.extrudeShape(name, opts);
      // Return a fake mesh; track disposal via the hoisted spy.
      const mesh = {
        material: null as unknown,
        dispose: vi.fn(() => M.meshDispose()),
      };
      return mesh;
    },
  };
  return {
    Vector3: M.Vec3Mock,
    Color3,
    StandardMaterial,
    MeshBuilder,
    Mesh: class {},
  };
});

// Import AFTER vi.mock so the SUT picks up the mocks.
import { createSkidMarks } from './skidMarks';
import type { Vector3, Scene } from '@babylonjs/core';

function fakeScene(): Scene {
  return {} as Scene; // mocks ignore scene anyway
}

// Cast Vec3Mock to Vector3 — at runtime the @babylonjs/core module mock
// replaces Vector3 with Vec3Mock, but TS doesn't know that.
const v3 = (x = 0, y = 0, z = 0): Vector3 =>
  new M.Vec3Mock(x, y, z) as unknown as Vector3;

describe('createSkidMarks', () => {
  it('does not create any mesh while lateralSpeed stays below threshold', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 0); // lateralSpeed=0 < threshold=3
    sm.tick(v3(0, 0, 1), v3(0, 0, 1), 2);
    sm.tick(v3(0, 0, 2), v3(0, 0, 1), 2.9);
    expect(M.extrudeShape).not.toHaveBeenCalled();
  });

  it('starts a segment on first above-threshold tick, but defers mesh until 2nd point is pushed', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // First above-threshold tick: path initialized to [rear], no mesh yet.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    expect(M.extrudeShape).not.toHaveBeenCalled();
    // Second tick: car moved 1.5 u (> MIN_VERTEX_DISTANCE 1.0), path grows
    // to 2 points, mesh is created.
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5);
    expect(M.extrudeShape).toHaveBeenCalledTimes(1);
    const opts = M.extrudeShape.mock.calls[0]![1] as { path: unknown[] };
    expect(opts.path).toHaveLength(2);
  });

  it('extends the active ribbon when car moves >= MIN_VERTEX_DISTANCE', () => {
    // Each delta is 1.5 u (well above the 1.0 MIN_VERTEX_DISTANCE).
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5); // path=[(...)]
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5); // path=2, mesh #1
    sm.tick(v3(0, 0, 3.0), v3(0, 0, 1), 5); // path=3, mesh #2 (rebuild)
    sm.tick(v3(0, 0, 4.5), v3(0, 0, 1), 5); // path=4, mesh #3
    expect(M.extrudeShape).toHaveBeenCalledTimes(3);
    const lastOpts = M.extrudeShape.mock.calls[2]![1] as { path: unknown[] };
    expect(lastOpts.path).toHaveLength(4);
  });

  it('does NOT push a duplicate point when car barely moved (< MIN_VERTEX_DISTANCE)', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5); // 1st mesh created at delta 1.5 > 1.0
    // Sub-threshold movement: deltas of 0.4 and 0.3 — both < 1.0, no growth.
    sm.tick(v3(0, 0, 1.9), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 2.2), v3(0, 0, 1), 5);
    // Still only ONE mesh recreation total.
    expect(M.extrudeShape).toHaveBeenCalledTimes(1);
  });

  it('finalizes a segment when lateralSpeed drops below threshold; starts a new one on next crossing', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // Segment 1: positions 0 → 1.5 (delta 1.5 > 1.0) creates mesh #1.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5);
    const segment1Count = M.extrudeShape.mock.calls.length;
    // Drop below threshold — finalize.
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 0);
    // Segment 2 (new path, defers mesh until 2nd point at delta >= 1.0).
    sm.tick(v3(0, 0, 5), v3(0, 0, 1), 5);
    expect(M.extrudeShape.mock.calls.length).toBe(segment1Count); // no new mesh yet
    sm.tick(v3(0, 0, 6.5), v3(0, 0, 1), 5); // delta 1.5 from 5
    expect(M.extrudeShape.mock.calls.length).toBe(segment1Count + 1);
  });

  it('disposes the oldest segment when MAX_SEGMENTS cap is exceeded', () => {
    const sm = createSkidMarks(fakeScene(), 3);
    // Build up exactly MAX_SEGMENTS (12) finalized segments — no cap fire yet.
    // Each segment uses positions i*3, i*3+1.5, i*3+2 (last is finalize tick).
    for (let i = 0; i < 12; i++) {
      sm.tick(v3(0, 0, i * 3), v3(0, 0, 1), 5);
      sm.tick(v3(0, 0, i * 3 + 1.5), v3(0, 0, 1), 5);
      sm.tick(v3(0, 0, i * 3 + 2), v3(0, 0, 1), 0); // finalize
    }
    // Now clear the spy. The very next finalize MUST dispose exactly one
    // mesh (the FIFO-evicted oldest). The regrow-disposes during the
    // build-up phase happened before the clear, so the only dispose that
    // can land in this window is the cap-enforcement one.
    M.meshDispose.mockClear();
    sm.tick(v3(0, 0, 36), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 37.5), v3(0, 0, 1), 5); // creates mesh #13's active form
    M.meshDispose.mockClear(); // exclude the rebuild-dispose
    sm.tick(v3(0, 0, 38), v3(0, 0, 1), 0); // finalize → cap fires
    expect(M.meshDispose).toHaveBeenCalledTimes(1);
  });

  it('reset() disposes all segments AND the in-flight ribbon', () => {
    M.meshDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // 2 finalized + 1 in-flight, each at deltas > 1.0
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5); // mesh 1
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 0); // finalize
    sm.tick(v3(0, 0, 5), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 6.5), v3(0, 0, 1), 5); // mesh 2
    sm.tick(v3(0, 0, 6.5), v3(0, 0, 1), 0); // finalize
    sm.tick(v3(0, 0, 10), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 11.5), v3(0, 0, 1), 5); // in-flight mesh
    const beforeReset = M.meshDispose.mock.calls.length;

    sm.reset();
    // Reset disposes exactly: 1 in-flight + 2 finalized = 3 meshes.
    // Deterministic — anything other than 3 indicates a reset() bug.
    expect(M.meshDispose.mock.calls.length - beforeReset).toBe(3);
  });

  it('AE5 — emits skid marks during natural drift (no handbrake context required)', () => {
    // The module is handbrake-agnostic: emission gates on lateralSpeed only.
    // This test verifies no hidden coupling to a handbrake signal.
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 5);
    expect(M.extrudeShape).toHaveBeenCalledTimes(1);
  });

  it('AE6 — reset() clears trails (analog of Retry teardown)', () => {
    M.meshDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 0); // finalize 1 segment
    expect(M.meshDispose).not.toHaveBeenCalled(); // not yet disposed
    sm.reset();
    expect(M.meshDispose).toHaveBeenCalled(); // now disposed
  });

  it('dispose() disposes the material AND becomes idempotent', () => {
    M.materialDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 5);
    sm.dispose();
    expect(M.materialDispose).toHaveBeenCalledTimes(1);
    // Calling dispose() again is a no-op (disposed flag guards re-entry).
    sm.dispose();
    expect(M.materialDispose).toHaveBeenCalledTimes(1);
  });

  it('skid material has the expected near-black color + alpha 0.8 (code-review #20 regression guard)', () => {
    // A typo on the tunable alpha (0.08 instead of 0.8 → invisible trails)
    // or a colour swap would silently ship without this assertion. The
    // material is created at module-init time; createSkidMarks is enough
    // to populate M.lastMaterial.
    createSkidMarks(fakeScene(), 3);
    expect(M.lastMaterial).not.toBeNull();
    expect(M.lastMaterial!.alpha).toBeCloseTo(0.8, 2);
    const color = M.lastMaterial!.diffuseColor as { r: number; g: number; b: number };
    expect(color.r).toBeLessThan(0.15); // near-black, definitely darker than asphalt (0.18)
    expect(color.g).toBeLessThan(0.15);
    expect(color.b).toBeLessThan(0.15);
  });

  it('uses the provided rearOffset when non-degenerate, else falls back', () => {
    M.extrudeShape.mockClear();
    // Provide rearOffset = 2 — should use that.
    const sm = createSkidMarks(fakeScene(), 3, { rearOffset: 2 });
    sm.tick(v3(10, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(10, 0, 1.5), v3(0, 0, 1), 5);
    const path = (M.extrudeShape.mock.calls[0]![1] as { path: { x: number; z: number }[] }).path;
    // First point: rear = carPos - forward*rearOffset = (10, 0, 0) - (0,0,1)*2 = (10, 0, -2)
    expect(path[0]!.x).toBe(10);
    expect(path[0]!.z).toBe(-2);

    // Provide degenerate rearOffset (0.05 — below threshold), should fall back.
    M.extrudeShape.mockClear();
    const sm2 = createSkidMarks(fakeScene(), 3, { rearOffset: 0.05 });
    sm2.tick(v3(10, 0, 0), v3(0, 0, 1), 5);
    sm2.tick(v3(10, 0, 1.5), v3(0, 0, 1), 5);
    const path2 = (M.extrudeShape.mock.calls[0]![1] as { path: { z: number }[] }).path;
    // Should use REAR_OFFSET_FALLBACK (1.5): rear = (10, 0, 0) - (0,0,1)*1.5 = (10, 0, -1.5)
    expect(path2[0]!.z).toBe(-1.5);
  });
});
