import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { buildSwordMesh, SwordGenerator } from './sword.js';
import { isManifold } from '../lib/glb.js';
import { generateParamsSchema } from '../lib/schema.js';

// (B-A) × (C-A) for the triangle at indices[offset..offset+2]; returns the
// component requested. Mirrors cylinder.test.ts triNormalY pattern.
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

describe('buildSwordMesh', () => {
  it('default params: 50 verts, 84 tris (pommel 8/12 + grip 26/48 + crossguard 8/12 + blade 8/12)', () => {
    const { positions, indices } = buildSwordMesh(1.0, 0.1, 0.2, 0.08);
    expect(positions.length / 3).toBe(50);
    expect(indices.length / 3).toBe(84);
  });

  it('pivots at bottom-center (minY = 0 at pommel base)', () => {
    const { positions } = buildSwordMesh(1.0, 0.1, 0.2, 0.08);
    let minY = Infinity;
    for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i]!);
    expect(minY).toBe(0);
  });

  it('blade top reaches pommelSize + gripLength + crossguardH + bladeLength', () => {
    const { positions } = buildSwordMesh(1.0, 0.1, 0.2, 0.08);
    let maxY = -Infinity;
    for (let i = 1; i < positions.length; i += 3) maxY = Math.max(maxY, positions[i]!);
    // pommel(0.08) + grip(0.2) + crossguard(bladeWidth=0.1) + blade(1.0) = 1.38
    expect(maxY).toBeCloseTo(1.38, 5);
  });

  it('rejects non-positive params', () => {
    expect(() => buildSwordMesh(0, 0.1, 0.2, 0.08)).toThrow();
    expect(() => buildSwordMesh(1, -0.1, 0.2, 0.08)).toThrow();
  });
});

describe('buildSwordMesh winding (Phase 1 cylinder-bug lesson)', () => {
  it('grip top cap faces +Y', () => {
    // Layout in merged mesh: pommel verts 0..7 (12 tris), then grip verts
    // 8..33. Indices: pommel 0..35 (12*3), then grip side 36..107 (16 quads*6
    // wait — grip uses segments=12). Grip indices come right after pommel's
    // 36 indices. Grip side: 12*6=72; top cap starts at 36+72=108.
    const { positions, indices } = buildSwordMesh(1.0, 0.1, 0.2, 0.08);
    const gripTopCapStart = 12 * 3 + 12 * 6;
    const n = triNormal(positions, indices, gripTopCapStart);
    expect(n.y).toBeGreaterThan(0);
  });

  it('blade top face normal points +Y', () => {
    // Blade is the last component, 8 verts and 12 tris. Box top face is the
    // last quad in buildBoxMesh's index list: indices `3,7,6, 3,6,2`. In the
    // merged buffer, the very last triangle's normal must be +Y.
    const { positions, indices } = buildSwordMesh(1.0, 0.1, 0.2, 0.08);
    const lastTriOffset = indices.length - 3;
    const n = triNormal(positions, indices, lastTriOffset);
    expect(n.y).toBeGreaterThan(0);
    // and tangential components should be ~0 for a flat top face
    expect(Math.abs(n.x)).toBeLessThan(1e-5);
    expect(Math.abs(n.z)).toBeLessThan(1e-5);
  });

  it('mesh is manifold (every edge shared by exactly 2 triangles)', () => {
    // Note: composed mesh; each component is independently closed. Shared
    // touching faces between pommel/grip/etc. are coincident but not stitched,
    // so manifold check passes per-component as a union of closed shells.
    const { positions, indices } = buildSwordMesh(1.0, 0.1, 0.2, 0.08);
    expect(isManifold(positions, indices)).toBe(true);
  });
});

describe('SwordGenerator', () => {
  it('emits a parseable GLB with magic bytes', async () => {
    const gen = new SwordGenerator();
    const { glbBytes } = await gen.generate({
      shape: 'sword', bladeLength: 1.0, bladeWidth: 0.1, gripLength: 0.2, pommelSize: 0.08,
    });
    expect(glbBytes.byteLength).toBeGreaterThan(0);
    // GLB magic: 'g','l','T','F' at offset 0
    expect(glbBytes[0]).toBe(0x67);
    expect(glbBytes[1]).toBe(0x6c);
    expect(glbBytes[2]).toBe(0x54);
    expect(glbBytes[3]).toBe(0x46);
    const doc = await new NodeIO().readBinary(glbBytes);
    expect(doc.getRoot().listMeshes().length).toBe(1);
  });

  it('zod schema accepts min + max ranges and rejects out-of-range', () => {
    expect(generateParamsSchema.safeParse({
      shape: 'sword', bladeLength: 0.2, bladeWidth: 0.02, gripLength: 0.05, pommelSize: 0.02,
    }).success).toBe(true);
    expect(generateParamsSchema.safeParse({
      shape: 'sword', bladeLength: 2.0, bladeWidth: 0.3, gripLength: 0.5, pommelSize: 0.2,
    }).success).toBe(true);
    expect(generateParamsSchema.safeParse({
      shape: 'sword', bladeLength: 5.0, bladeWidth: 0.1, gripLength: 0.2, pommelSize: 0.08,
    }).success).toBe(false);
  });
});
