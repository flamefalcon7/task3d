import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { LiveWellProps, LiveWellSceneContext } from '../../babylon/LiveWell';

const h = vi.hoisted(() => ({
  captured: null as LiveWellProps | null,
  groundCreate: vi.fn(),
  shadowCtor: vi.fn(),
  shadowDispose: vi.fn(),
  shadowCasters: 0,
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
  const MeshBuilder = {
    CreateGround: () => {
      h.groundCreate();
      return { position: { y: 0 }, material: null as unknown, receiveShadows: false };
    },
  };
  return { Color3, Vector3, DirectionalLight, ShadowGenerator, StandardMaterial, MeshBuilder };
});

vi.mock('../../babylon/LiveWell', () => ({
  LiveWell: (props: LiveWellProps) => {
    h.captured = props;
    return <div data-testid={props.testIdBase} />;
  },
}));

import { InGamePanel } from './InGamePanel';

function fakeContext() {
  const ctx = {
    scene: {} as LiveWellSceneContext['scene'],
    camera: {} as LiveWellSceneContext['camera'],
    meshes: [{ name: 'tusk' } as unknown as LiveWellSceneContext['meshes'][number]],
    container: {} as LiveWellSceneContext['container'],
  };
  return { ctx };
}

beforeEach(() => {
  h.captured = null;
  h.shadowCasters = 0;
  [h.groundCreate, h.shadowCtor, h.shadowDispose].forEach((f) => f.mockReset());
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

  it('builds a ground tile + contact shadow and casts the tusk shadow (no glow/particles)', () => {
    render(<InGamePanel />);
    const { ctx } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(h.groundCreate).toHaveBeenCalled();
    expect(h.shadowCtor).toHaveBeenCalled();
    expect(h.shadowCasters).toBe(1);
  });

  it('cleanup disposes the shadow generator', () => {
    render(<InGamePanel />);
    const { ctx } = fakeContext();
    const cleanupFn = h.captured?.onSceneReady?.(ctx) as (() => void) | undefined;
    cleanupFn?.();
    expect(h.shadowDispose).toHaveBeenCalled();
  });
});
