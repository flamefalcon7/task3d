import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// Babylon needs WebGL — jsdom doesn't have it. Mock @babylonjs/core entirely
// so the smoke test verifies the React shell renders + mount/unmount lifecycle,
// not actual GL rendering (that requires e2e in a real browser).
vi.mock('@babylonjs/core', () => {
  class Engine { constructor() {} runRenderLoop() {} resize() {} dispose() {} }
  class Scene {
    clearColor = { set: () => {} };
    render() {}
    dispose() {}
    constructor(_e: unknown) {}
  }
  class ArcRotateCamera {
    wheelDeltaPercentage = 0;
    attachControl() {}
    constructor(..._a: unknown[]) {}
  }
  class HemisphericLight { constructor(..._a: unknown[]) {} }
  class Vector3 { constructor(public x = 0, public y = 0, public z = 0) {} }
  class AssetContainer { addAllToScene() {} dispose() {} }
  const LoadAssetContainerAsync = vi.fn().mockResolvedValue(new AssetContainer());
  return { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, AssetContainer, LoadAssetContainerAsync };
});

vi.mock('@babylonjs/loaders/glTF/index.js', () => ({}));

import { PreviewCanvas } from './PreviewCanvas';

afterEach(() => cleanup());

describe('PreviewCanvas', () => {
  it('renders a canvas element', () => {
    render(<PreviewCanvas glbUrl={null} />);
    expect(screen.getByTestId('preview-canvas').tagName).toBe('CANVAS');
  });

  it('calls LoadAssetContainerAsync when glbUrl is provided', async () => {
    const babylon = await import('@babylonjs/core');
    const spy = babylon.LoadAssetContainerAsync as unknown as ReturnType<typeof vi.fn>;
    spy.mockClear();
    render(<PreviewCanvas glbUrl="blob:http://localhost/abc" />);
    await Promise.resolve();
    await Promise.resolve();
    expect(spy).toHaveBeenCalledWith(
      'blob:http://localhost/abc',
      expect.anything(),
      { pluginExtension: '.glb' },
    );
  });
});
