import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { LiveWellProps, LiveWellSceneContext } from '../../babylon/LiveWell';
import { landingWells } from '../../ux/tokens';

const h = vi.hoisted(() => ({
  captured: null as LiveWellProps | null,
  hexes: [] as string[],
  nodes: [] as { name: string; position: { x: number }; disposed: boolean }[],
  frameCalls: 0,
}));

vi.mock('@babylonjs/core', () => {
  class ArcRotateCamera {}
  class Color3 {
    constructor(public hex?: string) {}
    static FromHexString(hex: string) {
      h.hexes.push(hex);
      return new Color3(hex);
    }
  }
  class TransformNode {
    position = { x: 0 };
    disposed = false;
    constructor(public name: string) {
      h.nodes.push(this);
    }
    dispose() {
      this.disposed = true;
    }
  }
  return { ArcRotateCamera, Color3, TransformNode };
});

vi.mock('../../babylon/LiveWell', () => ({
  LiveWell: (props: LiveWellProps) => {
    h.captured = props;
    return <div data-testid={props.testIdBase} />;
  },
}));

vi.mock('../../babylon/PreviewCanvas', () => ({
  frameCameraToMeshes: () => {
    h.frameCalls++;
  },
}));

import { ArcRotateCamera } from '@babylonjs/core';
import { VariantPanel } from './VariantPanel';

// Mocked ArcRotateCamera has a 0-arg constructor; cast off the real signature.
const Cam = ArcRotateCamera as unknown as new () => object;

function fakeMaterial() {
  return { albedoColor: null as unknown, clone: () => fakeMaterial() };
}
function fakeMesh(name: string) {
  return {
    name,
    setEnabled: vi.fn(),
    material: fakeMaterial(),
    clone: vi.fn((cloneName: string) => ({
      name: cloneName,
      setEnabled: vi.fn(),
      material: fakeMaterial(),
    })),
  };
}

function fakeContext() {
  const source = fakeMesh('tusk');
  const camera = new Cam() as unknown as LiveWellSceneContext['camera'];
  const scene = {} as LiveWellSceneContext['scene'];
  const ctx = {
    scene,
    camera,
    meshes: [source as unknown as LiveWellSceneContext['meshes'][number]],
    container: {} as LiveWellSceneContext['container'],
  };
  return { ctx, source };
}

beforeEach(() => {
  h.captured = null;
  h.hexes = [];
  h.nodes = [];
  h.frameCalls = 0;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VariantPanel', () => {
  it('drives LiveWell with dispose policy + variant testid + static fallback', () => {
    render(<VariantPanel />);
    expect(h.captured?.offscreenPolicy).toBe('dispose');
    expect(h.captured?.testIdBase).toBe('lifecycle-panel-variant');
    expect(h.captured?.staticSrc).toBe('/lifecycle/variant.svg');
  });

  it('builds exactly three colored variants from the recorded D-093 tokens', () => {
    render(<VariantPanel />);
    const { ctx, source } = fakeContext();
    h.captured?.onSceneReady?.(ctx);

    // Three groups, the original hidden, the camera framed to the clones.
    expect(h.nodes).toHaveLength(3);
    expect(source.setEnabled).toHaveBeenCalledWith(false);
    expect(source.clone).toHaveBeenCalledTimes(3);
    expect(h.frameCalls).toBe(1);

    // Colors are exactly the three recorded variant tokens — not arbitrary,
    // and none is the D-044 accent.
    expect(h.hexes).toEqual([
      landingWells.variant1,
      landingWells.variant2,
      landingWells.variant3,
    ]);
    expect(h.hexes).not.toContain('#FF4500');
  });

  it('cleanup disposes the three clone groups', () => {
    render(<VariantPanel />);
    const { ctx } = fakeContext();
    const cleanupFn = h.captured?.onSceneReady?.(ctx) as (() => void) | undefined;
    cleanupFn?.();
    expect(h.nodes.every((n) => n.disposed)).toBe(true);
  });
});
