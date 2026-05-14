import type { PlatformParams, PlatformStyle, Generator, GenerateResult } from '@overflow2026/shared';
import { meshToGlb } from '../lib/glb.js';
import { buildBoxMesh } from './box.js';
import { buildCylinderMesh } from './cylinder.js';

// Platform: round (cylinder disk) or square (flat box). Pivot bottom-center.
// `size` = radius (round) OR width=depth (square).
export function buildPlatformMesh(style: PlatformStyle, size: number, thickness: number) {
  if (size <= 0 || thickness <= 0) throw new Error('platform params must be positive');
  if (style === 'round') {
    return buildCylinderMesh(size, thickness, 32);
  }
  if (style === 'square') {
    return buildBoxMesh(size, thickness, size);
  }
  throw new Error(`unknown platform style: ${style as string}`);
}

export class PlatformGenerator implements Generator {
  async generate(params: PlatformParams | { shape: string }): Promise<GenerateResult> {
    if (params.shape !== 'platform') throw new Error(`PlatformGenerator received shape=${params.shape}`);
    const p = params as PlatformParams;
    const mesh = buildPlatformMesh(p.style, p.size, p.thickness);
    const glbBytes = await meshToGlb({ ...mesh, name: 'platform' });
    return { glbBytes, lineageStub: { generatorSource: 'procedural' } };
  }
}
