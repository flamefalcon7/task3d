import { describe, expect, it, vi } from 'vitest';

// Plan-006 U7 — tireSmoke unit tests. Mock the @babylonjs/core surface the
// module touches (Color4, GPUParticleSystem, ParticleSystem static const,
// TransformNode, Vector3) and assert emitter wiring + the gating logic
// around lateralSpeedThreshold. GPU buffer state isn't observable in jsdom,
// so we treat emitRate assignments as the contract for "particles emit".

const M = vi.hoisted(() => {
  class Vec3Mock {
    constructor(public x = 0, public y = 0, public z = 0) {}
  }
  return {
    Vec3Mock,
    gpuSystemCtor: vi.fn(),
    gpuSystemDispose: vi.fn(),
    dynamicTextureDispose: vi.fn(),
    // Toggle the static IsSupported getter per-test for fallback coverage.
    isSupported: true,
    // Capture every emitter instance the SUT creates so tests can assert
    // post-tick emitRate, start/stop calls, etc. Ordered: [L, R].
    emitters: [] as Array<{
      name: string;
      capacity: number;
      emitRate: number;
      emitter: unknown;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
      color1: unknown;
      color2: unknown;
      colorDead: unknown;
      direction1: unknown;
      direction2: unknown;
      minLifeTime: number;
      maxLifeTime: number;
      minSize: number;
      maxSize: number;
      minEmitPower: number;
      maxEmitPower: number;
      updateSpeed: number;
      blendMode: number;
    }>,
  };
});

vi.mock('@babylonjs/core', () => {
  class Color4 {
    constructor(public r = 0, public g = 0, public b = 0, public a = 0) {}
  }
  class GPUParticleSystem {
    name: string;
    capacity: number;
    emitRate = 0;
    emitter: unknown = null;
    color1: unknown = null;
    color2: unknown = null;
    colorDead: unknown = null;
    direction1: unknown = null;
    direction2: unknown = null;
    minLifeTime = 0;
    maxLifeTime = 0;
    minSize = 0;
    maxSize = 0;
    minEmitPower = 0;
    maxEmitPower = 0;
    updateSpeed = 0;
    blendMode = 0;
    particleTexture: unknown = null;
    addColorGradient = vi.fn();
    addSizeGradient = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn(() => M.gpuSystemDispose());
    constructor(
      name: string,
      options: { capacity: number },
      _scene: unknown,
    ) {
      this.name = name;
      this.capacity = options.capacity;
      M.gpuSystemCtor(name, options.capacity);
      M.emitters.push(this);
    }
    static get IsSupported() {
      return M.isSupported;
    }
  }
  const ParticleSystem = {
    BLENDMODE_ADD: 1 as const,
    BLENDMODE_STANDARD: 0 as const,
  };
  // Minimal DynamicTexture shim — getContext returns a canvas-like API the
  // SUT uses to draw a soft radial gradient. The shim accepts the calls but
  // doesn't render anything (jsdom has no canvas backing); the SUT just
  // assigns the texture instance to system.particleTexture.
  class DynamicTexture {
    hasAlpha = false;
    constructor(_name: string, _size: number, _scene: unknown, _mips?: boolean) {}
    getContext() {
      return {
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '' as string | CanvasGradient,
        fillRect: () => {},
      };
    }
    update() {}
    dispose() {
      M.dynamicTextureDispose();
    }
  }
  // Texture is referenced as a TYPE in tireSmoke.ts (buildEmitter parameter).
  // The runtime instance comes from DynamicTexture above, so this is just a
  // placeholder class for the import to resolve.
  class Texture {}
  return {
    Color4,
    DynamicTexture,
    GPUParticleSystem,
    ParticleSystem,
    Texture,
    Vector3: M.Vec3Mock,
    Scene: class {},
  };
});

import { createTireSmoke } from './tireSmoke';
import type { Scene, Vector3 } from '@babylonjs/core';

function fakeScene(): Scene {
  return {} as Scene;
}

const v3 = (x = 0, y = 0, z = 0): Vector3 =>
  new M.Vec3Mock(x, y, z) as unknown as Vector3;

function reset(): void {
  M.gpuSystemCtor.mockClear();
  M.gpuSystemDispose.mockClear();
  M.dynamicTextureDispose.mockClear();
  M.emitters.length = 0;
  M.isSupported = true;
}

