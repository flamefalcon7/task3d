// plan-008 U7 — self-contained `IntegrationRegistered` indexer.
//
// Minimal, single-topic poll loop (NOT a generic poller framework — none
// exists, and the feasibility review cut that scope). It:
//   1. polls `queryEvents` for `<pkg>::model3d::IntegrationRegistered` from a
//      cursor (ascending), paginating each tick;
//   2. for each event resolves the `app_metadata` blob — the event is LEAN
//      (collection_id, integrator, registered_at_ms only; D-029), so the blob
//      lives in the collection's `integrations` Table (a dynamic field keyed by
//      integrator address). One `getObject` (collection → Table UID, cached) +
//      one `getDynamicFieldObject` (Table → record) per new event;
//   3. validates the blob via `parseAppMetadata` (U7 schema). Invalid records
//      are DROPPED + logged — they never reach the public "Used by" list.
//
// State is in-memory (cursor + Map). Restart re-scans from genesis cursor; for
// a hackathon demo that is acceptable (low event volume). The client is
// injected so unit tests drive it with mocks — testnet has zero registrations
// on the v3 package, so there is no live event to exercise.

import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Buffer } from 'node:buffer';
import { parseAppMetadata } from '../lib/appMetadataSchema.js';
import { integrationRegisteredEventType, NETWORK } from '../sui/client.js';

export interface UsedByRecord {
  name: string;
  url: string;
  integrator: string;
  registeredAtMs: number;
}

export type IndexerClient = Pick<
  SuiJsonRpcClient,
  'queryEvents' | 'getObject' | 'getDynamicFieldObject'
>;

/** Cross-collection aggregate row for the integration leaderboard. */
export interface LeaderboardEntry {
  collectionId: string;
  count: number;
  latestRegisteredAtMs: number;
}

export interface IntegrationIndexer {
  start(): void;
  stop(): void;
  /** Records for one collection, newest registrations last (insertion order). */
  getIntegrations(collectionId: string): UsedByRecord[];
  /**
   * Cross-collection counts for the leaderboard. UNSORTED (raw store iteration
   * order) — the route owns ordering (plan-2026-06-17-002 U1/U2). Only includes
   * collections with >=1 registration; zero-count collections are left-joined in
   * on the client.
   */
  getLeaderboard(): LeaderboardEntry[];
  /** Run a single poll tick — exposed for tests + manual triggering. */
  pollOnce(): Promise<void>;
}

export interface IndexerOptions {
  client: IndexerClient;
  packageId?: string;
  pollMs?: number;
  /** Page size for queryEvents pagination. */
  pageLimit?: number;
}

function toBytes(field: unknown): Uint8Array | null {
  // Sui JSON-RPC renders Move `vector<u8>` either as a base64 string or as a
  // number[] depending on context; accept both.
  if (typeof field === 'string') return Uint8Array.from(Buffer.from(field, 'base64'));
  if (Array.isArray(field) && field.every((n) => typeof n === 'number')) {
    return Uint8Array.from(field as number[]);
  }
  return null;
}

export function createIntegrationIndexer(opts: IndexerOptions): IntegrationIndexer {
  const { client } = opts;
  const packageId = opts.packageId ?? NETWORK.packageId;
  const pollMs = opts.pollMs ?? 2000;
  const pageLimit = opts.pageLimit ?? 50;
  const eventType = integrationRegisteredEventType(packageId);

  // collectionId -> (integrator -> record). Inner map dedupes the
  // one-per-(integrator,collection) registration.
  const store = new Map<string, Map<string, UsedByRecord>>();
  // collectionId -> integrations Table UID (avoids re-fetching the collection).
  const tableUidCache = new Map<string, string>();
  let cursor: { txDigest: string; eventSeq: string } | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let polling = false;

  async function resolveTableUid(collectionId: string): Promise<string | null> {
    const cached = tableUidCache.get(collectionId);
    if (cached) return cached;
    const obj = await client.getObject({ id: collectionId, options: { showContent: true } });
    const content = (obj as { data?: { content?: unknown } }).data?.content as
      | { fields?: { integrations?: { fields?: { id?: { id?: string } } } } }
      | undefined;
    const uid = content?.fields?.integrations?.fields?.id?.id;
    if (typeof uid === 'string') {
      tableUidCache.set(collectionId, uid);
      return uid;
    }
    return null;
  }

  async function resolveAppMetadataBytes(
    collectionId: string,
    integrator: string,
  ): Promise<Uint8Array | null> {
    const tableUid = await resolveTableUid(collectionId);
    if (!tableUid) return null;
    const field = await client.getDynamicFieldObject({
      parentId: tableUid,
      name: { type: 'address', value: integrator },
    });
    const fields = (field as { data?: { content?: { fields?: Record<string, unknown> } } }).data
      ?.content?.fields;
    if (!fields) return null;
    // Table entry is Field<address, IntegrationRecord>: the record lives under
    // `value`; fall back to a flattened shape just in case.
    const value = (fields.value as { fields?: Record<string, unknown> } | undefined)?.fields ?? fields;
    return toBytes((value as Record<string, unknown>).app_metadata);
  }

  async function ingest(event: {
    parsedJson?: unknown;
  }): Promise<void> {
    const pj = event.parsedJson as
      | { collection_id?: string; integrator?: string; registered_at_ms?: string }
      | undefined;
    if (!pj?.collection_id || !pj.integrator || pj.registered_at_ms === undefined) return;
    const collectionId = pj.collection_id;
    const integrator = pj.integrator;
    const registeredAtMs = Number(pj.registered_at_ms);

    const bytes = await resolveAppMetadataBytes(collectionId, integrator);
    if (!bytes) {
      console.warn(`[indexer] could not resolve app_metadata for ${collectionId}/${integrator}`);
      return;
    }
    const result = parseAppMetadata(bytes);
    if (!result.ok) {
      console.warn(`[indexer] dropped invalid app_metadata (${result.reason}) for ${integrator}`);
      return;
    }
    let inner = store.get(collectionId);
    if (!inner) {
      inner = new Map();
      store.set(collectionId, inner);
    }
    inner.set(integrator, { ...result.value, integrator, registeredAtMs });
  }

  async function pollOnce(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      let hasNext = true;
      while (hasNext) {
        const res = await client.queryEvents({
          query: { MoveEventType: eventType },
          cursor,
          limit: pageLimit,
          order: 'ascending',
        });
        for (const ev of res.data) {
          await ingest(ev as { parsedJson?: unknown });
        }
        if (res.nextCursor) cursor = res.nextCursor;
        hasNext = res.hasNextPage === true && res.data.length > 0;
      }
    } catch (err) {
      console.warn(`[indexer] poll failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      polling = false;
    }
  }

  return {
    start() {
      if (timer) return;
      void pollOnce();
      timer = setInterval(() => void pollOnce(), pollMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    getIntegrations(collectionId: string): UsedByRecord[] {
      return Array.from(store.get(collectionId)?.values() ?? []);
    },
    getLeaderboard(): LeaderboardEntry[] {
      return Array.from(store.entries()).map(([collectionId, inner]) => {
        let latestRegisteredAtMs = 0;
        for (const rec of inner.values()) {
          if (rec.registeredAtMs > latestRegisteredAtMs) latestRegisteredAtMs = rec.registeredAtMs;
        }
        return { collectionId, count: inner.size, latestRegisteredAtMs };
      });
    },
    pollOnce,
  };
}
