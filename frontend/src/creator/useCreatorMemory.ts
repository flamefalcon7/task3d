// Riff Copilot memory hook (plan-001 U4 + U9, D-080; recall core extracted to
// memory/useMemoryRecall in plan-002 U1).
//
// Thin, fail-soft client over the JWT-authed /api/memory proxy. The dual-scope
// recall (personal + community) now lives in the neutral `useMemoryRecall` hook;
// this wrapper keeps /create's existing public surface (chips / community /
// *Status / recallSimilar / recallCommunity) byte-identical and adds the
// creator-only `rememberCreation` capture. Every op is a no-op when there's no
// live session and NEVER throws — memory must not be able to disturb /create.
import { useCallback, useRef } from 'react';
import type { RecallChip } from '@overflow2026/shared';
import { useSession, isJwtExpired } from '../auth/useSession';
import { useMemoryRecall, type RecallStatus } from '../memory/useMemoryRecall';

// Single source of truth for the recall wire shape lives in shared/src/memory.ts
// (RecallChip) — aliased here so existing call sites keep the MemoryChip name.
export type MemoryChip = RecallChip;
export type { RecallStatus };

export interface UseCreatorMemory {
  chips: MemoryChip[];
  community: MemoryChip[];
  personalStatus: RecallStatus;
  communityStatus: RecallStatus;
  recallSimilar: (query: string) => void;
  recallCommunity: (query: string) => void;
  rememberCreation: (input: { prompt: string; modelId: string; policy?: number }) => Promise<void>;
}

export function useCreatorMemory(): UseCreatorMemory {
  // Recall core (debounce, per-scope race guards, account-switch clear, degraded
  // signal) — defaults preserve /create's baseline depths (personal 5, global 3).
  const { personal, global } = useMemoryRecall();

  const { session } = useSession();
  const authToken = session && !isJwtExpired(session.jwt) ? session.jwt : null;
  const tokenRef = useRef<string | null>(authToken);
  tokenRef.current = authToken;

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

  return {
    chips: personal.chips,
    community: global.chips,
    personalStatus: personal.status,
    communityStatus: global.status,
    recallSimilar: personal.recall,
    recallCommunity: global.recall,
    rememberCreation,
  };
}
