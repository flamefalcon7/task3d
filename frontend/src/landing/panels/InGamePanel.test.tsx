import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

import type { LiveWellProps, LiveWellSceneContext } from '../../babylon/LiveWell';

const h = vi.hoisted(() => ({
  captured: null as LiveWellProps | null,
  groundCreate: vi.fn(),
  shadowCtor: vi.fn(),
  shadowDispose: vi.fn(),
  shadowCasters: 0,
  transformNodes: 0,
  particleCtor: vi.fn(),
  particleDispose: vi.fn(),
  loadCalls: [] as string[],
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
    setAll() {}
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
    addShadowCaster() {
      h.shadowCasters++;
    }
    dispose() {
      h.shadowDispose();
    }
  }
  class StandardMaterial {
    diffuseColor: unknown = null;
    specularColor: unknown = null;
  }
  class TransformNode {
    position = { x: 0, y: 0, z: 0 };
    rotation = { x: 0, y: 0, z: 0 };
    scaling = { setAll: () => {} };
    constructor() {
      h.transformNodes++;
    }
    setEnabled() {}
    dispose() {}
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
  const LoadAssetContainerAsync = vi.fn((url: string) => {
    h.loadCalls.push(url);
    return Promise.resolve({
      meshes: [{ getTotalVertices: () => 8, setParent: () => {}, material: null }],
      addAllToScene: () => {},
      dispose: () => {},
    });
  });
  return {
    Color3,
    Color4,
    Vector3,
    DirectionalLight,
    ShadowGenerator,
    StandardMaterial,
    TransformNode,
    DynamicTexture,
    GPUParticleSystem,
    ParticleSystem,
    MeshBuilder,
    LoadAssetContainerAsync,
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
    isDisposed: false,
    getEngine: () => ({ getDeltaTime: () => 16 }),
    onBeforeRenderObservable: {
      add: (cb: () => void) => {
        frameCb = cb;
        return cb;
      },
      remove: vi.fn(),
    },
  } as unknown as LiveWellSceneContext['scene'];
  const meshes = [
    { setParent: vi.fn(), material: { emissiveColor: null } } as unknown as
      LiveWellSceneContext['meshes'][number],
  ];
  const ctx = {
    scene,
    camera: { radius: 6 } as unknown as LiveWellSceneContext['camera'],
    meshes,
    container: {} as LiveWellSceneContext['container'],
  };
  return { ctx, fireFrame: () => frameCb?.() };
}

beforeEach(() => {
  h.captured = null;
  h.shadowCasters = 0;
  h.transformNodes = 0;
  h.loadCalls = [];
  [h.groundCreate, h.shadowCtor, h.shadowDispose, h.particleCtor, h.particleDispose].forEach((f) =>
    f.mockReset(),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InGamePanel', () => {
  it('drives LiveWell with the monster model, dispose policy, no turntable', () => {
    render(<InGamePanel />);
    expect(h.captured?.offscreenPolicy).toBe('dispose');
    expect(h.captured?.testIdBase).toBe('lifecycle-well-ingame');
    expect(h.captured?.autoRotate).toBe(false);
    expect(h.captured?.glbUrl).toContain('monster.glb');
  });

  it('builds the scene: ground + shadow, monster + reward pivots, death + reward bursts; loads the reward tusk', async () => {
    render(<InGamePanel />);
    const { ctx, fireFrame } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(h.groundCreate).toHaveBeenCalled();
    expect(h.shadowCtor).toHaveBeenCalled();
    expect(h.transformNodes).toBe(2); // monster + reward pivots
    expect(h.particleCtor).toHaveBeenCalledTimes(2); // death + reward bursts
    // The reward tusk is loaded (separate from the monster model).
    await waitFor(() => expect(h.loadCalls.some((u) => u.includes('tusk.glb'))).toBe(true));
    // The phase loop runs without throwing.
    expect(() => fireFrame()).not.toThrow();
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
