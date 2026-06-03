import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
import { type BgKey, useBgCycle } from './bgPalette';
import { BgTogglePill } from './BgTogglePill';
import { applyCanvasMode } from './applyCanvasMode';
import { type CanvasMode, MODE_PALETTE } from './modePalette';
import { ModeTogglePill } from './ModeTogglePill';
import { captureStillsFromScene, captureFramesFromScene } from './captureStills';

// plan-015 U2 — accent color hex inlined here so the mode/highlight effect
// doesn't need to round-trip through the ux/tokens module. Matches
// tokens.color.accent.
const ACCENT_COLOR_HEX = '#FF4500';
// plan-015 U2 — idle auto-rotate gate (R10). 3s of pointer inactivity
// before rotation resumes; ~0.2 rad/sec around the camera's alpha axis.
const AUTO_ROTATE_IDLE_MS = 3000;
const AUTO_ROTATE_RAD_PER_SEC = 0.2;

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
   * Suffix appended to the BG-toggle and mode-toggle pill test ids so
   * multiple mounts on one page (e.g. /market listings, /launch variant
   * strip) don't collide on the default ids.
   */
  testIdSuffix?: string;
  /**
   * plan-015 U2 — canvas mode (controlled). 'pbr' is the existing render
   * and preserves every prior call site. 'parts' tints each mesh with a
   * deterministic per-index rainbow color. 'solo' dims non-highlighted
   * meshes to alpha 0.2 and adds a HighlightLayer halo to highlighted
   * ones. 'wireframe' toggles mesh.material.wireframe on every mesh.
   */
  mode?: CanvasMode;
  /**
   * plan-015 U2 — pill click handler. Required when `modeToggle=true`.
   * The parent owns mode state so that hover-driven effects (U7
   * column-hover → SOLO) can flip mode externally.
   */
  onModeCycle?: () => void;
  /** Show the mode-toggle pill in the well's top-left. Default false. */
  modeToggle?: boolean;
  /**
   * plan-015 U2 — part indices to SOLO-highlight (driven externally by
   * VariantEditor column hover, PartListPanel click, etc.). Only consumed
   * when `mode === 'solo'`. Default empty.
   */
  highlightedParts?: readonly number[];
  /**
   * plan-015 U2 — when provided, a POINTERPICK observable is registered
   * and the callback fires with the filtered mesh index (post-filter on
   * vertex count > 0, matching TaggingCanvas's index contract). When
   * undefined, no picking observable is registered — keeps read-only
   * mounts (market tiles, `/track`) cheap.
   */
  onPartClick?: (index: number) => void;
  /**
   * plan-015 U2 / R10 — idle auto-rotate around the camera's alpha axis
   * after 3s of pointer inactivity. Default false; full-page mounts opt
   * in explicitly per the R10 per-mount table.
   */
  autoRotate?: boolean;
  /**
   * plan-015 U7 / R9 — per-part user-defined colors (hex). When provided,
   * applied as an overlay on top of the snapshot baseline for PBR / SOLO
   * / WIREFRAME modes (PARTS mode's diagnostic rainbow still wins). This
   * is the channel for VariantEditor live-recolor — pick a color, the
   * preview updates within frame with no backend round-trip.
   */
  partColors?: readonly string[];
}

// plan-017 U2 — imperative dispose/remount handle. LaunchCollectionPage
// holds a ref to this and calls dispose() before the Walrus upload window so
// the Babylon scene's 200–400 MB heap drops out of the OOM danger zone;
// remount() restores the scene in the finally block. Scene/HL/observers are
// disposed but the Engine stays alive (avoids WebGL context-loss thrash).
export interface PreviewCanvasHandle {
  dispose(): void;
  remount(): void;
  /**
   * plan-026 U4 — capture `count` watermarked turntable stills from the CURRENT
   * (plaintext) scene. Returns PNG byte arrays (empty if the engine/camera aren't
   * ready). MUST be called before `dispose()` / the encrypt+upload window.
   */
  captureStills(count?: number): Promise<Uint8Array[]>;
  /**
   * D-082 — capture `count` CLEAN (un-watermarked) turntable frames from the
   * current scene for Upload Captioning vision input. Returns WebP byte arrays
   * (empty if the engine/camera aren't ready). Distinct from `captureStills`,
   * which watermarks for the encrypted-base preview path.
   */
  captureFrames(count?: number): Promise<Uint8Array[]>;
}

