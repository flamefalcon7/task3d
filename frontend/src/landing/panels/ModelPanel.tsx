import { type JSX } from 'react';
import { ArcRotateCamera, Color3, Color4, type Material } from '@babylonjs/core';
// Load-bearing: enableEdgesRendering only attaches when the edges renderer
// side-effect module is imported (same import edgesGradientSweep relies on).
import '@babylonjs/core/Rendering/edgesRenderer';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { EMBEDDED_TUSK_GLB_URL } from '../tuskModel';

// MODEL lifecycle panel (U5) — the tusk as a clean low-poly wireframe on the
// light-grey card. We DON'T use material.wireframe (that draws every triangle,
// far too dense). Instead the solid faces are painted the card's grey so they
// vanish into the background, and enableEdgesRendering draws only the hard facet
// edges in dark — a "hidden-line" wireframe that reads as the low-poly mesh.
const EDGE_COLOR = new Color4(0.1, 0.1, 0.1, 1);
const EDGES_EPSILON = 0.9; // angle threshold — higher = fewer (only sharp) edges
const EDGES_WIDTH = 2.5;
// Faces match the well grey (#E2E0DA) so only the dark edges read.
const FACE_GREY = new Color3(0.886, 0.878, 0.855);
const ZOOM = 0.72; // <1 = bigger in the card

type FaceMaterial = Material & {
  wireframe?: boolean;
  albedoColor?: Color3;
  diffuseColor?: Color3;
  emissiveColor?: Color3;
  disableLighting?: boolean;
};
type EdgeMesh = {
  enableEdgesRendering?: (epsilon?: number) => void;
  edgesColor?: Color4;
  edgesWidth?: number;
};

export function ModelPanel(): JSX.Element {
  const onSceneReady = ({ camera, meshes }: LiveWellSceneContext) => {
    for (const m of meshes) {
      const mat = m.material as FaceMaterial | null;
      if (mat) {
        mat.wireframe = false;
        if ('albedoColor' in mat) mat.albedoColor = FACE_GREY;
        if ('diffuseColor' in mat) mat.diffuseColor = FACE_GREY;
        if ('emissiveColor' in mat) mat.emissiveColor = FACE_GREY;
        if ('disableLighting' in mat) mat.disableLighting = true;
      }
      const em = m as unknown as EdgeMesh;
      em.enableEdgesRendering?.(EDGES_EPSILON);
      em.edgesColor = EDGE_COLOR;
      em.edgesWidth = EDGES_WIDTH;
    }
    if (camera instanceof ArcRotateCamera) camera.radius *= ZOOM; // bigger
  };

  return (
    <LiveWell
      glbUrl={EMBEDDED_TUSK_GLB_URL}
      staticSrc="/lifecycle/model.svg"
      staticAlt="A walrus tusk rendered as a wireframe mesh"
      ariaLabel="A 3D walrus tusk shown as a low-poly wireframe mesh"
      testIdBase="lifecycle-well-model"
      offscreenPolicy="dispose"
      onSceneReady={onSceneReady}
    />
  );
}
