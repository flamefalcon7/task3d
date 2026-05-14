import { useEffect, useRef } from 'react';
import {
  ArcRotateCamera,
  AssetContainer,
  Engine,
  HemisphericLight,
  LoadAssetContainerAsync,
  Scene,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

// Imperative Babylon wrapper (D-007: drop react-babylonjs). useEffect builds
// Engine/Scene/Camera/Light once; a second effect swaps assets when glbUrl
// changes. ResizeObserver keeps the canvas matched to its CSS box.
export function PreviewCanvas({ glbUrl }: { glbUrl: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);
    scene.clearColor.set(0.08, 0.09, 0.11, 1);
    const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 4, new Vector3(0, 0.5, 0), scene);
    camera.attachControl(canvasRef.current, true);
    camera.wheelDeltaPercentage = 0.01;
    new HemisphericLight('hl', new Vector3(0, 1, 0), scene);
    engine.runRenderLoop(() => scene.render());
    engineRef.current = engine;
    sceneRef.current = scene;

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      containerRef.current?.dispose();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
      sceneRef.current = null;
      containerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !glbUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const container = await LoadAssetContainerAsync(glbUrl, scene);
        if (cancelled) {
          container.dispose();
          return;
        }
        containerRef.current?.dispose();
        container.addAllToScene();
        containerRef.current = container;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('PreviewCanvas: load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  return <canvas ref={canvasRef} data-testid="preview-canvas" style={{ width: '100%', height: '100%', display: 'block' }} />;
}
