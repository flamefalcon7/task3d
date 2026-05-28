import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useOwnedTokens, useTokenById, type OwnedToken } from './useOwnedTokens';
import { glbUrlForToken } from '../walrus/aggregator';
import { CarCarousel } from './carCarousel';
import { createRacetrackScene } from './racetrackScene';
import type { RacetrackSceneHandles } from './racetrackScene';
import { initialLapState, waitingLapState, type LapState } from './lapState';
import { getPb, setPb } from './personalBest';
import { ResultOverlay } from './ResultOverlay';
import { formatHudTime } from './formatLapTime';
import { Countdown } from './Countdown';
import { displayHeadline, eyebrow, monoLabel, tokens } from '../ux/tokens';

// Phase 3 U6 / U11 — /track page. Wraps the Babylon scene in a React shell:
// query owned NftTokens → render carousel + canvas → rebuild scene each time
// the selected token changes. D-004: show a loading overlay while the Walrus
// fetch + scene-build is in flight (critical for the demo recording so the
// canvas doesn't go blank during the swap).
//
// Brutalist editorial styling per D-044: chrome recedes, full-bleed black
// canvas, mono uppercase HUDs without borders, italic-serif empty/error
// states. The page IS the well.

interface LastResult {
  lapMs: number;
  previousPbMs: number | null;
  isNewPb: boolean;
}

// Page-level styles.

const wellPage: CSSProperties = {
  background: tokens.color.well,
  color: tokens.color.wellInk,
  minHeight: '100vh',
};

const wellMain: CSSProperties = {
  padding: '24px 24px 48px',
  maxWidth: 1400,
  margin: '0 auto',
};

const pageHeader: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 16,
};

const wellEyebrow: CSSProperties = {
  ...eyebrow,
  color: 'rgba(255,255,255,0.7)',
};

const wellHeadline: CSSProperties = {
  ...displayHeadline,
  color: tokens.color.wellInk,
  fontSize: 28,
};

const canvasShell: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '68vh',
  background: tokens.color.well,
  overflow: 'hidden',
  border: '1.5px solid rgba(255,255,255,0.15)',
};

const sceneOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.85)',
  color: tokens.color.wellInk,
};

const sceneOverlayCenter: CSSProperties = {
  textAlign: 'center',
  padding: 24,
};

const hudLap: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 24,
  ...monoLabel,
  color: tokens.color.wellInk,
  letterSpacing: '2px',
  fontSize: 18,
  textTransform: 'none',
};

const hudBest: CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 24,
  ...monoLabel,
  color: 'rgba(255,255,255,0.7)',
  letterSpacing: '1.5px',
  fontSize: 13,
  textTransform: 'none',
};

const driveHint: CSSProperties = {
  ...monoLabel,
  color: 'rgba(255,255,255,0.5)',
  marginTop: 16,
  textTransform: 'none',
  letterSpacing: '0.5px',
};

const emptyStack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  alignItems: 'flex-start',
};

const emptyTitle: CSSProperties = {
  ...displayHeadline,
  color: tokens.color.wellInk,
  fontSize: 36,
};

const emptySub: CSSProperties = {
  ...monoLabel,
  color: 'rgba(255,255,255,0.6)',
  letterSpacing: '0.5px',
  textTransform: 'none',
};

const emptyLink: CSSProperties = {
  ...monoLabel,
  color: tokens.color.accent,
  textDecoration: 'underline',
};