// Imperative Babylon wrapper (D-007: drop react-babylonjs). Engine creation
// runs once on outer mount and persists across the dispose/remount cycle.
// Scene + camera + light + HighlightLayer are recreated on each remount via
// the [mounted]-keyed effect; the safe render loop calls
// `sceneRef.current?.render()` so disposing the scene mid-flight is benign.
// The bg-cycle effect (deps [entry, mounted]) owns scene.clearColor end-to-
// end — re-fires after remount so the new scene picks up the user's BG.
export const PreviewCanvas = forwardRef<PreviewCanvasHandle, PreviewCanvasProps>(function PreviewCanvas({
  glbUrl,
  defaultBg = 'black',
  bgToggle = true,
  testIdSuffix,
  mode = 'pbr',
  onModeCycle,
  modeToggle = false,
  highlightedParts = [],
  onPartClick,
  autoRotate = false,
  partColors,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  // plan-015 U2 — meshes, HighlightLayer, and the latest onPartClick
  // handler are needed by the mode + picking effects, so each lives in
  // a ref that the mount effect populates.
  const meshesRef = useRef<AbstractMesh[]>([]);
  const highlightLayerRef = useRef<HighlightLayer | null>(null);
  const onPartClickRef = useRef(onPartClick);
  // plan-015 F9 — monotonically increasing token assigned per glbUrl
  // effect run. Mirrors TaggingCanvas. The async load captures its token
  // locally and bails before mutating any ref if a newer effect run has
  // already started — prevents a slow first load from overwriting state
  // populated by a faster second load (real on rapid base re-pick).
  const loadTokenRef = useRef(0);
  // plan-017 U2 — module-level dispose state checked by the in-flight GLB
  // load before any scene-mutating call. Belt to the per-effect `cancelled`
  // flag: if dispose() fires while the load is between LoadAssetContainerAsync
  // and the cancellation-check branch, isDisposedRef catches it.
  const isDisposedRef = useRef(false);
  // plan-017 U2 — false during the upload window. Cycles the scene effect.
  // Engine stays alive across cycles; only scene/HL/observers are recreated.
  const [mounted, setMounted] = useState(true);
  const { bg, entry, cycle } = useBgCycle(defaultBg);
  // Bumped after each successful GLB load so the mode effect re-applies
  // mode against the new meshes ref. The setState is gated by the
  // `cancelled` flag below, so a load completing after unmount cannot
  // fire state on a dead component.
  const [loadEpoch, setLoadEpoch] = useState(0);

  // Latest-callback ref so the picking observable (registered once on
  // mount) calls the current onPartClick. Mirrors TaggingCanvas pattern.
  useEffect(() => {
    onPartClickRef.current = onPartClick;
  }, [onPartClick]);

  // plan-017 U2 — imperative dispose/remount. Setting mounted=false fires
  // the scene effect's cleanup which disposes the scene, HL, and observers.
  // Engine stays alive. Setting mounted=true re-fires the scene effect and
  // recreates everything. isDisposedRef guards in-flight async GLB loads.
  useImperativeHandle(
    ref,
    (): PreviewCanvasHandle => ({
      dispose: () => {
        isDisposedRef.current = true;
        setMounted(false);
      },
      remount: () => {
        isDisposedRef.current = false;
        setMounted(true);
      },
      // plan-026 U4 — capture watermarked stills from the live scene's
      // ArcRotateCamera. No-op (empty) if the engine/camera aren't ready.
      captureStills: async (count?: number) => {
        const engine = engineRef.current;
        const camera = sceneRef.current?.activeCamera as ArcRotateCamera | null | undefined;
        if (!engine || !camera) return [];
        // Re-frame the camera tightly to the mesh first so the thumbnail shows
        // the model FILLING the frame — not tiny in a sea of background —
        // regardless of wherever the user left the on-screen orbit/zoom.
        if (meshesRef.current.length > 0) frameCameraToMeshes(camera, meshesRef.current);
        return captureStillsFromScene(engine, camera, count);
      },
      // D-082 — clean (un-watermarked) frames for Upload Captioning vision input.
      captureFrames: async (count?: number) => {
        const engine = engineRef.current;
        const camera = sceneRef.current?.activeCamera as ArcRotateCamera | null | undefined;
        if (!engine || !camera) return [];
        if (meshesRef.current.length > 0) frameCameraToMeshes(camera, meshesRef.current);
        return captureFramesFromScene(engine, camera, count);
      },
    }),
    [],
  );

  // Engine: one per outer component lifetime. Stays alive across the
  // dispose/remount cycle. The render loop is `sceneRef.current?.render()`
  // so disposing the scene mid-flight is a no-op rather than a throw.
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new Engine(canvasRef.current, true);
    engine.runRenderLoop(() => sceneRef.current?.render());
    engineRef.current = engine;

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Scene + camera + light + HighlightLayer + pointer observable. Cycles
  // with `mounted`. Cleanup disposes everything except the Engine and
  // calls engine.wipeCaches(true) — flushes Babylon's effect/material
  // caches so VBO/texture memory actually returns to the GPU driver on
  // macOS Metal (scene.dispose alone doesn't guarantee this).
  useEffect(() => {
    if (!mounted) return;
    const engine = engineRef.current;
    if (!engine) return;
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera('cam', Math.PI / 4, Math.PI / 3, 4, new Vector3(0, 0.5, 0), scene);
    if (canvasRef.current) camera.attachControl(canvasRef.current, true);
    camera.wheelDeltaPercentage = 0.01;
    new HemisphericLight('hl', new Vector3(0, 1, 0), scene);
    const hl = new HighlightLayer('preview-hl', scene);
    highlightLayerRef.current = hl;

    // plan-015 U2 — POINTERPICK observable registered unconditionally;
    // gated at fire-time on the latest onPartClick ref. Mounting/unmounting
    // the observable on every prop change would defeat the latest-ref
    // pattern. Cleanup happens via scene.dispose() — Babylon tears the
    // observable down with the scene.
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
      const handler = onPartClickRef.current;
      if (!handler) return;
      const picked = pointerInfo.pickInfo?.pickedMesh;
      if (!picked) return;
      const idx = meshesRef.current.indexOf(picked as AbstractMesh);
      if (idx >= 0) handler(idx);
    });

    sceneRef.current = scene;

    return () => {
      // Guard the entire engine-touching dispose chain. React 19's
      // unmount-on-delete does NOT strictly run cleanups in reverse
      // declaration order — the engine effect's cleanup may run BEFORE
      // this scene-effect cleanup on full unmount. In that case the
      // engine is already disposed and every dispose call here that
      // walks into engine state will throw:
      //   - scene.dispose() internally calls engine.wipeCaches(true)
      //     (Babylon @9.7.0 scene.js:4748)
      //   - hl.dispose() removes effects from engine's effect registry
      //   - containerRef.dispose() releases VBOs via the GL context
      // On a disposed engine, the GPU resources are already gone — there
      // is nothing for these calls to free, so skipping them is correct.
      // Refs are still nulled unconditionally so the next remount starts
      // with a clean slate. Found by plan-017 5-reviewer pass (3 reviewers
      // converged on this gap left by the initial f64b7e6 hotfix).
      if (!engine.isDisposed) {
        containerRef.current?.dispose();
        hl.dispose();
        scene.dispose();
        engine.wipeCaches(true);
      }
      sceneRef.current = null;
      containerRef.current = null;
      highlightLayerRef.current = null;
      meshesRef.current = [];
    };
  }, [mounted]);

  // Sole owner of scene.clearColor. Fires once on mount alongside the
  // Engine/Scene init effect (same commit phase), and again every time
  // useBgCycle updates `entry` OR the scene is recreated on remount.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const [r, g, b] = entry.rgb;
    scene.clearColor.set(r, g, b, 1);
  }, [entry, mounted]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !glbUrl) return;
    // plan-015 F9 — capture this effect run's token. Increment so any prior
    // in-flight load sees its captured token != latestRef.current and bails
    // before mutating shared refs. The per-effect `cancelled` flag only
    // guards the cleanup of THIS effect run; it can't stop a slow first
    // load from racing a fast second load to mutate state.
    const token = ++loadTokenRef.current;
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
        // plan-017 U2 — isDisposedRef catches the case where dispose() ran
        // between effect start and load resolution; the per-effect cancelled
        // flag covers same-cycle re-runs, this covers the cross-cycle dispose.
        if (cancelled || token !== loadTokenRef.current || isDisposedRef.current) {
          container.dispose();
          return;
        }
        containerRef.current?.dispose();
        container.addAllToScene();
        containerRef.current = container;
        // plan-015 U2 — track filtered meshes for the mode + picking
        // effects. Same filter as TaggingCanvas: drop __root__ / empty
        // nodes, index by GLB node order.
        meshesRef.current = container.meshes.filter(
          (m) => typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
        );

        const camera = scene.activeCamera;
        if (camera instanceof ArcRotateCamera) {
          frameCameraToMeshes(camera, container.meshes);
        }
        // Re-trigger the mode effect now that meshesRef is populated.
        setLoadEpoch((e) => e + 1);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('PreviewCanvas: load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [glbUrl, mounted]);

  // plan-015 U2 / U7 — mode effect. Applies the mode-specific material
  // overlay via applyCanvasMode (snapshot/restore semantics) and updates
  // the HighlightLayer membership for SOLO mode. Re-fires on (mode,
  // highlightedParts, partColors) change AND after each new GLB load via
  // loadEpoch — partColors changes are how VariantEditor live-recolor
  // reaches the canvas (R9).
  useEffect(() => {
    const hl = highlightLayerRef.current;
    if (!hl) return;
    const meshes = meshesRef.current;
    applyCanvasMode(meshes, mode, highlightedParts, partColors);
    hl.removeAllMeshes();
    if (mode === 'solo') {
      const accent = Color3.FromHexString(ACCENT_COLOR_HEX);
      // plan-015 F19 — guard against a stale glbUrl→meshes race where
      // the effect deps fire BEFORE the async load has repopulated
      // meshesRef. getScene() check ensures the mesh's backing Scene
      // matches the live one (mirrors TaggingCanvas:237-244).
      const scene = sceneRef.current;
      const safeAdd = (i: number) => {
        const m = meshes[i];
        if (!m) return;
        if (
          !scene ||
          (typeof m.getScene === 'function' && m.getScene() !== scene)
        ) {
          return;
        }
        // HighlightLayer.addMesh's TS signature wants Mesh; AbstractMesh
        // works at runtime — matches the cast TaggingCanvas already does.
        hl.addMesh(m as Mesh, accent);
      };
      for (const i of highlightedParts) safeAdd(i);
    }
  }, [mode, highlightedParts, loadEpoch, partColors]);

  // plan-015 U2 / R10 — idle auto-rotate. Tracks the latest pointer time
  // in a closure-scoped variable; the per-frame observer advances
  // camera.alpha when idle for > 3s. Effect-scoped observers are removed
  // on cleanup so toggling autoRotate=false at runtime stops the rotation.
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
  }, [autoRotate, mounted]);

  // Wrap the canvas so the absolute-positioned pills anchor to the well.
  // `position: relative` is required; the rest mirrors the bare-canvas size.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        data-testid="preview-canvas"
        data-bg={bg}
        data-mode={mode}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {modeToggle && onModeCycle && (
        <ModeTogglePill
          entry={MODE_PALETTE[mode]}
          onCycle={onModeCycle}
          testId={testIdSuffix ? `mode-toggle-pill-${testIdSuffix}` : 'mode-toggle-pill'}
        />
      )}
      {bgToggle && (
        <BgTogglePill
          entry={entry}
          onCycle={cycle}
          testId={testIdSuffix ? `bg-toggle-pill-${testIdSuffix}` : 'bg-toggle-pill'}
        />
      )}
    </div>
  );
});
