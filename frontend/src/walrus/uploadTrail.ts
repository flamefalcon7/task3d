// Survives-crash diagnostic trail for Walrus uploads.
//
// Writes a breadcrumb entry to sessionStorage at each upload stage transition.
// On hook init, any stale trail from a prior session (i.e. a crash that left a
// trail behind) is surfaced as `[WALRUS CRASH DIAGNOSTIC]` in the console.
// Brave / Chromium renderer "Aw Snap" recovery preserves sessionStorage across
// the recovered-tab reload, so the last breadcrumb pinpoints which Walrus
// stage was active when the tab died. Cleared on successful `done` or `error`
// so a clean upload leaves no residue.
//
// `setItem` is wrapped in `queueMicrotask` so the synchronous storage I/O
// (5–50 ms under memory pressure) runs *after* the React state-setter that
// triggered the write completes. Microtask order preserves trail ordering.
//
// All writes are exception-swallowed: this module is a tap, not a load-bearing
// dependency. A failing breadcrumb must not crash the upload.

export const STAGE_KEY = 'walrus_upload_diagnostic';
export const MAX_ENTRIES = 16;

export interface TrailEntry {
  stage: string;
  tMs: number;
  heapUsedMb: number | null;
  heapLimitMb: number | null;
  [key: string]: unknown;
}

export function readHeapMb(): { used: number; limit: number } | null {
  const perf = performance as unknown as {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (!perf.memory) return null;
  return {
    used: Math.round(perf.memory.usedJSHeapSize / 1024 / 1024),
    limit: Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024),
  };
}

// In-memory cache. Updated synchronously by writeDiag so back-to-back writes
// in the same tick see each other; storage persistence is deferred via
// queueMicrotask so the synchronous I/O runs *after* the React state-setter
// that triggered the write completes. On module init, hydrate from any
// pre-existing sessionStorage trail (e.g. a recovered "Aw Snap" tab) so the
// first writeDiag of a recovered session appends rather than clobbers.
let currentTrail: TrailEntry[] = readSessionTrailSync();

function readSessionTrailSync(): TrailEntry[] {
  try {
    if (typeof sessionStorage === 'undefined') return [];
    const raw = sessionStorage.getItem(STAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as TrailEntry[];
    if (parsed && typeof parsed === 'object') return [parsed as TrailEntry];
    return [];
  } catch {
    return [];
  }
}

// Exported for tests; production code only writes / surfaces / clears.
export function readTrail(): TrailEntry[] {
  return [...currentTrail];
}

export function writeDiag(
  stage: string,
  startedAt: number,
  extra?: Record<string, unknown>,
): void {
  try {
    const heap = readHeapMb();
    const entry: TrailEntry = {
      stage,
      tMs: Math.round(performance.now() - startedAt),
      heapUsedMb: heap ? heap.used : null,
      heapLimitMb: heap ? heap.limit : null,
      ...extra,
    };
    currentTrail.push(entry);
    if (currentTrail.length > MAX_ENTRIES) {
      currentTrail = currentTrail.slice(currentTrail.length - MAX_ENTRIES);
    }
    // Snapshot for persistence — a later writeDiag mutating currentTrail
    // can't corrupt this microtask's payload.
    const snapshot = [...currentTrail];
    queueMicrotask(() => {
      try {
        sessionStorage.setItem(STAGE_KEY, JSON.stringify(snapshot));
      } catch {
        /* quota / disabled cookies — swallow */
      }
    });
  } catch {
    /* readHeapMb / performance.now / JSON.stringify edge — swallow */
  }
}

export function clearTrail(): void {
  currentTrail = [];
  try {
    sessionStorage.removeItem(STAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Module-scope guard so multiple useWalrusUpload mounts (e.g. /create + /launch)
// surface the stale trail only once per page load.
let surfacedThisLoad = false;

export function surfaceStaleTrail(): void {
  if (typeof window === 'undefined') return;
  if (surfacedThisLoad) return;
  surfacedThisLoad = true;
  try {
    // Read directly from sessionStorage — surfacing what was persisted by
    // the prior tab session, not the in-memory trail of this load.
    const trail = readSessionTrailSync();
    if (trail.length === 0) return;
    const last = trail[trail.length - 1]!;
    // eslint-disable-next-line no-console
    console.warn(
      `[WALRUS CRASH DIAGNOSTIC] previous upload session died at stage="${last.stage}" ` +
        `after ${last.tMs}ms · heap ${last.heapUsedMb}/${last.heapLimitMb} MB · trail (${trail.length} steps):`,
    );
    // eslint-disable-next-line no-console
    console.table(
      trail.map((e, i) => ({
        '#': i,
        tMs: e.tMs,
        stage: e.stage,
        'heap MB': e.heapUsedMb,
      })),
    );
    sessionStorage.removeItem(STAGE_KEY);
    // Clear the in-memory cache too — module init hydrated it from the
    // now-surfaced trail, but we want the next upload to start fresh.
    currentTrail = [];
  } catch {
    /* ignore */
  }
}

// Test-only escape hatch — resets module-scope state so tests stay isolated.
export function __resetSurfaceGuardForTests(): void {
  surfacedThisLoad = false;
  currentTrail = [];
}
