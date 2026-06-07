// Neutral MemWal recall hook (plan-002 U1; extracted from creator/useCreatorMemory, D-080).
//
// Fail-soft, debounced, stale-while-revalidate semantic recall over the
// JWT-authed /api/memory/recall proxy. Two independent scopes run off ONE hook
// instance: personal (namespace derived server-side from the JWT sub) and global
// (shared community namespace, scope:'global'). Consumed by /create (via
// useCreatorMemory) and /launch (the base-model finder).
//
// Invariants preserved from the original /create hook — do NOT weaken; they are
// covered by useCreatorMemory.test.ts and useMemoryRecall.test.ts:
//   - ONE hook instance owns BOTH scopes (shared mounted/token refs, per-scope
//     seq refs) so a fast global response can't clobber an in-flight personal one.
//   - A single authToken (session && !isJwtExpired) gates BOTH fetches; no token
//     → neither call fires, no Authorization header ever sent.
//   - StrictMode-safe lifecycle: mounted.current is re-asserted on mount, never a
//     cleanup-only effect.
//   - Account switch clears all results so one user's recalls never leak.
//   - The token re-check guards EVERY commit branch (success, non-OK, catch), so
//     no post-switch response of any kind mutates state for a stale token.
//   - degraded ≠ empty: a 200 carrying `x-memwal-degraded` is surfaced as
//     `degraded`, never silently collapsed to "zero matches".
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { RecallChip } from '@overflow2026/shared';
import { useSession, isJwtExpired } from '../auth/useSession';

export type RecallStatus = 'idle' | 'loading' | 'ready' | 'empty';

/** One recall lane (personal or global). */
export interface RecallScope {
  chips: RecallChip[];
  status: RecallStatus;
  /** True when the last response carried `x-memwal-degraded` (relayer down) —
   *  distinct from a clean empty result. Callers must not treat it as "no matches". */
  degraded: boolean;
  recall: (query: string) => void;
}

export interface UseMemoryRecall {
  personal: RecallScope;
  global: RecallScope;
}

export interface MemoryRecallOptions {
  /** Personal recall depth (default mirrors /create's baseline). */
  personalLimit?: number;
  /** Global recall depth. Effective MemWal reads ≈ limit × GLOBAL_OVERFETCH(4)
   *  per keystroke; keep at the /create baseline (3) unless reviewed. */
  globalLimit?: number;
}

const RECALL_DEBOUNCE_MS = 300;
const DEFAULT_PERSONAL_LIMIT = 5;
const DEFAULT_GLOBAL_LIMIT = 3;
// Don't recall on trivial input — a single 'z' embeds to *something* and the
// relayer always returns nearest-neighbours, so junk queries surface the whole
// pool. Real queries start at ~3 chars (probe: "car" matches, "ca"/"z" don't).
const MIN_QUERY_LEN = 3;

interface RecallTarget {
  timer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  seq: MutableRefObject<number>;
  displayed: MutableRefObject<RecallChip[]>;
  setResults: (chips: RecallChip[]) => void;
  setStatus: (s: RecallStatus) => void;
  setDegraded: (d: boolean) => void;
  limit: number;
  scope?: 'global';
}

