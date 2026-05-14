import type { HammerParams, Generator, GenerateResult } from '@overflow2026/shared';
import { meshToGlb, mergeMeshes, translateMesh } from '../lib/glb.js';
import { buildBoxMesh } from './box.js';
import { buildCylinderMesh } from './cylinder.js';

// Hammer: vertical handle (cylinder, pivot at y=0) with head (box) seated on
// top. Head's local origin is bottom-center; we shift so it's centered around
// the handle top axis (translate -headWidth/2 in X is implicit because
// buildBoxMesh already centers in X and Z; only Y needs to move up).
export function buildHammerMesh(
  headWidth: number,
  headDepth: number,
  headHeight: number,
  handleLength: number,
  handleRadius: number,
) {
  if (handleRadius <= 0 || handleLength <= 0 || headWidth <= 0 || headDepth <= 0 || headHeight <= 0) {
    throw new Error('hammer params must be positive');
  }

  const handleSegments = 16;
  const handle = buildCylinderMesh(handleRadius, handleLength, handleSegments);
  const handleMesh = { positions: handle.positions, indices: handle.indices };

  const head = buildBoxMesh(headWidth, headHeight, headDepth);
  const headMesh = translateMesh(
    { positions: head.positions, indices: head.indices },
    0,
    handleLength,
    0,
  );

  return mergeMeshes([handleMesh, headMesh]);
}

export class HammerGenerator implements Generator {
  async generate(params: HammerParams | { shape: string }): Promise<GenerateResult> {
    if (params.shape !== 'hammer') throw new Error(`HammerGenerator received shape=${params.shape}`);
    const p = params as HammerParams;
    const mesh = buildHammerMesh(
      p.headWidth,
      p.headDepth,
      p.headHeight,
      p.handleLength,
      p.handleRadius,
    );
    const glbBytes = await meshToGlb({ ...mesh, name: 'hammer' });
    return { glbBytes, lineageStub: { generatorSource: 'procedural' } };
  }
}
