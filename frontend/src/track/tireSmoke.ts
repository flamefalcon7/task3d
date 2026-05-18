// Plan-006 U7 — GPU tire-smoke particle plume from the rear wheels when the
// car drifts. Same lateral-speed gate as skidMarks (lateralSpeedThreshold);
// emission rate scales linearly with the magnitude above the threshold.
//
// Mirrors skidMarks.ts's structure:
//   - Hardcoded sizing constants at the TOP of the file (single source of
//     truth). BB derivation is intentionally avoided — Tripo GLB sub-meshes
//     return unreliable extents; project memory documents 2 failed attempts.
//   - Factory returns { tick, dispose }; no React, no scene-level globals.
//   - Two emitters (one per rear tire) created at init, never re-allocated.
//
// GPU particles vs CPU: at 5000 particles per side * 60fps the CPU cost of
// individually transforming particles dominates frame time. GPUParticleSystem
// keeps the simulation on the GPU. Fallback path documented below.

// --- SIZING (single source of truth) ---
const REAR_AXLE_HALF_TRACK = 0.35;     // L/R wheel separation, matches skidMarks.ts
const WHEEL_OFFSET = 0.5;              // along car-forward; matches skidMarks.ts (positive = in front of pivot)
const SMOKE_Y_OFFSET = 0.3;            // emit just above the road plane

// --- PARTICLE TUNABLES ---
const SMOKE_CAPACITY = 5000;           // per emitter; well under modern GPU budget
const SMOKE_RATE_MAX = 120;            // particles/sec at full drift
const SMOKE_MIN_LIFETIME_S = 0.4;
const SMOKE_MAX_LIFETIME_S = 0.7;      // short → fast disperse, low overdraw
const SMOKE_MIN_SIZE = 0.4;
const SMOKE_MAX_SIZE = 1.2;
const SMOKE_TINT: [number, number, number, number] = [0.7, 0.7, 0.7, 0.6]; // mid-grey, semi-transparent
const SMOKE_TINT_DEAD: [number, number, number, number] = [0.9, 0.9, 0.9, 0]; // fade to invisible white
// Particle velocity envelope. UP gives the puff lift; BACK pushes it
// behind the car as it scrolls past. Magnitudes are in scene units/sec.
const SMOKE_UP_MIN = 0.8;
const SMOKE_UP_MAX = 1.8;
const SMOKE_BACK_MIN = 0.3;
const SMOKE_BACK_MAX = 0.9;

import {
  Color4,
  GPUParticleSystem,
  ParticleSystem,
  Scene,
  Vector3,
} from '@babylonjs/core';

export interface TireSmoke {
  tick(carPosition: Vector3, carForward: Vector3, lateralSpeed: number): void;
  dispose(): void;
}

interface TireEmitter {
  system: GPUParticleSystem;
  // Vector3 emitter: GPUParticleSystem.emitter accepts a position vector
  // directly. Mutating its x/y/z in place keeps allocation flat in the
  // hot path (vs newing a Vector3 every frame).
  anchor: Vector3;
}

export function createTireSmoke(
  scene: Scene,
  lateralSpeedThreshold: number,
): TireSmoke {
  // GPUParticleSystem requires WebGL2. Headless test envs (and very old
  // browsers) return false from the static IsSupported getter — in that
  // case return a no-op shim so the scene still runs and the driver just
  // doesn't get smoke. Logged once at startup so the absence is debuggable.
  if (!GPUParticleSystem.IsSupported) {
    // eslint-disable-next-line no-console
    console.warn(
      '[tireSmoke] GPUParticleSystem.IsSupported === false; ' +
        'smoke disabled (WebGL2 unavailable).',
    );
    return {
      tick: () => {},
      dispose: () => {},
    };
  }

  const emitters: [TireEmitter, TireEmitter] = [
    buildEmitter('tire-smoke-L', scene),
    buildEmitter('tire-smoke-R', scene),
  ];

  // Both systems run continuously; emitRate=0 when below threshold means
  // no new particles enter the pool, but in-flight ones still render until
  // they expire (gives a natural fade-out when the drift ends).
  emitters[0].system.start();
  emitters[1].system.start();

  let disposed = false;

  function tick(
    carPosition: Vector3,
    carForward: Vector3,
    lateralSpeed: number,
  ): void {
    if (disposed) return;

    // "Right" in XZ for left-handed Babylon: (forward.z, 0, -forward.x).
    const rightX = carForward.z;
    const rightZ = -carForward.x;

    // Axle center, offset along car-forward to match skidMarks anchor.
    const axleX = carPosition.x + carForward.x * WHEEL_OFFSET;
    const axleZ = carPosition.z + carForward.z * WHEEL_OFFSET;

    // Left wheel anchor.
    emitters[0].anchor.x = axleX - rightX * REAR_AXLE_HALF_TRACK;
    emitters[0].anchor.y = SMOKE_Y_OFFSET;
    emitters[0].anchor.z = axleZ - rightZ * REAR_AXLE_HALF_TRACK;
    // Right wheel anchor.
    emitters[1].anchor.x = axleX + rightX * REAR_AXLE_HALF_TRACK;
    emitters[1].anchor.y = SMOKE_Y_OFFSET;
    emitters[1].anchor.z = axleZ + rightZ * REAR_AXLE_HALF_TRACK;

    // Linear scale from 0 at threshold to 1 at 2× threshold; clamped.
    // Drifts harder than 2× threshold all max out the rate.
    const speedAboveThreshold = Math.abs(lateralSpeed) - lateralSpeedThreshold;
    const scale = Math.max(0, Math.min(1, speedAboveThreshold / lateralSpeedThreshold));
    const rate = scale * SMOKE_RATE_MAX;
    emitters[0].system.emitRate = rate;
    emitters[1].system.emitRate = rate;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const e of emitters) {
      e.system.stop();
      e.system.dispose();
      // anchor is a plain Vector3 — nothing scene-owned to release.
    }
  }

  return { tick, dispose };
}

function buildEmitter(name: string, scene: Scene): TireEmitter {
  const anchor = new Vector3(0, SMOKE_Y_OFFSET, 0);
  const system = new GPUParticleSystem(
    name,
    { capacity: SMOKE_CAPACITY },
    scene,
  );
  system.emitter = anchor;
  system.emitRate = 0; // gated on tick(); start() runs the pool

  system.minLifeTime = SMOKE_MIN_LIFETIME_S;
  system.maxLifeTime = SMOKE_MAX_LIFETIME_S;
  system.minSize = SMOKE_MIN_SIZE;
  system.maxSize = SMOKE_MAX_SIZE;

  system.color1 = new Color4(...SMOKE_TINT);
  system.color2 = new Color4(...SMOKE_TINT);
  system.colorDead = new Color4(...SMOKE_TINT_DEAD);

  // Velocity envelope: predominantly up + slight backward push.
  system.direction1 = new Vector3(-0.2, SMOKE_UP_MIN, -SMOKE_BACK_MAX);
  system.direction2 = new Vector3(0.2, SMOKE_UP_MAX, -SMOKE_BACK_MIN);
  system.minEmitPower = 0.5;
  system.maxEmitPower = 1.2;
  system.updateSpeed = 0.01;

  // Additive blending picks up bloom from U2 — the smoke reads as glowing
  // haze rather than a flat sprite, which matches the Art-of-Rally feel.
  system.blendMode = ParticleSystem.BLENDMODE_ADD;

  return { system, anchor };
}
