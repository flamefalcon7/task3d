import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
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
import { applyCanvasMode } from './applyCanvasMode';
import { type BgKey, useBgCycle } from './bgPalette';
import { BgTogglePill } from './BgTogglePill';
import { type CanvasMode, MODE_PALETTE } from './modePalette';
import { ModeTogglePill } from './ModeTogglePill';
import { tokens, viewerWell } from '../ux/tokens';

// plan-015 U2 — idle auto-rotate gate (R10). Mirrors PreviewCanvas. The
// L1 tagging step opts in via U5 so creators see the mesh from multiple
// angles while naming parts.
const AUTO_ROTATE_IDLE_MS = 3000;
const AUTO_ROTATE_RAD_PER_SEC = 0.2;

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
  /**
   * Called once per successful GLB load with the count of filtered meshes
   * (parts) the canvas resolved. The parent uses this to size its label
   * palette + drive the "N of M labeled" progress indicator (U6).
   */
  onLoaded?: (meshCount: number) => void;
  /** Initial well background — defaults to D-044 black. */
  defaultBg?: BgKey;
  /** Render the BG cycle pill in the well's top-right. Default true. */
  bgToggle?: boolean;
  /**
   * plan-015 U2 — canvas render mode (controlled by parent). Default 'pbr'
   * preserves existing call sites. The L1 tagging step (U5) passes 'parts'
   * so creators see segments in rainbow color from the moment the tagging
   * screen renders.
   */
  mode?: CanvasMode;
  /** Pill click handler. Required when `modeToggle=true`. */
  onModeCycle?: () => void;
  /** Show the mode-toggle pill in the well's top-left. Default false. */
  modeToggle?: boolean;
  /**
   * plan-015 U2 — additional SOLO-highlight indices. Combined with the
   * built-in `selectedIndex` glow when mode === 'solo'. Default empty.
   */
  highlightedParts?: readonly number[];
  /**
   * plan-015 U2 / R10 — idle auto-rotate. Default false; L1 tagging step
   * opts in.
   */
  autoRotate?: boolean;
}

