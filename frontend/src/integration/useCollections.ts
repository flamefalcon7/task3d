import { useEffect, useState } from 'react';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';
import { TESTNET } from '../sui/networkConfig';

// plan-008 U13 — list shared L2 NftCollections so a gameDev can pick one to
// register an integration against. Mirrors useModelIndex (client-side GraphQL
// type-filter query) but for the `NftCollection` type. The collection has no
// `name` field on chain (RegisterIntegrationPage joins base_model_id →
// Model3D.name via useModelIndex for display).

export const POLICY_PERMISSIONLESS = 2; // model3d.move POLICY_PERMISSIONLESS

export interface NftCollectionSummary {
  collectionId: string;
  baseModelId: string;
  baseCreator: string;
  nftCreator: string;
  baseRoyaltyBps: number;
  integrationPolicy: number; // u8 — 0 restricted / 1 allow_list / 2 permissionless
  registerFee: string; // u64 MIST as string (D-015)
}

const COLLECTIONS_QUERY = /* GraphQL */ `
  query NftCollections($type: String!) {
    objects(filter: { type: $type }) {
      nodes {
        address
        asMoveObject {
          contents {
            json
          }
        }
      }
    }
  }
`;

const COLLECTION_BY_ID_QUERY = /* GraphQL */ `
  query NftCollectionById($id: SuiAddress!) {
    object(address: $id) {
      address
      asMoveObject {
        contents {
          json
        }
      }
    }
  }
`;

interface GraphQLObjectNode {
  address?: string;
  asMoveObject?: {
    contents?: {
      json?: Record<string, unknown> | null;
    } | null;
  } | null;
}

interface CollectionsResponse {
  data?: { objects?: { nodes?: GraphQLObjectNode[] } };
  errors?: Array<{ message: string }>;
}

interface CollectionByIdResponse {
  data?: { object?: GraphQLObjectNode | null };
  errors?: Array<{ message: string }>;
}

function collectionTypeTag(): string {
  return `${TESTNET.model3dPackageId}::model3d::NftCollection`;
}

function nodeToCollection(node: GraphQLObjectNode): NftCollectionSummary | null {
  const collectionId = node.address;
  const json = node.asMoveObject?.contents?.json as
    | Record<string, unknown>
    | null
    | undefined;
  if (!collectionId || !json) return null;
  return {
    collectionId,
    baseModelId: String(json.base_model_id ?? ''),
    baseCreator: String(json.base_creator ?? ''),
    nftCreator: String(json.nft_creator ?? ''),
    baseRoyaltyBps: Number(json.base_royalty_bps ?? 0),
    integrationPolicy: Number(json.integration_policy ?? 0),
    registerFee: String(json.register_fee ?? '0'),
  };
}

export interface UseCollectionsResult {
  collections: NftCollectionSummary[];
  loading: boolean;
  error: Error | null;
}

// `enabled` lets a caller (e.g. Browse, which only needs collections under the
// ?filter=integration view) skip the network round-trip until it's actually
// shown — without violating the rules-of-hooks unconditional-call requirement.
export function useCollections(enabled = true): UseCollectionsResult {
  const [collections, setCollections] = useState<NftCollectionSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCollections([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: COLLECTIONS_QUERY,
            variables: { type: collectionTypeTag() },
          }),
        });
        if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
        const json = (await resp.json()) as CollectionsResponse;
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join('; '));
        }
        if (cancelled) return;
        const list = (json.data?.objects?.nodes ?? [])
          .map(nodeToCollection)
          .filter((c): c is NftCollectionSummary => c !== null);
        setCollections(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { collections, loading, error };
}

export interface UseCollectionByIdResult {
  collection: NftCollectionSummary | null;
  loading: boolean;
  error: Error | null;
}

// Single-collection hook for CollectionDetailPage (`/collection/:id`). Wraps
// fetchCollectionById with loading/error/cancellation. `not found` surfaces as
// an error so the page can show its empty state.
export function useCollectionById(
  collectionId: string | undefined,
): UseCollectionByIdResult {
  const [collection, setCollection] = useState<NftCollectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!collectionId) {
      setCollection(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const c = await fetchCollectionById(collectionId);
        if (!cancelled) setCollection(c);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  return { collection, loading, error };
}

// TOCTOU guard for RegisterIntegrationPage: the cap holder may have raised the
// register_fee since page load. The on-chain check (EFeeTooLow) is authoritative,
// but a stale UI value would abort confusingly — so re-read the live fee right
// before building/signing the PTB. One-shot fetch, not a hook.
export async function fetchCollectionById(
  collectionId: string,
): Promise<NftCollectionSummary> {
  const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: COLLECTION_BY_ID_QUERY,
      variables: { id: collectionId },
    }),
  });
  if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
  const json = (await resp.json()) as CollectionByIdResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  const mapped = json.data?.object ? nodeToCollection(json.data.object) : null;
  if (!mapped) throw new Error(`Collection ${collectionId} not found`);
  return mapped;
}
