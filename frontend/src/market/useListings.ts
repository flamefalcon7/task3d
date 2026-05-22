import { useEffect, useState } from 'react';
import { KioskClient } from '@mysten/kiosk';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';

// plan-010 U3 (D-041) — discover NftTokens currently listed for sale.
//
// Approach (a), demo-grade (see D-041 / plan §U3): we read ONE seller kiosk by
// id (tracked from the list PTB / the team-controlled seller wallet) rather
// than indexing kiosk::ItemListed events globally. The scalable path (a backend
// event indexer, mirroring U7) is deferred post-submission.
//
// Read mechanism: @mysten/kiosk's `getKiosk` decodes the kiosk's Item/Listing
// dynamic fields for us. It accepts a `SuiGraphQLClient`, so this stays on the
// same GraphQL endpoint as every other read hook — no JSON-RPC client. We then
// join each listed token's `patch_id`/`name` via the standard `objects` query
// so the marketplace card can preview the variant (glbUrlForToken) and label it.

export interface Listing {
  tokenId: string;
  priceMist: bigint;
  name: string;
  patchId: string; // by-quilt-patch-id GLB resolution (preview)
  collectionId: string;
  kioskId: string; // the kiosk the buyer purchases from
}

// One object by id. Sui GraphQL's ObjectFilter has no `objectIds` field, so we
// fetch each listed token individually (kiosk-placed items keep their object id
// — they're stored as dynamic OBJECT fields — so this resolves them fine).
const TOKEN_DETAIL_QUERY = /* GraphQL */ `
  query TokenDetail($id: SuiAddress!) {
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

interface TokenDetailResponse {
  data?: {
    object?: {
      address?: string;
      asMoveObject?: { contents?: { json?: Record<string, unknown> | null } | null } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

/** Listed-token id + price as decoded from the seller kiosk. */
interface ListedRef {
  tokenId: string;
  priceMist: bigint;
}

function makeKioskClient(): KioskClient {
  return new KioskClient({
    client: new SuiGraphQLClient({ url: SUI_GRAPHQL_ENDPOINT, network: 'testnet' }),
    network: 'testnet',
  });
}

/** The connected wallet's first kiosk + its owner cap, or null if it has none. */
export interface OwnedKioskRef {
  kioskId: string;
  kioskCapId: string;
}

/**
 * Resolve a wallet's existing kiosk (first one) so the list flow can reuse it
 * instead of creating a new kiosk on every listing. Returns null when the
 * wallet has no kiosk yet (the list builder then creates one in-PTB).
 */
export async function fetchOwnedKiosk(address: string): Promise<OwnedKioskRef | null> {
  const kioskClient = makeKioskClient();
  const { kioskOwnerCaps } = await kioskClient.getOwnedKiosks({ address });
  const cap = kioskOwnerCaps[0];
  if (!cap) return null;
  return { kioskId: cap.kioskId, kioskCapId: cap.objectId };
}

/** All kiosk ids the wallet owns (a wallet may have several). */
export async function fetchOwnedKioskIds(address: string): Promise<string[]> {
  const kioskClient = makeKioskClient();
  const { kioskOwnerCaps } = await kioskClient.getOwnedKiosks({ address });
  return kioskOwnerCaps.map((c) => c.kioskId);
}

// Read the kiosk's `Listing` dynamic fields directly. We do NOT use
// @mysten/kiosk's getKiosk for prices: in this SDK version its
// `withListingPrices` decode is broken and returns garbage u64s (e.g.
// 6778647746668833948 for a real price of 10000000). The raw dynamic field is
// authoritative — name is `0x2::kiosk::Listing { id, is_exclusive }` (id = the
// listed item) and value is the u64 price in MIST.
const KIOSK_LISTINGS_QUERY = /* GraphQL */ `
  query KioskListings($id: SuiAddress!) {
    object(address: $id) {
      dynamicFields {
        nodes {
          name { type { repr } json }
          value { __typename ... on MoveValue { json } }
        }
      }
    }
  }
`;

interface KioskListingsResponse {
  data?: {
    object?: {
      dynamicFields?: {
        nodes?: Array<{
          name?: { type?: { repr?: string }; json?: { id?: string } | null } | null;
          value?: { __typename?: string; json?: unknown } | null;
        }>;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

/** Read the kiosk's listed token refs (id + price). Exported for testing. */
export async function fetchListedRefs(kioskId: string): Promise<ListedRef[]> {
  const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: KIOSK_LISTINGS_QUERY, variables: { id: kioskId } }),
  });
  if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
  const json = (await resp.json()) as KioskListingsResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  const refs: ListedRef[] = [];
  for (const node of json.data?.object?.dynamicFields?.nodes ?? []) {
    if (!node.name?.type?.repr?.includes('::kiosk::Listing')) continue;
    const tokenId = node.name.json?.id;
    const price = node.value?.json; // u64 emitted as a decimal string
    if (tokenId && (typeof price === 'string' || typeof price === 'number')) {
      refs.push({ tokenId, priceMist: BigInt(price) });
    }
  }
  return refs;
}

async function fetchTokenJson(tokenId: string): Promise<Record<string, unknown>> {
  const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: TOKEN_DETAIL_QUERY, variables: { id: tokenId } }),
  });
  if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
  const json = (await resp.json()) as TokenDetailResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data?.object?.asMoveObject?.contents?.json ?? {};
}

async function joinTokenDetails(
  refs: ListedRef[],
  kioskId: string,
): Promise<Listing[]> {
  if (refs.length === 0) return [];
  return Promise.all(
    refs.map(async (ref) => {
      const j = await fetchTokenJson(ref.tokenId);
      return {
        tokenId: ref.tokenId,
        priceMist: ref.priceMist,
        name: String(j.name ?? ''),
        patchId: String(j.patch_id ?? ''),
        collectionId: String(j.collection_id ?? ''),
        kioskId,
      };
    }),
  );
}

export interface UseListingsResult {
  listings: Listing[];
  loading: boolean;
  error: Error | null;
}

/**
 * Listings currently for sale across the given kiosks (approach (a),
 * demo-grade). Aggregates every kiosk we know about — the connected wallet's
 * own kiosks plus any kiosk listed into on this browser — so a listing always
 * shows regardless of which seller kiosk it landed in. Empty array → empty
 * marketplace.
 */
export function useListings(
  kioskIds: string[],
  reloadKey?: unknown,
): UseListingsResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stable primitive dep so the effect doesn't refire on a new-but-equal array.
  const key = [...kioskIds].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const perKiosk = await Promise.all(
          ids.map(async (id) => joinTokenDetails(await fetchListedRefs(id), id)),
        );
        if (!cancelled) setListings(perKiosk.flat());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, reloadKey]);

  return { listings, loading, error };
}
