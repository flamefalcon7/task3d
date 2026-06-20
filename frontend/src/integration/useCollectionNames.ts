import { useEffect, useState } from 'react';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';
import { TESTNET } from '../sui/networkConfig';

// plan-2026-06-20 (D-110 follow-up) — recover the creator-chosen COLLECTION name.
//
// The on-chain `NftCollection` has no `name` field (see useCollections.ts): at
// launch the creator's name input is only baked into the minted NftToken names
// as `"<name> #<n>"` (LaunchCollectionPage `tokenNames`). So the collection's
// display name lived nowhere readable, and every surface fell back to deriving
// `"<base model> collection"` from the L1 Model3D — which is why a collection the
// creator named "Neon drift" showed as "sport car collection".
//
// Stop-gap (frontend copy layer, no contract change): scan NftToken objects
// network-wide ONCE, take the first token seen per collection, strip its `#<n>`
// suffix, and expose a `collectionId -> name` map. Detail page, leaderboard, and
// the register picker all read this map, falling back to the old base-model
// derivation when no token exists yet (e.g. a freshly launched empty collection).
// The proper fix (a `name: String` field on NftCollection) is deferred to the
// mainnet milestone — see docs/open-questions.md.

// Hard bounds so a misbehaving endpoint can't hang the page. At demo scale we
// expect a single page; the cap degrades gracefully instead of looping forever.
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 20; // 20 * 50 = 1000 tokens ceiling

const COLLECTION_TOKENS_QUERY = /* GraphQL */ `
  query CollectionTokens($type: String!, $after: String) {
    objects(filter: { type: $type }, first: 50, after: $after) {
      nodes {
        asMoveObject {
          contents {
            json
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface TokenNode {
  asMoveObject?: {
    contents?: { json?: Record<string, unknown> | null } | null;
  } | null;
}

interface CollectionTokensResponse {
  data?: {
    objects?: {
      nodes?: TokenNode[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    } | null;
  };
  errors?: Array<{ message: string }>;
}

function tokenTypeTag(): string {
  return `${TESTNET.model3dPackageId}::model3d::NftToken`;
}

/**
 * Strip the per-token `" #<n>"` mint suffix to recover the creator's collection
 * name. `"Neon drift #3"` -> `"Neon drift"`. Names without a suffix (legacy /
 * unexpected) pass through unchanged. Pure; exported for unit testing.
 */
export function stripTokenSuffix(name: string): string {
  return name.replace(/\s*#\d+\s*$/, '').trim();
}

/**
 * Build `collectionId -> collection name` from a flat token list. First token
 * seen per collection wins (they share one base name, so any is correct); empty
 * names after stripping are skipped so they never shadow the base-model
 * fallback. Pure; exported for unit testing.
 */
export function buildNameMap(
  tokens: Array<{ collectionId: string; name: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of tokens) {
    if (!t.collectionId || map.has(t.collectionId)) continue;
    const name = stripTokenSuffix(t.name);
    if (name) map.set(t.collectionId, name);
  }
  return map;
}

/** Network-wide NftToken scan -> collectionId->name map. Bounded + abortable. */
export async function fetchCollectionNames(
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const tokens: Array<{ collectionId: string; name: string }> = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const reqSignal = signal
      ? mergeSignals(signal, timeout)
      : timeout;
    const res = await fetch(SUI_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: COLLECTION_TOKENS_QUERY,
        variables: { type: tokenTypeTag(), after },
      }),
      signal: reqSignal,
    });
    if (!res.ok) throw new Error(`Sui GraphQL ${res.status}`);
    const body = (await res.json()) as CollectionTokensResponse;
    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join('; '));
    }
    const objects = body.data?.objects;
    for (const node of objects?.nodes ?? []) {
      const json = node.asMoveObject?.contents?.json as
        | Record<string, unknown>
        | null
        | undefined;
      if (!json) continue;
      tokens.push({
        collectionId: String(json.collection_id ?? ''),
        name: String(json.name ?? ''),
      });
    }
    if (!objects?.pageInfo?.hasNextPage) break;
    after = objects.pageInfo.endCursor ?? null;
    if (!after) break;
  }
  return buildNameMap(tokens);
}

/** Combine an upstream signal with a per-call timeout (jsdom has no `any`). */
function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const anyFn = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, [a, b]);
  const merged = new AbortController();
  const forward = (src: AbortSignal) => {
    if (src.aborted) merged.abort(src.reason);
    else src.addEventListener('abort', () => merged.abort(src.reason), { once: true });
  };
  forward(a);
  forward(b);
  return merged.signal;
}

export interface UseCollectionNamesResult {
  /** collectionId -> creator-chosen name (token-derived). Absent = use fallback. */
  names: Map<string, string>;
  loading: boolean;
  error: Error | null;
}

/**
 * One network-wide NftToken scan shared across the detail page, leaderboard, and
 * register picker. A scan failure is non-fatal: callers fall back to the
 * base-model-derived name, so an empty map degrades gracefully.
 */
export function useCollectionNames(): UseCollectionNamesResult {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const map = await fetchCollectionNames(controller.signal);
        if (!controller.signal.aborted) {
          setNames(map);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          // Non-fatal: keep an empty map; callers fall back to base-model name.
          setNames(new Map());
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { names, loading, error };
}
