import type { CylinderParams, Generator, GenerateResult } from '@overflow2026/shared';
import { meshToGlb } from '../lib/glb.js';

// Cylinder with bottom-center pivot. segments verts on top ring + segments on
// bottom ring + 2 cap centers (top + bottom). Side faces + cap fans.
export function buildCylinderMesh(radius: number, height: number, segments: number) {
  if (segments < 3) throw new Error('cylinder needs >=3 segments');
  const ringSize = segments;
  const totalVerts = ringSize * 2 + 2; // bottom ring + top ring + 2 centers
  const positions = new Float32Array(totalVerts * 3);

  // Indices: side quads (segments * 6) + top fan (segments * 3) + bottom fan (segments * 3)
  const totalTris = segments * 4;
  const indices = new Uint16Array(totalTris * 3);

  // Build rings.
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    // bottom ring: index i
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = z;
    // top ring: index segments + i
    positions[(segments + i) * 3 + 0] = x;
    positions[(segments + i) * 3 + 1] = height;
    positions[(segments + i) * 3 + 2] = z;
  }

  // Centers.
  const bottomCenterIdx = segments * 2;
  const topCenterIdx = segments * 2 + 1;
  positions[bottomCenterIdx * 3 + 1] = 0;          // (0, 0, 0)
  positions[topCenterIdx * 3 + 1] = height;        // (0, h, 0)

  let idx = 0;
  // Side quads (CCW outward).
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const b0 = i;
    const b1 = next;
    const t0 = segments + i;
    const t1 = segments + next;
    // Two triangles per quad.
    indices[idx++] = b0; indices[idx++] = t0; indices[idx++] = b1;
    indices[idx++] = b1; indices[idx++] = t0; indices[idx++] = t1;
  }
  // Top cap: each triangle's normal must point +Y. Winding is
  // (center, ring[next], ring[i]) — verified by cross product on first tri.
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices[idx++] = topCenterIdx;
    indices[idx++] = segments + next;
    indices[idx++] = segments + i;
  }
  // Bottom cap: each triangle's normal must point -Y.
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices[idx++] = bottomCenterIdx;
    indices[idx++] = i;
    indices[idx++] = next;
  }

  return { positions, indices };
}

export class CylinderGenerator implements Generator {
  async generate(params: CylinderParams | { shape: string }): Promise<GenerateResult> {
    if (params.shape !== 'cylinder') throw new Error(`CylinderGenerator received shape=${params.shape}`);
    const p = params as CylinderParams;
    const mesh = buildCylinderMesh(p.radius, p.height, p.segments);
    const glbBytes = await meshToGlb({ ...mesh, name: 'cylinder' });
    return { glbBytes, lineageStub: { generatorSource: 'procedural' } };
  }
}