describe('createTireSmoke', () => {
  it('creates two GPUParticleSystem emitters at expected capacity', () => {
    reset();
    createTireSmoke(fakeScene(), 1.5);
    expect(M.gpuSystemCtor).toHaveBeenCalledTimes(2);
    expect(M.emitters).toHaveLength(2);
    // Capacity is wired from the SMOKE_CAPACITY constant in tireSmoke.ts.
    // Both emitters must share the same capacity; if they diverge, an
    // accidental per-side override has crept in.
    expect(M.emitters[0]!.capacity).toBe(M.emitters[1]!.capacity);
    expect(M.emitters[0]!.capacity).toBeGreaterThan(0);
    // start() is NOT called at init anymore — the systems begin STOPPED
    // and only start() on the first frame the player actually drifts. This
    // ensures emitRate=0 isn't being tick-driven against a running system
    // (which left a residual emission stream in some Babylon versions).
    expect(M.emitters[0]!.start).not.toHaveBeenCalled();
    expect(M.emitters[1]!.start).not.toHaveBeenCalled();
  });

  it('emitRate stays 0 when drifting=false, even if |lateralSpeed| is high (Space released gate)', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    // Hard sideways slide BUT no handbrake — physics is still settling
    // after a recent drift, but the player has released Space. Smoke must
    // stop immediately to match the player's mental model of "I'm not
    // drifting anymore" — without this gate the cloud kept spawning for
    // ~1s while lateralSpeed bled off.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 5.0, false);
    expect(M.emitters[0]!.emitRate).toBe(0);
    expect(M.emitters[1]!.emitRate).toBe(0);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), -7.5, false);
    expect(M.emitters[0]!.emitRate).toBe(0);
  });

  it('emitRate stays 0 when |lateralSpeed| is at or below threshold', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 0, true);
    expect(M.emitters[0]!.emitRate).toBe(0);
    expect(M.emitters[1]!.emitRate).toBe(0);
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 1.5, true);
    expect(M.emitters[0]!.emitRate).toBe(0);
    expect(M.emitters[1]!.emitRate).toBe(0);
    // Below-threshold negative drift is also gated.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), -1.0, true);
    expect(M.emitters[0]!.emitRate).toBe(0);
  });

  it('emitRate scales above threshold and clamps at 2× threshold', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    // Just above threshold → small emit rate.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 1.6, true);
    const justAbove = M.emitters[0]!.emitRate;
    expect(justAbove).toBeGreaterThan(0);

    // At 2× threshold (3.0) → full SMOKE_RATE_MAX.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 3.0, true);
    const fullRate = M.emitters[0]!.emitRate;
    expect(fullRate).toBeGreaterThan(justAbove);

    // At 5× threshold → still clamped at full rate (no runaway emission).
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 7.5, true);
    expect(M.emitters[0]!.emitRate).toBe(fullRate);
  });

  it('positions L/R anchors symmetrically around the car-forward axis', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    // Car at origin, facing +Z. Right is +X.
    sm.tick(v3(0, 0, 0), v3(0, 0, 1), 2.0, true);
    const left = M.emitters[0]!.emitter as { x: number; y: number; z: number };
    const right = M.emitters[1]!.emitter as { x: number; y: number; z: number };
    // Mirrored across the car's longitudinal axis: left and right wheel X
    // offsets equal in magnitude, opposite in sign; Z offsets identical.
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.z).toBeCloseTo(right.z);
    // Both anchors sit at the same Y above the road.
    expect(left.y).toBe(right.y);
    expect(left.y).toBeGreaterThan(0);
  });

  it('repeated tick() calls do not allocate new emitters', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    expect(M.gpuSystemCtor).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 20; i++) {
      sm.tick(v3(0, 0, i), v3(0, 0, 1), i % 2 === 0 ? 0 : 3, true);
    }
    // Still only the two emitters created at init — no per-frame allocs.
    expect(M.gpuSystemCtor).toHaveBeenCalledTimes(2);
  });

  it('dispose() stops + disposes both particle systems', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    sm.dispose();
    expect(M.emitters[0]!.stop).toHaveBeenCalledTimes(1);
    expect(M.emitters[1]!.stop).toHaveBeenCalledTimes(1);
    expect(M.gpuSystemDispose).toHaveBeenCalledTimes(2);
  });

  it('dispose() is idempotent — second call does not double-dispose', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    sm.dispose();
    sm.dispose();
    expect(M.gpuSystemDispose).toHaveBeenCalledTimes(2);
  });

  it('tick() after dispose() is a no-op (no emitRate writes, no throw)', () => {
    reset();
    const sm = createTireSmoke(fakeScene(), 1.5);
    sm.dispose();
    // Capture the post-dispose emitRate (likely the last write from any
    // pre-dispose tick, or the init value 0). It should NOT change.
    const lastRate = M.emitters[0]!.emitRate;
    expect(() =>
      sm.tick(v3(0, 0, 0), v3(0, 0, 1), 10.0, true),
    ).not.toThrow();
    expect(M.emitters[0]!.emitRate).toBe(lastRate);
  });

  it('returns a silent no-op shim when GPUParticleSystem.IsSupported is false', () => {
    reset();
    M.isSupported = false;
    const sm = createTireSmoke(fakeScene(), 1.5);
    // No particle system constructed when the GPU path is unavailable.
    expect(M.gpuSystemCtor).not.toHaveBeenCalled();
    expect(() => sm.tick(v3(0, 0, 0), v3(0, 0, 1), 10, true)).not.toThrow();
    expect(() => sm.dispose()).not.toThrow();
  });
});
