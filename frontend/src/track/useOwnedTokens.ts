import { useEffect, useRef, useState } from 'react';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';
import { TESTNET } from '../sui/networkConfig';

// U11 (D-035/D-036) — discover the connected wallet's drivable NFTs for /track.
//
// Per D-036 an NftToken is a PLAIN owned object (no Kiosk place_and_list), so
// discovery is a single owned-objects query — no two-pass receipt lookup (the
// old soulbound-receipt type is gone) and no Kiosk walk. Each token carries a
// `patch_id` (D-035) that
// resolves to its colored variant GLB through the parent collection's quilt via
// the by-quilt-patch-id aggregator (see `glbUrlForToken` in walrus/aggregator).

export interface OwnedToken {
  tokenId: string; // Sui object id of the owned NftToken
  name: string;
  patchId: string; // D-035 — by-quilt-patch-id GLB resolution
  collectionId: string;
  baseModelId: string;
  // '' for chain-discovered tokens. Set ONLY by the /track ?blob= dev hatch so
  // the shared scene-build path can drive a raw standalone blob (see TrackPage).
  blobId: string;
}

const OWNED_TOKENS_QUERY = /* GraphQL */ `
  query OwnedTokens($owner: SuiAddress!, $type: String!) {
    objects(filter: { owner: $owner, type: $type }) {
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

const TOKEN_BY_ID_QUERY = /* GraphQL */ `
  query TokenById($id: SuiAddress!) {
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

interface OwnedTokensResponse {
  data?: { objects?: { nodes?: GraphQLObjectNode[] } };
  errors?: Array<{ message: string }>;
}

interface TokenByIdResponse {
  data?: { object?: GraphQLObjectNode | null };
  errors?: Array<{ message: string }>;
}

function tokenTypeTag(): string {
  return `${TESTNET.model3dPackageId}::model3d::NftToken`;
}

function nodeToToken(node: GraphQLObjectNode): OwnedToken | null {
  const tokenId = node.address;
  const json = node.asMoveObject?.contents?.json as
    | Record<string, unknown>
    | null
    | undefined;
  if (!tokenId || !json) return null;
  return {
    tokenId,
    name: String(json.name ?? ''),
    patchId: String(json.patch_id ?? ''),
    collectionId: String(json.collection_id ?? ''),
    baseModelId: String(json.base_model_id ?? ''),
    blobId: '',
  };
}

export interface UseOwnedTokensResult {
  tokens: OwnedToken[];
  loading: boolean;
  error: Error | null;
}

export function useOwnedTokens(
  walletAddress: string | undefined,
  // Bump to force a refetch (e.g. after a purchase mints ownership) — owned
  // objects change without the address changing, so this is the refresh hook.
  reloadKey?: unknown,
): UseOwnedTokensResult {
  const [tokens, setTokens] = useState<OwnedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Only show the "Loading your NFTs…" placeholder on the FIRST fetch. Once we
  // have data, reloadKey bumps (MarketPage.pollRefresh fires 10× over 15 s) keep
  // existing cards on screen and swap silently to avoid placeholder flicker.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!walletAddress) {
      setTokens([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    (async () => {
      try {
        const resp = await fetch(SUI_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: OWNED_TOKENS_QUERY,
            variables: { owner: walletAddress, type: tokenTypeTag() },
          }),
        });
        if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
        const json = (await resp.json()) as OwnedTokensResponse;
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join('; '));
        }
        if (cancelled) return;
        const owned = (json.data?.objects?.nodes ?? [])
          .map(nodeToToken)
          .filter((t): t is OwnedToken => t !== null);
        setTokens(owned);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoadedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, reloadKey]);

  return { tokens, loading, error };
}

export interface UseTokenByIdResult {
  token: OwnedToken | null;
  loading: boolean;
  error: Error | null;
}

// `/track?model=<tokenId>` single-drive: resolve ONE token's patch_id directly.
// The race-on-mint demo arc auto-navigates here, and the driver may not be the
// connected wallet — so this bypasses the owned-objects query and reads the
// token by id. GLB resolves through the same by-quilt-patch-id path.
export function useTokenById(
  tokenId: string | undefined,
): UseTokenByIdResult {
  const [token, setToken] = useState<OwnedToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!tokenId) {
      setToken(null);
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
            query: TOKEN_BY_ID_QUERY,
            variables: { id: tokenId },
          }),
        });
        if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
        const json = (await resp.json()) as TokenByIdResponse;
        if (json.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join('; '));
        }
        if (cancelled) return;
        const mapped = json.data?.object ? nodeToToken(json.data.object) : null;
        if (!mapped) throw new Error(`Token ${tokenId} not found`);
        setToken(mapped);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  return { token, loading, error };
}
