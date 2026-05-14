import type { BoxParams, Generator, GenerateResult } from '@overflow2026/shared';
import { meshToGlb } from '../lib/glb.js';

// 8 unique vertices, 12 triangles, pivot at bottom-center (minY = 0).
// Mirrors the geometry from /tmp/box-demo/box.go (per D-012, do not port the
// Go file — replicate the vertex/index tables in TS).
export function buildBoxMesh(w: number, h: number, d: number) {
  const hw = w / 2;
  const hd = d / 2;
  const positions = new Float32Array([
    -hw, 0, -hd,   //  0
     hw, 0, -hd,   //  1
     hw, h, -hd,   //  2
    -hw, h, -hd,   //  3
    -hw, 0,  hd,   //  4
     hw, 0,  hd,   //  5
     hw, h,  hd,   //  6
    -hw, h,  hd,   //  7
  ]);
  const indices = new Uint16Array([
    // back face (z = -hd), CCW from +z
    0, 2, 1,  0, 3, 2,
    // front face (z = +hd)
    4, 5, 6,  4, 6, 7,
    // left (x = -hw)
    0, 7, 3,  0, 4, 7,
    // right (x = +hw)
    1, 2, 6,  1, 6, 5,
    // bottom (y = 0)
    0, 1, 5,  0, 5, 4,
    // top (y = h)
    3, 7, 6,  3, 6, 2,
  ]);
  return { positions, indices };
}

export class BoxGenerator implements Generator {
  async generate(params: BoxParams | { shape: string }): Promise<GenerateResult> {
    if (params.shape !== 'box') throw new Error(`BoxGenerator received shape=${params.shape}`);
    const p = params as BoxParams;
    const mesh = buildBoxMesh(p.width, p.height, p.depth);
    const glbBytes = await meshToGlb({ ...mesh, name: 'box' });
    return { glbBytes, lineageStub: { generatorSource: 'procedural' } };
  }
}
