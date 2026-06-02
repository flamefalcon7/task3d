// Riff Copilot memory hook (plan-001 U4, D-080).
//
// Thin, fail-soft client over the JWT-authed /api/memory proxy. Every op is a
// no-op when there's no live session, and NEVER throws — memory must not be
// able to disturb /create. `recallSimilar` is debounced (~300ms) and
// stale-while-revalidate: prior chips stay visible until a fresh result lands.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, isJwtExpired } from '../auth/useSession';

export interface MemoryChip {
  prompt: string;
  modelId: string | null;
  distance: number;
}

const RECALL_DEBOUNCE_MS = 300;
const RECALL_LIMIT = 5;

export interface UseCreatorMemory {
  /** Personal recalled chips (own namespace). */
  chips: MemoryChip[];
  /** Debounced recall of the user's similar past prompts. */
  recallSimilar: (query: string) => void;
  /** Fire-and-forget store on publish. `policy` gates the global dual-write
   *  (RESTRICTED → personal only). Never throws. */
  rememberCreation: (input: { prompt: string; modelId: string; policy?: number }) => Promise<void>;
}

export function useCreatorMemory(): UseCreatorMemory {
  const { session } = useSession();
  const authToken = session && !isJwtExpired(session.jwt) ? session.jwt : null;

  const [chips, setChips] = useState<MemoryChip[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow earlier recall can't overwrite a newer one.
  const seqRef = useRef(0);
  const tokenRef = useRef<string | null>(authToken);
  tokenRef.current = authToken;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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

  const recallSimilar = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const token = tokenRef.current;
    const q = query.trim();
    // No session or nothing to search on → clear chips, no request.
    if (!token || !q) {
      setChips([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const res = await fetch('/api/memory/recall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query: q, limit: RECALL_LIMIT }),
        });
        if (!res.ok) return; // keep prior chips (stale-while-revalidate)
        const data = (await res.json()) as { results?: MemoryChip[] };
        // Ignore if a newer recall has since been issued.
        if (seq === seqRef.current) setChips(data.results ?? []);
      } catch {
        /* keep prior chips */
      }
    }, RECALL_DEBOUNCE_MS);
  }, []);

  return { chips, recallSimilar, rememberCreation };
}
