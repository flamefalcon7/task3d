// Plan-004 U4 — lap-result modal shown when LapState.status === 'finished'.
//
// React overlay div pattern (KTD-3) matches the rest of /track and avoids
// pulling in @babylonjs/gui for 3 UI elements. Backdrop blocks pointer
// events but doesn't close on click — only the Retry button resets.
//
// Brutalist editorial styling per D-044: italic-serif headline lap time,
// mono uppercase eyebrow + delta labels, accent only on positive delta.

import type { CSSProperties } from 'react';
import { buttonPrimary, monoLabel, tokens } from '../ux/tokens';
import { formatPbDelta, formatResultTime } from './formatLapTime';

interface ResultOverlayProps {
  lapMs: number;
  previousPbMs: number | null;
  isNewPb: boolean;
  onRetry: () => void;
}

const backdrop: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.72)',
  zIndex: 10,
};

const card: CSSProperties = {
  background: tokens.color.paperPure,
  color: tokens.color.ink,
  border: tokens.border.primary,
  padding: '32px 48px',
  minWidth: 360,
  textAlign: 'center',
};

const eyebrowStyle: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  marginBottom: 12,
};

const lapTime: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: 56,
  fontWeight: tokens.weight.medium,
  lineHeight: 1,
  letterSpacing: '-1px',
  marginBottom: 16,
};

const newPbBanner: CSSProperties = {
  ...monoLabel,
  fontSize: 12,
  color: tokens.color.accent,
  letterSpacing: '2px',
  marginBottom: 24,
};

const deltaImproved: CSSProperties = {
  ...monoLabel,
  fontSize: 13,
  color: tokens.color.accent,
  marginBottom: 24,
  textTransform: 'none',
  letterSpacing: '0.5px',
};

const deltaWorse: CSSProperties = {
  ...monoLabel,
  fontSize: 13,
  color: tokens.color.err,
  marginBottom: 24,
  textTransform: 'none',
  letterSpacing: '0.5px',
};

const deltaNeutral: CSSProperties = {
  ...monoLabel,
  fontSize: 13,
  color: tokens.color.hint,
  marginBottom: 24,
};

const retryBtn: CSSProperties = {
  ...buttonPrimary,
  padding: '12px 28px',
  fontSize: 12,
};

export function ResultOverlay({
  lapMs,
  previousPbMs,
  isNewPb,
  onRetry,
}: ResultOverlayProps) {
  return (
    <div data-testid="track-result-overlay" style={backdrop}>
      <div style={card}>
        <div style={eyebrowStyle}>— LAP COMPLETE</div>
        <div style={lapTime} data-testid="track-result-time">
          {formatResultTime(lapMs)}
        </div>
        {isNewPb ? (
          // Show the improvement delta alongside the NEW PB banner when there
          // was a prior PB — players want to see how much they shaved off.
          // First-ever PB shows only the banner (no delta to compute).
          <div data-testid="track-result-delta" style={newPbBanner}>
            NEW PB
            {previousPbMs !== null && (
              <span
                style={{
                  ...monoLabel,
                  fontSize: 11,
                  marginLeft: 12,
                  color: tokens.color.muted,
                  letterSpacing: '0.5px',
                  textTransform: 'none',
                }}
              >
                {formatPbDelta(lapMs, previousPbMs)}
              </span>
            )}
          </div>
        ) : previousPbMs !== null ? (
          <div
            data-testid="track-result-delta"
            style={lapMs < previousPbMs ? deltaImproved : deltaWorse}
          >
            {formatPbDelta(lapMs, previousPbMs)} vs PB ({formatResultTime(previousPbMs)})
          </div>
        ) : (
          <div data-testid="track-result-delta" style={deltaNeutral}>
            —
          </div>
        )}
        <button
          data-testid="track-retry-button"
          onClick={onRetry}
          style={retryBtn}
        >
          RETRY (R)
        </button>
      </div>
    </div>
  );
}
