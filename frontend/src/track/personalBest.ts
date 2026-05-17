// Plan-004 U4 — per-car Personal Best persistence via localStorage.
//
// Storage key: `track-pb:${carObjectId}`. Value: stringified lap-time ms.
// R-r5 mitigation — wrap reads/writes in try/catch so private/incognito
// mode and quota-exceeded errors silently fall back to "no PB" instead of
// crashing the page.

const KEY_PREFIX = 'track-pb:';

function key(carObjectId: string): string {
  return `${KEY_PREFIX}${carObjectId}`;
}

export function getPb(carObjectId: string): number | null {
  try {
    const raw = localStorage.getItem(key(carObjectId));
    if (raw === null) return null;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  } catch {
    // Private mode / disabled storage / SecurityError. R-r5 — silent fallback.
    return null;
  }
}

export function setPb(carObjectId: string, lapMs: number): void {
  try {
    localStorage.setItem(key(carObjectId), String(lapMs));
  } catch (e) {
    // QuotaExceededError / private mode. R-r5 — silent fallback, PB just
    // won't persist this session. Log so the dev console signals the
    // discrepancy (HUD will show the in-memory PB the caller already set,
    // but next page load won't have it).
    // eslint-disable-next-line no-console
    console.warn('[personalBest] setPb failed; PB will not persist:', e);
  }
}
