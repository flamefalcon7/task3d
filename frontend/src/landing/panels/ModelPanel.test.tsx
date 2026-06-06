import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { LiveWellProps, LiveWellSceneContext } from '../../babylon/LiveWell';

const h = vi.hoisted(() => ({ captured: null as LiveWellProps | null }));

vi.mock('@babylonjs/core', () => {
  class ArcRotateCamera {
    radius = 10;
  }
  class Color3 {
    constructor(
      public r = 0,
      public g = 0,
      public b = 0,
    ) {}
  }
  return { ArcRotateCamera, Color3 };
});

vi.mock('../../babylon/LiveWell', () => ({
  LiveWell: (props: LiveWellProps) => {
    h.captured = props;
    return <div data-testid={props.testIdBase} />;
  },
}));

import { ArcRotateCamera } from '@babylonjs/core';
import { ModelPanel } from './ModelPanel';

const Cam = ArcRotateCamera as unknown as new () => { radius: number };

function fakeContext() {
  const material = {
    wireframe: false,
    albedoColor: null as unknown,
    emissiveColor: null as unknown,
    disableLighting: false,
  };
  const camera = new Cam() as unknown as LiveWellSceneContext['camera'];
  const ctx = {
    scene: {} as LiveWellSceneContext['scene'],
    camera,
    meshes: [{ material } as unknown as LiveWellSceneContext['meshes'][number]],
    container: {} as LiveWellSceneContext['container'],
  };
  return { ctx, material, camera: camera as unknown as { radius: number } };
}

beforeEach(() => {
  h.captured = null;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ModelPanel', () => {
  it('drives LiveWell with dispose policy, full turntable, model testid + static fallback', () => {
    render(<ModelPanel />);
    expect(h.captured?.offscreenPolicy).toBe('dispose');
    expect(h.captured?.testIdBase).toBe('lifecycle-well-model');
    expect(h.captured?.staticSrc).toBe('/lifecycle/model.svg');
    expect(h.captured?.glbUrl).toContain('tusk.glb');
    // No more split → no oscillation → default auto-rotate (autoRotate prop unset).
    expect(h.captured?.autoRotate).toBeUndefined();
  });

  it('renders the tusk as a dark wireframe (full mesh, flat dark, unlit)', () => {
    render(<ModelPanel />);
    const { ctx, material } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(material.wireframe).toBe(true);
    expect(material.albedoColor).not.toBeNull();
    expect(material.emissiveColor).not.toBeNull();
    expect(material.disableLighting).toBe(true);
  });

  it('zooms the camera in so the model reads bigger', () => {
    render(<ModelPanel />);
    const { ctx, camera } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(camera.radius).toBeCloseTo(7.2); // 10 * 0.72
  });
});
