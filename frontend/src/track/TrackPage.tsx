import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { Model3DSummary } from '@overflow2026/shared';
import { useOwnedVariants } from './useOwnedVariants';
import { CarCarousel } from './carCarousel';
import { createRacetrackScene } from './racetrackScene';
import type { RacetrackSceneHandles } from './racetrackScene';
import { initialLapState, type LapState } from './lapState';
import { getPb, setPb } from './personalBest';
import { ResultOverlay } from './ResultOverlay';

// Phase 3 U6 — /track page. Wraps the Babylon scene in a React shell:
// query owned variants → render carousel + canvas → rebuild scene each time
// the selected variant changes. D-004: show a loading overlay while the
// Walrus fetch + scene-build is in flight (critical for the demo recording
// so the canvas doesn't go blank during the swap).

function aggregatorUrlForVariant(v: Model3DSummary): string {
  // Spike-C verdict (R9): Walrus aggregator handles both quilt-patch reads
  // and single-blob reads. Phase 3 mints have patchId set; Phase 2
  // degenerate-of-1 mints use the blobId directly.
  if (v.patchId) {
    return `https://aggregator.walrus-testnet.walrus.space/v1/blobs/by-quilt-patch-id/${v.patchId}`;
  }
  return `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${v.blobId}`;
}

function formatShortSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

interface LastResult {
  lapMs: number;
  previousPbMs: number | null;
  isNewPb: boolean;
}

export function TrackPage() {
  const account = useCurrentAccount();
  const { variants, loading: variantsLoading, error: variantsError } =
    useOwnedVariants(account?.address);
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
  useEffect(() => {
    setLapState(initialLapState());
    setLastResult(null);
    setPbState(selected ? getPb(selected.objectId) : null);
  }, [selected]);

  // Build (and rebuild) the scene whenever the selected variant changes.
  // Each rebuild disposes the previous scene to avoid stacking engines.
  useEffect(() => {
    if (!canvasRef.current || !selected) return;
    let cancelled = false;
    setSceneLoading(true);
    setSceneError(null);
    (async () => {
      try {
        const url = aggregatorUrlForVariant(selected);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Walrus aggregator ${res.status}`);
        const carGlbBytes = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        sceneRef.current?.dispose();
        sceneRef.current = null;
        sceneRef.current = await createRacetrackScene({
          canvas: canvasRef.current!,
          carGlbBytes,
          onLapStateChange: setLapState,
        });
      } catch (e) {
        if (!cancelled) {
          setSceneError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setSceneLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // U4 — on lap finish, write PB + populate result modal. Captures the
  // CURRENT pb (pre-update) so the modal shows delta vs the old best.
  useEffect(() => {
    if (
      lapState.status !== 'finished' ||
      lapState.finishedLapMs === null ||
      !selected
    ) {
      return;
    }
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
  }, [lapState.status, lapState.finishedLapMs, selected]);

  // U4 — Retry calls scene.reset() which teleports the car + dispatches
  // `reset` to the lap state machine; the resulting `waiting` state clears
  // the modal via the next effect.
  const handleRetry = useCallback(() => {
    sceneRef.current?.reset();
  }, []);

  // Clear the modal when state machine returns to waiting (post-reset).
  useEffect(() => {
    if (lapState.status === 'waiting') setLastResult(null);
  }, [lapState.status]);

  // R13 — keyboard 'r'/'R' equivalent to clicking Retry. Works mid-run too
  // so the player can abort a bad lap. No-op while waiting (nothing to reset).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r') return;
      if (lapState.status === 'waiting') return;
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

  if (!account) {
    return (
      <div style={{ padding: 32 }} data-testid="track-needs-signin">
        <h2>Tiny Racetrack</h2>
        <p>Connect a wallet to drive variants you own.</p>
      </div>
    );
  }
  if (variantsLoading) {
    return (
      <div style={{ padding: 32 }} data-testid="track-loading-variants">
        Loading your variants…
      </div>
    );
  }
  if (variantsError) {
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
              Lap: {formatShortSeconds(lapState.currentLapMs)}
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
              Best: {pb !== null ? formatShortSeconds(pb) : '—'}
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
