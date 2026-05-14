import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { buildPlatformMesh, PlatformGenerator } from './platform.js';
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

describe('buildPlatformMesh round', () => {
  it('default radius=1, thickness=0.1: 66 verts, 128 tris (cylinder seg=32)', () => {
    const { positions, indices } = buildPlatformMesh('round', 1.0, 0.1);
    expect(positions.length / 3).toBe(66);
    expect(indices.length / 3).toBe(128);
  });

  it('pivots at bottom-center (minY = 0)', () => {
    const { positions } = buildPlatformMesh('round', 1.0, 0.1);
    let minY = Infinity;
    for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i]!);
    expect(minY).toBeCloseTo(0, 5);
  });

  it('top cap faces +Y, bottom cap faces -Y', () => {
    const segments = 32;
    const { positions, indices } = buildPlatformMesh('round', 1.0, 0.1);
    const topCapStart = segments * 6;
    const bottomCapStart = segments * 6 + segments * 3;
    expect(triNormal(positions, indices, topCapStart).y).toBeGreaterThan(0);
    expect(triNormal(positions, indices, bottomCapStart).y).toBeLessThan(0);
  });

  it('mesh is manifold', () => {
    const { positions, indices } = buildPlatformMesh('round', 1.0, 0.1);
    expect(isManifold(positions, indices)).toBe(true);
  });
});

describe('buildPlatformMesh square', () => {
  it('default size=1, thickness=0.1: 8 verts, 12 tris (box)', () => {
    const { positions, indices } = buildPlatformMesh('square', 1.0, 0.1);
    expect(positions.length / 3).toBe(8);
    expect(indices.length / 3).toBe(12);
  });

  it('top face normal +Y, bottom face normal -Y', () => {
    const { positions, indices } = buildPlatformMesh('square', 1.0, 0.1);
    // buildBoxMesh index order: back, front, left, right, bottom, top.
    // Each face = 2 tris = 6 indices. Bottom starts at index 24, top at 30.
    const bottomTri = triNormal(positions, indices, 24);
    const topTri = triNormal(positions, indices, 30);
    expect(bottomTri.y).toBeLessThan(0);
    expect(topTri.y).toBeGreaterThan(0);
  });

  it('mesh is manifold', () => {
    const { positions, indices } = buildPlatformMesh('square', 1.0, 0.1);
    expect(isManifold(positions, indices)).toBe(true);
  });
});

describe('buildPlatformMesh edges', () => {
  it('rejects non-positive size or thickness', () => {
    expect(() => buildPlatformMesh('round', 0, 0.1)).toThrow();
    expect(() => buildPlatformMesh('square', 1.0, -0.1)).toThrow();
  });

  it('rejects unknown style', () => {
    expect(() => buildPlatformMesh('hex' as unknown as 'round', 1, 0.1)).toThrow();
  });
});

describe('PlatformGenerator', () => {
  it('emits parseable GLB for both styles', async () => {
    const gen = new PlatformGenerator();
    const r = await gen.generate({ shape: 'platform', style: 'round', size: 1, thickness: 0.1 });
    const s = await gen.generate({ shape: 'platform', style: 'square', size: 1, thickness: 0.1 });
    for (const { glbBytes } of [r, s]) {
      expect(glbBytes.byteLength).toBeGreaterThan(0);
      expect(glbBytes[0]).toBe(0x67);
      expect(glbBytes[1]).toBe(0x6c);
      expect(glbBytes[2]).toBe(0x54);
      expect(glbBytes[3]).toBe(0x46);
      const doc = await new NodeIO().readBinary(glbBytes);
      expect(doc.getRoot().listMeshes().length).toBe(1);
    }
  });

  it('zod schema accepts min + max and rejects out-of-range', () => {
    expect(generateParamsSchema.safeParse({
      shape: 'platform', style: 'round', size: 0.2, thickness: 0.02,
    }).success).toBe(true);
    expect(generateParamsSchema.safeParse({
      shape: 'platform', style: 'square', size: 5, thickness: 1,
    }).success).toBe(true);
    expect(generateParamsSchema.safeParse({
      shape: 'platform', style: 'round', size: 10, thickness: 0.1,
    }).success).toBe(false);
    expect(generateParamsSchema.safeParse({
      shape: 'platform', style: 'triangle', size: 1, thickness: 0.1,
    }).success).toBe(false);
  });
});
