import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { LiveWellProps, LiveWellSceneContext } from '../../babylon/LiveWell';

const h = vi.hoisted(() => ({
  captured: null as LiveWellProps | null,
  hexes: [] as string[],
  particleSupported: true,
  psStart: vi.fn(),
  psStop: vi.fn(),
  psDispose: vi.fn(),
  glowDispose: vi.fn(),
  shadowDispose: vi.fn(),
  shadowCasters: 0,
  groundCreate: vi.fn(),
}));

vi.mock('@babylonjs/core', () => {
  class Color3 {
    constructor(
      public r = 0,
      public g = 0,
      public b = 0,
    ) {}
    static FromHexString(hex: string) {
      h.hexes.push(hex);
      return new Color3(0.9, 0.9, 0.85);
    }
  }
  class Color4 {
    constructor(
      public r = 0,
      public g = 0,
      public b = 0,
      public a = 1,
    ) {}
  }
  class Vector3 {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
    ) {}
  }
  class DirectionalLight {
    position = new Vector3();
    intensity = 1;
  }
  class ShadowGenerator {
    useBlurExponentialShadowMap = false;
    addShadowCaster() {
      h.shadowCasters++;
    }
    dispose() {
      h.shadowDispose();
    }
  }
  class GlowLayer {
    intensity = 0;
    dispose() {
      h.glowDispose();
    }
  }
  class StandardMaterial {
    diffuseColor: unknown = null;
    specularColor: unknown = null;
  }
  class DynamicTexture {
    hasAlpha = false;
    getContext() {
      return {
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '',
        fillRect: () => {},
      };
    }
    update() {}
    dispose() {}
  }
  class GPUParticleSystem {
    static get IsSupported() {
      return h.particleSupported;
    }
    particleTexture: unknown = null;
    emitter: unknown = null;
    minEmitBox: unknown = null;
    maxEmitBox: unknown = null;
    color1: unknown = null;
    color2: unknown = null;
    colorDead: unknown = null;
    minSize = 0;
    maxSize = 0;
    minLifeTime = 0;
    maxLifeTime = 0;
    emitRate = 0;
    direction1: unknown = null;
    direction2: unknown = null;
    gravity: unknown = null;
    start() {
      h.psStart();
    }
    stop() {
      h.psStop();
    }
    dispose() {
      h.psDispose();
    }
  }
  const MeshBuilder = {
    CreateGround: () => {
      h.groundCreate();
      return { position: { y: 0 }, material: null as unknown, receiveShadows: false };
    },
  };
  return {
    Color3,
    Color4,
    Vector3,
    DirectionalLight,
    ShadowGenerator,
    GlowLayer,
    StandardMaterial,
    DynamicTexture,
    GPUParticleSystem,
    MeshBuilder,
  };
});

vi.mock('../../babylon/LiveWell', () => ({
  LiveWell: (props: LiveWellProps) => {
    h.captured = props;
    return <div data-testid={props.testIdBase} />;
  },
}));

import { InGamePanel } from './InGamePanel';

function fakeContext() {
  let frameCb: (() => void) | null = null;
  const material = { emissiveColor: null as unknown, emissiveIntensity: 0 };
  const mesh = { name: 'tusk', material };
  const scene = {
    onBeforeRenderObservable: {
      add: (cb: () => void) => {
        frameCb = cb;
        return cb;
      },
      remove: vi.fn(),
    },
  } as unknown as LiveWellSceneContext['scene'];
  const ctx = {
    scene,
    camera: {} as LiveWellSceneContext['camera'],
    meshes: [mesh as unknown as LiveWellSceneContext['meshes'][number]],
    container: {} as LiveWellSceneContext['container'],
  };
  return { ctx, material, fireFrame: () => frameCb?.() };
}

let clock = 0;

beforeEach(() => {
  h.captured = null;
  h.hexes = [];
  h.particleSupported = true;
  h.shadowCasters = 0;
  [h.psStart, h.psStop, h.psDispose, h.glowDispose, h.shadowDispose, h.groundCreate].forEach((f) =>
    f.mockReset(),
  );
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InGamePanel', () => {
  it('drives LiveWell with dispose policy + ingame testid + static fallback', () => {
    render(<InGamePanel />);
    expect(h.captured?.offscreenPolicy).toBe('dispose');
    expect(h.captured?.testIdBase).toBe('lifecycle-well-ingame');
    expect(h.captured?.staticSrc).toBe('/lifecycle/in-game.svg');
  });

  it('builds a neutral scene with ground + shadow and a glowing tusk', () => {
    render(<InGamePanel />);
    const { ctx, material } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(h.groundCreate).toHaveBeenCalled();
    expect(h.shadowCasters).toBe(1);
    // Emissive glow applied as the primary spawn signal (tusk glows).
    expect(material.emissiveColor).not.toBeNull();
    // Glow color is neutral, never the D-044 accent.
    expect(h.hexes).not.toContain('#FF4500');
  });

  it('AE4 — start() fires once per burst and the entrance loops (>=2 bursts)', () => {
    render(<InGamePanel />);
    const { ctx, fireFrame } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    for (let i = 0; i < 60; i++) {
      clock += 100; // +0.1s/frame (matches the panel's frame-delta cap)
      fireFrame();
    }
    expect(h.psStart.mock.calls.length).toBeGreaterThanOrEqual(2); // looped
    expect(h.psStart.mock.calls.length).toBe(h.psStop.mock.calls.length); // balanced, no mid-burst restart
  });

  it('falls back to glow-only when GPU particles are unsupported (no crash, still glows)', () => {
    h.particleSupported = false;
    render(<InGamePanel />);
    const { ctx, material, fireFrame } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    fireFrame();
    expect(h.psStart).not.toHaveBeenCalled();
    expect(material.emissiveColor).not.toBeNull(); // glow still carries the spawn
  });

  it('cleanup removes the observer and disposes particles, glow, shadow', () => {
    render(<InGamePanel />);
    const { ctx } = fakeContext();
    const cleanupFn = h.captured?.onSceneReady?.(ctx) as (() => void) | undefined;
    cleanupFn?.();
    expect(ctx.scene.onBeforeRenderObservable.remove).toHaveBeenCalled();
    expect(h.psDispose).toHaveBeenCalled();
    expect(h.glowDispose).toHaveBeenCalled();
    expect(h.shadowDispose).toHaveBeenCalled();
  });
});
