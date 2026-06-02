// Riff Copilot memory hook (plan-001 U4 + U9, D-080).
//
// Thin, fail-soft client over the JWT-authed /api/memory proxy. Every op is a
// no-op when there's no live session, and NEVER throws — memory must not be
// able to disturb /create. Recall is debounced (~300ms) and
// stale-while-revalidate: prior chips stay visible until a fresh result lands.
// `recallSimilar` (personal namespace) and `recallCommunity` (shared global
// namespace) run independently off the same query — one erroring/emptying never
// affects the other.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecallChip } from '@overflow2026/shared';
import { useSession, isJwtExpired } from '../auth/useSession';

// Single source of truth for the recall wire shape lives in shared/src/memory.ts
// (RecallChip) — aliased here so existing call sites keep the MemoryChip name.
export type MemoryChip = RecallChip;

const RECALL_DEBOUNCE_MS = 300;
const PERSONAL_LIMIT = 5;
const COMMUNITY_LIMIT = 3;

export interface UseCreatorMemory {
  /** Personal recalled chips (own namespace). */
  chips: MemoryChip[];
  /** Community recalled chips (shared global namespace, exclude-self). */
  community: MemoryChip[];
  /** Debounced recall of the user's similar past prompts. */
  recallSimilar: (query: string) => void;
  /** Debounced recall of similar community models. */
  recallCommunity: (query: string) => void;
  /** Fire-and-forget store on publish. `policy` gates the global dual-write
   *  (RESTRICTED → personal only). Never throws. */
  rememberCreation: (input: { prompt: string; modelId: string; policy?: number }) => Promise<void>;
}

interface RecallTarget {
  timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  seq: React.MutableRefObject<number>;
  setter: (chips: MemoryChip[]) => void;
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

  const personalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const communityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const personalSeq = useRef(0);
  const communitySeq = useRef(0);
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
  // user's recalled prompts never leak into the next account's view (review).
  useEffect(() => {
    setChips([]);
    setCommunity([]);
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
      t.setter([]);
      return;
    }
    t.timer.current = setTimeout(async () => {
      const seq = ++t.seq.current;
      try {
        const res = await fetch('/api/memory/recall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: q, limit: t.limit, ...(t.scope ? { scope: t.scope } : {}) }),
        });
        if (!res.ok) return; // keep prior chips (stale-while-revalidate)
        const data = (await res.json()) as { results?: MemoryChip[] };
        // Drop the response if a newer recall superseded it, the component
        // unmounted, or the session changed since the request was issued.
        if (seq === t.seq.current && mounted.current && tokenRef.current === token) {
          t.setter(data.results ?? []);
        }
      } catch {
        /* keep prior chips */
      }
    }, RECALL_DEBOUNCE_MS);
  }, []);

  const recallSimilar = useCallback(
    (query: string) =>
      runRecall(query, { timer: personalTimer, seq: personalSeq, setter: setChips, limit: PERSONAL_LIMIT }),
    [runRecall],
  );

  const recallCommunity = useCallback(
    (query: string) =>
      runRecall(query, {
        timer: communityTimer,
        seq: communitySeq,
        setter: setCommunity,
        limit: COMMUNITY_LIMIT,
        scope: 'global',
      }),
    [runRecall],
  );

  return { chips, community, recallSimilar, recallCommunity, rememberCreation };
}
