import type { ChestParams, Generator, GenerateResult } from '@overflow2026/shared';
import { meshToGlb } from '../lib/glb.js';
import { buildBoxMesh } from './box.js';

// Treasure chest: body box (bottom half) + lid box (top half) rotated around
// the back-top edge of the body. Mirrors /tmp/box-demo/chest.go geometry —
// 16 vertices, 24 triangles. Per D-012, replicate logic in TS, don't port Go.
export function buildChestMesh(
  w: number,
  h: number,
  d: number,
  lidOpenRadians: number,
) {
  // Split height: body 60%, lid 40% (matches the Go proof's proportions).
  const bodyH = h * 0.6;
  const lidH = h * 0.4;

  const body = buildBoxMesh(w, bodyH, d);

  // Lid: build a box at origin, translate to sit on top of body, then rotate
  // around the back-top edge of the body (pivot at y = bodyH, z = -d/2).
  const lid = buildBoxMesh(w, lidH, d);
  const lidPositions = new Float32Array(lid.positions);
  const pivotY = bodyH;
  const pivotZ = -d / 2;
  const sin = Math.sin(lidOpenRadians);
  const cos = Math.cos(lidOpenRadians);
  for (let i = 0; i < lidPositions.length; i += 3) {
    // Move lid up to body top, then translate so back-edge aligns to pivot.
    const x = lidPositions[i]!;
    const yLocal = lidPositions[i + 1]!;           // lid local y in [0, lidH]
    const zLocal = lidPositions[i + 2]!;           // lid local z in [-d/2, d/2]
    // Translate into world: lid sits with its bottom-back at (any, bodyH, -d/2).
    // So world before rotation: (x, bodyH + yLocal, zLocal)
    // After translating to pivot frame: (x, yLocal, zLocal + d/2)
    // (subtract pivotY from world-y, subtract pivotZ from world-z)
    const yp = yLocal;
    const zp = zLocal + d / 2;
    // Rotate around X axis: positive radians lifts the front edge (z=+d/2) up
    // and tips the lid back toward -z. (CCW when viewed from +x.)
    const yr = yp * cos + zp * sin;
    const zr = -yp * sin + zp * cos;
    lidPositions[i] = x;
    lidPositions[i + 1] = yr + pivotY;
    lidPositions[i + 2] = zr + pivotZ;
  }

  // Merge body + lid: offset lid indices by body vertex count.
  const bodyVertCount = body.positions.length / 3;
  const positions = new Float32Array(body.positions.length + lidPositions.length);
  positions.set(body.positions, 0);
  positions.set(lidPositions, body.positions.length);

  const indices = new Uint16Array(body.indices.length + lid.indices.length);
  indices.set(body.indices, 0);
  for (let i = 0; i < lid.indices.length; i++) {
    indices[body.indices.length + i] = lid.indices[i]! + bodyVertCount;
  }

  return { positions, indices };
}

export class ChestGenerator implements Generator {
  async generate(params: ChestParams | { shape: string }): Promise<GenerateResult> {
    if (params.shape !== 'chest') throw new Error(`ChestGenerator received shape=${params.shape}`);
    const p = params as ChestParams;
    const mesh = buildChestMesh(p.width, p.height, p.depth, p.lidOpenRadians);
    const glbBytes = await meshToGlb({ ...mesh, name: 'chest' });
    return { glbBytes, lineageStub: { generatorSource: 'procedural' } };
  }
}