export function TrackPage() {
  const account = useCurrentAccount();
  // U11 override modes (both skip the owned-tokens wallet query):
  //   ?blob=<id>  — dev hatch: drive a raw standalone Walrus blob with no chain
  //                 lookup (exercise the scene before any real token exists).
  //   ?model=<id> — single-drive: resolve ONE NftToken's patch_id on chain.
  //                 The race-on-mint demo arc auto-navigates here; the driver
  //                 may not be the connected wallet, so we read the token by id
  //                 rather than relying on owned-objects discovery.
  // ?blob= wins when both are present.
  const [searchParams] = useSearchParams();
  const modelParam = searchParams.get('model');
  const blobOverride = searchParams.get('blob');
  const blobToken = useMemo<OwnedToken | null>(
    () =>
      blobOverride
        ? {
            tokenId: modelParam ?? 'dev-blob',
            name: 'prototype',
            patchId: '',
            collectionId: '',
            baseModelId: '',
            blobId: blobOverride,
          }
        : null,
    [blobOverride, modelParam],
  );
  const isOverrideMode = blobOverride !== null || modelParam !== null;
  const {
    token: modelToken,
    loading: modelLoading,
    error: modelError,
  } = useTokenById(blobOverride ? undefined : modelParam ?? undefined);
  const {
    tokens: ownedTokens,
    loading: ownedLoading,
    error: ownedError,
  } = useOwnedTokens(isOverrideMode ? undefined : account?.address);
  const tokensList: OwnedToken[] = blobToken
    ? [blobToken]
    : modelToken
      ? [modelToken]
      : isOverrideMode
        ? []
        : ownedTokens;
  // Unified loading/error across the three discovery paths. The ?blob= hatch is
  // synchronous (no fetch), so it never reports loading/error.
  const tokensLoading = blobToken
    ? false
    : isOverrideMode
      ? modelLoading
      : ownedLoading;
  const tokensError = blobToken ? null : isOverrideMode ? modelError : ownedError;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  // U4 — lap state mirrored from the scene's onLapStateChange callback.
  // Scene holds the source of truth; React just renders snapshots.
  const [lapState, setLapState] = useState<LapState>(initialLapState);
  // U4 — current PB for the selected car. Read from localStorage on car
  // change; updated when a finished lap beats it.
  const [pb, setPbState] = useState<number | null>(null);
  // U4 — populated when the lap state transitions to `finished`. Drives
  // the ResultOverlay modal. Cleared on Retry (lap state back to waiting).
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  // Plan-006 U8 — gates the countdown overlay. Scene fires onOrbitComplete
  // when the camera orbit finishes; that flips this flag and the
  // <Countdown /> mounts. Reset on each scene rebuild (carousel switch).
  const [orbitDone, setOrbitDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RacetrackSceneHandles | null>(null);

  // Keep selectedIdx in range when the token list changes (initial fetch
  // or post-mint refresh).
  useEffect(() => {
    if (selectedIdx >= tokensList.length) setSelectedIdx(0);
  }, [tokensList.length, selectedIdx]);

  const selected = tokensList[selectedIdx];

  // U4/U5 — when the selected variant changes (carousel switch), reset
  // React-side game state and re-read the PB for the new car.
  // Plan-006 U8 — also reset orbitDone so the new scene's intro plays from
  // the top (camera orbit + countdown overlay reset).
  useEffect(() => {
    setLapState(initialLapState());
    setLastResult(null);
    setOrbitDone(false);
    setPbState(selected ? getPb(selected.tokenId) : null);
  }, [selected]);

  // Build (and rebuild) the scene whenever the selected variant changes.
  // Each rebuild disposes the previous scene to avoid stacking engines.
  // The AbortController + post-await cancellation guards together prevent
  // two race-leaks reviewers caught: a rapid carousel switch must (a) abort
  // the in-flight Walrus fetch so we don't waste bandwidth and (b) dispose
  // any scene that finished initialising AFTER cancellation fired, so we
  // never overwrite sceneRef with an orphaned engine.
  useEffect(() => {
    if (!canvasRef.current || !selected) return;
    const canvas = canvasRef.current; // capture before any await
    let cancelled = false;
    const controller = new AbortController();
    setSceneLoading(true);
    setSceneError(null);
    (async () => {
      try {
        const url = glbUrlForToken(selected);
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Walrus aggregator ${res.status}`);
        const carGlbBytes = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        sceneRef.current?.dispose();
        sceneRef.current = null;
        // Plan-006 U8 — onIntroSkipRequested is wired through a mutable ref
        // box rather than sceneRef so it survives the render-loop-starts-
        // before-await-returns window. Without this, the first 5-10 frames
        // of intro can fire onIntroSkipRequested while sceneRef is still
        // null (silent ?. drop) and the hold-W gesture is permanently
        // disarmed for that scene instance.
        const introSkipBox: { dispatch: (() => void) | null } = { dispatch: null };
        const handles = await createRacetrackScene({
          canvas,
          carGlbBytes,
          onLapStateChange: setLapState,
          // Plan-006 U8 — show the countdown once the orbit completes.
          onOrbitComplete: () => setOrbitDone(true),
          // Hold-W during intro = jump straight to waiting. Route the
          // request back as an introSkip dispatch on the scene we just
          // built (still in scope here).
          onIntroSkipRequested: () => introSkipBox.dispatch?.(),
        });
        introSkipBox.dispatch = handles.dispatchIntroSkip;
        if (cancelled) {
          handles.dispose();
          return;
        }
        sceneRef.current = handles;
      } catch (e) {
        // AbortError is the expected unwind on cleanup; don't surface it.
        if (cancelled) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setSceneError(e instanceof Error ? e.message : String(e));
        // Plan-006 U8 — if scene init failed, lapState is still 'intro'
        // (from the carousel-switch reset) and no scene exists to dispatch
        // introComplete/Skip. Recover to 'waiting' so the player isn't
        // wedged behind a phantom intro state.
        setLapState(waitingLapState());
      } finally {
        if (!cancelled) setSceneLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selected]);

  // U4 — on lap finish, write PB + populate result modal. Captures the
  // CURRENT pb (pre-update) so the modal shows delta vs the old best.
  //
  // The `lastResult !== null` guard is load-bearing for the carousel-switch
  // race: when `selected` changes from A to B while car A's result modal is
  // showing, this effect's `selected` dep fires WITH lapState.status still
  // 'finished' and finishedLapMs still A's value (the selected-effect's
  // setLapState(initial) is queued for the next render). Without the guard,
  // setPb(B.objectId, A.lapMs) would corrupt B's PB storage. The closure
  // here still sees the old `lastResult` (set on the original finish),
  // so the guard correctly skips. After selected-effect's setLastResult(null)
  // commits in the next render, lapState.status is also 'waiting' and the
  // first status guard catches the re-fire instead.
  useEffect(() => {
    if (
      lapState.status !== 'finished' ||
      lapState.finishedLapMs === null ||
      !selected
    ) {
      return;
    }
    if (lastResult !== null) return; // already wrote PB for this finish
    const lapMs = lapState.finishedLapMs;
    const previousPbMs = pb;
    const isNewPb = previousPbMs === null || lapMs < previousPbMs;
    if (isNewPb) {
      setPb(selected.tokenId, lapMs);
      setPbState(lapMs);
    }
    setLastResult({ lapMs, previousPbMs, isNewPb });
    // pb intentionally omitted from deps — we want a single snapshot at
    // finish-time, not a re-evaluation when setPbState fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lapState.status, lapState.finishedLapMs, selected, lastResult]);

  // U4 — Retry calls scene.reset() which teleports the car + dispatches
  // `reset` to the lap state machine; the resulting `waiting` state clears
  // the modal via the next effect.
  const handleRetry = useCallback(() => {
    sceneRef.current?.reset();
  }, []);

  // Plan-006 U8 — stable reference so Countdown's effect doesn't reset its
  // setTimeout chain on every parent re-render.
  const handleCountdownComplete = useCallback(() => {
    sceneRef.current?.dispatchIntroComplete();
  }, []);

  // Clear the modal when state machine returns to waiting (post-reset).
  useEffect(() => {
    if (lapState.status === 'waiting') setLastResult(null);
  }, [lapState.status]);

  // R13 — keyboard 'r'/'R' equivalent to clicking Retry. Works mid-run too
  // so the player can abort a bad lap. No-op while waiting (nothing to reset).
  //
  // Skip when a modifier is held (Cmd-R hard-reload, Cmd-Shift-R, Ctrl-R)
  // and when focus is in a text-entry field so future inputs on /track
  // (search box, comment field, etc.) don't trigger retry while typing.
  //
  // Skip during 'intro' too — pressing R mid-orbit would silently dispatch
  // reset and abort the cinematic without the player seeing a countdown.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (lapState.status === 'waiting' || lapState.status === 'intro') return;
      handleRetry();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lapState.status, handleRetry]);

  // Final unmount cleanup. The variant-change effect above already disposes
  // when switching cars, but unmount needs its own tear-down.
  useEffect(() => {
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // U11 — only the carousel (owned-tokens) path needs a connected wallet. Both
  // override modes (?model= / ?blob=) resolve a token without one.
  if (!isOverrideMode && !account) {
    return (
      <div style={wellPage} data-testid="track-needs-signin">
        <div style={wellMain}>
          <div style={pageHeader}>
            <span style={wellEyebrow}>— L3 / DRIVE</span>
            <h1 style={wellHeadline}>Tiny Racetrack.</h1>
          </div>
          <div style={emptyStack}>
            <p style={emptyTitle}>Connect a wallet.</p>
            <p style={emptySub}>TO DRIVE THE NFTS YOU OWN</p>
          </div>
        </div>
      </div>
    );
  }
  if (tokensLoading) {
    return (
      <div style={wellPage} data-testid="track-loading-variants">
        <div style={wellMain}>
          <p style={{ ...monoLabel, color: 'rgba(255,255,255,0.7)' }}>— LOADING YOUR NFTS</p>
        </div>
      </div>
    );
  }
  if (tokensError) {
    return (
      <div style={wellPage} data-testid="track-variants-error">
        <div style={wellMain}>
          <p style={{ ...monoLabel, color: tokens.color.err, textTransform: 'none', letterSpacing: '0.5px' }}>
            × FAILED · Couldn't load your NFTs: {tokensError.message}
          </p>
        </div>
      </div>
    );
  }
  if (tokensList.length === 0) {
    return (
      <div style={wellPage} data-testid="track-empty">
        <div style={wellMain}>
          <div style={pageHeader}>
            <span style={wellEyebrow}>— L3 / DRIVE</span>
            <h1 style={wellHeadline}>Tiny Racetrack.</h1>
          </div>
          <div style={emptyStack}>
            <p style={emptyTitle}>Nothing to drive yet.</p>
            <p style={emptySub}>
              MINT A COLLECTION ON{' '}
              <Link to="/launch" style={emptyLink}>/LAUNCH</Link>{' '}
              OR BUY ONE ON{' '}
              <Link to="/market" style={emptyLink}>/MARKET</Link>.
            </p>
            <Link to="/browse" data-testid="track-empty-browse" style={emptyLink}>
              ← BROWSE
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wellPage} data-testid="track-page">
      <div style={wellMain}>
        <div style={pageHeader}>
          <span style={wellEyebrow}>— L3 / DRIVE</span>
          <h1 style={wellHeadline}>Tiny Racetrack.</h1>
        </div>
        <CarCarousel
          tokens={tokensList}
          selectedIdx={selectedIdx}
          onSelect={setSelectedIdx}
        />
        <div style={canvasShell}>
          <canvas
            ref={canvasRef}
            data-testid="track-canvas"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
          {sceneLoading && (
            <div data-testid="track-scene-loading" style={sceneOverlay}>
              <div style={sceneOverlayCenter}>
                <p style={{ ...monoLabel, fontSize: 14, letterSpacing: '2px' }}>
                  — LOADING TRACK · BABYLON + HAVOK
                </p>
              </div>
            </div>
          )}
          {sceneError && !sceneLoading && (
            <div data-testid="track-scene-error" style={{ ...sceneOverlay, background: 'rgba(40, 0, 0, 0.85)' }}>
              <div style={sceneOverlayCenter}>
                <p style={{ ...monoLabel, color: tokens.color.err, fontSize: 14, letterSpacing: '2px', marginBottom: 8 }}>
                  × LOAD FAILED
                </p>
                <p style={{ ...monoLabel, color: tokens.color.wellInk, textTransform: 'none', letterSpacing: '0.5px' }}>
                  {sceneError}
                </p>
              </div>
            </div>
          )}
          {/* Plan-006 U8 — countdown overlay. Mounts only when the camera
              orbit completes AND the lap state is still 'intro' (i.e. user
              hasn't skipped via hold-W). On GO step, fires onComplete →
              scene.dispatchIntroComplete → lapState transitions to waiting
              → this overlay unmounts. */}
          {!sceneError &&
            orbitDone &&
            lapState.status === 'intro' && (
              <Countdown onComplete={handleCountdownComplete} />
            )}
          {/* U4 — HUD overlay (KTD-3, React not Babylon GUI). Stays mounted
              during scene reload so the values for the new car are immediately
              visible behind the loading overlay (no flash on carousel switch). */}
          {!sceneError && (
            <>
              <div data-testid="track-hud-lap" style={hudLap}>
                Lap: {formatHudTime(lapState.currentLapMs)}
              </div>
              <div data-testid="track-hud-best" style={hudBest}>
                Best: {pb !== null ? formatHudTime(pb) : '—'}
              </div>
            </>
          )}
          {lastResult && (
            <ResultOverlay
              lapMs={lastResult.lapMs}
              previousPbMs={lastResult.previousPbMs}
              isNewPb={lastResult.isNewPb}
              onRetry={handleRetry}
            />
          )}
        </div>
        <p style={driveHint}>WASD or arrow keys to drive. Press <kbd style={{ fontFamily: tokens.font.mono, padding: '0 4px', border: '1px solid rgba(255,255,255,0.3)' }}>R</kbd> to retry.</p>
      </div>
    </div>
  );
}
