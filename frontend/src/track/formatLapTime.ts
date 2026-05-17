// Plan-004 U4 / code-review fix #22 — single home for lap-time formatters.
// Previously duplicated between TrackPage.tsx (compact HUD form) and
// ResultOverlay.tsx (full MM:SS.cc form). Two formatters with different
// semantics in sibling files is a refactor invitation; one shared module
// with two clearly-named helpers makes the contrast explicit.

/**
 * Defensive guard: NaN / Infinity / negative ms return an em-dash placeholder.
 * Catches broken state from upstream bugs without crashing the HUD or modal.
 */
function safeFinite(ms: number): boolean {
  return Number.isFinite(ms) && ms >= 0;
}

/**
 * Result-modal form: MM:SS.cc for ≥60s, SS.cc otherwise. cc = hundredths
 * of a second (not thousandths) — easier to read on screen without losing
 * meaningful granularity for a ~25s lap.
 */
export function formatResultTime(ms: number): string {
  if (!safeFinite(ms)) return '—';
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

/**
 * HUD form: compact `12.34s`. Always seconds, never MM:SS — race laps are
 * ~25s so minute handling would be wasted space. Falls back to em-dash on
 * non-finite or negative input.
 */
export function formatHudTime(ms: number): string {
  if (!safeFinite(ms)) return '—';
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Signed delta vs prior PB, formatted with a sign character and seconds.
 * Examples: '-1.68s', '+0.40s'. Returns '0.00s' on zero diff. Uses
 * absolute-value math so the sign comes from the diff direction, not from
 * `toFixed` which would coerce '-0.0' on small negative values.
 */
export function formatPbDelta(lapMs: number, previousPbMs: number): string {
  const diff = lapMs - previousPbMs;
  const sign = diff < 0 ? '-' : '+';
  const abs = Math.abs(diff) / 1000;
  return `${sign}${abs.toFixed(2)}s`;
}
