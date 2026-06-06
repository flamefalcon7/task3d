import { type JSX } from 'react';
import { ArcRotateCamera } from '@babylonjs/core';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { setupEdgesGradientSweep } from '../../babylon/edgesGradientSweep';
import { EMBEDDED_TUSK_GLB_URL } from '../tuskModel';

// MODEL lifecycle panel (U5) — the tusk shown half shaded-solid / half
// wireframe via edgesGradientSweep frozen at its midpoint. The sweep clip plane
// is WORLD-space along X, so a full camera turntable would push the cut edge-on
// (split collapses) and invert at 180°. We therefore disable LiveWell's
// turntable and oscillate the camera within a narrow frontal arc — the split
// reads at every angle (AE3).
const SPLIT_MIDPOINT = 0.5;
// Center the view roughly along world -Z so the world-X cut maps to a left/right
// split on screen; final framing is visual-tuned.
const OSCILLATION_CENTER_ALPHA = -Math.PI / 2;
const OSCILLATION_ARC = Math.PI / 6; // ±30° — never reaches the ±90° edge-on angle
const OSCILLATION_SPEED = 0.45; // phase rad/s
const MAX_FRAME_DELTA_S = 0.1;

export function ModelPanel(): JSX.Element {
  const onSceneReady = ({ scene, camera, meshes }: LiveWellSceneContext) => {
    const sweep = setupEdgesGradientSweep(scene, meshes);
    sweep.setProgress(SPLIT_MIDPOINT); // freeze the half/half cut

    // Bounded frontal oscillation (no full revolution).
    camera.alpha = OSCILLATION_CENTER_ALPHA;
    let phase = 0;
    let lastMs = performance.now();
    const obs = scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      const deltaS = Math.min((now - lastMs) / 1000, MAX_FRAME_DELTA_S);
      lastMs = now;
      phase += deltaS * OSCILLATION_SPEED;
      const cam = scene.activeCamera;
      const target = cam instanceof ArcRotateCamera ? cam : camera;
      target.alpha = OSCILLATION_CENTER_ALPHA + Math.sin(phase) * OSCILLATION_ARC;
    });

    return () => {
      scene.onBeforeRenderObservable.remove(obs);
      sweep.dispose();
    };
  };

  return (
    <LiveWell
      glbUrl={EMBEDDED_TUSK_GLB_URL}
      staticSrc="/lifecycle/model.svg"
      staticAlt="A walrus tusk shown half as a solid model, half as a wireframe mesh"
      ariaLabel="A 3D walrus tusk, one half shaded solid and the other half wireframe"
      testIdBase="lifecycle-well-model"
      offscreenPolicy="dispose"
      autoRotate={false}
      onSceneReady={onSceneReady}
    />
  );
}
