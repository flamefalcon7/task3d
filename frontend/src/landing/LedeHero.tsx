import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { Link } from 'react-router-dom';
import {
  type AbstractMesh,
  ArcRotateCamera,
  type AssetContainer,
  Color3,
  DirectionalLight,
  Engine,
  HemisphericLight,
  LoadAssetContainerAsync,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  Vector2,
  Vector3,
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial';
import { ShadowOnlyMaterial } from '@babylonjs/materials/shadowOnly/shadowOnlyMaterial';
import '@babylonjs/loaders/glTF/index.js';

import {
  fetchBlobWithTimeout,
  WalrusFetchAbortedError,
  WalrusFetchTimeoutError,
} from '../walrus/fetchWithTimeout';
import { WALRUS_AGGREGATOR } from '../walrus/aggregator';
import { frameCameraToMeshes } from '../babylon/PreviewCanvas';
import { tokens, viewerWell } from '../ux/tokens';
import { EMBEDDED_TUSK_GLB_URL } from './tuskModel';
import { useInView } from './useInView';
import { useLedeRenderMode } from './useLedeRenderMode';

// D-093 — auto-rotate (new, unconditional; no idle gate, unlike PreviewCanvas).
const AUTO_ROTATE_RAD_PER_SEC = 0.2;
const MAX_FRAME_DELTA_S = 0.1;

// Canonical Walrus blob CID for L1 Collection #001 — replaced before deploy
// once Rick's pre-flight `/create` + `/launch` run mints the tusk. Until then
// the value is a placeholder long enough to exercise `truncateBlobId`.
const WALRUS_BLOB_CID = 'placeholder000000000000000000000000000000abcd';
const WALRUS_BLOB_URL = `${WALRUS_AGGREGATOR}/v1/blobs/${WALRUS_BLOB_CID}`;
const EMBEDDED_GLB_URL = EMBEDDED_TUSK_GLB_URL;
const STATIC_KEYFRAME_URL = '/lede/tusk-keyframe.svg';
const STATIC_KEYFRAME_ALT =
  'Tusk3D Collection #001 — low-poly walrus tusk, line drawing gradient at 45% sweep, 3/4 view';

const WALRUS_TIMEOUT_MS = 3000;
const DWELL_MS = 15000;

// Shift the framed tusk left so the right side is free for editorial content
// (left-image / right-text hero). Negative targetScreenOffset.x moves the model
// left on screen.
const TUSK_SCREEN_OFFSET_X = -1.2;

// Right-column editorial copy (jargon-free — no L1/L2/L3). The headline is the
// product tagline; the sub-line decodes it in plain words; the spec block is the
// "card stats" flavor.
const HERO_HEADLINE = 'Carve. Mint. Riff.';
const HERO_SUBLINE = 'Generate a model. Own it on Sui. Remix anyone’s.';
const HERO_SPEC: ReadonlyArray<readonly [string, string]> = [
  ['MODEL', 'walrus tusk'],
  ['STYLE', 'low-poly'],
  ['STORAGE', 'Walrus · live'],
  ['LICENSE', 'open to remix'],
];

export function LedeHero(): JSX.Element {
  const renderMode = useLedeRenderMode();
  const isLive = renderMode === 'live';

  // ---------------------------------------------------------------------
  // ALL HOOKS declared unconditionally — branching lives only in the JSX
  // return. The render-mode flag gates effect bodies, not declaration.
  // ---------------------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const containerRef = useRef<AssetContainer | null>(null);
  const shadowGenRef = useRef<ShadowGenerator | null>(null);
  const shadowGroundRef = useRef<AbstractMesh | null>(null);
  const gridGroundRef = useRef<AbstractMesh | null>(null);
  const aliveRef = useRef(false);

  // Pause the hero render loop when scrolled out of view (the brutalist hero is
  // fine frozen off-screen). Above the fold, so IntersectionObserver reports
  // in-view almost immediately on mount.
  const { ref: wellRef, inView } = useInView<HTMLDivElement>();

  // null until a source (Walrus blob URL or embedded GLB URL) is selected.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [dwellElapsed, setDwellElapsed] = useState(false);
  // false until the GLB is loaded + framed — gates the keyframe→canvas swap so
  // there's no grey/black flash before the tusk appears.
  const [sceneReady, setSceneReady] = useState(false);

  // Engine effect — one per LedeHero lifetime, only when live. Survives the
  // Walrus→embedded source swap so we don't thrash WebGL contexts.
  useEffect(() => {
    aliveRef.current = true;
    if (!isLive || !canvasRef.current) {
      return () => {
        aliveRef.current = false;
      };
    }
    const engine = new Engine(canvasRef.current, true);
    engine.runRenderLoop(() => sceneRef.current?.render());
    engineRef.current = engine;
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('resize', onResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, [isLive]);

  // Scene effect — the tusk blends into the page rather than sitting in its own
  // window (supersedes D-093's grey Blender viewport): clearColor = page paper
  // so the box has no visible boundary, a soft contact shadow grounds the model
  // on the page, and the canvas edges are feathered (CSS mask) so anything near
  // the box edge dissolves into the page instead of hard-clipping. Cleanup
  // mirrors PreviewCanvas's `if (!engine.isDisposed)` guard.
  useEffect(() => {
    if (!isLive) return;
    const engine = engineRef.current;
    if (!engine) return;
    setSceneReady(false); // fresh scene waits for its own GLB load before reveal
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera(
      'lede-cam',
      Math.PI / 4,
      Math.PI / 3,
      4,
      new Vector3(0, 0.5, 0),
      scene,
    );
    // No attachControl — auto-rotate only (R4). Grabbing the hero would drag it
    // out of the framed composition.
    new HemisphericLight('lede-hl', new Vector3(0, 1, 0), scene).intensity = 0.9;

    // Background = page paper (#F5F5F0) so the well merges into the page.
    const paper = Color3.FromHexString(tokens.color.paper);
    scene.clearColor.set(paper.r, paper.g, paper.b, 1);

    // Directional key light — gives the ivory tusk real shading (definition it
    // would lose washed-out on the light background) AND casts the contact shadow.
    const key = new DirectionalLight('lede-key', new Vector3(-0.45, -1, -0.35), scene);
    key.position = new Vector3(4, 8, 4);
    key.intensity = 1.5;

    // Shadow-only ground: invisible except where the tusk casts a soft shadow,
    // so the model reads as standing on the page, not floating. Y is set to the
    // model's base after load (model scale/origin is unknown until then).
    const ground = MeshBuilder.CreateGround('lede-shadow', { width: 20, height: 20 }, scene);
    ground.position.y = -1.1;
    ground.receiveShadows = true;
    const shadowMat = new ShadowOnlyMaterial('lede-shadow-mat', scene);
    shadowMat.activeLight = key;
    shadowMat.alpha = 0.22; // soft
    ground.material = shadowMat;
    shadowGroundRef.current = ground;

    const sg = new ShadowGenerator(1024, key);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 48;
    shadowGenRef.current = sg;

    // Faint "graph-paper" grid floor — sits just BELOW the shadow ground so the
    // soft shadow darkens over it (no z-fight). Lines are a muted warm grey on
    // the paper base so they read on the light background without turning the
    // well back into a dark viewport; the canvas edge-feather fades them out.
    const gridGround = MeshBuilder.CreateGround('lede-grid', { width: 20, height: 20 }, scene);
    gridGround.position.y = -1.12;
    const grid = new GridMaterial('lede-grid-mat', scene);
    grid.mainColor = paper;
    grid.lineColor = Color3.FromHexString('#9A968C');
    grid.opacity = 0.35;
    grid.gridRatio = 0.5;
    grid.majorUnitFrequency = 5;
    grid.minorUnitVisibility = 0.45;
    gridGround.material = grid;
    gridGroundRef.current = gridGround;

    // New unconditional auto-rotate observer — no pointer idle gate (the hero
    // has no pointer interaction). Per-frame delta capped so a resume-after-
    // pause can't snap the camera.
    let lastMs = performance.now();
    scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      const deltaS = Math.min((now - lastMs) / 1000, MAX_FRAME_DELTA_S);
      lastMs = now;
      camera.alpha += AUTO_ROTATE_RAD_PER_SEC * deltaS;
    });

    sceneRef.current = scene;

    return () => {
      if (!engine.isDisposed) {
        containerRef.current?.dispose();
        scene.dispose();
        engine.wipeCaches(true);
      }
      containerRef.current = null;
      shadowGenRef.current = null;
      shadowGroundRef.current = null;
      gridGroundRef.current = null;
      sceneRef.current = null;
    };
  }, [isLive]);

  // Pause/resume the render loop with viewport visibility. The engine + scene
  // stay warm (offscreenPolicy 'pause' — the hero is the one always-warm well);
  // only the rAF stops when scrolled away.
  useEffect(() => {
    if (!isLive) return;
    const engine = engineRef.current;
    if (!engine) return;
    if (inView) {
      engine.runRenderLoop(() => sceneRef.current?.render());
    } else {
      engine.stopRenderLoop();
    }
  }, [isLive, inView]);

  // Walrus fetch effect — runs once per live mount. Sets sourceUrl to a
  // blob: URL on success OR to EMBEDDED_GLB_URL on timeout. External abort
  // (component unmount) is a silent no-op.
  //
  // Blob URL lifetime: ownership is transferred to the GLB-load effect once
  // setSourceUrl is called — its cleanup revokes the URL when sourceUrl
  // changes or on unmount. The fetch cleanup only revokes URLs we created
  // but never published to state (the unmount-mid-resolve window).
  useEffect(() => {
    if (!isLive) return;
    const localAlive = { current: true };
    const controller = new AbortController();
    let unpublishedUrl: string | null = null;
    (async () => {
      try {
        const bytes = await fetchBlobWithTimeout(WALRUS_BLOB_URL, {
          timeoutMs: WALRUS_TIMEOUT_MS,
          signal: controller.signal,
        });
        if (!localAlive.current) return;
        const blob = new Blob([bytes], { type: 'model/gltf-binary' });
        const objectUrl = URL.createObjectURL(blob);
        unpublishedUrl = objectUrl;
        if (localAlive.current) {
          setSourceUrl(objectUrl);
          unpublishedUrl = null; // ownership handed off to GLB-load cleanup
        }
      } catch (err) {
        if (!localAlive.current) return;
        if (err instanceof WalrusFetchTimeoutError) {
          setSourceUrl(EMBEDDED_GLB_URL);
          return;
        }
        if (err instanceof WalrusFetchAbortedError) return;
        // eslint-disable-next-line no-console
        console.warn('LedeHero: Walrus fetch failed, using embedded GLB', err);
        setSourceUrl(EMBEDDED_GLB_URL);
      }
    })();
    return () => {
      localAlive.current = false;
      controller.abort();
      if (unpublishedUrl) URL.revokeObjectURL(unpublishedUrl);
    };
  }, [isLive]);

  // GLB load effect — keyed on sourceUrl. Fires once when Walrus resolves (or
  // times out and EMBEDDED_GLB_URL takes over); fires again on the swap, with
  // the previous container disposed first. No wireframe sweep on the hero — the
  // Blender viewport reads cleaner as a solid PBR tusk (review-corrected: the
  // sweep's world-X clip plane fights camera-orbit auto-rotate).
  useEffect(() => {
    if (!isLive || !sourceUrl) return;
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;
    (async () => {
      try {
        const container = await LoadAssetContainerAsync(sourceUrl, scene, {
          pluginExtension: '.glb',
        });
        // After await: the scene effect's cleanup may have disposed the scene
        // (StrictMode double-mount, viewport flip across breakpoint). Babylon's
        // addAllToScene silently writes to a dead render graph, so we must
        // detect a disposed scene here and bail before mutating anything.
        if (cancelled || scene.isDisposed) {
          container.dispose();
          return;
        }
        // Dispose any prior container (Walrus→embedded swap path).
        containerRef.current?.dispose();
        container.addAllToScene();
        containerRef.current = container;
        const camera = scene.activeCamera;
        if (camera instanceof ArcRotateCamera) {
          frameCameraToMeshes(camera, container.meshes);
          // Push the model left so the right column has room.
          camera.targetScreenOffset = new Vector2(TUSK_SCREEN_OFFSET_X, 0);
        }
        // Ground the contact shadow at the model's base + register casters
        // (model scale/origin is only known now, after load + framing).
        const sg = shadowGenRef.current;
        const ground = shadowGroundRef.current;
        let minY = Infinity;
        for (const m of container.meshes as AbstractMesh[]) {
          if (typeof m.getTotalVertices !== 'function' || m.getTotalVertices() === 0) continue;
          m.computeWorldMatrix(true);
          minY = Math.min(minY, m.getBoundingInfo().boundingBox.minimumWorld.y);
          sg?.addShadowCaster(m);
        }
        if (Number.isFinite(minY)) {
          if (ground) ground.position.y = minY - 0.02;
          // Grid sits just below the shadow ground so the shadow reads over it.
          if (gridGroundRef.current) gridGroundRef.current.position.y = minY - 0.04;
        }
        // Tusk loaded + framed — reveal the canvas, hide the keyframe placeholder.
        setSceneReady(true);
      } catch (err) {
        // Embedded GLB load failure is logged but does not bubble to React —
        // an error boundary would be overkill for a single optional asset.
        // eslint-disable-next-line no-console
        console.warn('LedeHero: GLB load failed', err);
      }
    })();
    return () => {
      cancelled = true;
      // Own the blob: URL's lifetime here — revoke when the source changes
      // (Walrus→embedded swap) or on unmount. Static/embedded URLs are
      // never revoked.
      if (sourceUrl && sourceUrl.startsWith('blob:')) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [isLive, sourceUrl]);

  // Dwell timer — 15s after live mount, flip the CTA flag. Resets the flag on
  // each isLive=true entry so a viewport flip false→true→false→true doesn't
  // pop the CTA instantly the second time around (the brutalist spec requires
  // a real 15s dwell on each fresh entry, not a persisted boolean).
  useEffect(() => {
    if (!isLive) return;
    setDwellElapsed(false);
    const timer = window.setTimeout(() => {
      setDwellElapsed(true);
    }, DWELL_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isLive]);

  // ---------------------------------------------------------------------
  // Render — branches on renderMode in JSX only.
  // ---------------------------------------------------------------------
  return (
    <section style={sectionStyle} data-testid="lede-hero" data-render-mode={renderMode}>
      <div ref={wellRef} style={isLive ? liveWellStyle : wellStyle}>
        {isLive ? (
          // Canvas fades in once the tusk is framed; until then the paper well
          // background shows through (opacity 0) — same color as the page, so
          // the load reads as blank page rather than a flash.
          <canvas
            ref={canvasRef}
            data-testid="lede-canvas"
            role="img"
            aria-label={STATIC_KEYFRAME_ALT}
            style={{ ...fillStyle, objectFit: 'cover', opacity: sceneReady ? 1 : 0 }}
          />
        ) : (
          <img
            src={STATIC_KEYFRAME_URL}
            alt={STATIC_KEYFRAME_ALT}
            data-testid="lede-static-image"
            style={canvasInnerStyle}
          />
        )}
        {isLive && (
          <div style={contentColStyle} data-testid="lede-content">
            <div style={headlineStyle}>{HERO_HEADLINE}</div>
            <p style={subStyle}>{HERO_SUBLINE}</p>
            <dl style={specStyle}>
              {HERO_SPEC.map(([k, v]) => (
                <div key={k} style={specRowStyle}>
                  <dt style={specKeyStyle}>{k}</dt>
                  <dd style={specValStyle}>{v}</dd>
                </div>
              ))}
            </dl>
            {dwellElapsed && (
              <Link to="/launch" style={ctaInColumnStyle} data-testid="lede-cta">
                fork your own →
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: tokens.space[4],
  padding: `${tokens.space[8]}px ${tokens.space[6]}px`,
  maxWidth: 1280,
  margin: '0 auto',
};

const wellStyle: CSSProperties = {
  ...viewerWell,
  aspectRatio: '16 / 10',
  width: '100%',
};

// Live hero blends into the page: paper background (not the D-044 black well)
// so the feathered canvas edges reveal page paper, not black. Static-fallback
// (mobile) keeps the black well + keyframe via the plain wellStyle above.
const liveWellStyle: CSSProperties = {
  ...wellStyle,
  background: tokens.color.paper,
};

// Radial feather so the box has no hard rectangular boundary — content near the
// edges dissolves into the page. Inner ~70% stays fully opaque (the tusk reads
// crisp); the outer band fades to transparent.
const EDGE_FEATHER = 'radial-gradient(115% 115% at 50% 50%, #000 70%, transparent 100%)';

const canvasInnerStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

// Absolute-fill so the keyframe placeholder and the live canvas stack inside the
// (position: relative) well — the placeholder sits beneath until sceneReady.
const fillStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  maskImage: EDGE_FEATHER,
  WebkitMaskImage: EDGE_FEATHER,
};

const ctaStyle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.lg,
  color: tokens.color.accent,
  textDecoration: 'none',
  alignSelf: 'flex-start',
  // D-044 §7 — no transition, no opacity fade. CTA appears via conditional
  // render at t=15s; the appearance IS the motion.
};

// Right editorial column — overlays the right ~42% of the well (tusk is pushed
// left). pointer-events:none so the (transparent) column never blocks the
// canvas; only the CTA link re-enables them.
const contentColStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: '42%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: tokens.space[3],
  paddingRight: tokens.space[8],
  paddingLeft: tokens.space[4],
  pointerEvents: 'none',
};

const headlineStyle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: 46,
  lineHeight: 1.05,
  color: tokens.color.ink,
};

const subStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.sm,
  color: tokens.color.muted,
  margin: 0,
  lineHeight: 1.5,
  maxWidth: 280,
};

const specStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
};

const specRowStyle: CSSProperties = {
  display: 'flex',
  gap: tokens.space[2],
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
};

const specKeyStyle: CSSProperties = {
  width: 76,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: tokens.color.subtle,
  margin: 0,
};

const specValStyle: CSSProperties = {
  margin: 0,
  color: tokens.color.hint,
};

const ctaInColumnStyle: CSSProperties = {
  ...ctaStyle,
  pointerEvents: 'auto',
  marginTop: tokens.space[2],
};
