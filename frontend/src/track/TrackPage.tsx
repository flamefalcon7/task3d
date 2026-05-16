import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { Model3DSummary } from '@overflow2026/shared';
import { useOwnedVariants } from './useOwnedVariants';
import { CarCarousel } from './carCarousel';
import { createRacetrackScene } from './racetrackScene';
import type { RacetrackSceneHandles } from './racetrackScene';

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

export function TrackPage() {
  const account = useCurrentAccount();
  const { variants, loading: variantsLoading, error: variantsError } =
    useOwnedVariants(account?.address);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RacetrackSceneHandles | null>(null);

  // Keep selectedIdx in range when the variants list changes (initial fetch
  // or post-purchase refresh).
  useEffect(() => {
    if (selectedIdx >= variants.length) setSelectedIdx(0);
  }, [variants.length, selectedIdx]);

  const selected = variants[selectedIdx];

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
      </div>
      <p style={{ marginTop: 12, color: '#666' }}>
        WASD or arrow keys to drive. Hit walls to stop.
      </p>
    </div>
  );
}
