// Plan-004 U4 — lap-result modal shown when LapState.status === 'finished'.
//
// React overlay div pattern (KTD-3) matches the rest of /track and avoids
// pulling in @babylonjs/gui for 3 UI elements. Backdrop blocks pointer
// events but doesn't close on click — only the Retry button resets.

interface ResultOverlayProps {
  lapMs: number;
  previousPbMs: number | null;
  isNewPb: boolean;
  onRetry: () => void;
}

function formatLapTime(ms: number): string {
  // SS.cc for sub-minute laps (the common case for our ~25s lap), MM:SS.cc
  // for longer. cc = hundredths of a second, not thousandths — easier to
  // read on a HUD without losing meaningful granularity.
  const totalCs = Math.round(ms / 10);
  const cs = totalCs % 100;
  const totalSeconds = Math.floor(totalCs / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const csPad = cs.toString().padStart(2, '0');
  if (minutes === 0) return `${seconds}.${csPad}s`;
  const secPad = seconds.toString().padStart(2, '0');
  return `${minutes}:${secPad}.${csPad}`;
}

function formatDelta(lapMs: number, previousPbMs: number): string {
  const diff = lapMs - previousPbMs;
  const sign = diff < 0 ? '-' : '+';
  const abs = Math.abs(diff) / 1000;
  return `${sign}${abs.toFixed(2)}s`;
}

export function ResultOverlay({
  lapMs,
  previousPbMs,
  isNewPb,
  onRetry,
}: ResultOverlayProps) {
  return (
    <div
      data-testid="track-result-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.72)',
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: '#15171b',
          color: '#fff',
          padding: '32px 40px',
          borderRadius: 12,
          minWidth: 320,
          textAlign: 'center',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            fontSize: 14,
            letterSpacing: 1.5,
            color: '#7aa2ff',
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          Lap complete
        </div>
        <div
          style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, marginBottom: 16 }}
          data-testid="track-result-time"
        >
          {formatLapTime(lapMs)}
        </div>
        {isNewPb ? (
          <div
            data-testid="track-result-delta"
            style={{ fontSize: 18, color: '#ffd166', fontWeight: 600, marginBottom: 24 }}
          >
            NEW PB!
          </div>
        ) : previousPbMs !== null ? (
          <div
            data-testid="track-result-delta"
            style={{
              fontSize: 16,
              color: lapMs < previousPbMs ? '#7aff9d' : '#ff7a7a',
              marginBottom: 24,
            }}
          >
            {formatDelta(lapMs, previousPbMs)} vs PB ({formatLapTime(previousPbMs)})
          </div>
        ) : (
          <div
            data-testid="track-result-delta"
            style={{ fontSize: 16, color: '#888', marginBottom: 24 }}
          >
            —
          </div>
        )}
        <button
          data-testid="track-retry-button"
          onClick={onRetry}
          style={{
            background: '#ffb86b',
            color: '#15171b',
            border: 'none',
            borderRadius: 6,
            padding: '12px 28px',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Retry (R)
        </button>
      </div>
    </div>
  );
}
