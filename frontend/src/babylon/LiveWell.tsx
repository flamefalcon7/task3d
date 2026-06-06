import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import {
  type AbstractMesh,
  ArcRotateCamera,
  type AssetContainer,
  Engine,
  HemisphericLight,
  LoadAssetContainerAsync,
  Scene,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';

import { frameCameraToMeshes } from './PreviewCanvas';
import { useInView } from '../landing/useInView';
import { useLedeRenderMode } from '../landing/useLedeRenderMode';

// ~0.2 rad/s, the constant borrowed from PreviewCanvas — but the mechanism here
// is a NEW unconditional rotator with no pointer idle gate (the wells have no
// pointer interaction). Per-frame delta is capped so a resume-after-pause (or a
// long first frame) can't snap the camera by a large angle.
const AUTO_ROTATE_RAD_PER_SEC = 0.2;
const MAX_FRAME_DELTA_S = 0.1;

// Warm near-black "pocket" (D-094 harmony) — softer than pure #000 and matched
// to the .well radial gradient behind, so the dark center dissolves into the
// page at the feathered edges. #14110D → rgb(20,17,13)/255.
const WELL_POCKET_RGB = [0.078, 0.067, 0.051] as const;
// Same radial edge-feather signature as the hero: dark center, edges fade out so
// the dark canvas melts into the paper rather than ending in a hard rectangle.
const EDGE_FEATHER = 'radial-gradient(120% 120% at 50% 50%, #000 66%, transparent 100%)';

// First-class kill-switch (D-093 / plan-2026-06-06-001). When
// VITE_LANDING_LIVE_WELLS === '0' the wells collapse to their static fallback —
// the one-flip revert if the live path janks on the demo machine.
const LIVE_WELLS_ENABLED =
  (import.meta.env.VITE_LANDING_LIVE_WELLS as string | undefined) !== '0';

export interface LiveWellSceneContext {
  scene: Scene;
  camera: ArcRotateCamera;
  container: AssetContainer;
  /** GLB meshes with geometry (glTF __root__ / empty nodes filtered out). */
  meshes: AbstractMesh[];
}

export interface LiveWellProps {
  glbUrl: string;
  /** Static SVG/image used both as the low-end fallback AND the mount placeholder. */
  staticSrc: string;
  staticAlt: string;
  /** Required: a plain-language description of what the well depicts (a bare <canvas> is opaque to AT). */
  ariaLabel: string;
  /** Testid root: `{base}`, `{base}-canvas`, `{base}-static-image`. */
  testIdBase: string;
  /**
   * Off-screen behaviour. 'dispose' (default) tears the engine down to bound
   * resident WebGL contexts; 'pause' keeps the context warm and only stops the
   * render loop (used by the always-warm hero, which manages its own engine).
   */
  offscreenPolicy?: 'dispose' | 'pause';
  /** Default true = slow full turntable. MODEL passes false to install its own bounded oscillation. */
  autoRotate?: boolean;
  /** scene.clearColor as [r,g,b] 0–1. Defaults to D-044 black well. */
  clearColor?: readonly [number, number, number];
  /**
   * Decorate the base scene after GLB load + camera frame (sweep, instances,
   * VFX). May return a cleanup that runs before the scene is disposed.
   */
  onSceneReady?: (ctx: LiveWellSceneContext) => void | (() => void);
}

const FILL: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
};

/**
 * Lazy-mounted Babylon well (U3). Creates its scene only when scrolled into
 * view (IntersectionObserver), disposes (or pauses) it off-screen, and falls
 * back to a static image on low-end/mobile (useLedeRenderMode) or when the
 * kill-switch is off. Lifecycle discipline mirrors PreviewCanvas: cancellation
 * token on the async GLB load, `scene.isDisposed` guard after every await,
 * `!engine.isDisposed` guard around the dispose chain, `engine.wipeCaches(true)`.
 */
