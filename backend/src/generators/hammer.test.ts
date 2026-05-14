import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { buildHammerMesh, HammerGenerator } from './hammer.js';
import { isManifold } from '../lib/glb.js';
import { generateParamsSchema } from '../lib/schema.js';

function triNormal(positions: Float32Array, indices: Uint16Array, offset: number) {
  const i0 = indices[offset]!;
  const i1 = indices[offset + 1]!;
  const i2 = indices[offset + 2]!;
  const ax = positions[i0 * 3]!, ay = positions[i0 * 3 + 1]!, az = positions[i0 * 3 + 2]!;
  const bx = positions[i1 * 3]!, by = positions[i1 * 3 + 1]!, bz = positions[i1 * 3 + 2]!;
  const cx = positions[i2 * 3]!, cy = positions[i2 * 3 + 1]!, cz = positions[i2 * 3 + 2]!;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const cax = cx - ax, cay = cy - ay, caz = cz - az;
  return {
    x: bay * caz - baz * cay,
    y: baz * cax - bax * caz,
    z: bax * cay - bay * cax,
  };
}

describe('buildHammerMesh', () => {
  it('default params: 42 verts, 76 tris (handle 34/64 + head 8/12)', () => {
    const { positions, indices } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    expect(positions.length / 3).toBe(42);
    expect(indices.length / 3).toBe(76);
  });

  it('pivots at bottom-center (minY = 0 at handle base)', () => {
    const { positions } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    let minY = Infinity;
    for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i]!);
    expect(minY).toBeCloseTo(0, 5);
  });

  it('head top reaches handleLength + headHeight', () => {
    const { positions } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    let maxY = -Infinity;
    for (let i = 1; i < positions.length; i += 3) maxY = Math.max(maxY, positions[i]!);
    expect(maxY).toBeCloseTo(1.0, 5); // 0.8 + 0.2
  });

  it('rejects non-positive params', () => {
    expect(() => buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0)).toThrow();
    expect(() => buildHammerMesh(-0.3, 0.15, 0.2, 0.8, 0.04)).toThrow();
  });
});

describe('buildHammerMesh winding (Phase 1 cylinder-bug lesson)', () => {
  it('handle top cap faces +Y', () => {
    // Handle is the first component; cylinder layout: side quads first
    // (segments*6 indices), then top cap (segments*3), then bottom cap.
    const segments = 16;
    const { positions, indices } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    const topCapStart = segments * 6;
    const n = triNormal(positions, indices, topCapStart);
    expect(n.y).toBeGreaterThan(0);
  });

  it('handle bottom cap faces -Y', () => {
    const segments = 16;
    const { positions, indices } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    const bottomCapStart = segments * 6 + segments * 3;
    const n = triNormal(positions, indices, bottomCapStart);
    expect(n.y).toBeLessThan(0);
  });

  it('handle side normal points radially outward (away from Y axis)', () => {
    const segments = 16;
    const { positions, indices } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    // First side triangle, offset 0
    const n = triNormal(positions, indices, 0);
    // The triangle's centroid x,z should align with the normal's x,z (sign-wise).
    const i0 = indices[0]!, i1 = indices[1]!, i2 = indices[2]!;
    const cx = (positions[i0 * 3]! + positions[i1 * 3]! + positions[i2 * 3]!) / 3;
    const cz = (positions[i0 * 3 + 2]! + positions[i1 * 3 + 2]! + positions[i2 * 3 + 2]!) / 3;
    // Dot of (normal.xz, centroid.xz) should be > 0 (outward).
    expect(n.x * cx + n.z * cz).toBeGreaterThan(0);
  });

  it('head top face normal points +Y', () => {
    // Head is last component, a box. Last triangle of buildBoxMesh is the top face.
    const { positions, indices } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    const lastTriOffset = indices.length - 3;
    const n = triNormal(positions, indices, lastTriOffset);
    expect(n.y).toBeGreaterThan(0);
  });

  it('mesh is manifold', () => {
    const { positions, indices } = buildHammerMesh(0.3, 0.15, 0.2, 0.8, 0.04);
    expect(isManifold(positions, indices)).toBe(true);
  });
});

describe('HammerGenerator', () => {
  it('emits a parseable GLB with magic bytes', async () => {
    const gen = new HammerGenerator();
    const { glbBytes } = await gen.generate({
      shape: 'hammer', headWidth: 0.3, headDepth: 0.15, headHeight: 0.2,
      handleLength: 0.8, handleRadius: 0.04,
    });
    expect(glbBytes.byteLength).toBeGreaterThan(0);
    expect(glbBytes[0]).toBe(0x67);
    expect(glbBytes[1]).toBe(0x6c);
    expect(glbBytes[2]).toBe(0x54);
    expect(glbBytes[3]).toBe(0x46);
    const doc = await new NodeIO().readBinary(glbBytes);
    expect(doc.getRoot().listMeshes().length).toBe(1);
  });

  it('zod schema accepts min + max ranges and rejects out-of-range', () => {
    expect(generateParamsSchema.safeParse({
      shape: 'hammer', headWidth: 0.05, headDepth: 0.05, headHeight: 0.05,
      handleLength: 0.1, handleRadius: 0.01,
    }).success).toBe(true);
    expect(generateParamsSchema.safeParse({
      shape: 'hammer', headWidth: 1, headDepth: 0.5, headHeight: 0.5,
      handleLength: 2, handleRadius: 0.15,
    }).success).toBe(true);
    expect(generateParamsSchema.safeParse({
      shape: 'hammer', headWidth: 2, headDepth: 0.15, headHeight: 0.2,
      handleLength: 0.8, handleRadius: 0.04,
    }).success).toBe(false);
  });
});
