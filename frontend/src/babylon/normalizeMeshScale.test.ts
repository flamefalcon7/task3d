import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { computeUniformScale } from './normalizeMeshScale';

// Build a stub AbstractMesh-shaped object with a fixed bounding box. The
// helper only reads getTotalVertices(), computeWorldMatrix(), and
// getBoundingInfo().boundingBox.{minimumWorld,maximumWorld} — anything else
// on AbstractMesh is irrelevant here.
function fakeMesh(min: Vector3, max: Vector3, vertices = 100) {
  return {
    getTotalVertices: () => vertices,
    computeWorldMatrix: () => {},
    getBoundingInfo: () => ({ boundingBox: { minimumWorld: min, maximumWorld: max } }),
  } as never;
}

describe('computeUniformScale', () => {
  it('scales a 1m mesh up to the target', () => {
    // unit cube centered at origin → extents = (1,1,1) → longest = 1
    const m = fakeMesh(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
    expect(computeUniformScale([m], 4)).toBeCloseTo(4, 6);
  });

  it('scales a 10m mesh down to the target', () => {
    // 10m cube → longest = 10 → target 4 → scale 0.4
    const m = fakeMesh(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));
    expect(computeUniformScale([m], 4)).toBeCloseTo(0.4, 6);
  });

  it('uses the longest XYZ extent across the bounding box', () => {
    // Long thin mesh: x=8, y=1, z=2 → longest = 8 → scale 4/8 = 0.5
    const m = fakeMesh(new Vector3(-4, -0.5, -1), new Vector3(4, 0.5, 1));
    expect(computeUniformScale([m], 4)).toBeCloseTo(0.5, 6);
  });

  it('unions the bounding box across multiple meshes', () => {
    // Two meshes that together span 6m on X
    const a = fakeMesh(new Vector3(-3, 0, 0), new Vector3(-1, 1, 1));
    const b = fakeMesh(new Vector3(1, 0, 0), new Vector3(3, 1, 1));
    // Union extents: x=6, y=1, z=1 → longest = 6 → scale 4/6 ≈ 0.6667
    expect(computeUniformScale([a, b], 4)).toBeCloseTo(4 / 6, 6);
  });

  it('skips vertex-less meshes (e.g., glTF __root__ TransformNodes)', () => {
    const root = fakeMesh(new Vector3(-1000, -1000, -1000), new Vector3(1000, 1000, 1000), 0);
    const geom = fakeMesh(new Vector3(-1, -1, -1), new Vector3(1, 1, 1), 50);
    // Should ignore the giant __root__ and only see the 2m geometry → scale = 4/2 = 2
    expect(computeUniformScale([root, geom], 4)).toBeCloseTo(2, 6);
  });

  it('returns 1 when no geometry is present (no-op default)', () => {
    const root = fakeMesh(new Vector3(0, 0, 0), new Vector3(0, 0, 0), 0);
    expect(computeUniformScale([root], 4)).toBe(1);
    expect(computeUniformScale([], 4)).toBe(1);
  });

  it('returns 1 for a degenerate (zero-extent) mesh', () => {
    const m = fakeMesh(new Vector3(2, 2, 2), new Vector3(2, 2, 2));
    expect(computeUniformScale([m], 4)).toBe(1);
  });
});
