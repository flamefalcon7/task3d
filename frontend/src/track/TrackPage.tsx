import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useOwnedTokens, useTokenById, type OwnedToken } from './useOwnedTokens';
import { glbUrlForToken } from '../walrus/aggregator';
import { SignInButton } from '../auth/SignInButton';
import { CarCarousel } from './carCarousel';
import { createRacetrackScene } from './racetrackScene';
import type { RacetrackSceneHandles } from './racetrackScene';
import { initialLapState, waitingLapState, type LapState } from './lapState';
import { getPb, setPb } from './personalBest';
import { ResultOverlay } from './ResultOverlay';
import { formatHudTime } from './formatLapTime';
import { Countdown } from './Countdown';
import {
  RAGE_RACING,
  BOUND_COLLECTION_ID,
  DEFAULT_CAR_TOKEN_ID,
  DEFAULT_CAR_NAME,
  arcadeLabel,
  arcadeTitle,
  studioCredit,
  truncateId,
  wordmark,
} from './rageRacing/brand';

// /track is reskinned as "RAGE RACING by Deksat Studio" — a third-party indie
// game that imports a Tusk3D collection and drives it (plan 2026-06-05-001).
// The chrome (Tusk3D masthead) is hidden on this route (HIDDEN_ROUTES in
// ux/TopNav). NOTHING here should read as a Tusk3D feature: the identity, copy,
// and palette all belong to Rage Racing. The only nod back to Tusk3D is the
// on-canvas provenance caption — which is the POINT: it proves the car is a
// Tusk3D/Walrus asset running in someone else's game.
//
// All hooks, refs, effects, override modes (?model= / ?blob=), and data-testids
// are preserved verbatim from the pre-reskin page — this is a styling + copy
// swap, not a behavior change.

interface LastResult {
  lapMs: number;
  previousPbMs: number | null;
  isNewPb: boolean;
}

// Page-level styles (Electric Arcade — see rageRacing/brand).

const wellPage: CSSProperties = {
  background: RAGE_RACING.color.surface,
  color: RAGE_RACING.color.ink,
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

const canvasShell: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '68vh',
  background: RAGE_RACING.color.surface,
  overflow: 'hidden',
  border: `1.5px solid rgba(255,229,0,0.25)`,
};

const sceneOverlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.85)',
  color: RAGE_RACING.color.ink,
};

const sceneOverlayCenter: CSSProperties = {
  textAlign: 'center',
  padding: 24,
};

// HUD — keep the literal "Lap:"/"Best:" prefixes readable (not uppercased).
const hudLap: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 24,
  fontFamily: RAGE_RACING.font.mono,
  color: RAGE_RACING.color.ink,
  letterSpacing: '2px',
  fontSize: 18,
};

const hudBest: CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 24,
  fontFamily: RAGE_RACING.font.mono,
  color: RAGE_RACING.color.inkDim,
  letterSpacing: '1.5px',
  fontSize: 13,
};

// Provenance caption — the proof line. Bottom-left of the canvas, HUD-style.
const provenanceBox: CSSProperties = {
  position: 'absolute',
  left: 16,
  bottom: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  pointerEvents: 'none',
};

const provenanceHead: CSSProperties = {
  ...arcadeLabel,
  color: RAGE_RACING.color.accent,
};

const provenanceSub: CSSProperties = {
  fontFamily: RAGE_RACING.font.mono,
  fontSize: 10,
  letterSpacing: '1px',
  color: RAGE_RACING.color.inkFaint,
};

const driveHint: CSSProperties = {
  ...arcadeLabel,
  color: RAGE_RACING.color.inkFaint,
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

const emptySub: CSSProperties = {
  ...arcadeLabel,
  color: RAGE_RACING.color.inkDim,
  letterSpacing: '0.5px',
  textTransform: 'none',
};

// De-emphasised exit affordance for the connect / empty states. R8 keeps the
// inward route OUT of the primary CTA, but a third-party game still needs an
// escape hatch and a "where do I get a car" pointer — both kept secondary.
const secondaryLink: CSSProperties = {
  ...arcadeLabel,
  color: RAGE_RACING.color.accent,
  textTransform: 'none',
  letterSpacing: '0.5px',
  textDecoration: 'none',
};

// Constrain the (neutral, non-Tusk3D-branded) SignInButton so it reads as the
// game's own connect affordance, not a stretched chrome element.
const signInWrap: CSSProperties = {
  maxWidth: 280,
  width: '100%',
};

// Plan-2026-06-18-002 U4 — row holding the connect button + buy-collection CTA,
// sitting between the carousel and the canvas (never over the gameplay).
const ctaRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  padding: '4px 0 12px',
};

