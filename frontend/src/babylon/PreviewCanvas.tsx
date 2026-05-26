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
import { type BgKey, useBgCycle } from './bgPalette';
import { BgTogglePill } from './BgTogglePill';

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

interface PreviewCanvasProps {
  glbUrl: string | null;
  /**
   * Initial well background. Read ONLY on first render — subsequent prop
   * changes are ignored (the BG state is owned by the internal useBgCycle
   * hook once mounted). Defaults to D-044 black.
   */
  defaultBg?: BgKey;
  /** Render the BG cycle pill in the well's top-right. Default true. */
  bgToggle?: boolean;
  /**
   * Suffix appended to the BG-toggle pill's test id so multiple mounts on
   * one page (e.g. /market listings) don't collide on the default
   * `bg-toggle-pill` testid.
   */
  testIdSuffix?: string;
}

// Imperative Babylon wrapper (D-007: drop react-babylonjs). useEffect builds
// Engine/Scene/Camera/Light once; a separate effect swaps assets when glbUrl
// changes. The bg-cycle effect (deps [entry]) owns scene.clearColor end-to-
// end — the mount effect deliberately does NOT set clearColor any more (it
// fires synchronously alongside the bg-cycle effect on first render anyway,
// so the prior double-write was dead code per julik+correctness review).
export function PreviewCanvas({
  glbUrl,
  defaultBg = 'black',
  bgToggle = true,
  testIdSuffix,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  const { bg, entry, cycle } = useBgCycle(defaultBg);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);
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

  // Sole owner of scene.clearColor. Fires once on mount alongside the
  // Engine/Scene init effect (same commit phase), and again every time
  // useBgCycle updates `entry`.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const [r, g, b] = entry.rgb;
    scene.clearColor.set(r, g, b, 1);
  }, [entry]);

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

  // Wrap the canvas so the absolute-positioned BG pill anchors to the well.
  // `position: relative` is required; the rest mirrors the bare-canvas size.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        data-testid="preview-canvas"
        data-bg={bg}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {bgToggle && (
        <BgTogglePill
          entry={entry}
          onCycle={cycle}
          testId={testIdSuffix ? `bg-toggle-pill-${testIdSuffix}` : 'bg-toggle-pill'}
        />
      )}
    </div>
  );
}
