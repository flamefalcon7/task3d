import type { Model3DSummary } from '@overflow2026/shared';

// Phase 4 U1-prelim — temporary stub for plan-007 U10's `GET /api/listings/:id`.
// Lets `/track?model=<id>` resolve a model id to a `Model3DSummary` without the
// real backend route landing yet. U7 ships the route; U10 swaps this stub for a
// fetch call. Delete the file when U10 lands.
//
// Dev escape hatch: `?blob=<walrusBlobId>` forces that blob regardless of the
// stub map — useful for end-to-end Babylon scene-mount testing before any real
// model is registered.

interface StubEntry {
  blobId: string;
  name: string;
  patchId?: string;
}

const STUB_MAP: Record<string, StubEntry> = {
  // Populate with `{ '<modelId>': { blobId, name } }` once a known testnet
  // listing exists. Until then, callers must pass `?blob=` to exercise the
  // path end-to-end.
};

export function stubListingLookup(
  modelId: string,
  blobOverride?: string | null,
): Model3DSummary | null {
  const entry = STUB_MAP[modelId];
  const blobId = blobOverride ?? entry?.blobId ?? '';
  if (!blobId) return null;
  return {
    objectId: modelId,
    blobId,
    patchId: entry?.patchId ?? '',
    collectionId: '',
    creator: '',
    shapeType: 'car',
    paramsJson: '',
    name: entry?.name ?? 'prototype',
    directAccessPrice: '0',
    tags: [],
    createdAtMs: '0',
    lineageBlobId: '',
    glbBlobId: '',
    derivativeMintFee: '0',
    derivativeRoyaltyBps: 0,
  };
}
