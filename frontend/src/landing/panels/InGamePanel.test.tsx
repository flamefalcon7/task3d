import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { LiveWellProps, LiveWellSceneContext } from '../../babylon/LiveWell';

const h = vi.hoisted(() => ({
  captured: null as LiveWellProps | null,
  groundCreate: vi.fn(),
  shadowCtor: vi.fn(),
  shadowDispose: vi.fn(),
  particleCtor: vi.fn(),
  particleDispose: vi.fn(),
}));

vi.mock('@babylonjs/core', () => {
  class Color3 {
    constructor(
      public r = 0,
      public g = 0,
      public b = 0,
    ) {}
    static FromHexString() {
      return new Color3(0.8, 0.8, 0.75);
    }
    scale() {
      return new Color3(this.r, this.g, this.b);
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
    position: unknown = null;
    intensity = 1;
  }
  class ShadowGenerator {
    useBlurExponentialShadowMap = false;
    blurKernel = 1;
    constructor() {
      h.shadowCtor();
    }
    addShadowCaster() {}
    dispose() {
      h.shadowDispose();
    }
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
      return true;
    }
    blendMode = 0;
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
    constructor() {
      h.particleCtor();
    }
    start() {}
    stop() {}
    dispose() {
      h.particleDispose();
    }
  }
  class ParticleSystem {
    static BLENDMODE_STANDARD = 0;
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
    DynamicTexture,
    GPUParticleSystem,
    ParticleSystem,
    MeshBuilder,
  };
});

vi.mock('@babylonjs/materials/grid/gridMaterial', () => ({
  GridMaterial: class {
    mainColor: unknown = null;
    lineColor: unknown = null;
    opacity = 1;
    gridRatio = 1;
    majorUnitFrequency = 1;
    minorUnitVisibility = 1;
  },
}));
vi.mock('@babylonjs/materials/shadowOnly/shadowOnlyMaterial', () => ({
  ShadowOnlyMaterial: class {
    activeLight: unknown = null;
    alpha = 1;
  },
}));

vi.mock('../../babylon/LiveWell', () => ({
  LiveWell: (props: LiveWellProps) => {
    h.captured = props;
    return <div data-testid={props.testIdBase} />;
  },
}));

import { InGamePanel } from './InGamePanel';

function fakeContext() {
  let frameCb: (() => void) | null = null;
  const scene = {
    getEngine: () => ({ getDeltaTime: () => 700 }), // big step so the loop visits all phases
    onBeforeRenderObservable: {
      add: (cb: () => void) => {
        frameCb = cb;
        return cb;
      },
      remove: vi.fn(),
    },
  } as unknown as LiveWellSceneContext['scene'];
  const material = { albedoColor: null, diffuseColor: null, emissiveColor: null };
  const meshes = [{ material } as unknown as LiveWellSceneContext['meshes'][number]];
  const ctx = {
    scene,
    camera: {} as LiveWellSceneContext['camera'],
    meshes,
    container: {} as LiveWellSceneContext['container'],
  };
  return { ctx, material, fireFrame: () => frameCb?.() };
}

beforeEach(() => {
  h.captured = null;
  [h.groundCreate, h.shadowCtor, h.shadowDispose, h.particleCtor, h.particleDispose].forEach((f) =>
    f.mockReset(),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InGamePanel', () => {
  it('drives LiveWell with the monster model + dispose policy + ingame testid', () => {
    render(<InGamePanel />);
    expect(h.captured?.offscreenPolicy).toBe('dispose');
    expect(h.captured?.testIdBase).toBe('lifecycle-well-ingame');
    expect(h.captured?.glbUrl).toContain('monster.glb');
  });

  it('builds a grid floor + shadow + death/reward bursts', () => {
    render(<InGamePanel />);
    const { ctx } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(h.groundCreate).toHaveBeenCalledTimes(2); // grid + shadow grounds
    expect(h.shadowCtor).toHaveBeenCalled();
    expect(h.particleCtor).toHaveBeenCalledTimes(2);
  });

  it('the phase loop recolors the monster across stages without throwing', () => {
    render(<InGamePanel />);
    const { ctx, material, fireFrame } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    // Several big steps cycle monster → kill → reward → rest; the material is
    // recolored (gold during reward) and never crashes.
    for (let i = 0; i < 6; i++) expect(() => fireFrame()).not.toThrow();
    expect(material.albedoColor).not.toBeNull();
  });

  it('cleanup disposes the shadow and the particle bursts', () => {
    render(<InGamePanel />);
    const { ctx } = fakeContext();
    const cleanupFn = h.captured?.onSceneReady?.(ctx) as (() => void) | undefined;
    cleanupFn?.();
    expect(h.shadowDispose).toHaveBeenCalled();
    expect(h.particleDispose).toHaveBeenCalled();
  });
});
