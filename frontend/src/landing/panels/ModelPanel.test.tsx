import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { LiveWellProps, LiveWellSceneContext } from '../../babylon/LiveWell';

const h = vi.hoisted(() => ({
  setProgress: vi.fn(),
  dispose: vi.fn(),
  setupSweep: vi.fn(),
  captured: null as LiveWellProps | null,
}));

vi.mock('@babylonjs/core', () => {
  class ArcRotateCamera {
    alpha = 0;
  }
  return { ArcRotateCamera };
});

vi.mock('../../babylon/LiveWell', () => ({
  LiveWell: (props: LiveWellProps) => {
    h.captured = props;
    return <div data-testid={props.testIdBase} />;
  },
}));

vi.mock('../../babylon/edgesGradientSweep', () => ({
  setupEdgesGradientSweep: (...args: unknown[]) => {
    h.setupSweep(...args);
    return { setProgress: h.setProgress, dispose: h.dispose };
  },
}));

import { ArcRotateCamera } from '@babylonjs/core';
import { ModelPanel } from './ModelPanel';

// The mocked ArcRotateCamera has a 0-arg constructor; cast away the real 5-7
// arg signature so tsc -b is happy while runtime uses the mock.
const Cam = ArcRotateCamera as unknown as new () => { alpha: number };

function fakeContext(): { ctx: LiveWellSceneContext; fireFrame: () => void } {
  let frameCb: (() => void) | null = null;
  const camera = new Cam() as unknown as LiveWellSceneContext['camera'];
  const scene = {
    activeCamera: camera,
    onBeforeRenderObservable: {
      add: (cb: () => void) => {
        frameCb = cb;
        return cb;
      },
      remove: vi.fn(),
    },
  } as unknown as LiveWellSceneContext['scene'];
  const ctx = { scene, camera, meshes: [], container: {} as LiveWellSceneContext['container'] };
  return { ctx, fireFrame: () => frameCb?.() };
}

beforeEach(() => {
  h.setProgress.mockReset();
  h.dispose.mockReset();
  h.setupSweep.mockReset();
  h.captured = null;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ModelPanel', () => {
  it('drives LiveWell with dispose policy, no turntable, model testid + static fallback', () => {
    render(<ModelPanel />);
    expect(h.captured?.offscreenPolicy).toBe('dispose');
    expect(h.captured?.autoRotate).toBe(false);
    expect(h.captured?.testIdBase).toBe('lifecycle-panel-model');
    expect(h.captured?.staticSrc).toBe('/lifecycle/model.svg');
    expect(h.captured?.glbUrl).toContain('tusk.glb');
  });

  it('AE3 — freezes the split at the midpoint (0.5), not the 6s loop', () => {
    render(<ModelPanel />);
    const { ctx } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    expect(h.setupSweep).toHaveBeenCalledTimes(1);
    expect(h.setProgress).toHaveBeenCalledWith(0.5);
  });

  it('AE3 — camera oscillation stays in a narrow frontal arc (never edge-on/inverted)', () => {
    vi.spyOn(performance, 'now').mockImplementation(
      (() => {
        let t = 0;
        return () => (t += 200); // advance 200ms each frame so the phase sweeps
      })(),
    );
    render(<ModelPanel />);
    const { ctx, fireFrame } = fakeContext();
    h.captured?.onSceneReady?.(ctx);
    const center = -Math.PI / 2;
    const arc = Math.PI / 6;
    let maxDeviation = 0;
    for (let i = 0; i < 200; i++) {
      fireFrame();
      maxDeviation = Math.max(maxDeviation, Math.abs(ctx.camera.alpha - center));
    }
    // Swings (proves it isn't stuck) but never reaches the ±90° edge-on angle.
    expect(maxDeviation).toBeGreaterThan(0);
    expect(maxDeviation).toBeLessThanOrEqual(arc + 1e-9);
    expect(maxDeviation).toBeLessThan(Math.PI / 2);
  });

  it('cleanup disposes the sweep and removes the oscillation observer', () => {
    render(<ModelPanel />);
    const { ctx } = fakeContext();
    const cleanupFn = h.captured?.onSceneReady?.(ctx) as (() => void) | undefined;
    expect(typeof cleanupFn).toBe('function');
    cleanupFn?.();
    expect(h.dispose).toHaveBeenCalledTimes(1);
    expect(ctx.scene.onBeforeRenderObservable.remove).toHaveBeenCalled();
  });
});
