import { type JSX } from 'react';
import {
  type AbstractMesh,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  GlowLayer,
  GPUParticleSystem,
  type Material,
  MeshBuilder,
  type Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

import { LiveWell, type LiveWellSceneContext } from '../../babylon/LiveWell';
import { EMBEDDED_TUSK_GLB_URL } from '../tuskModel';
import { landingWells } from '../../ux/tokens';

// IN-GAME lifecycle panel (U7) — the tusk dropped into a neutral game scene
// (ground tile + soft shadow) as a glowing collectible. The EMISSIVE GLOW is
// the primary spawn signal (works even where GPU particles aren't supported);
// the particle burst is enhancement. The entrance loops off the Babylon render
// clock so it pauses/tears down with the scene (no stray setInterval), and a
// burst is never restarted mid-flight. Neutral colors only — NOT Rage Racing.
const LOOP_PERIOD_S = 4; // > burst + glow ramp so start() never fires mid-burst
const BURST_DURATION_S = 0.7;
const MAX_FRAME_DELTA_S = 0.1;
const GLOW_BASE = 0.25;
const GLOW_PEAK = 0.75;
const EMISSIVE_BASE = 0.25;
const EMISSIVE_PEAK = 0.9;

interface SpawnBurst {
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

function radialSprite(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture('ingame-spark', size, scene, false);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

// GPU particles need WebGL2; return null (glow carries the spawn) when absent.
function createSpawnBurst(scene: Scene, color: Color3): SpawnBurst | null {
  if (!GPUParticleSystem.IsSupported) return null;
  const tex = radialSprite(scene);
  const ps = new GPUParticleSystem('ingame-spawn', { capacity: 800 }, scene);
  ps.particleTexture = tex;
  ps.emitter = new Vector3(0, 0, 0);
  ps.minEmitBox = new Vector3(-0.4, 0, -0.4);
  ps.maxEmitBox = new Vector3(0.4, 1.4, 0.4);
  ps.color1 = new Color4(color.r, color.g, color.b, 0.9);
  ps.color2 = new Color4(color.r, color.g, color.b, 0.6);
  ps.colorDead = new Color4(color.r, color.g, color.b, 0);
  ps.minSize = 0.04;
  ps.maxSize = 0.12;
  ps.minLifeTime = 0.3;
  ps.maxLifeTime = 0.6;
  ps.emitRate = 350;
  ps.direction1 = new Vector3(-0.6, 1.4, -0.6);
  ps.direction2 = new Vector3(0.6, 2.2, 0.6);
  ps.gravity = new Vector3(0, -1.2, 0);
  return {
    start: () => ps.start(),
    stop: () => ps.stop(),
    dispose: () => {
      ps.dispose();
      tex.dispose();
    },
  };
}

function setEmissive(material: Material | null, color: Color3, intensity: number): void {
  if (!material) return;
  const mat = material as Material & { emissiveColor?: Color3; emissiveIntensity?: number };
  if ('emissiveColor' in mat) mat.emissiveColor = color;
  if ('emissiveIntensity' in mat) mat.emissiveIntensity = intensity;
}

export function InGamePanel(): JSX.Element {
  const onSceneReady = ({ scene, meshes }: LiveWellSceneContext) => {
    const glowColor = Color3.FromHexString(landingWells.glow);

    // Neutral ground tile (near-black so it reads inside the black well) + soft shadow.
    const ground = MeshBuilder.CreateGround('ingame-ground', { width: 8, height: 8 }, scene);
    ground.position.y = -1.0;
    const groundMat = new StandardMaterial('ingame-ground-mat', scene);
    groundMat.diffuseColor = Color3.FromHexString('#15151A');
    groundMat.specularColor = new Color3(0, 0, 0);
    ground.material = groundMat;
    ground.receiveShadows = true;

    const dir = new DirectionalLight('ingame-dir', new Vector3(-0.5, -1, -0.4), scene);
    dir.position = new Vector3(3, 6, 3);
    dir.intensity = 1.2;
    const shadow = new ShadowGenerator(512, dir);
    shadow.useBlurExponentialShadowMap = true;
    meshes.forEach((m: AbstractMesh) => shadow.addShadowCaster(m));

    // Emissive glow = primary spawn read.
    const glow = new GlowLayer('ingame-glow', scene);
    glow.intensity = GLOW_BASE;
    const tuskMats = meshes.map((m) => m.material).filter((m): m is Material => Boolean(m));
    tuskMats.forEach((mat) => setEmissive(mat, glowColor, EMISSIVE_BASE));

    // Particle burst (enhancement; null when WebGL2/GPU particles unavailable).
    const burst = createSpawnBurst(scene, glowColor);

    // Loop driver on the render clock — pauses with the render loop, never a
    // stray timer. start() fires once per period; never mid-burst.
    let phase = 0;
    let bursting = false;
    let lastMs = performance.now();
    const obs = scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      const deltaS = Math.min((now - lastMs) / 1000, MAX_FRAME_DELTA_S);
      lastMs = now;
      phase = (phase + deltaS) % LOOP_PERIOD_S;
      const inBurst = phase < BURST_DURATION_S;
      if (inBurst && !bursting) {
        burst?.start();
        bursting = true;
      } else if (!inBurst && bursting) {
        burst?.stop();
        bursting = false;
      }
      const pulse = inBurst ? Math.sin((phase / BURST_DURATION_S) * Math.PI) : 0;
      glow.intensity = GLOW_BASE + pulse * GLOW_PEAK;
      // Tusk stays visible + glowing between bursts (baseline), pulses during.
      tuskMats.forEach((mat) => setEmissive(mat, glowColor, EMISSIVE_BASE + pulse * EMISSIVE_PEAK));
    });

    return () => {
      scene.onBeforeRenderObservable.remove(obs);
      burst?.dispose();
      glow.dispose();
      shadow.dispose();
    };
  };

  return (
    <LiveWell
      glbUrl={EMBEDDED_TUSK_GLB_URL}
      staticSrc="/lifecycle/in-game.svg"
      staticAlt="The tusk floating as a usable object in a neutral game scene"
      ariaLabel="A walrus tusk glowing as a collectible item in a small game scene"
      testIdBase="lifecycle-well-ingame"
      offscreenPolicy="dispose"
      onSceneReady={onSceneReady}
    />
  );
}
