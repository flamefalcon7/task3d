import type { SwordParams, Generator, GenerateResult } from '@overflow2026/shared';
import { meshToGlb, mergeMeshes, translateMesh } from '../lib/glb.js';
import { buildBoxMesh } from './box.js';
import { buildCylinderMesh } from './cylinder.js';

// Sword pointing +Y, pivot bottom-center (pommel base at y=0).
// Stack order bottom-to-top: pommel → grip → crossguard → blade.
export function buildSwordMesh(
  bladeLength: number,
  bladeWidth: number,
  gripLength: number,
  pommelSize: number,
) {
  if (bladeLength <= 0 || bladeWidth <= 0 || gripLength <= 0 || pommelSize <= 0) {
    throw new Error('sword params must be positive');
  }

  const pommel = buildBoxMesh(pommelSize, pommelSize, pommelSize);
  const pommelMesh = translateMesh({ positions: pommel.positions, indices: pommel.indices }, 0, 0, 0);

  // Grip: cylinder above pommel. Radius scaled to bladeWidth so it visually
  // matches the blade without a separate slider.
  const gripRadius = bladeWidth * 0.5;
  const gripSegments = 12;
  const grip = buildCylinderMesh(gripRadius, gripLength, gripSegments);
  const gripMesh = translateMesh({ positions: grip.positions, indices: grip.indices }, 0, pommelSize, 0);

  // Crossguard: wide thin box. Width = 4x blade width (classic ratio), height
  // = blade width, depth = blade width.
  const cgW = bladeWidth * 4;
  const cgH = bladeWidth;
  const cgD = bladeWidth;
  const crossguard = buildBoxMesh(cgW, cgH, cgD);
  const crossguardMesh = translateMesh(
    { positions: crossguard.positions, indices: crossguard.indices },
    0,
    pommelSize + gripLength,
    0,
  );

  // Blade: tall thin box on top of the crossguard. Depth is 30% of width so
  // it reads as a flat blade rather than a square rod.
  const blade = buildBoxMesh(bladeWidth, bladeLength, bladeWidth * 0.3);
  const bladeMesh = translateMesh(
    { positions: blade.positions, indices: blade.indices },
    0,
    pommelSize + gripLength + cgH,
    0,
  );

  return mergeMeshes([pommelMesh, gripMesh, crossguardMesh, bladeMesh]);
}

export class SwordGenerator implements Generator {
  async generate(params: SwordParams | { shape: string }): Promise<GenerateResult> {
    if (params.shape !== 'sword') throw new Error(`SwordGenerator received shape=${params.shape}`);
    const p = params as SwordParams;
    const mesh = buildSwordMesh(p.bladeLength, p.bladeWidth, p.gripLength, p.pommelSize);
    const glbBytes = await meshToGlb({ ...mesh, name: 'sword' });
    return { glbBytes, lineageStub: { generatorSource: 'procedural' } };
  }
}
