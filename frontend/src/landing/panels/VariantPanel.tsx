import { type JSX } from 'react';
import {
  type AbstractMesh,
  ArcRotateCamera,
  Color3,
  type Material,
  TransformNode,
} from '@babylonjs/core';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { frameCameraToMeshes } from '../../babylon/PreviewCanvas';
import { EMBEDDED_TUSK_GLB_URL } from '../tuskModel';
import { landingWells } from '../../ux/tokens';

// VARIANT lifecycle panel (U6) — "same model, three forks". Three tusks in
// distinct desaturated tints (D-093 tokens; black well, accent-free). The
// loaded tusk is hidden and three recolored clones are spread across the well.
const VARIANT_HEXES = [landingWells.variant1, landingWells.variant2, landingWells.variant3];
const SPREAD = 1.05; // closer together
const ZOOM = 0.82; // <1 = bigger in the card

function recolor(material: Material | null, color: Color3): void {
  if (!material) return;
  // PBR materials use albedoColor; StandardMaterial uses diffuseColor. Set
  // whichever the loaded GLB's material exposes.
  const mat = material as Material & { albedoColor?: Color3; diffuseColor?: Color3 };
  if (mat.albedoColor) mat.albedoColor = color;
  if (mat.diffuseColor) mat.diffuseColor = color;
}

export function VariantPanel(): JSX.Element {
  const onSceneReady = ({ scene, camera, meshes }: LiveWellSceneContext) => {
    const colors = VARIANT_HEXES.map((hex) => Color3.FromHexString(hex));
    // Hide the originally-loaded tusk; LiveWell still owns + disposes it.
    meshes.forEach((m) => m.setEnabled(false));

    const groups: TransformNode[] = [];
    const framed: AbstractMesh[] = [];
    for (let i = 0; i < 3; i++) {
      const color = colors[i];
      if (!color) continue;
      const node = new TransformNode(`variant-${i}`, scene);
      node.position.x = (i - 1) * SPREAD;
      for (const src of meshes) {
        const clone = src.clone(`${src.name}-v${i}`, node);
        if (!clone) continue;
        clone.setEnabled(true);
        clone.material = clone.material ? clone.material.clone(`variant-${i}-mat`) : null;
        recolor(clone.material, color);
        framed.push(clone);
      }
      groups.push(node);
    }

    if (camera instanceof ArcRotateCamera && framed.length > 0) {
      frameCameraToMeshes(camera, framed);
      camera.radius *= ZOOM; // bigger
    }

    return () => {
      // Dispose the clone groups + their cloned materials. The hidden originals
      // belong to LiveWell's container and are disposed there.
      groups.forEach((g) => g.dispose(false, true));
    };
  };

  return (
    <LiveWell
      glbUrl={EMBEDDED_TUSK_GLB_URL}
      staticSrc="/lifecycle/variant.svg"
      staticAlt="A grid of tusk forks in different colors"
      ariaLabel="Three copies of the same walrus tusk in three different colors"
      testIdBase="lifecycle-well-variant"
      offscreenPolicy="dispose"
      onSceneReady={onSceneReady}
    />
  );
}
