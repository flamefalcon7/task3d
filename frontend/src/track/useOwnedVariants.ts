import { useEffect, useState } from 'react';
import type { Model3DSummary } from '@overflow2026/shared';
import {
  SUI_GRAPHQL_ENDPOINT,
  buildModel3DTypeTag,
} from '../browse/graphqlQueries';

// Phase 3 U6 — list a connected wallet's drivable variants.
//
// Two-pass approach (mirrors buy/hooks.ts useOwnsAccess + collection/
// useCollectionBySlug):
//
//   1. Query Sui for every Access object owned by the connected wallet.
//      `Access` is the soulbound receipt minted by `model3d::buy_access`;
//      its `target_id` field points at the Model3D the buyer paid for.
//   2. Query every Model3D for our package, then narrow to the set whose
//      objectId is in the Access target list.
//
// Why not one query: Sui GraphQL `objects(filter: {...})` doesn't yet
// support `OR` over arbitrary IDs, and Move-struct field equality on the
// target_id side isn't supported either. Two index-style fetches kept the
// implementation simple and is what useCollectionBySlug already does.
//
// Filtering to "car" variants (F8 per plan): for v1 we DON'T filter — every
// owned variant lands in the carousel even if it's a sword or a chest. The
// physics aggregate is a fixed BOX shape so any GLB will at least roll; the
// demo script will simply use car variants. Phase 3+ can re-introduce
// shapeType === 'car' filtering once the Forge ships an explicit "car"
// collection tag.

const OWNED_ACCESS_QUERY = /* GraphQL */ `
  query OwnedAccess($owner: SuiAddress!, $type: String!) {
    objects(filter: { owner: $owner, type: $type }) {
      nodes {
        asMoveObject {
          contents {
            json
          }
        }
      }
    }
  }
`;

const ALL_MODELS_QUERY = /* GraphQL */ `
  query Model3Ds($type: String!) {
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

interface GraphQLObjectNode {
  address?: string;
  asMoveObject?: {
    contents?: {
      json?: Record<string, unknown> | null;
    } | null;
  } | null;
}

interface GraphQLResponse {
  data?: {
    objects?: {
      nodes?: GraphQLObjectNode[];
    };
  };
  errors?: Array<{ message: string }>;
}

function getPackageId(): string {
  const id = import.meta.env.VITE_MODEL3D_PACKAGE_ID as string | undefined;
  return id ?? '0x0';
}

function nodeToSummary(node: GraphQLObjectNode): Model3DSummary | null {
  const objectId = node.address;
  const json = node.asMoveObject?.contents?.json as
    | Record<string, unknown>
    | null
    | undefined;
  if (!objectId || !json) return null;
  const blob = (json.blob ?? {}) as Record<string, unknown>;
  const blobId = String(blob.blob_id ?? json.blob_id ?? '');
  const rawTags = Array.isArray(json.tags) ? (json.tags as unknown[]) : [];
  return {
    objectId,
    blobId,
    collectionId: String(json.collection_id ?? ''),
    patchId: String(json.patch_id ?? ''),
    creator: String(json.creator ?? ''),
    shapeType: String(json.shape_type ?? ''),
    paramsJson: String(json.params_json ?? ''),
    name: String(json.name ?? ''),
    directAccessPrice: String(json.direct_access_price ?? '0'),
    tags: rawTags.map((t) => String(t)),
    createdAtMs: String(json.created_at_ms ?? '0'),
    lineageBlobId: String(json.lineage_blob_id ?? ''),
    glbBlobId: String(json.glb_blob_id ?? ''),
    derivativeMintFee: String(
      ((json.license ?? {}) as Record<string, unknown>).derivative_mint_fee ?? '0',
    ),
    derivativeRoyaltyBps: Number(
      ((json.license ?? {}) as Record<string, unknown>).derivative_royalty_bps ?? 0,
    ),
  };
}

export interface UseOwnedVariantsResult {
  variants: Model3DSummary[];
  loading: boolean;
  error: Error | null;
}

export function useOwnedVariants(
  walletAddress: string | undefined,
): UseOwnedVariantsResult {
  const [variants, setVariants] = useState<Model3DSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const packageId = getPackageId();
    if (!walletAddress || !packageId || packageId === '0x0') {
      setVariants([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Pass 1 — Access objects owned by this wallet.
        const accessResp = await fetch(SUI_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: OWNED_ACCESS_QUERY,
            variables: {
              owner: walletAddress,
              type: `${packageId}::model3d::Access`,
            },
          }),
        });
        if (!accessResp.ok) throw new Error(`Sui GraphQL ${accessResp.status}`);
        const accessJson = (await accessResp.json()) as GraphQLResponse;
        if (accessJson.errors && accessJson.errors.length) {
          throw new Error(accessJson.errors.map((e) => e.message).join('; '));
        }
        const targetIds = new Set<string>(
          (accessJson.data?.objects?.nodes ?? [])
            .map((n) => {
              const j = n.asMoveObject?.contents?.json as
                | Record<string, unknown>
                | undefined;
              return j?.target_id ? String(j.target_id) : '';
            })
            .filter((id): id is string => id.length > 0),
        );
        if (cancelled) return;
        if (targetIds.size === 0) {
          setVariants([]);
          return;
        }

        // Pass 2 — all Model3D for the package, then narrow to targetIds.
        const modelsResp = await fetch(SUI_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: ALL_MODELS_QUERY,
            variables: { type: buildModel3DTypeTag(packageId) },
          }),
        });
        if (!modelsResp.ok) throw new Error(`Sui GraphQL ${modelsResp.status}`);
        const modelsJson = (await modelsResp.json()) as GraphQLResponse;
        if (modelsJson.errors && modelsJson.errors.length) {
          throw new Error(modelsJson.errors.map((e) => e.message).join('; '));
        }
        if (cancelled) return;
        const owned = (modelsJson.data?.objects?.nodes ?? [])
          .map(nodeToSummary)
          .filter((m): m is Model3DSummary => m !== null && targetIds.has(m.objectId));
        setVariants(owned);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  return { variants, loading, error };
}
