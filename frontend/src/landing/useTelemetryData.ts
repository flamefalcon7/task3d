// S2 telemetry strip data hook.
// Per docs/brainstorms/2026-05-29-s2-telemetry-strip-requirements.md KD-1/KD-4/KD-5.
//
// Behavior: render the baked fallback immediately on mount, then race a
// live `queryEvents` sweep against a wall-clock timeout. If the sweep wins,
// return `{ status: 'live', data: fresh }`. Otherwise return
// `{ status: 'cache', data: FALLBACK_TELEMETRY }`. Fetch-once on mount; no
// polling, no interval, no websocket.

import { useEffect, useState } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';

import { TESTNET } from '../sui/networkConfig';
import { FALLBACK_TELEMETRY, type TelemetrySnapshot } from './telemetryFallback';

export type TelemetryStatus = 'live' | 'cache';

export interface TelemetryResult {
  status: TelemetryStatus;
  data: TelemetrySnapshot;
}

// Total wall-clock budget for the live sweep before we give up and stay on
// fallback. Includes pagination round-trips for both event streams. Long
// enough to absorb a single slow RPC hop; short enough that a judge does
// not perceive the swap as a delayed re-render.
const LIVE_FETCH_TIMEOUT_MS = 2000;

// Per-page limit for queryEvents pagination. The Sui SDK caps each request;
// 50 is a safe ceiling that costs one round-trip per ~50 events.
const QUERY_EVENTS_PAGE_SIZE = 50;

interface QueryEventsLikeClient {
  queryEvents: (args: {
    query: { MoveEventType: string };
    limit?: number;
    cursor?: { txDigest: string; eventSeq: string } | null;
    order?: 'ascending' | 'descending';
  }) => Promise<{
    data: Array<{
      parsedJson?: unknown;
    }>;
    hasNextPage?: boolean;
    nextCursor?: { txDigest: string; eventSeq: string } | null;
  }>;
}

interface ModelPublishedJson {
  lineage_blob_id?: string;
}

// Sweep ALL pages of a single MoveEventType, descending order. Returns
// (count, firstEvent) — first event in descending order = the most recent.
async function sweepEventStream(
  client: QueryEventsLikeClient,
  moveEventType: string,
  signal: AbortSignal,
): Promise<{ count: number; firstEvent: unknown | null }> {
  let count = 0;
  let firstEvent: unknown | null = null;
  let cursor: { txDigest: string; eventSeq: string } | null = null;
  // Hard upper bound on pages so a runaway RPC cannot trap us past the
  // outer timeout. 100 pages × 50 events = 5000-event ceiling, well above
  // expected testnet event counts for the submission window.
  for (let page = 0; page < 100; page += 1) {
    if (signal.aborted) throw new Error('aborted');
    const res = await client.queryEvents({
      query: { MoveEventType: moveEventType },
      limit: QUERY_EVENTS_PAGE_SIZE,
      cursor,
      order: 'descending',
    });
    if (firstEvent === null && res.data.length > 0) {
      firstEvent = res.data[0];
    }
    count += res.data.length;
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return { count, firstEvent };
}

export function useTelemetryData(): TelemetryResult {
  const suiClient = useSuiClient() as unknown as QueryEventsLikeClient;
  const [result, setResult] = useState<TelemetryResult>({
    status: 'cache',
    data: FALLBACK_TELEMETRY,
  });

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const modelEventType = `${TESTNET.model3dPackageId}::model3d::ModelPublished`;
    const nftEventType = `${TESTNET.model3dPackageId}::model3d::NftTokenMinted`;

    const live = (async () => {
      const [modelRes, nftRes] = await Promise.all([
        sweepEventStream(suiClient, modelEventType, controller.signal),
        sweepEventStream(suiClient, nftEventType, controller.signal),
      ]);
      const latestModel = modelRes.firstEvent as
        | { parsedJson?: ModelPublishedJson }
        | null;
      const latestCid =
        latestModel?.parsedJson?.lineage_blob_id ?? FALLBACK_TELEMETRY.latestCid;
      const snapshot: TelemetrySnapshot = {
        asOfIso: new Date().toISOString(),
        l1Models: modelRes.count,
        l2Nfts: nftRes.count,
        // KD-3: with no `bytes` field on ModelPublished, WALRUS BLOBS falls
        // back to L1 count (1 blob per Model3D). Honest within the schema we
        // ship; the redundancy is acceptable for track-relevance signal.
        walrusBlobs: modelRes.count,
        latestCid,
      };
      return snapshot;
    })();

    const timeout = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), LIVE_FETCH_TIMEOUT_MS);
    });

    Promise.race([live, timeout])
      .then((value) => {
        if (!alive) return;
        if (value === 'timeout') {
          // Live still in flight, but UI won't wait. Abort so we don't keep
          // hammering RPC for a result nobody will display.
          controller.abort();
          return;
        }
        setResult({ status: 'live', data: value });
      })
      .catch(() => {
        // Live sweep errored (network failure, RPC 5xx, parse mismatch). Stay
        // on the fallback that's already rendered; no error UI per KD-4.
      })
      .finally(() => {
        if (timeoutId !== null) clearTimeout(timeoutId);
      });

    return () => {
      alive = false;
      controller.abort();
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [suiClient]);

  return result;
}