export function LiveWell({
  glbUrl,
  staticSrc,
  staticAlt,
  ariaLabel,
  testIdBase,
  offscreenPolicy = 'dispose',
  autoRotate = true,
  clearColor = WELL_POCKET_RGB,
  onSceneReady,
}: LiveWellProps): JSX.Element {
  const renderMode = useLedeRenderMode();
  const isLive = renderMode === 'live' && LIVE_WELLS_ENABLED;
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  const sceneCleanupRef = useRef<(() => void) | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const loadTokenRef = useRef(0);

  // Keep the latest decorator/clearColor in refs so teardown/build don't churn
  // on identity changes (callers pass inline closures).
  const onSceneReadyRef = useRef(onSceneReady);
  onSceneReadyRef.current = onSceneReady;
  const clearColorRef = useRef(clearColor);
  clearColorRef.current = clearColor;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const glbUrlRef = useRef(glbUrl);
  glbUrlRef.current = glbUrl;

  const [ready, setReady] = useState(false);

  const teardown = useCallback(() => {
    loadTokenRef.current++; // invalidate any in-flight load
    const engine = engineRef.current;
    if (engine && !engine.isDisposed) {
      sceneCleanupRef.current?.();
      containerRef.current?.dispose();
      sceneRef.current?.dispose();
      engine.wipeCaches(true);
      engine.dispose();
    }
    resizeCleanupRef.current?.();
    engineRef.current = null;
    sceneRef.current = null;
    containerRef.current = null;
    sceneCleanupRef.current = null;
    resizeCleanupRef.current = null;
    setReady(false);
  }, []);

  const build = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || engineRef.current) return;

    const engine = new Engine(canvas, true);
    engine.runRenderLoop(() => sceneRef.current?.render());
    engineRef.current = engine;

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    resizeCleanupRef.current = () => window.removeEventListener('resize', onResize);

    const scene = new Scene(engine);
    const [r, g, b] = clearColorRef.current;
    scene.clearColor.set(r, g, b, 1);
    const camera = new ArcRotateCamera(
      'livewell-cam',
      Math.PI / 4,
      Math.PI / 3,
      4,
      new Vector3(0, 0.5, 0),
      scene,
    );
    // No attachControl — these are marketing surfaces, not interactive viewers.
    new HemisphericLight('livewell-hl', new Vector3(0, 1, 0), scene);
    sceneRef.current = scene;

    if (autoRotateRef.current) installAutoRotate(scene);

    const token = ++loadTokenRef.current;
    void (async () => {
      try {
        const container = await LoadAssetContainerAsync(glbUrlRef.current, scene, {
          pluginExtension: '.glb',
        });
        // The scene effect may have torn down while we awaited (StrictMode,
        // scroll-out, unmount). Bail before mutating a dead render graph.
        if (token !== loadTokenRef.current || scene.isDisposed) {
          container.dispose();
          return;
        }
        container.addAllToScene();
        containerRef.current = container;
        const meshes = container.meshes.filter(
          (m: AbstractMesh) =>
            typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
        );
        if (camera instanceof ArcRotateCamera) frameCameraToMeshes(camera, meshes);
        const cleanup = onSceneReadyRef.current?.({ scene, camera, container, meshes });
        if (typeof cleanup === 'function') sceneCleanupRef.current = cleanup;
        setReady(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`LiveWell(${testIdBase}): GLB load failed`, err);
      }
    })();
  }, [testIdBase]);

  // Single lifecycle effect keyed on (isLive, inView). Creates on first
  // in-view, disposes or pauses off-screen per policy, resumes on re-entry.
  useEffect(() => {
    if (!isLive) {
      teardown();
      return;
    }
    if (inView) {
      if (engineRef.current) {
        engineRef.current.runRenderLoop(() => sceneRef.current?.render()); // resume (pause policy)
      } else {
        build();
      }
    } else if (engineRef.current) {
      if (offscreenPolicy === 'pause') {
        engineRef.current.stopRenderLoop();
      } else {
        teardown();
      }
    }
  }, [isLive, inView, offscreenPolicy, build, teardown]);

  // Unmount teardown lives in its own effect so the lifecycle effect above can
  // re-run on dep changes without disposing the engine on every change.
  useEffect(() => () => teardown(), [teardown]);

  if (!isLive) {
    return (
      <div ref={inViewRef} data-testid={testIdBase} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <img
          src={staticSrc}
          alt={staticAlt}
          data-testid={`${testIdBase}-static-image`}
          style={{ ...FILL, objectFit: 'contain' }}
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      </div>
    );
  }

  return (
    <div ref={inViewRef} data-testid={testIdBase} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Placeholder beneath the canvas until the scene is framed — no black flash. */}
      {!ready && (
        <img
          src={staticSrc}
          alt={staticAlt}
          data-testid={`${testIdBase}-static-image`}
          aria-hidden
          style={{ ...FILL, objectFit: 'contain' }}
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        data-testid={`${testIdBase}-canvas`}
        role="img"
        aria-label={ariaLabel}
        style={{
          ...FILL,
          objectFit: 'cover',
          opacity: ready ? 1 : 0,
          maskImage: EDGE_FEATHER,
          WebkitMaskImage: EDGE_FEATHER,
        }}
      />
    </div>
  );
}

// Unconditional auto-rotate observer — no idle gate (unlike PreviewCanvas).
// Disposed implicitly when the scene is disposed.
function installAutoRotate(scene: Scene): void {
  let lastMs = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const deltaS = Math.min((now - lastMs) / 1000, MAX_FRAME_DELTA_S);
    lastMs = now;
    const cam = scene.activeCamera;
    if (cam instanceof ArcRotateCamera) {
      cam.alpha += AUTO_ROTATE_RAD_PER_SEC * deltaS;
    }
  });
}
