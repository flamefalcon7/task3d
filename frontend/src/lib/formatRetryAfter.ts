// Shared "retry ~X" formatter for the Gemini quota state (plan-002 U7, D-083).
//
// Both the caption button and the copilot panel import this so their reset-time
// hints never diverge (the design-lens / safe-auto finding). Deliberately coarse —
// the reset is an approximation (the 429-derived cooldown), so we never show
// false-precision seconds.
const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/** Render a remaining-cooldown duration as an approximate, human phrase. */
export function formatRetryAfter(ms: number): string {
  if (ms < ONE_MINUTE_MS) return 'in a moment';
  if (ms <= ONE_HOUR_MS) return `~${Math.round(ms / ONE_MINUTE_MS)}m`;
  return 'later today';
}
