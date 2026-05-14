import { describe, it, expect } from 'vitest';
import { buildSphereMesh, SphereGenerator } from './sphere.js';

describe('buildSphereMesh', () => {
  it('latSegments=8, lonSegments=16: (7*16)+2 verts', () => {
    const { positions } = buildSphereMesh(0.5, 8, 16);
    expect(positions.length / 3).toBe(7 * 16 + 2);
  });

  it('pivots at bottom-center (minY = 0)', () => {
    const { positions } = buildSphereMesh(0.5, 8, 16);
    let minY = Infinity;
    for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i]!);
    expect(minY).toBeCloseTo(0, 5);
  });

  it('latSegments=2 (minimum) does not crash', () => {
    const { positions, indices } = buildSphereMesh(0.5, 2, 8);
    expect(positions.length).toBeGreaterThan(0);
    expect(indices.length).toBeGreaterThan(0);
  });

  it('rejects invalid segment counts', () => {
    expect(() => buildSphereMesh(0.5, 1, 8)).toThrow();
    expect(() => buildSphereMesh(0.5, 4, 2)).toThrow();
  });
});

describe('SphereGenerator', () => {
  it('emits nonzero GLB', async () => {
    const gen = new SphereGenerator();
    const { glbBytes } = await gen.generate({ shape: 'sphere', radius: 0.5, latSegments: 8, lonSegments: 16 });
    expect(glbBytes.byteLength).toBeGreaterThan(0);
  });
});
