import { type JSX } from 'react';
import { ArcRotateCamera, Color3, type Material } from '@babylonjs/core';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { EMBEDDED_TUSK_GLB_URL } from '../tuskModel';

// MODEL lifecycle panel (U5) — the tusk rendered as a full dark wireframe
// ("blueprint" of the low-poly mesh) on the light-grey card. No solid/wireframe
// split anymore, so the world-X clip-plane concern is gone and the model can do
// a normal full turntable (LiveWell's default auto-rotate).
const WIRE_COLOR = new Color3(0.1, 0.1, 0.1);
// <1 zooms the camera in so the model reads bigger in the small card.
const ZOOM = 0.72;

type WireMaterial = Material & {
  wireframe?: boolean;
  albedoColor?: Color3;
  diffuseColor?: Color3;
  emissiveColor?: Color3;
  disableLighting?: boolean;
};

export function ModelPanel(): JSX.Element {
  const onSceneReady = ({ camera, meshes }: LiveWellSceneContext) => {
    for (const m of meshes) {
      const mat = m.material as WireMaterial | null;
      if (!mat) continue;
      mat.wireframe = true;
      // Make the wireframe lines a flat dark regardless of lighting so they read
      // crisply on the light-grey background.
      if ('albedoColor' in mat) mat.albedoColor = WIRE_COLOR;
      if ('diffuseColor' in mat) mat.diffuseColor = WIRE_COLOR;
      if ('emissiveColor' in mat) mat.emissiveColor = WIRE_COLOR;
      if ('disableLighting' in mat) mat.disableLighting = true;
    }
    if (camera instanceof ArcRotateCamera) camera.radius *= ZOOM; // bigger
  };

  return (
    <LiveWell
      glbUrl={EMBEDDED_TUSK_GLB_URL}
      staticSrc="/lifecycle/model.svg"
      staticAlt="A walrus tusk rendered as a wireframe mesh"
      ariaLabel="A 3D walrus tusk shown as a wireframe mesh"
      testIdBase="lifecycle-well-model"
      offscreenPolicy="dispose"
      onSceneReady={onSceneReady}
    />
  );
}
