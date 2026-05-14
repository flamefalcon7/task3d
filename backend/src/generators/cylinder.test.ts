import { describe, it, expect } from 'vitest';
import { buildCylinderMesh, CylinderGenerator } from './cylinder.js';

describe('buildCylinderMesh', () => {
  it('segments=16: 34 verts, 64 tris (16 side quads + 32 cap tris)', () => {
    const { positions, indices } = buildCylinderMesh(0.5, 1, 16);
    expect(positions.length / 3).toBe(16 * 2 + 2); // 2 rings + 2 centers
    expect(indices.length / 3).toBe(16 * 4);       // 2 side + 1 top + 1 bottom per segment
  });

  it('segments=3 produces a triangular prism without crash', () => {
    const { positions, indices } = buildCylinderMesh(1, 1, 3);
    expect(positions.length / 3).toBe(8);
    expect(indices.length / 3).toBe(12);
  });

  it('rejects segments<3', () => {
    expect(() => buildCylinderMesh(1, 1, 2)).toThrow();
  });
});

describe('buildCylinderMesh winding (regression: caps were inverted)', () => {
  // Compute (B-A) × (C-A) for the triangle at indices[offset .. offset+2].
  // Returns the Y component of the cross product (sign tells us cap direction).
  function triNormalY(positions: Float32Array, indices: Uint16Array, offset: number) {
    const i0 = indices[offset]!;
    const i1 = indices[offset + 1]!;
    const i2 = indices[offset + 2]!;
    const ax = positions[i0 * 3]!, ay = positions[i0 * 3 + 1]!, az = positions[i0 * 3 + 2]!;
    const bx = positions[i1 * 3]!, by = positions[i1 * 3 + 1]!, bz = positions[i1 * 3 + 2]!;
    const cx = positions[i2 * 3]!, cy = positions[i2 * 3 + 1]!, cz = positions[i2 * 3 + 2]!;
    const bax = bx - ax, bay = by - ay, baz = bz - az;
    const cax = cx - ax, cay = cy - ay, caz = cz - az;
    // (B-A) × (C-A) — y component:
    return baz * cax - bax * caz;
  }

  it('top cap triangles face +Y (visible from above)', () => {
    const segments = 8;
    const { positions, indices } = buildCylinderMesh(1, 1, segments);
    // Layout: side quads (segments * 6) come first, then top cap (segments * 3).
    const topCapStart = segments * 6;
    const ny = triNormalY(positions, indices, topCapStart);
    expect(ny).toBeGreaterThan(0);
  });

  it('bottom cap triangles face -Y (visible from below)', () => {
    const segments = 8;
    const { positions, indices } = buildCylinderMesh(1, 1, segments);
    const bottomCapStart = segments * 6 + segments * 3;
    const ny = triNormalY(positions, indices, bottomCapStart);
    expect(ny).toBeLessThan(0);
  });
});

describe('CylinderGenerator', () => {
  it('emits nonzero GLB', async () => {
    const gen = new CylinderGenerator();
    const { glbBytes } = await gen.generate({ shape: 'cylinder', radius: 0.5, height: 1, segments: 16 });
    expect(glbBytes.byteLength).toBeGreaterThan(0);
  });
});
