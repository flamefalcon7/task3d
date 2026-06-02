// Riff Copilot memory hook (plan-001 U4 + U9, D-080; UX status pass).
//
// Thin, fail-soft client over the JWT-authed /api/memory proxy. Every op is a
// no-op when there's no live session, and NEVER throws — memory must not be
// able to disturb /create. Recall is debounced (~300ms) and
// stale-while-revalidate: prior chips stay visible until a fresh result lands.
// `recallSimilar` (personal namespace) and `recallCommunity` (shared global
// namespace) run independently off the same query.
//
// Each source exposes a `status` so the UI can make the agent's work legible
// (the whole point of an agent-memory feature): the moment the user pauses, the
// section shows "recalling…" rather than a blank-then-pop. status goes
// idle → loading (set immediately on a valid query, covering debounce + flight)
// → ready | empty, and is fail-soft (a relayer error settles to ready/empty
// based on what's currently shown, never a stuck spinner).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecallChip } from '@overflow2026/shared';
import { useSession, isJwtExpired } from '../auth/useSession';

// Single source of truth for the recall wire shape lives in shared/src/memory.ts
// (RecallChip) — aliased here so existing call sites keep the MemoryChip name.
export type MemoryChip = RecallChip;

export type RecallStatus = 'idle' | 'loading' | 'ready' | 'empty';

const RECALL_DEBOUNCE_MS = 300;
const PERSONAL_LIMIT = 5;
const COMMUNITY_LIMIT = 3;

export interface UseCreatorMemory {
  chips: MemoryChip[];
  community: MemoryChip[];
  personalStatus: RecallStatus;
  communityStatus: RecallStatus;
  recallSimilar: (query: string) => void;
  recallCommunity: (query: string) => void;
  rememberCreation: (input: { prompt: string; modelId: string; policy?: number }) => Promise<void>;
}

interface RecallTarget {
  timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  seq: React.MutableRefObject<number>;
  displayed: React.MutableRefObject<MemoryChip[]>;
  setResults: (chips: MemoryChip[]) => void;
  setStatus: (s: RecallStatus) => void;
  limit: number;
  scope?: 'global';
}

export function useCreatorMemory(): UseCreatorMemory {
  const { session } = useSession();
  const authToken = session && !isJwtExpired(session.jwt) ? session.jwt : null;
  const tokenRef = useRef<string | null>(authToken);
  tokenRef.current = authToken;

  const [chips, setChips] = useState<MemoryChip[]>([]);
  const [community, setCommunity] = useState<MemoryChip[]>([]);
  const [personalStatus, setPersonalStatus] = useState<RecallStatus>('idle');
  const [communityStatus, setCommunityStatus] = useState<RecallStatus>('idle');

  const personalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const communityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personalSeq = useRef(0);
  const communitySeq = useRef(0);
  const personalDisplayed = useRef<MemoryChip[]>([]);
  const communityDisplayed = useRef<MemoryChip[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (personalTimer.current) clearTimeout(personalTimer.current);
      if (communityTimer.current) clearTimeout(communityTimer.current);
    };
  }, []);

  // Clear chips when the session changes (sign-out / account switch) so one
  // user's recalled prompts never leak into the next account's view.
  useEffect(() => {
    setChips([]);
    setCommunity([]);
    setPersonalStatus('idle');
    setCommunityStatus('idle');
    personalDisplayed.current = [];
    communityDisplayed.current = [];
  }, [authToken]);

  const rememberCreation = useCallback(
    async ({ prompt, modelId, policy }: { prompt: string; modelId: string; policy?: number }) => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        await fetch('/api/memory/remember', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ prompt, modelId, policy }),
        });
      } catch {
        /* fail-soft */
      }
    },
    [],
  );

  // Shared debounced recall runner. Refs + setters are stable, so this is too.
  const runRecall = useCallback((query: string, t: RecallTarget) => {
    if (t.timer.current) clearTimeout(t.timer.current);
    const token = tokenRef.current;
    const q = query.trim();
    if (!token || !q) {
      t.setStatus('idle');
      t.setResults([]);
      t.displayed.current = [];
      return;
    }
    // Set loading immediately — covers BOTH the debounce wait and the flight, so
    // the UI shows "recalling…" the moment the user pauses, not after the round-trip.
    t.setStatus('loading');
    t.timer.current = setTimeout(async () => {
      const seq = ++t.seq.current;
      try {
        const res = await fetch('/api/memory/recall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: q, limit: t.limit, ...(t.scope ? { scope: t.scope } : {}) }),
        });
        if (!res.ok) {
          // keep prior chips (SWR); settle status to what's shown, never stuck.
          if (seq === t.seq.current && mounted.current) {
            t.setStatus(t.displayed.current.length ? 'ready' : 'empty');
          }
          return;
        }
        const data = (await res.json()) as { results?: MemoryChip[] };
        if (seq === t.seq.current && mounted.current && tokenRef.current === token) {
          const results = data.results ?? [];
          t.setResults(results);
          t.displayed.current = results;
          t.setStatus(results.length ? 'ready' : 'empty');
        }
      } catch {
        if (seq === t.seq.current && mounted.current) {
          t.setStatus(t.displayed.current.length ? 'ready' : 'empty');
        }
      }
    }, RECALL_DEBOUNCE_MS);
  }, []);

  const recallSimilar = useCallback(
    (query: string) =>
      runRecall(query, {
        timer: personalTimer,
        seq: personalSeq,
        displayed: personalDisplayed,
        setResults: setChips,
        setStatus: setPersonalStatus,
        limit: PERSONAL_LIMIT,
      }),
    [runRecall],
  );

  const recallCommunity = useCallback(
    (query: string) =>
      runRecall(query, {
        timer: communityTimer,
        seq: communitySeq,
        displayed: communityDisplayed,
        setResults: setCommunity,
        setStatus: setCommunityStatus,
        limit: COMMUNITY_LIMIT,
        scope: 'global',
      }),
    [runRecall],
  );

  return { chips, community, personalStatus, communityStatus, recallSimilar, recallCommunity, rememberCreation };
}
