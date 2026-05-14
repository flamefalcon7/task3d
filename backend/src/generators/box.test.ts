import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { BoxGenerator, buildBoxMesh } from './box.js';

describe('buildBoxMesh', () => {
  it('produces 8 unique vertex slots and 12 triangles', () => {
    const { positions, indices } = buildBoxMesh(1, 1, 1);
    expect(positions.length / 3).toBe(8);
    expect(indices.length / 3).toBe(12);
  });

  it('pivots at bottom-center (minY = 0)', () => {
    const { positions } = buildBoxMesh(2, 3, 2);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < positions.length; i += 3) {
      minY = Math.min(minY, positions[i]!);
      maxY = Math.max(maxY, positions[i]!);
    }
    expect(minY).toBe(0);
    expect(maxY).toBe(3);
  });

  it('stays finite at very small sizes', () => {
    const { positions } = buildBoxMesh(0.001, 0.001, 0.001);
    for (const v of positions) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('BoxGenerator', () => {
  it('emits a parseable GLB', async () => {
    const gen = new BoxGenerator();
    const { glbBytes } = await gen.generate({ shape: 'box', width: 1, height: 1, depth: 1 });
    expect(glbBytes.byteLength).toBeGreaterThan(0);
    const doc = await new NodeIO().readBinary(glbBytes);
    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(1);
    const prim = meshes[0]!.listPrimitives()[0]!;
    const positionAccessor = prim.getAttribute('POSITION')!;
    expect(positionAccessor.getCount()).toBe(8);
    expect(prim.getIndices()!.getCount()).toBe(36); // 12 tris * 3
  });
});
