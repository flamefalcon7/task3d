// plan 2026-06-10-001 U1 (KTD-5) — `jsonToSummary` lifted VERBATIM from
// `frontend/src/buy/hooks.ts` so the frontend detail page and the backend MCP
// read tools (`get_model` / `get_license_terms`) share ONE copy of the raw
// Move-JSON → `Model3DSummary` field mapping. Pure + isomorphic: no fetch, no
// DOM, no React. Defensive about partial decodes, same as useModelIndex.

import type { Model3DSummary } from '../types.js';

export function jsonToSummary(
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
    // plan-027 D-078 — one-time buy-access fee on an ALLOW_LIST base; defaults
    // to '0' on pre-v10 objects whose license JSON carries no access_fee.
    accessFee: String(
      ((json.license ?? {}) as Record<string, unknown>).access_fee ?? '0',
    ),
    derivativeRoyaltyBps: Number(
      ((json.license ?? {}) as Record<string, unknown>).derivative_royalty_bps ?? 0,
    ),
    // plan-026 D-075 — policy + Seal flags (default to PERMISSIONLESS / public
    // for pre-v9 objects; see useModelIndex.nodeToSummary for the same mapping).
    policy: Number(((json.license ?? {}) as Record<string, unknown>).policy ?? 2),
    isEncrypted: Boolean(json.is_encrypted ?? false),
    previewBlobIds: (Array.isArray(json.preview_blob_ids)
      ? (json.preview_blob_ids as unknown[])
      : []
    ).map((b) => String(b)),
  };
}