// Rage Racing masthead — wordmark + studio credit. Replaces the Tusk3D
// "— L3 / DRIVE / Tiny Racetrack." editorial header.
function RageRacingHeader() {
  return (
    <div style={pageHeader}>
      <h1 style={wordmark}>{RAGE_RACING.game}</h1>
      <span style={studioCredit}>{RAGE_RACING.studioCredit}</span>
    </div>
  );
}

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
  // Plan-2026-06-18-002 U1/U3 — the always-available primitive default car,
  // modeled as a synthetic OwnedToken (empty chain fields, like the ?blob=
  // hatch). Memoized so its reference is stable across renders — the scene-build
  // effect keys on `selected`, so an unstable default token would rebuild the
  // scene every render.
  const defaultCarToken = useMemo<OwnedToken>(
    () => ({
      tokenId: DEFAULT_CAR_TOKEN_ID,
      name: DEFAULT_CAR_NAME,
      patchId: '',
      collectionId: '',
      baseModelId: '',
      blobId: '',
    }),
    [],
  );
  // Plan-2026-06-18-002 U3 — the picker. Override modes (?blob=/?model=) resolve
  // their own single car and keep current behavior. Otherwise the list is
  // [default car, ...NFTs the player owns FROM THE BOUND COLLECTION], newest
  // first. Non-bound tokens are filtered out (R3).
  const tokensList: OwnedToken[] = useMemo(() => {
    if (blobToken) return [blobToken];
    if (modelToken) return [modelToken];
    if (isOverrideMode) return [];
    const bound = ownedTokens
      .filter((t) => t.collectionId === BOUND_COLLECTION_ID)
      .sort((a, b) => (b.acquiredAtMs ?? 0) - (a.acquiredAtMs ?? 0));
    return [defaultCarToken, ...bound];
  }, [blobToken, modelToken, isOverrideMode, ownedTokens, defaultCarToken]);
  // Unified loading/error across the three discovery paths. The ?blob= hatch is
  // synchronous (no fetch), so it never reports loading/error.
  const tokensLoading = blobToken
    ? false
    : isOverrideMode
      ? modelLoading
      : ownedLoading;
  const tokensError = blobToken ? null : isOverrideMode ? modelError : ownedError;
  // Plan-2026-06-18-002 U3 — selection tracked by token IDENTITY, not index, so
  // it survives the async owned-tokens fill-in and post-mint refreshes: a player
  // who switched to their NFT must not snap back to the default car when the
  // list grows/reorders. null = "follow the first car" (the default car).
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
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

  // Resolve the selected index from the tracked token id. When the selected
  // token genuinely disappears (or none picked yet), fall back to the first car
  // — which is always the default car in non-override mode. No clamp effect
  // needed: the derivation handles list growth, reorder, and removal.
  const selectedIdx = useMemo(() => {
    if (selectedTokenId === null) return 0;
    const i = tokensList.findIndex((t) => t.tokenId === selectedTokenId);
    return i >= 0 ? i : 0;
  }, [tokensList, selectedTokenId]);

  const handleSelect = useCallback(
    (idx: number) => setSelectedTokenId(tokensList[idx]?.tokenId ?? null),
    [tokensList],
  );

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
        const isDefaultCar = selected.tokenId === DEFAULT_CAR_TOKEN_ID;
        // Plan-2026-06-18-002 U3 — the default car is built from primitives in
        // the scene, so it skips the Walrus fetch entirely (no blob, no 404/expiry
        // risk). NFT cars still resolve + fetch their GLB.
        let carGlbBytes: Uint8Array | undefined;
        if (!isDefaultCar) {
          const url = glbUrlForToken(selected);
          // glbUrlForToken returns '' for a missing/malformed blob id (audit W-4).
          // Guard before fetch: fetch('') resolves the app's own HTML with ok=true,
          // which would slip past the !res.ok check and fail later as a confusing
          // GLB parse error. Reachable via the ?blob= dev hatch + on-chain ids.
          if (!url) throw new Error('This car has no loadable model.');
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) throw new Error(`Walrus aggregator ${res.status}`);
          carGlbBytes = new Uint8Array(await res.arrayBuffer());
          if (cancelled) return;
        }
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
          useDefaultCar: isDefaultCar,
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

  // Plan-2026-06-18-002 U4 — the free-to-play path NEVER blocks: in non-override
  // mode the default car is always in tokensList, so a missing wallet, an
  // in-flight query, or a failed owned-tokens read all still render a drivable
  // game (the default car) below. These full-page states are now scoped to the
  // override modes (?model=/?blob=), where a single car is resolved on its own
  // and the race-on-mint demo arc still needs visible loading / error / not-found.
  if (isOverrideMode && tokensLoading) {
    return (
      <div style={wellPage} data-testid="track-loading-variants">
        <div style={wellMain}>
          <RageRacingHeader />
          <p style={{ ...arcadeLabel, color: RAGE_RACING.color.inkDim }}>
            — LOADING CAR
          </p>
        </div>
      </div>
    );
  }
  if (isOverrideMode && tokensError) {
    return (
      <div style={wellPage} data-testid="track-variants-error">
        <div style={wellMain}>
          <RageRacingHeader />
          <p
            style={{
              ...arcadeLabel,
              color: RAGE_RACING.color.err,
              textTransform: 'none',
              letterSpacing: '0.5px',
            }}
          >
            × FAILED · Couldn't load that car: {tokensError.message}
          </p>
        </div>
      </div>
    );
  }
  if (isOverrideMode && tokensList.length === 0) {
    return (
      <div style={wellPage} data-testid="track-empty">
        <div style={wellMain}>
          <RageRacingHeader />
          <div style={emptyStack}>
            <p style={arcadeTitle}>Car not found.</p>
            <p style={emptySub}>
              THAT CAR COULDN'T BE RESOLVED ON-CHAIN.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // R5 — show the conversion CTA whenever the player has no NFT from the bound
  // collection (list holds only the default car), covering BOTH the no-wallet
  // visitor and the connected-but-non-owner. Suppressed while a connected
  // wallet's query is still in flight so NFT tiles can fill in without flicker.
  const showBuyCta =
    !isOverrideMode && !tokensLoading && tokensList.length === 1;
  const isDefaultCarSelected = selected?.tokenId === DEFAULT_CAR_TOKEN_ID;

  return (
    <div style={wellPage} data-testid="track-page">
      <div style={wellMain}>
        <RageRacingHeader />
        <CarCarousel
          tokens={tokensList}
          selectedIdx={selectedIdx}
          onSelect={handleSelect}
        />
        {/* Plan-2026-06-18-002 U4 — secondary affordances below the carousel,
            distinct from the on-canvas provenance caption. No-wallet visitors
            get a connect button; anyone without a bound-collection NFT gets the
            buy-to-drive CTA. Both stay out of the way of the gameplay. */}
        {(!account || showBuyCta) && (
          <div style={ctaRow}>
            {!isOverrideMode && !account && (
              <div style={signInWrap} data-testid="track-connect">
                <SignInButton />
              </div>
            )}
            {showBuyCta && (
              <Link
                to={`/collection/${BOUND_COLLECTION_ID}`}
                data-testid="track-buy-cta"
                style={secondaryLink}
              >
                Own a car from this collection to drive it here →
              </Link>
            )}
          </div>
        )}
        <div style={canvasShell}>
          <canvas
            ref={canvasRef}
            data-testid="track-canvas"
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
          {sceneLoading && (
            <div data-testid="track-scene-loading" style={sceneOverlay}>
              <div style={sceneOverlayCenter}>
                <p style={{ ...arcadeLabel, fontSize: 14, letterSpacing: '2px' }}>
                  — LOADING TRACK · BABYLON + HAVOK
                </p>
              </div>
            </div>
          )}
          {sceneError && !sceneLoading && (
            <div data-testid="track-scene-error" style={{ ...sceneOverlay, background: 'rgba(40, 0, 0, 0.85)' }}>
              <div style={sceneOverlayCenter}>
                <p style={{ ...arcadeLabel, color: RAGE_RACING.color.err, fontSize: 14, letterSpacing: '2px', marginBottom: 8 }}>
                  × LOAD FAILED
                </p>
                <p style={{ ...arcadeLabel, color: RAGE_RACING.color.ink, textTransform: 'none', letterSpacing: '0.5px' }}>
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
              {/* Provenance caption — the proof line for NFT cars (this is a
                  Tusk3D asset on Walrus, running in another studio's game).
                  Plan-2026-06-18-002 U4/R6: the default car has no on-chain
                  provenance, so it shows an identity-only caption (no fabricated
                  ids, no "connect" copy — the CTA carries the conversion prompt
                  for both no-wallet and connected-non-owner). */}
              {selected && isDefaultCarSelected && (
                <div data-testid="track-provenance" style={provenanceBox}>
                  <span
                    style={{ ...provenanceHead, color: RAGE_RACING.color.inkFaint }}
                  >
                    ◇ Default car · not an NFT
                  </span>
                </div>
              )}
              {selected && !isDefaultCarSelected && (
                <div data-testid="track-provenance" style={provenanceBox}>
                  <span style={provenanceHead}>◇ Imported asset · Sui + Walrus</span>
                  <span style={provenanceSub}>
                    {selected.collectionId
                      ? `collection ${truncateId(selected.collectionId)} · `
                      : ''}
                    walrus {selected.blobId ? 'blob' : 'patch'}{' '}
                    {truncateId(selected.blobId || selected.patchId || '—')}
                  </span>
                </div>
              )}
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
        <p style={driveHint}>
          WASD or arrow keys to drive. Press{' '}
          <kbd style={{ fontFamily: RAGE_RACING.font.mono, padding: '0 4px', border: '1px solid rgba(255,255,255,0.3)' }}>R</kbd>{' '}
          to retry.
        </p>
      </div>
    </div>
  );
}
