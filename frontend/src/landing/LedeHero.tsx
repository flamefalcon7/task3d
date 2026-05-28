import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
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

import {
  fetchBlobWithTimeout,
  WalrusFetchAbortedError,
  WalrusFetchTimeoutError,
} from '../walrus/fetchWithTimeout';
import { WALRUS_AGGREGATOR } from '../walrus/aggregator';
import {
  setupEdgesGradientSweep,
  type EdgesGradientSweepControl,
} from '../babylon/edgesGradientSweep';
import { frameCameraToMeshes } from '../babylon/PreviewCanvas';
import { truncateBlobId } from '../babylon/MeshInfoPanel';
import { tokens, viewerWell } from '../ux/tokens';
import { useLedeRenderMode } from './useLedeRenderMode';

// Canonical Walrus blob CID for L1 Collection #001 — replaced before deploy
// once Rick's pre-flight `/create` + `/launch` run mints the tusk. Until then
// the value is a placeholder long enough to exercise `truncateBlobId`.
const WALRUS_BLOB_CID = 'placeholder000000000000000000000000000000abcd';
const WALRUS_BLOB_URL = `${WALRUS_AGGREGATOR}/v1/blobs/${WALRUS_BLOB_CID}`;
const EMBEDDED_GLB_URL = '/models/tusk3d/walrus-tusk.glb';
const STATIC_KEYFRAME_URL = '/lede/tusk-keyframe.svg';
const STATIC_KEYFRAME_ALT =
  'Tusk3D Collection #001 — low-poly walrus tusk, line drawing gradient at 45% sweep, 3/4 view';

const WALRUS_TIMEOUT_MS = 3000;
const DWELL_MS = 15000;

const TUSK_PROMPT = 'a low-poly walrus tusk';
// Substituted at ship time once Rick mints — pre-deploy checklist item.
const MINT_DATE_PLACEHOLDER = '2026-05-NN';

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
  const sweepRef = useRef<EdgesGradientSweepControl | null>(null);
  const aliveRef = useRef(false);

  // null until a source (Walrus blob URL or embedded GLB URL) is selected.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [dwellElapsed, setDwellElapsed] = useState(false);

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

  // Scene effect — camera, light, attaches when engine is up. Cleanup
  // mirrors PreviewCanvas's `if (!engine.isDisposed)` guard so a teardown
  // ordering surprise doesn't crash into a disposed engine.
  useEffect(() => {
    if (!isLive) return;
    const engine = engineRef.current;
    if (!engine) return;
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera(
      'lede-cam',
      Math.PI / 4,
      Math.PI / 3,
      4,
      new Vector3(0, 0.5, 0),
      scene,
    );
    // No attachControl — the lede is a marketing surface; user grabbing the
    // hero canvas to orbit the tusk would drag it out of the framed 3/4
    // composition the static keyframe asset promises.
    new HemisphericLight('lede-hl', new Vector3(0, 1, 0), scene);
    scene.clearColor.set(0, 0, 0, 1);
    sceneRef.current = scene;

    return () => {
      if (!engine.isDisposed) {
        sweepRef.current?.dispose();
        containerRef.current?.dispose();
        scene.dispose();
        engine.wipeCaches(true);
      }
      sweepRef.current = null;
      containerRef.current = null;
      sceneRef.current = null;
    };
  }, [isLive]);

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

  // GLB load + sweep effect — keyed on sourceUrl. Fires once when Walrus
  // resolves (or times out and EMBEDDED_GLB_URL takes over); fires again on
  // the swap, with the previous container disposed first.
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
        // Dispose any prior sweep + container (Walrus→embedded swap path).
        sweepRef.current?.dispose();
        containerRef.current?.dispose();
        container.addAllToScene();
        containerRef.current = container;
        const camera = scene.activeCamera;
        if (camera instanceof ArcRotateCamera) {
          frameCameraToMeshes(camera, container.meshes);
        }
        const meshes = container.meshes.filter(
          (m: AbstractMesh) =>
            typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
        );
        sweepRef.current = setupEdgesGradientSweep(scene, meshes);
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
      <div style={wellStyle}>
        {isLive ? (
          <canvas
            ref={canvasRef}
            data-testid="lede-canvas"
            style={canvasInnerStyle}
          />
        ) : (
          <img
            src={STATIC_KEYFRAME_URL}
            alt={STATIC_KEYFRAME_ALT}
            data-testid="lede-static-image"
            style={canvasInnerStyle}
          />
        )}
      </div>
      <div style={captionBlockStyle} data-testid="lede-caption">
        <p style={captionLineStyle}>
          // L1 Collection #001 · prompt: "{TUSK_PROMPT}"
        </p>
        <p style={captionLineStyle}>
          // live from Walrus · {truncateBlobId(WALRUS_BLOB_CID)}
        </p>
        <p style={captionLineStyle}>
          // minted {MINT_DATE_PLACEHOLDER} · Tusk3D testnet
        </p>
      </div>
      {isLive && dwellElapsed && (
        <Link to="/launch" style={ctaStyle} data-testid="lede-cta">
          fork your own →
        </Link>
      )}
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

const canvasInnerStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const captionBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const captionLineStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.sm,
  color: tokens.color.hint,
  margin: 0,
  lineHeight: 1.6,
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
