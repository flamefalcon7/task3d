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
  };
});

vi.mock('@babylonjs/core', () => {
  class StandardMaterial {
    diffuseColor: unknown;
    specularColor: unknown;
    alpha = 1;
    constructor(_name: string, _scene: unknown) {}
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
    // Second tick: car moved 1 u (> MIN_VERTEX_DISTANCE 0.5), path grows to
    // 2 points, mesh is created.
    sm.tick(v3(0, 0, 1), v3(0, 0, 1), 5);
    expect(M.extrudeShape).toHaveBeenCalledTimes(1);
    const opts = M.extrudeShape.mock.calls[0]![1] as { path: unknown[] };
    expect(opts.path).toHaveLength(2);
  });

  it('extends the active ribbon when car moves >= MIN_VERTEX_DISTANCE', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5); // path=[(...)]
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5); // moved 0.6 > 0.5, path=2, mesh #1
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 5); // moved 0.6 again, path=3, mesh #2 (recreate)
    sm.tick(v3(0, 0, 1.8), v3(0, 0, 1), 5); // moved 0.6 again, path=4, mesh #3
    expect(M.extrudeShape).toHaveBeenCalledTimes(3);
    const lastOpts = M.extrudeShape.mock.calls[2]![1] as { path: unknown[] };
    expect(lastOpts.path).toHaveLength(4);
  });

  it('does NOT push a duplicate point when car barely moved (< MIN_VERTEX_DISTANCE)', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5); // 1st mesh created
    // Sub-threshold movement: 0.2 < 0.5, no growth.
    sm.tick(v3(0, 0, 0.8), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.9), v3(0, 0, 1), 5);
    // Still only ONE mesh recreation total.
    expect(M.extrudeShape).toHaveBeenCalledTimes(1);
  });

  it('finalizes a segment when lateralSpeed drops below threshold; starts a new one on next crossing', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // Segment 1
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5);
    const segment1Count = M.extrudeShape.mock.calls.length;
    // Drop below threshold — finalize.
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 0);
    // Segment 2 (new path, defers mesh until 2nd point)
    sm.tick(v3(0, 0, 2), v3(0, 0, 1), 5);
    expect(M.extrudeShape.mock.calls.length).toBe(segment1Count); // no new mesh yet
    sm.tick(v3(0, 0, 2.6), v3(0, 0, 1), 5);
    expect(M.extrudeShape.mock.calls.length).toBe(segment1Count + 1);
  });

  it('disposes the oldest segment when MAX_SEGMENTS cap is exceeded', () => {
    M.meshDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // Create 13 finalized segments (cap is 12).
    for (let i = 0; i < 13; i++) {
      sm.tick(v3(0, 0, i * 2), v3(0, 0, 1), 5);
      sm.tick(v3(0, 0, i * 2 + 0.6), v3(0, 0, 1), 5);
      sm.tick(v3(0, 0, i * 2 + 1), v3(0, 0, 1), 0); // finalize
    }
    // 13 finalizations + each pre-finalization regrowth disposed earlier
    // meshes, but at minimum the oldest finalized segment must have been
    // disposed when segment 13 finalized.
    expect(M.meshDispose).toHaveBeenCalled();
  });

  it('reset() disposes all segments AND the in-flight ribbon', () => {
    M.meshDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // 2 finalized + 1 in-flight
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5); // mesh 1
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 0); // finalize
    sm.tick(v3(0, 0, 2), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 2.6), v3(0, 0, 1), 5); // mesh 2
    sm.tick(v3(0, 0, 3.2), v3(0, 0, 1), 0); // finalize
    sm.tick(v3(0, 0, 4), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 4.6), v3(0, 0, 1), 5); // in-flight mesh
    const beforeReset = M.meshDispose.mock.calls.length;

    sm.reset();
    // Reset should dispose 2 finalized + 1 in-flight = 3 more meshes.
    expect(M.meshDispose.mock.calls.length - beforeReset).toBeGreaterThanOrEqual(3);
  });

  it('AE5 — emits skid marks during natural drift (no handbrake context required)', () => {
    // The module is handbrake-agnostic: emission gates on lateralSpeed only.
    // This test verifies no hidden coupling to a handbrake signal.
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5);
    expect(M.extrudeShape).toHaveBeenCalledTimes(1);
  });

  it('AE6 — reset() clears trails (analog of Retry teardown)', () => {
    M.meshDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 0); // finalize 1 segment
    expect(M.meshDispose).not.toHaveBeenCalled(); // not yet disposed
    sm.reset();
    expect(M.meshDispose).toHaveBeenCalled(); // now disposed
  });

  it('dispose() disposes the material AND becomes idempotent', () => {
    M.materialDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5);
    sm.dispose();
    expect(M.materialDispose).toHaveBeenCalledTimes(1);
    // Calling dispose() again is a no-op (disposed flag guards re-entry).
    sm.dispose();
    expect(M.materialDispose).toHaveBeenCalledTimes(1);
  });

  it('uses the provided rearOffset when non-degenerate, else falls back', () => {
    M.extrudeShape.mockClear();
    // Provide rearOffset = 2 — should use that.
    const sm = createSkidMarks(fakeScene(), 3, { rearOffset: 2 });
    sm.tick(v3(10, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(10, 0, 0.6), v3(0, 0, 1), 5);
    const path = (M.extrudeShape.mock.calls[0]![1] as { path: { x: number; z: number }[] }).path;
    // First point: rear = carPos - forward*rearOffset = (10, 0, 0) - (0,0,1)*2 = (10, 0, -2)
    expect(path[0]!.x).toBe(10);
    expect(path[0]!.z).toBe(-2);

    // Provide degenerate rearOffset (0.05 — below threshold), should fall back.
    M.extrudeShape.mockClear();
    const sm2 = createSkidMarks(fakeScene(), 3, { rearOffset: 0.05 });
    sm2.tick(v3(10, 0, 0), v3(0, 0, 1), 5);
    sm2.tick(v3(10, 0, 0.6), v3(0, 0, 1), 5);
    const path2 = (M.extrudeShape.mock.calls[0]![1] as { path: { z: number }[] }).path;
    // Should use REAR_OFFSET_FALLBACK (1.5): rear = (10, 0, 0) - (0,0,1)*1.5 = (10, 0, -1.5)
    expect(path2[0]!.z).toBe(-1.5);
  });
});
