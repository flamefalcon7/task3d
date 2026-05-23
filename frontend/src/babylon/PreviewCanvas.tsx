import { useEffect, useRef } from 'react';
import {
  type AbstractMesh,
  ArcRotateCamera,
  AssetContainer,
  Engine,
  HemisphericLight,
  LoadAssetContainerAsync,
  Scene,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

// Frame the ArcRotateCamera so the loaded mesh fills the box regardless of its
// authored scale — Tripo/uploaded GLBs range from sub-unit to tens of units, so
// a fixed radius makes some render as a speck and clips others. We size the
// orbit radius to the bounding sphere + the vertical FOV (+ padding), recenter
// the target, and widen the near/far planes so neither tiny nor huge meshes clip.
export function frameCameraToMeshes(camera: ArcRotateCamera, meshes: AbstractMesh[]): void {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() === 0) continue; // skip glTF __root__ / empty nodes
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    min = min ? Vector3.Minimize(min, bb.minimumWorld) : bb.minimumWorld.clone();
    max = max ? Vector3.Maximize(max, bb.maximumWorld) : bb.maximumWorld.clone();
  }
  if (!min || !max) return; // nothing with geometry — keep defaults

  const center = min.add(max).scale(0.5);
  const radius = max.subtract(min).length() / 2; // bounding-sphere radius
  if (radius <= 0) return;

  const fitRadius = (radius / Math.sin(camera.fov / 2)) * 1.3; // 30% padding
  camera.setTarget(center);
  camera.radius = fitRadius;
  camera.lowerRadiusLimit = fitRadius * 0.15;
  camera.upperRadiusLimit = fitRadius * 6;
  camera.minZ = Math.max(0.001, fitRadius * 0.005);
  camera.maxZ = fitRadius * 100;
  camera.wheelDeltaPercentage = 0.01;
}

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
    scene.clearColor.set(0, 0, 0, 1); // pure-black well per D-044
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
        // D-006: GLB only. Babylon infers the loader plugin from the URL's
        // file extension, but blob: / data: URLs have no extension — without
        // an explicit pluginExtension, the load throws silently and we'd
        // surface as an empty canvas. Set it unconditionally since we never
        // load any other format.
        const container = await LoadAssetContainerAsync(glbUrl, scene, {
          pluginExtension: '.glb',
        });
        if (cancelled) {
          container.dispose();
          return;
        }
        containerRef.current?.dispose();
        container.addAllToScene();
        containerRef.current = container;

        const camera = scene.activeCamera;
        if (camera instanceof ArcRotateCamera) {
          frameCameraToMeshes(camera, container.meshes);
        }
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