export function useMemoryRecall(opts: MemoryRecallOptions = {}): UseMemoryRecall {
  const personalLimit = opts.personalLimit ?? DEFAULT_PERSONAL_LIMIT;
  const globalLimit = opts.globalLimit ?? DEFAULT_GLOBAL_LIMIT;

  const { session } = useSession();
  const authToken = session && !isJwtExpired(session.jwt) ? session.jwt : null;
  const tokenRef = useRef<string | null>(authToken);
  tokenRef.current = authToken;

  const [personalChips, setPersonalChips] = useState<RecallChip[]>([]);
  const [globalChips, setGlobalChips] = useState<RecallChip[]>([]);
  const [personalStatus, setPersonalStatus] = useState<RecallStatus>('idle');
  const [globalStatus, setGlobalStatus] = useState<RecallStatus>('idle');
  const [personalDegraded, setPersonalDegraded] = useState(false);
  const [globalDegraded, setGlobalDegraded] = useState(false);

  const personalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personalSeq = useRef(0);
  const globalSeq = useRef(0);
  const personalDisplayed = useRef<RecallChip[]>([]);
  const globalDisplayed = useRef<RecallChip[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (personalTimer.current) clearTimeout(personalTimer.current);
      if (globalTimer.current) clearTimeout(globalTimer.current);
    };
  }, []);

  // Clear results when the session changes (sign-out / account switch) so one
  // user's recalled prompts never leak into the next account's view.
  useEffect(() => {
    setPersonalChips([]);
    setGlobalChips([]);
    setPersonalStatus('idle');
    setGlobalStatus('idle');
    setPersonalDegraded(false);
    setGlobalDegraded(false);
    personalDisplayed.current = [];
    globalDisplayed.current = [];
  }, [authToken]);

  // Shared debounced recall runner. Refs + setters are stable, so this is too.
  const runRecall = useCallback((query: string, t: RecallTarget) => {
    if (t.timer.current) clearTimeout(t.timer.current);
    const token = tokenRef.current;
    const q = query.trim();
    if (!token || q.length < MIN_QUERY_LEN) {
      t.setStatus('idle');
      t.setResults([]);
      t.setDegraded(false);
      t.displayed.current = [];
      return;
    }
    // Set loading immediately — covers BOTH the debounce wait and the flight, so
    // the UI shows "recalling…" the moment the user pauses, not after the round-trip.
    // Clear any prior `degraded` here too: a new query must not inherit the last
    // one's relayer-down flag (else the caller shows "searching…" and "some matches
    // unavailable" at once, and an errored new query would keep a stale flag).
    t.setStatus('loading');
    t.setDegraded(false);
    t.timer.current = setTimeout(async () => {
      const seq = ++t.seq.current;
      // A response only commits if it's the latest query (seq), the hook is still
      // mounted, AND the auth token is unchanged — checked on EVERY branch so a
      // post-account-switch response can't mutate the next account's view.
      const fresh = () => seq === t.seq.current && mounted.current && tokenRef.current === token;
      try {
        const res = await fetch('/api/memory/recall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: q, limit: t.limit, ...(t.scope ? { scope: t.scope } : {}) }),
        });
        if (!res.ok) {
          // keep prior chips (SWR); settle status to what's shown, never stuck.
          if (fresh()) t.setStatus(t.displayed.current.length ? 'ready' : 'empty');
          return;
        }
        const data = (await res.json()) as { results?: RecallChip[] };
        if (fresh()) {
          const results = data.results ?? [];
          // Optional-chain the header read: test/mock Responses may omit `headers`.
          const degraded = res.headers?.get('x-memwal-degraded') === '1';
          t.setResults(results);
          t.displayed.current = results;
          t.setDegraded(degraded);
          t.setStatus(results.length ? 'ready' : 'empty');
        }
      } catch {
        if (fresh()) t.setStatus(t.displayed.current.length ? 'ready' : 'empty');
      }
    }, RECALL_DEBOUNCE_MS);
  }, []);

  const recallPersonal = useCallback(
    (query: string) =>
      runRecall(query, {
        timer: personalTimer,
        seq: personalSeq,
        displayed: personalDisplayed,
        setResults: setPersonalChips,
        setStatus: setPersonalStatus,
        setDegraded: setPersonalDegraded,
        limit: personalLimit,
      }),
    [runRecall, personalLimit],
  );

  const recallGlobal = useCallback(
    (query: string) =>
      runRecall(query, {
        timer: globalTimer,
        seq: globalSeq,
        displayed: globalDisplayed,
        setResults: setGlobalChips,
        setStatus: setGlobalStatus,
        setDegraded: setGlobalDegraded,
        limit: globalLimit,
        scope: 'global',
      }),
    [runRecall, globalLimit],
  );

  return {
    personal: { chips: personalChips, status: personalStatus, degraded: personalDegraded, recall: recallPersonal },
    global: { chips: globalChips, status: globalStatus, degraded: globalDegraded, recall: recallGlobal },
  };
}
