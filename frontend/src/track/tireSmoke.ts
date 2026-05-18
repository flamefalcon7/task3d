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
//
// Visibility note (post-manual-smoke fix): GPUParticleSystem without a
// particleTexture renders as undefined/blank or tiny untextured quads. We
// generate a soft radial-gradient sprite at runtime via DynamicTexture so
// the smoke reads as puffy clouds rather than invisible/blocky additives.
// Switched to standard alpha blend (was additive) so the smoke is opaque
// against the bright bloom-enhanced track instead of getting washed out.

// --- SIZING (single source of truth) ---
const REAR_AXLE_HALF_TRACK = 0.35;     // L/R wheel separation, matches skidMarks.ts
const WHEEL_OFFSET = 0.5;              // along car-forward; matches skidMarks.ts (positive = in front of pivot)
const SMOKE_Y_OFFSET = 0.6;            // above the wheel hub so smoke isn't hidden under the car body

// --- PARTICLE TUNABLES ---
const SMOKE_CAPACITY = 5000;           // per emitter; well under modern GPU budget
const SMOKE_RATE_MAX = 100;            // particles/sec at full drift — halved for a more subtle plume
// Babylon's lifetime is in the particle-sim time base; with the default
// updateSpeed=0.01, a "lifetime" of 0.2 maps to roughly 0.4-0.5 REAL
// seconds of visible particle life. Empirically the previous 0.4-0.7
// settings produced ~1-2 real seconds of visible smoke at the car
// position, which read as "car keeps smoking" after Space release because
// the camera follows the car and the smoke barely moves before fading.
// 0.15-0.3 caps the post-release visual tail to ~0.6s — fast enough
// that releasing Space looks like an immediate cut, not a fade.
const SMOKE_MIN_LIFETIME_S = 0.15;
const SMOKE_MAX_LIFETIME_S = 0.3;
// IMPORTANT: minSize/maxSize are IGNORED whenever addSizeGradient() is
// called below. Babylon's GPUParticleSystem uses the size gradient as the
// authoritative size override — the min/max base values become dead code.
// Visible particle size is controlled ENTIRELY by SMOKE_SIZE_BIRTH /
// SMOKE_SIZE_DEATH. We keep these values set for documentation purposes
// (so the file reads as a complete particle config) but tweaking them
// has zero visual effect — adjust the gradient constants instead.
const SMOKE_MIN_SIZE = 0.25;
const SMOKE_MAX_SIZE = 0.45;
// Color/alpha gradient over particle lifetime — used via addColorGradient
// rather than the static color1/color2/colorDead properties because in
// GPUParticleSystem (Babylon 9.x) the static properties don't interpolate
// alpha across the lifetime: particles stay fully opaque then pop out at
// end-of-life, which reads as "the smoke never disperses". Explicit
// gradient stops give the smooth fade-in → fade-out arc.
const SMOKE_COLOR_RGB: [number, number, number] = [0.88, 0.88, 0.92]; // off-white grey
// alpha at lifetime fractions [0, 0.15, 0.6, 1.0] — fast fade-in, hold, slow fade-out.
// Peak/mid lowered from 0.85/0.55 → 0.35/0.18 so the cloud reads as fine
// wispy mist (lots of translucent puffs layered) instead of chunky opaque
// blobs. Combined with the texture's soft radial-gradient sprite this
// gives the "細" / wispy feel the demo aesthetic needs.
const SMOKE_ALPHA_BIRTH = 0.0;
const SMOKE_ALPHA_PEAK = 0.35;
const SMOKE_ALPHA_MID = 0.18;
const SMOKE_ALPHA_DEATH = 0.0;
// These are the AUTHORITATIVE size constants — passed to addSizeGradient
// below, which overrides minSize/maxSize entirely. Values are absolute
// world units (not multipliers on minSize/maxSize).
const SMOKE_SIZE_BIRTH = 0.25;
const SMOKE_SIZE_DEATH = 0.7;
// Particle velocity envelope. UP gives the puff lift; BACK pushes it
// behind the car. Magnitudes amplified again because the new short
// lifetime (0.15-0.3) means particles need to MOVE FAST to read as a
// dispersing wake rather than a static puff at the wheel — at low
// velocity a 0.4-real-second life looks like a stationary blob fading
// in place.
const SMOKE_UP_MIN = 2.0;
const SMOKE_UP_MAX = 3.5;
const SMOKE_BACK_MIN = 3.0;
const SMOKE_BACK_MAX = 6.0;
// Threshold ramp: scale = clamp((|lateralSpeed| - threshold) / SMOKE_RAMP_WIDTH, 0, 1).
// Reaches full rate at (threshold + SMOKE_RAMP_WIDTH) — was originally (threshold × 2)
// which meant gentle drifts produced near-zero smoke even though skid marks were drawing.
const SMOKE_RAMP_WIDTH = 0.5;
// Soft radial-gradient sprite generated at scene init. 64×64 is plenty for a
// blurry smoke puff; data lives in a single DynamicTexture shared by both
// emitters (one allocation per scene, not per particle).
const SMOKE_TEXTURE_SIZE = 64;

