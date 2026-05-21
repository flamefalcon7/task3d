import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { Model3DSummary } from '@overflow2026/shared';
import { useOwnedVariants } from './useOwnedVariants';
import { stubListingLookup } from './stubListingLookup';
import { glbUrlForSummary } from '../walrus/aggregator';
import { CarCarousel } from './carCarousel';
import { createRacetrackScene } from './racetrackScene';
import type { RacetrackSceneHandles } from './racetrackScene';
import { initialLapState, waitingLapState, type LapState } from './lapState';
import { getPb, setPb } from './personalBest';
import { ResultOverlay } from './ResultOverlay';
import { formatHudTime } from './formatLapTime';
import { Countdown } from './Countdown';

// Phase 3 U6 — /track page. Wraps the Babylon scene in a React shell:
// query owned variants → render carousel + canvas → rebuild scene each time
// the selected variant changes. D-004: show a loading overlay while the
// Walrus fetch + scene-build is in flight (critical for the demo recording
// so the canvas doesn't go blank during the swap).

interface LastResult {
  lapMs: number;
  previousPbMs: number | null;
  isNewPb: boolean;
}

export function TrackPage() {
  const account = useCurrentAccount();
  // Phase 4 U1-prelim — `?model=<id>` bypass: when present, resolve the model
  // through a stub (U10 will swap for `GET /api/listings/:id`) and skip the
  // Phase-3 useOwnedVariants/Access-based discovery path entirely. The race-
  // on-mint demo arc auto-navigates here with `?model=` set, and the buyer
  // does NOT also hold an Access object (Kiosk-protocol KTD).
  const [searchParams] = useSearchParams();
  const modelParam = searchParams.get('model');
  const blobOverride = searchParams.get('blob');
  const overrideVariant = useMemo(
    () => (modelParam ? stubListingLookup(modelParam, blobOverride) : null),
    [modelParam, blobOverride],
  );
  const isOverrideMode = overrideVariant !== null;
  const {
    variants: queriedVariants,
    loading: variantsLoading,
    error: variantsError,
  } = useOwnedVariants(isOverrideMode ? undefined : account?.address);
  const variants: Model3DSummary[] = overrideVariant
    ? [overrideVariant]
    : queriedVariants;
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

  // Keep selectedIdx in range when the variants list changes (initial fetch
  // or post-purchase refresh).
  useEffect(() => {
    if (selectedIdx >= variants.length) setSelectedIdx(0);
  }, [variants.length, selectedIdx]);

  const selected = variants[selectedIdx];

  // U4/U5 — when the selected variant changes (carousel switch), reset
  // React-side game state and re-read the PB for the new car.
  // Plan-006 U8 — also reset orbitDone so the new scene's intro plays from
  // the top (camera orbit + countdown overlay reset).
  useEffect(() => {
    setLapState(initialLapState());
    setLastResult(null);
    setOrbitDone(false);
    setPbState(selected ? getPb(selected.objectId) : null);
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
        const url = glbUrlForSummary(selected);
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
      setPb(selected.objectId, lapMs);
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

  // U1-prelim — in override mode, skip wallet/owned-variants gating. Render
  // straight through with the stubbed variant as the only carousel entry.
  if (!isOverrideMode && !account) {
    return (
      <div style={{ padding: 32 }} data-testid="track-needs-signin">
        <h2>Tiny Racetrack</h2>
        <p>Connect a wallet to drive variants you own.</p>
      </div>
    );
  }
  if (!isOverrideMode && variantsLoading) {
    return (
      <div style={{ padding: 32 }} data-testid="track-loading-variants">
        Loading your variants…
      </div>
    );
  }
  if (!isOverrideMode && variantsError) {
    return (
      <div style={{ padding: 32, color: 'crimson' }} data-testid="track-variants-error">
        Couldn't load your variants: {variantsError.message}
      </div>
    );
  }
  if (variants.length === 0) {
    return (
      <div style={{ padding: 32 }} data-testid="track-empty">
        <h2>No variants yet</h2>
        <p>
          Buy a variant first to drive it.{' '}
          <Link to="/" data-testid="track-empty-browse">
            Browse the marketplace
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }} data-testid="track-page">
      <h2 style={{ marginTop: 0 }}>Tiny Racetrack</h2>
      <CarCarousel
        variants={variants}
        selectedIdx={selectedIdx}
        onSelect={setSelectedIdx}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '70vh',
          background: '#222',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="track-canvas"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        {sceneLoading && (
          <div
            data-testid="track-scene-loading"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.55)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 18,
            }}
          >
            Loading variant…
          </div>
        )}
        {sceneError && !sceneLoading && (
          <div
            data-testid="track-scene-error"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(80, 0, 0, 0.7)',
              color: '#fff',
              padding: 16,
              textAlign: 'center',
            }}
          >
            Couldn't load this variant: {sceneError}
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
            <div
              data-testid="track-hud-lap"
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                padding: '6px 18px',
                borderRadius: 6,
                fontSize: 22,
                fontWeight: 700,
                fontFamily: 'monospace',
                letterSpacing: 1,
              }}
            >
              Lap: {formatHudTime(lapState.currentLapMs)}
            </div>
            <div
              data-testid="track-hud-best"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'rgba(0,0,0,0.55)',
                color: '#ddd',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'monospace',
              }}
            >
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
      <p style={{ marginTop: 12, color: '#888' }}>
        WASD or arrow keys to drive. Press <kbd>R</kbd> to retry.
      </p>
    </div>
  );
}
