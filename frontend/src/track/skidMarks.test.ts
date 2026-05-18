import { describe, expect, it, vi } from 'vitest';

// Plan-005 U3 — skidMarks unit tests. Mock @babylonjs/core surface used by
// the module: Vector3, Color3, StandardMaterial, Mesh.dispose, and
// MeshBuilder.ExtrudeShape (which we want to count + capture path lengths).
//
// Twin-ribbon refactor (post manual-smoke): each growth tick now creates
// TWO meshes (left + right rear tire), so count assertions are 2× the
// single-ribbon counterpart.

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

import { createSkidMarks } from './skidMarks';
import type { Vector3, Scene } from '@babylonjs/core';

function fakeScene(): Scene {
  return {} as Scene;
}

const v3 = (x = 0, y = 0, z = 0): Vector3 =>
  new M.Vec3Mock(x, y, z) as unknown as Vector3;

// Twin-ribbon constants — kept in sync with skidMarks.ts hardcoded values.
// Used in path-position assertions where the left/right offset and forward
// distance matter.
const REAR_AXLE_HALF_TRACK = 0.35;
const WHEEL_OFFSET = 0.5; // positive = in front of pivot

describe('createSkidMarks', () => {
  it('does not create any mesh while lateralSpeed stays below threshold', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 0);
    sm.tick(v3(0, 0, 1), v3(0, 0, 1), 2);
    sm.tick(v3(0, 0, 2), v3(0, 0, 1), 2.9);
    expect(M.extrudeShape).not.toHaveBeenCalled();
  });

  it('starts a pair on first above-threshold tick, but defers mesh until 2nd point is pushed', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // First above-threshold tick: paths initialized to [[leftRear], [rightRear]], no mesh yet.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    expect(M.extrudeShape).not.toHaveBeenCalled();
    // Second tick: car moved 1.5 u (> MIN_VERTEX_DISTANCE 1.0), each path
    // grows to 2 points, BOTH meshes (left + right) are created.
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5);
    expect(M.extrudeShape).toHaveBeenCalledTimes(2);
    const leftOpts = M.extrudeShape.mock.calls[0]![1] as { path: unknown[] };
    const rightOpts = M.extrudeShape.mock.calls[1]![1] as { path: unknown[] };
    expect(leftOpts.path).toHaveLength(2);
    expect(rightOpts.path).toHaveLength(2);
  });

  it('extends BOTH ribbons when car moves >= MIN_VERTEX_DISTANCE', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5); // paths=[[L],[R]]
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5); // paths grow to 2 — 2 meshes
    sm.tick(v3(0, 0, 3.0), v3(0, 0, 1), 5); // paths grow to 3 — 2 more meshes
    sm.tick(v3(0, 0, 4.5), v3(0, 0, 1), 5); // paths grow to 4 — 2 more meshes
    // 3 rebuilds × 2 meshes/rebuild = 6 ExtrudeShape calls.
    expect(M.extrudeShape).toHaveBeenCalledTimes(6);
    const lastLeft = M.extrudeShape.mock.calls[4]![1] as { path: unknown[] };
    const lastRight = M.extrudeShape.mock.calls[5]![1] as { path: unknown[] };
    expect(lastLeft.path).toHaveLength(4);
    expect(lastRight.path).toHaveLength(4);
  });

  it('does NOT push a duplicate point when car barely moved (< MIN_VERTEX_DISTANCE)', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.5), v3(0, 0, 1), 5); // first pair at delta 0.5 (> 0.3)
    // Sub-threshold movement: deltas of 0.1 and 0.1 — both < 0.3, no growth.
    sm.tick(v3(0, 0, 0.6), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 0.7), v3(0, 0, 1), 5);
    // Still only ONE rebuild → 2 meshes total.
    expect(M.extrudeShape).toHaveBeenCalledTimes(2);
  });

  it('finalizes a pair when lateralSpeed drops below threshold; starts a new one on next crossing', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // Pair 1: positions 0 → 1.5 creates 2 meshes (left + right).
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5);
    const segment1Count = M.extrudeShape.mock.calls.length; // 2
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 0); // finalize
    // Pair 2 (new paths, defers meshes until 2nd point at delta >= 1.0).
    sm.tick(v3(0, 0, 5), v3(0, 0, 1), 5);
    expect(M.extrudeShape.mock.calls.length).toBe(segment1Count); // no new meshes yet
    sm.tick(v3(0, 0, 6.5), v3(0, 0, 1), 5); // delta 1.5 from 5 → 2 more meshes
    expect(M.extrudeShape.mock.calls.length).toBe(segment1Count + 2);
  });

  it('disposes the oldest pair (2 meshes) when MAX_SEGMENT_PAIRS cap is exceeded', () => {
    const sm = createSkidMarks(fakeScene(), 3);
    // Build up exactly MAX_SEGMENT_PAIRS (12) finalized pairs — no cap fire yet.
    for (let i = 0; i < 12; i++) {
      sm.tick(v3(0, 0, i * 3), v3(0, 0, 1), 5);
      sm.tick(v3(0, 0, i * 3 + 1.5), v3(0, 0, 1), 5);
      sm.tick(v3(0, 0, i * 3 + 2), v3(0, 0, 1), 0); // finalize
    }
    // The 13th pair triggers the FIFO eviction of the oldest pair = 2 meshes.
    M.meshDispose.mockClear();
    sm.tick(v3(0, 0, 36), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 37.5), v3(0, 0, 1), 5); // creates pair #13 (active)
    M.meshDispose.mockClear(); // exclude rebuild-disposes from the count
    sm.tick(v3(0, 0, 38), v3(0, 0, 1), 0); // finalize → cap fires, disposes pair = 2 meshes
    expect(M.meshDispose).toHaveBeenCalledTimes(2);
  });

  it('reset() disposes all pairs AND the in-flight pair', () => {
    M.meshDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    // 2 finalized pairs + 1 in-flight pair, each at deltas > 1.0
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 5); // pair 1
    sm.tick(v3(0, 0, 1.5), v3(0, 0, 1), 0); // finalize
    sm.tick(v3(0, 0, 5), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 6.5), v3(0, 0, 1), 5); // pair 2
    sm.tick(v3(0, 0, 6.5), v3(0, 0, 1), 0); // finalize
    sm.tick(v3(0, 0, 10), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 11.5), v3(0, 0, 1), 5); // in-flight pair
    const beforeReset = M.meshDispose.mock.calls.length;

    sm.reset();
    // 3 pairs × 2 meshes/pair = 6 disposals on reset.
    expect(M.meshDispose.mock.calls.length - beforeReset).toBe(6);
  });

  it('AE5 — emits skid marks during natural drift (no handbrake context required)', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 5);
    // One growth tick = one pair = 2 ExtrudeShape calls.
    expect(M.extrudeShape).toHaveBeenCalledTimes(2);
  });

  it('AE6 — reset() clears trails (analog of Retry teardown)', () => {
    M.meshDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 0); // finalize 1 pair
    expect(M.meshDispose).not.toHaveBeenCalled();
    sm.reset();
    expect(M.meshDispose).toHaveBeenCalled();
  });

  it('dispose() disposes the material AND becomes idempotent', () => {
    M.materialDispose.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(0, 0, 1.2), v3(0, 0, 1), 5);
    sm.dispose();
    expect(M.materialDispose).toHaveBeenCalledTimes(1);
    sm.dispose();
    expect(M.materialDispose).toHaveBeenCalledTimes(1);
  });

  it('skid material has the expected flat-black color + alpha 1.0', () => {
    createSkidMarks(fakeScene(), 3);
    expect(M.lastMaterial).not.toBeNull();
    expect(M.lastMaterial!.alpha).toBeCloseTo(1.0, 2);
    const color = M.lastMaterial!.diffuseColor as { r: number; g: number; b: number };
    // Flat black for tire-rubber realism — twin-stripe layout reads correctly
    // at this color without the earlier warm-brown visibility hack.
    expect(color.r).toBeLessThan(0.15);
    expect(color.g).toBeLessThan(0.15);
    expect(color.b).toBeLessThan(0.15);
  });

  it('places left/right ribbons symmetrically about the axle center using the hardcoded sizing constants', () => {
    M.extrudeShape.mockClear();
    const sm = createSkidMarks(fakeScene(), 3);
    sm.tick(v3(10, 0, 0), v3(0, 0, 1), 5);
    sm.tick(v3(10, 0, 1.5), v3(0, 0, 1), 5);
    // Two calls per growth: [0] = left ribbon, [1] = right ribbon.
    // Axle center for the first emit: (10, *, 0) + (0,0,1) × WHEEL_OFFSET
    //   = (10, *, +WHEEL_OFFSET)
    // Right vector for forward=(0,0,1) is (1,0,0).
    // Left wheel:  x = 10 - REAR_AXLE_HALF_TRACK, z = +WHEEL_OFFSET
    // Right wheel: x = 10 + REAR_AXLE_HALF_TRACK, z = +WHEEL_OFFSET
    const leftPath = (M.extrudeShape.mock.calls[0]![1] as { path: { x: number; z: number }[] }).path;
    const rightPath = (M.extrudeShape.mock.calls[1]![1] as { path: { x: number; z: number }[] }).path;
    expect(leftPath[0]!.x).toBeCloseTo(10 - REAR_AXLE_HALF_TRACK, 5);
    expect(rightPath[0]!.x).toBeCloseTo(10 + REAR_AXLE_HALF_TRACK, 5);
    expect(leftPath[0]!.z).toBeCloseTo(WHEEL_OFFSET, 5);
    expect(rightPath[0]!.z).toBeCloseTo(WHEEL_OFFSET, 5);
  });
});