import {
  Color4,
  DynamicTexture,
  GPUParticleSystem,
  ParticleSystem,
  Scene,
  Texture,
  Vector3,
} from '@babylonjs/core';

export interface TireSmoke {
  /**
   * Per-frame update.
   * @param drifting True iff the player is INTENTIONALLY drifting (handbrake
   *   held). Used as a hard gate on emission so smoke stops the instant the
   *   player releases Space, even though physics keeps yielding above-threshold
   *   lateralSpeed for a few frames afterwards as the car settles.
   */
  tick(
    carPosition: Vector3,
    carForward: Vector3,
    lateralSpeed: number,
    drifting: boolean,
  ): void;
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

  // Generate the smoke sprite once and share it across both emitters.
  // Soft radial gradient (white center → transparent edge) = puffy cloud.
  const smokeTexture = createSmokeTexture(scene);

  const emitters: [TireEmitter, TireEmitter] = [
    buildEmitter('tire-smoke-L', scene, smokeTexture),
    buildEmitter('tire-smoke-R', scene, smokeTexture),
  ];

  // Track per-emitter start/stop state so we only call start()/stop()
  // on transitions, not every frame. Repeated start()/stop() calls per
  // frame thrash Babylon's internal accumulator and can cause emission
  // hiccups. The systems begin STOPPED — they only run while drifting.
  let emitting = false;

  let disposed = false;

  function tick(
    carPosition: Vector3,
    carForward: Vector3,
    lateralSpeed: number,
    drifting: boolean,
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

    // Emission gated on BOTH the intentional-drift flag AND the lateral-speed
    // threshold. The flag is the load-bearing gate: without it, after the
    // player releases Space the car continues sliding (lateralSpeed stays
    // > threshold for ~0.5-1s as physics settles), so smoke would keep
    // spawning long after the player "stopped drifting" in their mental
    // model. The threshold is the additional cosmetic gate so straight-line
    // handbrake taps (which don't actually produce sideways slide) don't
    // emit smoke either.
    // Decide whether this frame should emit.
    let rate = 0;
    let shouldEmit = false;
    if (drifting) {
      const speedAboveThreshold = Math.abs(lateralSpeed) - lateralSpeedThreshold;
      const scale = Math.max(0, Math.min(1, speedAboveThreshold / SMOKE_RAMP_WIDTH));
      rate = scale * SMOKE_RATE_MAX;
      shouldEmit = rate > 0;
    }

    if (shouldEmit) {
      emitters[0].system.emitRate = rate;
      emitters[1].system.emitRate = rate;
      if (!emitting) {
        emitters[0].system.start();
        emitters[1].system.start();
        emitting = true;
      }
    } else if (emitting) {
      // Full stop on the GPU side — emitRate=0 alone left a barely-visible
      // residual stream in some Babylon versions because the emit
      // accumulator could still tick past 1 particle per pulse. stop()
      // sets the internal _stopped flag, which the shader honors
      // unambiguously. Existing in-flight particles continue their
      // lifecycle until lifetime expiry (handled by the GPU shader,
      // independent of emit state).
      emitters[0].system.stop();
      emitters[1].system.stop();
      emitting = false;
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const e of emitters) {
      e.system.stop();
      e.system.dispose();
      // anchor is a plain Vector3 — nothing scene-owned to release.
    }
    smokeTexture.dispose();
  }

