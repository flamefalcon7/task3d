// D-106 — in-memory store for async Tripo generation jobs.
//
// `POST /api/generate` verifies payment synchronously, then runs the ~7-min Tripo
// work in the background and stores the outcome here keyed by a jobId; the client
// polls `GET /api/generate/result/:jobId`. This decouples the long generation from
// any single HTTP request so nothing crosses Cloudflare's ~100s proxy timeout.
//
// Bounded three ways (mirrors the auth.ts nonce store idiom):
//   1. delete-on-fetch — a terminal (done/error) read removes the record, so the
//      1–6 MB GLB it holds is freed the instant it's delivered;
//   2. TTL sweep — an unref'd interval evicts records older than the TTL, covering
//      orphaned jobs (user paid then closed the tab without polling);
//   3. hard cap — at the ceiling, `create` evicts the oldest record (O(1)-bounded
//      regardless of request rate).

import type { GenerateResponse } from '@overflow2026/shared';

export type JobState =
  | { status: 'pending' }
  | { status: 'done'; result: GenerateResponse }
  | { status: 'error'; code: string; httpStatus: number; refundable: boolean };

interface JobRecord {
  owner: string;
  createdAt: number;
  state: JobState;
}

export type JobLookup =
  | { kind: 'state'; state: JobState }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export interface GenerateJobStore {
  create(jobId: string, owner: string): void;
  setDone(jobId: string, result: GenerateResponse): void;
  setError(jobId: string, code: string, httpStatus: number, refundable: boolean): void;
  /** Owner-scoped read. A terminal (done/error) record is deleted on read so the
   *  delivered GLB is freed immediately; pending records are left to poll again. */
  take(jobId: string, owner: string): JobLookup;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // > the ~7-min Tripo budget + slack
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000;
const DEFAULT_MAX_JOBS = 30;

export function createGenerateJobStore(
  ttlMs: number = DEFAULT_TTL_MS,
  sweepIntervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
  maxEntries: number = DEFAULT_MAX_JOBS,
): GenerateJobStore {
  const map = new Map<string, JobRecord>();

  const sweep = (): void => {
    const cutoff = Date.now() - ttlMs;
    for (const [id, rec] of map) {
      if (rec.createdAt < cutoff) map.delete(id);
    }
  };

  const handle = setInterval(sweep, sweepIntervalMs);
  // unref so the sweep timer doesn't keep Node (or a test runner) alive.
  if (typeof handle === 'object' && handle !== null && 'unref' in handle) {
    (handle as { unref: () => void }).unref();
  }

  return {
    create(jobId, owner) {
      sweep(); // cheap; evicts expired before the cap check
      while (map.size >= maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      map.set(jobId, { owner, createdAt: Date.now(), state: { status: 'pending' } });
    },
    setDone(jobId, result) {
      const rec = map.get(jobId);
      if (rec) rec.state = { status: 'done', result };
    },
    setError(jobId, code, httpStatus, refundable) {
      const rec = map.get(jobId);
      if (rec) rec.state = { status: 'error', code, httpStatus, refundable };
    },
    take(jobId, owner) {
      const rec = map.get(jobId);
      if (!rec) return { kind: 'not_found' };
      if (rec.owner !== owner) return { kind: 'forbidden' };
      if (rec.state.status !== 'pending') map.delete(jobId); // delete-on-fetch
      return { kind: 'state', state: rec.state };
    },
  };
}
