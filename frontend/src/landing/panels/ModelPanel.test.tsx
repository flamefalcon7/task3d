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
  class Color4 {
    constructor(
      public r = 0,
      public g = 0,
      public b = 0,
      public a = 1,
    ) {}
  }
  return { ArcRotateCamera, Color3, Color4 };
});

vi.mock('@babylonjs/core/Rendering/edgesRenderer', () => ({}));

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
    wireframe: true,
    albedoColor: null as unknown,
    emissiveColor: null as unknown,
    disableLighting: false,
  };
  const mesh = {
    material,
    enableEdgesRendering: vi.fn(),
    edgesColor: null as unknown,
    edgesWidth: 0,
  };
  const camera = new Cam() as unknown as LiveWellSceneContext['camera'];
  const ctx = {
    scene: {} as LiveWellSceneContext['scene'],
    camera,
    meshes: [mesh as unknown as LiveWellSceneContext['meshes'][number]],
    container: {} as LiveWellSceneContext['container'],
  };
  return { ctx, material, mesh, camera: camera as unknown as { radius: number } };
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
    expect(h.captured?.autoRotate).toBeUndefined(); // default full turntable
  });

  it('renders a hidden-line wireframe: faces hidden into the grey, dark hard edges only', () => {
    render(<ModelPanel />);
    const { ctx, material, mesh } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    // NOT material.wireframe (that draws every triangle — too dense).
    expect(material.wireframe).toBe(false);
    // Faces painted the card grey so they vanish into the background.
    expect(material.albedoColor).not.toBeNull();
    expect(material.disableLighting).toBe(true);
    // Only hard facet edges are drawn, in dark.
    expect(mesh.enableEdgesRendering).toHaveBeenCalled();
    expect(mesh.edgesColor).not.toBeNull();
  });

  it('zooms the camera in so the model reads bigger', () => {
    render(<ModelPanel />);
    const { ctx, camera } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(camera.radius).toBeCloseTo(7.2); // 10 * 0.72
  });
});