export function TaggingCanvas({
  glbUrl,
  selectedIndex,
  onPartSelect,
  onLoaded,
  defaultBg = 'black',
  bgToggle = true,
  mode = 'pbr',
  onModeCycle,
  modeToggle = false,
  highlightedParts = [],
  autoRotate = false,
}: TaggingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  const highlightRef = useRef<HighlightLayer | null>(null);
  const meshesRef = useRef<AbstractMesh[]>([]);
  // Latest-callback ref so the pointer observable (registered once on mount)
  // calls the current `onPartSelect` instead of the closure captured at mount.
  const onPartSelectRef = useRef(onPartSelect);
  const onLoadedRef = useRef(onLoaded);
  // plan-013 fix-pass — monotonically increasing token assigned per glbUrl
  // effect run. The async load captures its token locally and bails before
  // mutating any ref if a newer effect run has already started — prevents
  // a slow first load from overwriting state populated by a faster second
  // load (real on cache-hit churn or rapid base re-pick).
  const loadTokenRef = useRef(0);
  // UX-G2 fix — local "mesh loaded" flag drives the wireframe-cube overlay.
  // Until LoadAssetContainerAsync resolves, the canvas is a pure-black well
  // with no visual indication that anything is happening; mirrors the
  // PreviewCanvas WireframePlaceholder pattern for symmetry. Resets to false
  // whenever `glbUrl` changes so the overlay reappears between loads.
  const [meshLoaded, setMeshLoaded] = useState(false);
  const { entry: bgEntry, cycle: cycleBg } = useBgCycle(defaultBg);

  useEffect(() => {
    onPartSelectRef.current = onPartSelect;
  }, [onPartSelect]);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true);
    const scene = new Scene(engine);
    // scene.clearColor is owned end-to-end by the bg-cycle effect below.
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
    // UX-G2 — clear the loaded flag so the wireframe overlay reappears
    // while a new glbUrl loads (e.g., parent swaps the base mesh).
    setMeshLoaded(false);
    // Capture this effect run's token. Increment so any prior in-flight load
    // sees its captured token != latestRef.current and bails before mutating
    // shared refs. The per-effect `cancelled` flag only guards the cleanup
    // of THIS effect run; it can't stop a slow first load from racing a
    // fast second load to mutate state.
    const token = ++loadTokenRef.current;
    let cancelled = false;
    (async () => {
      try {
        const container = await LoadAssetContainerAsync(glbUrl, scene, {
          pluginExtension: '.glb',
        });
        if (cancelled || token !== loadTokenRef.current) {
          container.dispose();
          return;
        }
        containerRef.current?.dispose();
        container.addAllToScene();
        containerRef.current = container;
        meshesRef.current = container.meshes.filter(
          (m) => typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
        );
        onLoadedRef.current?.(meshesRef.current.length);
        setMeshLoaded(true);

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

  // Reactively update the scene clearColor when the user cycles BG.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const [r, g, b] = bgEntry.rgb;
    scene.clearColor.set(r, g, b, 1);
  }, [bgEntry]);

  // plan-015 U2 — combined mode-and-selection effect. Owns BOTH (a) the
  // applyCanvasMode material overlay and (b) HighlightLayer membership.
  // HighlightLayer is a single shared resource, so the click-to-tag
  // `selectedIndex` glow and the SOLO-mode `highlightedParts` halo must
  // be coordinated in one effect — running as two independent effects
  // would fight via competing removeAllMeshes()/addMesh() pairs.
  //
  // Re-fires when mode / highlightedParts / selectedIndex / meshLoaded
  // change. `meshLoaded` transitions false→true on every successful
  // load, which is the signal that meshesRef.current is fresh.
  useEffect(() => {
    const hl = highlightRef.current;
    if (!hl) return;
    const meshes = meshesRef.current;
    applyCanvasMode(meshes, mode, highlightedParts);
    hl.removeAllMeshes();

    const accent = Color3.FromHexString(tokens.color.accent);
    const scene = sceneRef.current;
    const safeAdd = (i: number) => {
      const m = meshes[i];
      if (!m) return;
      // plan-013 fix-pass — guard against a stale glbUrl→meshes race where
      // the deps fire BEFORE the async load has repopulated meshesRef.
      // getScene check ensures the mesh's backing Scene matches the live one.
      if (!scene || (typeof m.getScene === 'function' && m.getScene() !== scene)) return;
      hl.addMesh(m as Mesh, accent);
    };

    if (mode === 'solo') {
      for (const i of highlightedParts) safeAdd(i);
    }
    // Click-to-tag selectedIndex glow is orthogonal to mode — always apply.
    if (selectedIndex != null) safeAdd(selectedIndex);
  }, [mode, highlightedParts, selectedIndex, meshLoaded]);

  // plan-015 U2 / R10 — idle auto-rotate. Mirrors PreviewCanvas exactly.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!autoRotate || !scene) return;

    let lastPointerMs = Date.now();
    let lastTickMs = Date.now();

    const pointerObs = scene.onPointerObservable.add(() => {
      lastPointerMs = Date.now();
    });
    const renderObs = scene.onBeforeRenderObservable.add(() => {
      const now = Date.now();
      const deltaSec = (now - lastTickMs) / 1000;
      lastTickMs = now;
      if (now - lastPointerMs > AUTO_ROTATE_IDLE_MS) {
        const cam = scene.activeCamera;
        if (cam instanceof ArcRotateCamera) {
          cam.alpha += AUTO_ROTATE_RAD_PER_SEC * deltaSec;
        }
      }
    });

    return () => {
      scene.onPointerObservable.remove(pointerObs);
      scene.onBeforeRenderObservable.remove(renderObs);
    };
  }, [autoRotate]);

  return (
    <div style={{ ...viewerWell, width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        data-testid="tagging-canvas"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {!meshLoaded && (
        <div data-testid="tagging-canvas-loading" style={loadingOverlay} aria-hidden>
          <svg width="80" height="80" viewBox="0 0 100 100">
            <g
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <path d="M 20 30 L 50 15 L 80 30 L 80 70 L 50 85 L 20 70 Z" />
              <path d="M 20 30 L 50 45 L 80 30" />
              <path d="M 50 45 L 50 85" />
            </g>
          </svg>
          <span style={loadingLabel}>— LOADING MESH</span>
        </div>
      )}
      {modeToggle && onModeCycle && (
        <ModeTogglePill
          entry={MODE_PALETTE[mode]}
          onCycle={onModeCycle}
          testId="tagging-mode-toggle-pill"
        />
      )}
      {bgToggle && (
        <BgTogglePill
          entry={bgEntry}
          onCycle={cycleBg}
          testId="tagging-bg-toggle-pill"
        />
      )}
    </div>
  );
}

const loadingOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  pointerEvents: 'none',
};

const loadingLabel: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 10,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.5)',
};
