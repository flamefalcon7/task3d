import { type JSX } from 'react';
import {
  type AbstractMesh,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  GPUParticleSystem,
  type Material,
  MeshBuilder,
  ParticleSystem,
  type Scene,
  ShadowGenerator,
  Vector3,
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';
import { ShadowOnlyMaterial } from '@babylonjs/materials/shadowOnly/shadowOnlyMaterial';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { MONSTER_GLB_URL } from '../tuskModel';

// IN-GAME lifecycle panel (U7) — a tiny game vignette on a game-editor grid
// floor: a dark monster is struck (red flash + burst), then turns into a gold
// tusk "reward" with a sparkle, then respawns. Loops on the render clock. The
// single model is recolored rather than swapped (robust — no reparenting),
// reading as "defeat the monster → claim the tusk". Colors read on light grey.
const GROUND_HEX = '#E0DCD2';
const MONSTER_COLOR = new Color3(0.21, 0.19, 0.2); // dark silhouette
const REWARD_COLOR = new Color3(0.82, 0.6, 0.12); // gold treasure tusk
const HIT_COLOR = new Color3(0.66, 0.14, 0.11); // red hit flash (emissive)
// STANDARD (alpha) blend + deep colors so the VFX reads on the LIGHT card —
// additive (the GPU-particle default) would just wash into the bright bg.
const DEATH_RGB = new Color4(0.16, 0.13, 0.12, 1); // charcoal smoke
const REWARD_RGB = new Color4(0.86, 0.5, 0.04, 1); // amber-gold sparkle

const T_ALIVE = 1.2;
const T_KILL = 0.5;
const T_REWARD = 1.6;
const T_REST = 0.4;
const PERIOD = T_ALIVE + T_KILL + T_REWARD + T_REST;
const MAX_FRAME_DELTA_S = 0.1;

function radialSprite(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture('ingame-spark', size, scene, false);
  const c = tex.getContext();
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

interface Burst {
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

function createBurst(scene: Scene, tex: DynamicTexture, color: Color4, up: number): Burst | null {
  if (!GPUParticleSystem.IsSupported) return null;
  let ps: GPUParticleSystem;
  try {
    ps = new GPUParticleSystem(`ingame-burst-${up}`, { capacity: 600 }, scene);
  } catch {
    return null; // some GPUs report IsSupported but fail to create — never break the scene
  }
  ps.particleTexture = tex;
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.emitter = new Vector3(0, 0.4, 0);
  ps.minEmitBox = new Vector3(-0.3, 0, -0.3);
  ps.maxEmitBox = new Vector3(0.3, 0.6, 0.3);
  ps.color1 = color;
  ps.color2 = color;
  ps.colorDead = new Color4(color.r, color.g, color.b, 0);
  ps.minSize = 0.05;
  ps.maxSize = 0.15;
  ps.minLifeTime = 0.25;
  ps.maxLifeTime = 0.6;
  ps.emitRate = 320;
  ps.direction1 = new Vector3(-0.9, up, -0.9);
  ps.direction2 = new Vector3(0.9, up + 0.8, 0.9);
  ps.gravity = new Vector3(0, -2.2, 0);
  return { start: () => ps.start(), stop: () => ps.stop(), dispose: () => ps.dispose() };
}

type TintMaterial = Material & {
  albedoColor?: Color3;
  diffuseColor?: Color3;
  emissiveColor?: Color3;
};

function tint(meshes: AbstractMesh[], albedo: Color3, emissive: Color3): void {
  for (const m of meshes) {
    const mat = m.material as TintMaterial | null;
    if (!mat) continue;
    if ('albedoColor' in mat) mat.albedoColor = albedo;
    if ('diffuseColor' in mat) mat.diffuseColor = albedo;
    if ('emissiveColor' in mat) mat.emissiveColor = emissive;
  }
}

const BLACK = new Color3(0, 0, 0);

export function InGamePanel(): JSX.Element {
  const onSceneReady = ({ scene, meshes }: LiveWellSceneContext) => {
    // Game-editor grid floor + a shadow-only ground for the contact shadow.
    const dir = new DirectionalLight('ingame-dir', new Vector3(-0.5, -1, -0.4), scene);
    dir.position = new Vector3(3, 6, 3);
    dir.intensity = 1.0;
    const shadow = new ShadowGenerator(512, dir);
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurKernel = 32;
    meshes.forEach((m) => shadow.addShadowCaster(m));

    const gridGround = MeshBuilder.CreateGround('ingame-grid', { width: 10, height: 10 }, scene);
    gridGround.position.y = -1.02;
    const grid = new GridMaterial('ingame-grid-mat', scene);
    grid.mainColor = Color3.FromHexString(GROUND_HEX);
    grid.lineColor = Color3.FromHexString('#6E6A62'); // clearly-visible game-editor lines
    grid.opacity = 0.95;
    grid.gridRatio = 0.4;
    grid.majorUnitFrequency = 4;
    grid.minorUnitVisibility = 0.6;
    gridGround.material = grid;

    const shadowGround = MeshBuilder.CreateGround('ingame-shadow', { width: 10, height: 10 }, scene);
    shadowGround.position.y = -1.0;
    const shadowMat = new ShadowOnlyMaterial('ingame-shadow-mat', scene);
    shadowMat.activeLight = dir;
    shadowMat.alpha = 0.22;
    shadowGround.material = shadowMat;
    shadowGround.receiveShadows = true;

    tint(meshes, MONSTER_COLOR, BLACK);

    // VFX is enhancement — if anything in the GPU-particle path fails, the
    // monster + grid + recolor loop must still render (a throw here would block
    // LiveWell's reveal and leave the well blank).
    let tex: DynamicTexture | null = null;
    let deathBurst: Burst | null = null;
    let rewardBurst: Burst | null = null;
    try {
      tex = radialSprite(scene);
      deathBurst = createBurst(scene, tex, DEATH_RGB, 1.6);
      rewardBurst = createBurst(scene, tex, REWARD_RGB, 2.4);
    } catch {
      /* no VFX on this device */
    }

    let phase = 0;
    let prev = 'rest';
    const obs = scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, MAX_FRAME_DELTA_S);
      phase = (phase + dt) % PERIOD;

      let stage: 'alive' | 'kill' | 'reward' | 'rest';
      if (phase < T_ALIVE) stage = 'alive';
      else if (phase < T_ALIVE + T_KILL) stage = 'kill';
      else if (phase < T_ALIVE + T_KILL + T_REWARD) stage = 'reward';
      else stage = 'rest';

      if (stage === 'alive') {
        tint(meshes, MONSTER_COLOR, BLACK);
      } else if (stage === 'kill') {
        const k = (phase - T_ALIVE) / T_KILL; // 0..1 — red flash fading
        tint(meshes, MONSTER_COLOR, HIT_COLOR.scale(1 - k));
        if (prev !== 'kill') deathBurst?.start();
      } else if (stage === 'reward') {
        deathBurst?.stop();
        tint(meshes, REWARD_COLOR, BLACK); // monster → gold tusk reward
        if (prev !== 'reward') rewardBurst?.start();
      } else {
        rewardBurst?.stop();
        tint(meshes, MONSTER_COLOR, BLACK);
      }
      prev = stage;
    });

    return () => {
      scene.onBeforeRenderObservable.remove(obs);
      deathBurst?.dispose();
      rewardBurst?.dispose();
      tex?.dispose();
      shadow.dispose();
    };
  };

  return (
    <LiveWell
      glbUrl={MONSTER_GLB_URL}
      staticSrc="/lifecycle/in-game.svg"
      staticAlt="A monster turning into a tusk reward when defeated in a game scene"
      ariaLabel="A game scene: a monster is defeated and becomes a tusk reward"
      testIdBase="lifecycle-well-ingame"
      offscreenPolicy="dispose"
      onSceneReady={onSceneReady}
    />
  );
}
