import { type JSX } from 'react';
import {
  type AbstractMesh,
  Color3,
  DirectionalLight,
  MeshBuilder,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { EMBEDDED_TUSK_GLB_URL } from '../tuskModel';

// IN-GAME lifecycle panel (U7) — the tusk as a usable game object: it sits on a
// neutral ground tile with a soft contact shadow (so it reads as "in a scene",
// not floating) and slowly turntables (LiveWell auto-rotate). Light-grey card,
// no glow/particles (those needed a dark well; dropped for the cards direction).
const GROUND_HEX = '#E0DCD2';

export function InGamePanel(): JSX.Element {
  const onSceneReady = ({ scene, meshes }: LiveWellSceneContext) => {
    // Neutral ground tile + soft shadow so the tusk reads as standing in a scene.
    const ground = MeshBuilder.CreateGround('ingame-ground', { width: 8, height: 8 }, scene);
    ground.position.y = -1.0;
    const groundMat = new StandardMaterial('ingame-ground-mat', scene);
    groundMat.diffuseColor = Color3.FromHexString(GROUND_HEX);
    groundMat.specularColor = new Color3(0, 0, 0);
    ground.material = groundMat;
    ground.receiveShadows = true;

    const dir = new DirectionalLight('ingame-dir', new Vector3(-0.5, -1, -0.4), scene);
    dir.position = new Vector3(3, 6, 3);
    dir.intensity = 1.0;
    const shadow = new ShadowGenerator(512, dir);
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurKernel = 32;
    meshes.forEach((m: AbstractMesh) => shadow.addShadowCaster(m));

    return () => {
      shadow.dispose();
    };
  };

  return (
    <LiveWell
      glbUrl={EMBEDDED_TUSK_GLB_URL}
      staticSrc="/lifecycle/in-game.svg"
      staticAlt="The tusk as a usable object in a neutral game scene"
      ariaLabel="A walrus tusk as a collectible item standing in a small game scene"
      testIdBase="lifecycle-well-ingame"
      offscreenPolicy="dispose"
      onSceneReady={onSceneReady}
    />
  );
}
