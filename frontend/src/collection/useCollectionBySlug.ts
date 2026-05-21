import { useEffect, useState } from 'react';
import type { Model3DSummary } from '@overflow2026/shared';
import {
  SUI_GRAPHQL_ENDPOINT,
  buildModel3DTypeTag,
} from '../browse/graphqlQueries';

// Phase 3 (U5): fetch every Model3D variant whose `collection_id` matches a
// given slug. v1 slug strategy is collectionId itself (see CollectionCard
// header for rationale), so this hook simply filters by `collection_id ==
// slug`. When the Phase 4 indexer lands we'll add a slug→collectionId
// resolution step and switch the GraphQL filter accordingly.
//
// We reuse the global Model3D type filter from the Browse query and
// client-side narrow by collectionId. The Sui GraphQL `objects(filter: {...})`
// API does not yet support Move-struct field equality, so a chain-side filter
// isn't possible without a custom indexer.

interface GraphQLNode {
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
      nodes?: GraphQLNode[];
    };
  };
  errors?: Array<{ message: string }>;
}

function getPackageId(): string {
  const id = import.meta.env.VITE_MODEL3D_PACKAGE_ID as string | undefined;
  return id ?? '0x0';
}

function nodeToSummary(node: GraphQLNode): Model3DSummary | null {
  const objectId = node.address;
  const json = node.asMoveObject?.contents?.json as
    | Record<string, unknown>
    | null
    | undefined;
  if (!objectId || !json) return null;

  const blob = (json.blob ?? {}) as Record<string, unknown>;
  const blobId = String(blob.blob_id ?? json.blob_id ?? '');
  const lineageBlobId = String(json.lineage_blob_id ?? '');
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
    lineageBlobId,
    glbBlobId: String(json.glb_blob_id ?? ''),
    derivativeMintFee: String(
      ((json.license ?? {}) as Record<string, unknown>).derivative_mint_fee ?? '0',
    ),
    derivativeRoyaltyBps: Number(
      ((json.license ?? {}) as Record<string, unknown>).derivative_royalty_bps ?? 0,
    ),
  };
}

const VARIANTS_QUERY = /* GraphQL */ `
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

export interface UseCollectionBySlugResult {
  variants: Model3DSummary[];
  loading: boolean;
  error: Error | null;
}

export function useCollectionBySlug(slug: string): UseCollectionBySlugResult {
  const [variants, setVariants] = useState<Model3DSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const packageId = getPackageId();
    if (!slug || !packageId || packageId === '0x0') {
      setVariants([]);
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
            query: VARIANTS_QUERY,
            variables: { type: buildModel3DTypeTag(packageId) },
          }),
        });
        if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
        const data = (await resp.json()) as GraphQLResponse;
        if (data.errors && data.errors.length) {
          throw new Error(data.errors.map((e) => e.message).join('; '));
        }
        if (cancelled) return;
        const all = (data.data?.objects?.nodes ?? [])
          .map(nodeToSummary)
          .filter((m): m is Model3DSummary => m !== null);
        const matching = all.filter((m) => m.collectionId === slug);
        setVariants(matching);
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
  }, [slug]);

  return { variants, loading, error };
}
