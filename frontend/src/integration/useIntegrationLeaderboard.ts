import { useEffect, useMemo, useState } from 'react';
import type { Model3DSummary } from '@overflow2026/shared';
import { useModelIndex } from '../browse/useModelIndex';
import { useCollections, POLICY_PERMISSIONLESS, type NftCollectionSummary } from './useCollections';

// plan-2026-06-17-002 U3 — Integration Ecosystem leaderboard data.
//
// Left-join: the collection SET comes from GraphQL (useCollections, filtered to
// permissionless), the COUNTS come from the backend indexer endpoint. Collections
// the indexer has never seen render at count 0 (the indexer only knows collections
// with >=1 IntegrationRegistered event). If the count endpoint fails, the list
// still renders — every row at count 0 (pessimistic; never drop the list).

export interface LeaderboardRow {
  collectionId: string;
  name: string;
  count: number;
  latestRegisteredAtMs: number;
  registerFee: string;
}

interface CountEntry {
  count: number;
  latestRegisteredAtMs: number;
}

// Endpoint returns snake_case (matches the existing /integrations convention);
// map to camelCase here, the single client-side boundary.
interface LeaderboardApiRow {
  collection_id: string;
  count: number;
  latest_registered_at_ms: number;
}
interface LeaderboardApiResponse {
  leaderboard?: LeaderboardApiRow[];
}

function truncate(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

// NftCollection has no on-chain name — join base_model_id → Model3D.name.
function nameForCollection(c: NftCollectionSummary, models: Model3DSummary[]): string {
  const model = models.find((m) => m.objectId === c.baseModelId);
  return model?.name ? `${model.name} collection` : `Collection ${truncate(c.collectionId)}`;
}

/**
 * Pure join + sort. Exported for unit testing. Includes zero-count collections
 * (left-join), sorts count desc → most-recent integration desc → collectionId.
 */
export function buildLeaderboardRows(
  collections: NftCollectionSummary[],
  models: Model3DSummary[],
  counts: Map<string, CountEntry>,
): LeaderboardRow[] {
  return collections
    .filter((c) => c.integrationPolicy === POLICY_PERMISSIONLESS)
    .map((c) => {
      const entry = counts.get(c.collectionId);
      return {
        collectionId: c.collectionId,
        name: nameForCollection(c, models),
        count: entry?.count ?? 0,
        latestRegisteredAtMs: entry?.latestRegisteredAtMs ?? 0,
        registerFee: c.registerFee,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.latestRegisteredAtMs - a.latestRegisteredAtMs ||
        a.collectionId.localeCompare(b.collectionId),
    );
}

export interface UseIntegrationLeaderboardResult {
  rows: LeaderboardRow[];
  loading: boolean;
  error: Error | null;
}

export function useIntegrationLeaderboard(): UseIntegrationLeaderboardResult {
  const { collections, loading: collLoading, error: collError } = useCollections();
  const { models } = useModelIndex();
  const [counts, setCounts] = useState<Map<string, CountEntry>>(new Map());
  const [countsLoading, setCountsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCountsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/integrations/leaderboard');
        if (!res.ok) throw new Error(`leaderboard API ${res.status}`);
        const body = (await res.json()) as LeaderboardApiResponse;
        if (cancelled) return;
        const next = new Map<string, CountEntry>();
        for (const r of body.leaderboard ?? []) {
          next.set(r.collection_id, {
            count: r.count,
            latestRegisteredAtMs: r.latest_registered_at_ms,
          });
        }
        setCounts(next);
      } catch {
        // Pessimistic: keep the list, show every row at count 0. Do not surface
        // as a fatal error — only the collection list failing is fatal.
        if (!cancelled) setCounts(new Map());
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => buildLeaderboardRows(collections, models, counts),
    [collections, models, counts],
  );

  return { rows, loading: collLoading || countsLoading, error: collError };
}