  return { tick, dispose };
}

function createSmokeTexture(scene: Scene): DynamicTexture {
  // Soft white radial gradient on a transparent background. The fully
  // opaque inner pixel + falloff to alpha=0 at the edge gives particles
  // a puffy cloud shape rather than a hard square.
  const tex = new DynamicTexture(
    'smoke-flare',
    SMOKE_TEXTURE_SIZE,
    scene,
    false, // generateMipMaps — not needed for screen-aligned sprites
  );
  // hasAlpha must be true for the alpha channel to be honoured; without it
  // the texture is sampled RGB-only and the falloff becomes invisible.
  tex.hasAlpha = true;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const cx = SMOKE_TEXTURE_SIZE / 2;
  const gradient = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  // Softened from (1.0 → 0.7 → 0.0) to (0.7 → 0.4 → 0.0) so the sprite
  // itself has no fully-opaque pixel — the cloud reads as fine drifting
  // mist instead of hard white discs. Combined with the lowered SMOKE_ALPHA_*
  // gradient stops, particles overlap as translucent layers.
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SMOKE_TEXTURE_SIZE, SMOKE_TEXTURE_SIZE);
  tex.update();
  return tex;
}

function buildEmitter(
  name: string,
  scene: Scene,
  particleTexture: Texture,
): TireEmitter {
  const anchor = new Vector3(0, SMOKE_Y_OFFSET, 0);
  const system = new GPUParticleSystem(
    name,
    { capacity: SMOKE_CAPACITY },
    scene,
  );
  system.emitter = anchor;
  system.emitRate = 0; // gated on tick(); start() runs the pool
  system.particleTexture = particleTexture;

  system.minLifeTime = SMOKE_MIN_LIFETIME_S;
  system.maxLifeTime = SMOKE_MAX_LIFETIME_S;
  system.minSize = SMOKE_MIN_SIZE;
  system.maxSize = SMOKE_MAX_SIZE;

  // Lifetime-curve gradients (replaces static color1/color2/colorDead which
  // don't interpolate alpha across GPUParticleSystem lifetimes in this
  // Babylon release — caught during plan-006 manual smoke).
  const [r, g, b] = SMOKE_COLOR_RGB;
  system.addColorGradient(0.0, new Color4(r, g, b, SMOKE_ALPHA_BIRTH));
  system.addColorGradient(0.15, new Color4(r, g, b, SMOKE_ALPHA_PEAK));
  system.addColorGradient(0.6, new Color4(r, g, b, SMOKE_ALPHA_MID));
  system.addColorGradient(1.0, new Color4(r, g, b, SMOKE_ALPHA_DEATH));
  // Size grows over lifetime — small puff at the wheel, big puff as it
  // floats up + dissipates. Multiplies minSize/maxSize.
  system.addSizeGradient(0.0, SMOKE_SIZE_BIRTH);
  system.addSizeGradient(1.0, SMOKE_SIZE_DEATH);

  // Velocity envelope: predominantly up + slight backward push.
  system.direction1 = new Vector3(-0.2, SMOKE_UP_MIN, -SMOKE_BACK_MAX);
  system.direction2 = new Vector3(0.2, SMOKE_UP_MAX, -SMOKE_BACK_MIN);
  system.minEmitPower = 0.5;
  system.maxEmitPower = 1.2;
  // Leave updateSpeed at Babylon's documented default (0.01 from
  // BaseParticleSystem JSDoc). Earlier attempts at 1.0 made particles
  // die in a single frame (cloud "stuck" to the car); reverting to
  // default gives a particle-sim time base that, paired with the
  // lifetime/velocity/size tuning above, produces visible drift + fade.
  // Don't set system.updateSpeed explicitly — keep parity with the
  // BaseParticleSystem default so the constants here remain meaningful.

  // Standard alpha blending (was BLENDMODE_ADD). The additive mode gave a
  // glowing-haze look that got washed out by U2's bloom-enhanced lit areas.
  // Standard mode renders the smoke as opaque grey clouds — denser, more
  // legible against bright AND dark backgrounds.
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  return { system, anchor };
}
