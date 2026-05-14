import { describe, it, expect } from 'vitest';
import { buildChestMesh, ChestGenerator } from './chest.js';

describe('buildChestMesh', () => {
  it('has 16 verts and 24 triangles (body + lid)', () => {
    const { positions, indices } = buildChestMesh(1, 1, 1, 0);
    expect(positions.length / 3).toBe(16);
    expect(indices.length / 3).toBe(24);
  });

  it('lidOpenRadians=0: chest stays within full height', () => {
    const { positions } = buildChestMesh(1, 1, 1, 0);
    let maxY = -Infinity;
    for (let i = 1; i < positions.length; i += 3) maxY = Math.max(maxY, positions[i]!);
    expect(maxY).toBeCloseTo(1, 5);
  });

  it('lidOpenRadians=pi/2: lid swings back along -z', () => {
    const { positions: closed } = buildChestMesh(1, 1, 1, 0);
    const { positions: open } = buildChestMesh(1, 1, 1, Math.PI / 2);
    let closedMinZ = Infinity;
    let openMinZ = Infinity;
    for (let i = 2; i < closed.length; i += 3) closedMinZ = Math.min(closedMinZ, closed[i]!);
    for (let i = 2; i < open.length; i += 3) openMinZ = Math.min(openMinZ, open[i]!);
    expect(openMinZ).toBeLessThan(closedMinZ);
  });
});

describe('ChestGenerator', () => {
  it('emits nonzero GLB for both closed and open states', async () => {
    const gen = new ChestGenerator();
    const a = await gen.generate({ shape: 'chest', width: 1, height: 1, depth: 1, lidOpenRadians: 0 });
    const b = await gen.generate({ shape: 'chest', width: 1, height: 1, depth: 1, lidOpenRadians: Math.PI / 2 });
    expect(a.glbBytes.byteLength).toBeGreaterThan(0);
    expect(b.glbBytes.byteLength).toBeGreaterThan(0);
  });
});
