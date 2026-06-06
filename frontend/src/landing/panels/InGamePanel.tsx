import { type JSX } from 'react';
import {
  type AbstractMesh,
  type AssetContainer,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  GPUParticleSystem,
  LoadAssetContainerAsync,
  type Material,
  MeshBuilder,
  type Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { EMBEDDED_TUSK_GLB_URL } from '../tuskModel';

// IN-GAME lifecycle panel (U7) — a tiny game vignette: a monster (the
// walrus-tusk model) is struck, dies in a burst, and drops a tusk reward that
// pops in with a sparkle. Loops on the render clock. Colors read on the
// light-grey card (no #FF4500 — panels stay accent-free).
const MONSTER_GLB_URL = '/models/tusk3d/monster.glb';
const GROUND_HEX = '#E0DCD2';
const HIT_COLOR = new Color3(0.6, 0.18, 0.16); // muted red flash on the monster
const DEATH_RGB = new Color4(0.32, 0.3, 0.3, 1); // smoke burst
const REWARD_RGB = new Color4(0.79, 0.63, 0.15, 1); // gold sparkle

// Loop phases (seconds).
const T_ALIVE = 1.3;
const T_KILL = 0.5;
const T_REWARD = 1.7;
const T_REST = 0.5;
const PERIOD = T_ALIVE + T_KILL + T_REWARD + T_REST;
const MAX_FRAME_DELTA_S = 0.1;
const REWARD_DROP_FROM = 2.2;

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
  const ps = new GPUParticleSystem(`ingame-burst-${up}`, { capacity: 600 }, scene);
  ps.particleTexture = tex;
  ps.emitter = new Vector3(0, 0.3, 0);
  ps.minEmitBox = new Vector3(-0.3, 0, -0.3);
  ps.maxEmitBox = new Vector3(0.3, 0.5, 0.3);
  ps.color1 = color;
  ps.color2 = color;
  ps.colorDead = new Color4(color.r, color.g, color.b, 0);
  ps.minSize = 0.05;
  ps.maxSize = 0.14;
  ps.minLifeTime = 0.25;
  ps.maxLifeTime = 0.55;
  ps.emitRate = 300;
  ps.direction1 = new Vector3(-0.8, up, -0.8);
  ps.direction2 = new Vector3(0.8, up + 0.8, 0.8);
  ps.gravity = new Vector3(0, -2, 0);
  return { start: () => ps.start(), stop: () => ps.stop(), dispose: () => ps.dispose() };
}

function setEmissive(meshes: AbstractMesh[], color: Color3): void {
  for (const m of meshes) {
    const mat = m.material as (Material & { emissiveColor?: Color3 }) | null;
    if (mat && 'emissiveColor' in mat) mat.emissiveColor = color;
  }
}

export function InGamePanel(): JSX.Element {
  const onSceneReady = ({ scene, camera, meshes }: LiveWellSceneContext) => {
    let cancelled = false;

    // Ground + soft shadow.
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
    meshes.forEach((m) => shadow.addShadowCaster(m));

    // Monster = the meshes LiveWell loaded. Group under a pivot for scale/flash.
    const monster = new TransformNode('ingame-monster', scene);
    const baseEmissive = new Color3(0, 0, 0);
    for (const m of meshes) {
      m.setParent(monster);
    }
    setEmissive(meshes, baseEmissive);
    if (camera && 'radius' in camera) {
      (camera as unknown as { radius: number }).radius *= 1.35; // headroom for the drop
    }

    // VFX
    const tex = radialSprite(scene);
    const deathBurst = createBurst(scene, tex, DEATH_RGB, 1.6);
    const rewardBurst = createBurst(scene, tex, REWARD_RGB, 2.4);

    // Reward tusk — loaded async, parented to a pivot, hidden until the drop.
    const reward = new TransformNode('ingame-reward', scene);
    reward.setEnabled(false);
    let rewardMeshes: AbstractMesh[] = [];
    let rewardContainer: AssetContainer | null = null;
    void (async () => {
      try {
        const c = await LoadAssetContainerAsync(EMBEDDED_TUSK_GLB_URL, scene, {
          pluginExtension: '.glb',
        });
        if (cancelled || scene.isDisposed) {
          c.dispose();
          return;
        }
        c.addAllToScene();
        rewardContainer = c;
        rewardMeshes = c.meshes.filter(
          (m) => typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
        );
        for (const m of rewardMeshes) {
          m.setParent(reward);
          shadow.addShadowCaster(m);
        }
        reward.scaling.setAll(0.7);
      } catch {
        /* reward is optional flourish; ignore load failure */
      }
    })();

    // Phase machine on the render clock.
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
        monster.setEnabled(true);
        monster.scaling.setAll(1);
        monster.rotation.y += dt * 0.6;
        setEmissive(meshes, baseEmissive);
        reward.setEnabled(false);
      } else if (stage === 'kill') {
        const k = (phase - T_ALIVE) / T_KILL; // 0..1
        // flash red, then shrink away
        setEmissive(meshes, HIT_COLOR.scale(1 - k));
        monster.scaling.setAll(Math.max(0.001, 1 - k));
        if (prev !== 'kill') deathBurst?.start();
      } else if (stage === 'reward') {
        monster.setEnabled(false);
        deathBurst?.stop();
        const r = (phase - T_ALIVE - T_KILL) / T_REWARD; // 0..1
        reward.setEnabled(true);
        // ease-out drop with a small settle bounce
        const ease = 1 - Math.pow(1 - Math.min(r * 1.25, 1), 3);
        const bounce = r > 0.8 ? Math.sin((r - 0.8) * Math.PI * 5) * 0.08 * (1 - r) : 0;
        reward.position.y = REWARD_DROP_FROM * (1 - ease) + bounce;
        reward.rotation.y += dt * 1.2;
        if (prev !== 'reward') rewardBurst?.start();
      } else {
        rewardBurst?.stop();
        reward.setEnabled(false);
        monster.setEnabled(false);
      }
      prev = stage;
    });

    return () => {
      cancelled = true;
      scene.onBeforeRenderObservable.remove(obs);
      deathBurst?.dispose();
      rewardBurst?.dispose();
      tex.dispose();
      rewardContainer?.dispose();
      reward.dispose();
      monster.dispose();
      shadow.dispose();
    };
  };

  return (
    <LiveWell
      glbUrl={MONSTER_GLB_URL}
      staticSrc="/lifecycle/in-game.svg"
      staticAlt="A monster dropping a tusk reward when defeated in a game scene"
      ariaLabel="A game scene: a monster is defeated and drops a tusk as a reward"
      testIdBase="lifecycle-well-ingame"
      offscreenPolicy="dispose"
      autoRotate={false}
      onSceneReady={onSceneReady}
    />
  );
}
