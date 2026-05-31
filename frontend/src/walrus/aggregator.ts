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

// plan-026 D-075 — resolve the URL of an encrypted ALLOW_LIST base's FIRST
// public preview still (a watermarked image captured at publish). Returns null
// when there is no preview (PERMISSIONLESS, or a malformed encrypted record) —
// callers fall back to the 3D PreviewCanvas. NEVER point this at `glbBlobId`,
// which holds AES ciphertext for an encrypted base.
//
// `previewBlobIds` are QUILT PATCH ids: the ciphertext + all preview stills are
// co-located in ONE Walrus quilt at publish (so an encrypted publish is a single
// upload, ~3 popups), so previews resolve via the by-quilt-patch-id endpoint.
export function previewStillUrlForSummary(
  m: Pick<Model3DSummary, 'previewBlobIds'>,
): string | null {
  const first = m.previewBlobIds?.[0];
  return first ? `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/${first}` : null;
}

// plan-026 D-075 — render-path selector for a catalog/picker thumbnail.
// Encrypted bases (ALLOW_LIST) MUST render their public preview still as an
// <img>, NEVER fetch the ciphertext `glbBlobId` as a GLB. Returns either a
// `{ kind: 'glb', url }` for the live 3D mesh (PERMISSIONLESS + legacy) or a
// `{ kind: 'preview', url }` still. An encrypted base with no still resolves to
// `{ kind: 'preview', url: null }` so the caller shows a placeholder (it must
// still NOT fall through to the ciphertext GLB).
export type ThumbSource =
  | { kind: 'glb'; url: string }
  | { kind: 'preview'; url: string | null };

export function thumbSourceForSummary(
  m: Pick<Model3DSummary, 'patchId' | 'glbBlobId' | 'blobId' | 'isEncrypted' | 'previewBlobIds'>,
): ThumbSource {
  if (m.isEncrypted) {
    return { kind: 'preview', url: previewStillUrlForSummary(m) };
  }
  return { kind: 'glb', url: glbUrlForSummary(m) };
}

// L2 NftToken GLB resolution (U11, D-035): a token binds a quilt patch, so its
// drivable variant is the by-quilt-patch-id slice. `blobId` is the /track
// ?blob= dev hatch only — a raw standalone blob to drive before any real token
// exists. patch_id wins when both are present (mirrors glbUrlForSummary).
export function glbUrlForToken(t: { patchId: string; blobId: string }): string {
  if (t.patchId) return `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/${t.patchId}`;
  return `${WALRUS_AGGREGATOR}/v1/blobs/${t.blobId}`;
}
