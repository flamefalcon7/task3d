import type { SphereParams, Generator, GenerateResult } from '@overflow2026/shared';
import { meshToGlb } from '../lib/glb.js';

// UV sphere centered at origin, sitting with bottom at y=0 (pivot bottom-center
// to match the other shapes). latSegments slices from south to north pole,
// lonSegments around the equator.
export function buildSphereMesh(radius: number, latSegments: number, lonSegments: number) {
  if (latSegments < 2) throw new Error('sphere needs >=2 latSegments');
  if (lonSegments < 3) throw new Error('sphere needs >=3 lonSegments');

  // Vertices: 2 poles + (latSegments-1) middle rings * lonSegments.
  const ringCount = latSegments - 1;
  const ringVerts = ringCount * lonSegments;
  const totalVerts = ringVerts + 2;
  const positions = new Float32Array(totalVerts * 3);

  // South pole index = 0, ring i (1..ringCount) starts at 1 + (i-1) * lonSegments,
  // north pole index = totalVerts - 1.
  const southIdx = 0;
  const northIdx = totalVerts - 1;
  const yOffset = radius; // shift so minY = 0

  positions[southIdx * 3 + 0] = 0;
  positions[southIdx * 3 + 1] = -radius + yOffset;
  positions[southIdx * 3 + 2] = 0;

  positions[northIdx * 3 + 0] = 0;
  positions[northIdx * 3 + 1] = radius + yOffset;
  positions[northIdx * 3 + 2] = 0;

  for (let r = 1; r <= ringCount; r++) {
    const phi = (r / latSegments) * Math.PI - Math.PI / 2; // -pi/2 .. +pi/2
    const y = Math.sin(phi) * radius;
    const ringRadius = Math.cos(phi) * radius;
    for (let s = 0; s < lonSegments; s++) {
      const theta = (s / lonSegments) * Math.PI * 2;
      const vi = 1 + (r - 1) * lonSegments + s;
      positions[vi * 3 + 0] = Math.cos(theta) * ringRadius;
      positions[vi * 3 + 1] = y + yOffset;
      positions[vi * 3 + 2] = Math.sin(theta) * ringRadius;
    }
  }

  // Indices.
  // South cap: lonSegments triangles fan from south pole to ring 1.
  // Middle: (ringCount - 1) * lonSegments * 2 triangles.
  // North cap: lonSegments triangles fan from north pole to ring ringCount.
  const tris = lonSegments * 2 + (ringCount - 1) * lonSegments * 2;
  const indices = new Uint16Array(tris * 3);
  const ringStart = (r: number) => 1 + (r - 1) * lonSegments; // r in [1, ringCount]

  let idx = 0;
  // South cap (ring 1 to south pole).
  for (let s = 0; s < lonSegments; s++) {
    const next = (s + 1) % lonSegments;
    indices[idx++] = southIdx;
    indices[idx++] = ringStart(1) + s;
    indices[idx++] = ringStart(1) + next;
  }
  // Middle bands.
  for (let r = 1; r < ringCount; r++) {
    const r0 = ringStart(r);
    const r1 = ringStart(r + 1);
    for (let s = 0; s < lonSegments; s++) {
      const next = (s + 1) % lonSegments;
      const a = r0 + s;
      const b = r0 + next;
      const c = r1 + next;
      const d = r1 + s;
      indices[idx++] = a; indices[idx++] = d; indices[idx++] = b;
      indices[idx++] = b; indices[idx++] = d; indices[idx++] = c;
    }
  }
  // North cap.
  for (let s = 0; s < lonSegments; s++) {
    const next = (s + 1) % lonSegments;
    indices[idx++] = northIdx;
    indices[idx++] = ringStart(ringCount) + next;
    indices[idx++] = ringStart(ringCount) + s;
  }

  return { positions, indices };
}

export class SphereGenerator implements Generator {
  async generate(params: SphereParams | { shape: string }): Promise<GenerateResult> {
    if (params.shape !== 'sphere') throw new Error(`SphereGenerator received shape=${params.shape}`);
    const p = params as SphereParams;
    const mesh = buildSphereMesh(p.radius, p.latSegments, p.lonSegments);
    const glbBytes = await meshToGlb({ ...mesh, name: 'sphere' });
    return { glbBytes, lineageStub: { generatorSource: 'procedural' } };
  }
}
