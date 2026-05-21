import { useEffect, useState } from 'react';
import { KioskClient } from '@mysten/kiosk';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';
import { TESTNET } from '../sui/networkConfig';

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

const NFT_TOKEN_TYPE = `${TESTNET.model3dPackageId}::model3d::NftToken`;

const TOKEN_DETAILS_QUERY = /* GraphQL */ `
  query TokenDetails($ids: [SuiAddress!]!) {
    objects(filter: { objectIds: $ids }) {
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

interface TokenDetailsResponse {
  data?: {
    objects?: {
      nodes?: Array<{
        address?: string;
        asMoveObject?: { contents?: { json?: Record<string, unknown> | null } | null } | null;
      }>;
    };
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

/** Read the kiosk's listed NftToken refs (id + price). Exported for testing. */
export async function fetchListedRefs(kioskId: string): Promise<ListedRef[]> {
  const kioskClient = makeKioskClient();
  const { items } = await kioskClient.getKiosk({
    id: kioskId,
    options: { withListingPrices: true },
  });
  return items
    .filter((item) => item.type === NFT_TOKEN_TYPE && item.listing?.price != null)
    .map((item) => ({
      tokenId: item.objectId,
      priceMist: BigInt(item.listing!.price as string),
    }));
}

async function joinTokenDetails(
  refs: ListedRef[],
  kioskId: string,
): Promise<Listing[]> {
  if (refs.length === 0) return [];
  const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: TOKEN_DETAILS_QUERY,
      variables: { ids: refs.map((r) => r.tokenId) },
    }),
  });
  if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
  const json = (await resp.json()) as TokenDetailsResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }

  const detailsById = new Map<string, Record<string, unknown>>();
  for (const node of json.data?.objects?.nodes ?? []) {
    const j = node.asMoveObject?.contents?.json;
    if (node.address && j) detailsById.set(node.address, j);
  }

  return refs.map((ref) => {
    const j = detailsById.get(ref.tokenId) ?? {};
    return {
      tokenId: ref.tokenId,
      priceMist: ref.priceMist,
      name: String(j.name ?? ''),
      patchId: String(j.patch_id ?? ''),
      collectionId: String(j.collection_id ?? ''),
      kioskId,
    };
  });
}

export interface UseListingsResult {
  listings: Listing[];
  loading: boolean;
  error: Error | null;
}

/**
 * Listings currently for sale in a single seller kiosk (approach (a)).
 * Pass `undefined` to render an empty marketplace (no kiosk known yet).
 */
export function useListings(
  kioskId: string | undefined,
  reloadKey?: unknown,
): UseListingsResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!kioskId) {
      setListings([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const refs = await fetchListedRefs(kioskId);
        const joined = await joinTokenDetails(refs, kioskId);
        if (!cancelled) setListings(joined);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kioskId, reloadKey]);

  return { listings, loading, error };
}
