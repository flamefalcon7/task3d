import type { Model3DSummary } from '@overflow2026/shared';

// Single source of truth for Walrus testnet aggregator reads. Centralised so the
// GLB-resolution rule can't drift across the (4) call sites again — the v6
// four-role Model3D dropped the Phase-3 `blob`/`patch_id` fields and resolves via
// its standalone `glb_blob_id` (D-037), which the old patchId→blobId resolvers
// never read (→ empty preview URLs for every L1 model).
export const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

// Resolve a model/variant summary to the GLB URL the aggregator serves:
//   1. patchId  → a quilt-patch slice (L2 NftToken / collection variants, D-035)
//   2. glbBlobId → the standalone L1 content blob (D-037)
//   3. blobId    → legacy Phase-2/3 whole-blob fallback
export function glbUrlForSummary(
  m: Pick<Model3DSummary, 'patchId' | 'glbBlobId' | 'blobId'>,
): string {
  if (m.patchId) return `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/${m.patchId}`;
  if (m.glbBlobId) return `${WALRUS_AGGREGATOR}/v1/blobs/${m.glbBlobId}`;
  return `${WALRUS_AGGREGATOR}/v1/blobs/${m.blobId}`;
}

// L2 NftToken GLB resolution (U11, D-035): a token binds a quilt patch, so its
// drivable variant is the by-quilt-patch-id slice. `blobId` is the /track
// ?blob= dev hatch only — a raw standalone blob to drive before any real token
// exists. patch_id wins when both are present (mirrors glbUrlForSummary).
export function glbUrlForToken(t: { patchId: string; blobId: string }): string {
  if (t.patchId) return `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/${t.patchId}`;
  return `${WALRUS_AGGREGATOR}/v1/blobs/${t.blobId}`;
}
