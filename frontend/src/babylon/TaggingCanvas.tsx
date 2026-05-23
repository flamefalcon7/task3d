import { useEffect, useRef } from 'react';
import {
  type AbstractMesh,
  ArcRotateCamera,
  AssetContainer,
  Color3,
  Engine,
  HemisphericLight,
  HighlightLayer,
  LoadAssetContainerAsync,
  type Mesh,
  PointerEventTypes,
  Scene,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { frameCameraToMeshes } from './PreviewCanvas';
import { tokens, viewerWell } from '../ux/tokens';

// plan-013 U5 — click-to-select Babylon picker for L1 tagging UX. Sibling to
// PreviewCanvas: same imperative Engine/Scene/Camera/Light lifecycle plus a
// HighlightLayer driven by `selectedIndex` and a POINTERPICK observable that
// reports the picked mesh's filtered-index back via `onPartSelect`.
//
// Index contract: meshes are filtered to drop __root__ / empty nodes, then
// indexed by GLB node order. Tripo's `tripo_part_N` naming gives us a stable
// node order, so filtered index N ↔ Move `part_labels[N]` ↔ backend swap
// `materials[N]`. See plan-013 R4 / U5 Approach.

interface TaggingCanvasProps {
  glbUrl: string | null;
  selectedIndex: number | null;
  onPartSelect: (index: number) => void;
}

export function TaggingCanvas({ glbUrl, selectedIndex, onPartSelect }: TaggingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  const highlightRef = useRef<HighlightLayer | null>(null);
  const meshesRef = useRef<AbstractMesh[]>([]);
  // Latest-callback ref so the pointer observable (registered once on mount)
  // calls the current `onPartSelect` instead of the closure captured at mount.
  const onPartSelectRef = useRef(onPartSelect);

  useEffect(() => {
    onPartSelectRef.current = onPartSelect;
  }, [onPartSelect]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);
    scene.clearColor.set(0, 0, 0, 1);
    const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 4, new Vector3(0, 0.5, 0), scene);
    camera.attachControl(canvasRef.current, true);
    camera.wheelDeltaPercentage = 0.01;
    new HemisphericLight('hl', new Vector3(0, 1, 0), scene);
    const hl = new HighlightLayer('tagging-hl', scene);
    highlightRef.current = hl;

    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
      const picked = pointerInfo.pickInfo?.pickedMesh;
      if (!picked) return;
      const idx = meshesRef.current.indexOf(picked as AbstractMesh);
      if (idx >= 0) onPartSelectRef.current(idx);
    });

    engine.runRenderLoop(() => scene.render());
    engineRef.current = engine;
    sceneRef.current = scene;

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      containerRef.current?.dispose();
      hl.dispose();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
      sceneRef.current = null;
      containerRef.current = null;
      highlightRef.current = null;
      meshesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !glbUrl) return;
    let cancelled = false;
    (async () => {
      try {
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
        meshesRef.current = container.meshes.filter(
          (m) => typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
        );

        const camera = scene.activeCamera;
        if (camera instanceof ArcRotateCamera) {
          frameCameraToMeshes(camera, container.meshes);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('TaggingCanvas: load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  useEffect(() => {
    const hl = highlightRef.current;
    if (!hl) return;
    hl.removeAllMeshes();
    if (selectedIndex == null) return;
    const mesh = meshesRef.current[selectedIndex];
    if (!mesh) return;
    // HighlightLayer.addMesh's TS signature wants Mesh, but the picker works
    // on AbstractMesh at runtime — segmented GLB parts may surface as either.
    hl.addMesh(mesh as Mesh, Color3.FromHexString(tokens.color.accent));
  }, [selectedIndex, glbUrl]);

  return (
    <div style={{ ...viewerWell, width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        data-testid="tagging-canvas"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
