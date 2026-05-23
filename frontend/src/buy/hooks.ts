import { useEffect, useState } from 'react';
import type { Model3DSummary } from '@overflow2026/shared';
import { SUI_GRAPHQL_ENDPOINT } from '../browse/graphqlQueries';

// Single-object Model3D query — sibling of useModelIndex (U8) but scoped to
// one object id. Defensive about partial decodes, same as useModelIndex.
const SINGLE_MODEL_QUERY = /* GraphQL */ `
  query Model3DById($id: SuiAddress!) {
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

interface SingleObjectResponse {
  data?: {
    object?: {
      address?: string;
      asMoveObject?: {
        contents?: {
          json?: Record<string, unknown> | null;
        } | null;
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

function jsonToSummary(
  objectId: string,
  json: Record<string, unknown>,
): Model3DSummary {
  const blob = (json.blob ?? {}) as Record<string, unknown>;
  const blobId = String(blob.blob_id ?? json.blob_id ?? '');
  const lineageBlobId = String(json.lineage_blob_id ?? '');
  const rawTags = Array.isArray(json.tags) ? (json.tags as unknown[]) : [];
  // plan-013 — segmented-mesh per-part labels; empty on pre-republish objects.
  const rawPartLabels = Array.isArray(json.part_labels) ? (json.part_labels as unknown[]) : [];
  // Phase 3 (U1): see useModelIndex nodeToSummary for the same migration.
  const collectionId = String(json.collection_id ?? '');
  const patchId = String(json.patch_id ?? '');
  return {
    objectId,
    blobId,
    collectionId,
    patchId,
    creator: String(json.creator ?? ''),
    shapeType: String(json.shape_type ?? ''),
    paramsJson: String(json.params_json ?? ''),
    name: String(json.name ?? ''),
    directAccessPrice: String(json.direct_access_price ?? '0'),
    tags: rawTags.map((t) => String(t)),
    partLabels: rawPartLabels.map((l) => String(l)),
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

export function useModelById(objectId: string): {
  model: Model3DSummary | null;
  loading: boolean;
  error: Error | null;
} {
  const [model, setModel] = useState<Model3DSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!objectId || objectId === '0x0') {
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
            query: SINGLE_MODEL_QUERY,
            variables: { id: objectId },
          }),
        });
        if (!resp.ok) throw new Error(`Sui GraphQL ${resp.status}`);
        const data = (await resp.json()) as SingleObjectResponse;
        if (data.errors && data.errors.length) {
          throw new Error(data.errors.map((e) => e.message).join('; '));
        }
        const obj = data.data?.object;
        if (!obj || cancelled) {
          if (!cancelled) setModel(null);
          return;
        }
        const json = obj.asMoveObject?.contents?.json;
        if (!json) throw new Error('Model3D object missing contents.json');
        if (!cancelled) {
          setModel(jsonToSummary(obj.address ?? objectId, json));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [objectId]);

  return { model, loading, error };
}
