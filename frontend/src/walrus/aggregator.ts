import type { Model3DSummary } from '@overflow2026/shared';

// Single source of truth for Walrus aggregator reads. Centralised so the
// GLB-resolution rule can't drift across the (4) call sites again — the v6
// four-role Model3D dropped the Phase-3 `blob`/`patch_id` fields and resolves via
// its standalone `glb_blob_id` (D-037), which the old patchId→blobId resolvers
// never read (→ empty preview URLs for every L1 model).
//
// Audit W-3: env-driven (was hardcoded testnet). On mainnet the read path would
// otherwise silently resolve every blob against the testnet aggregator (404s, or
// worse, a same-id-different-content collision). Override at build time with
// VITE_WALRUS_AGGREGATOR (e.g. the cdn.tusk3d.space worker, or the mainnet
// aggregator); falls back to the testnet aggregator for local dev.
export const WALRUS_AGGREGATOR =
  (import.meta.env.VITE_WALRUS_AGGREGATOR as string | undefined)?.replace(/\/+$/, '') ??
  'https://aggregator.walrus-testnet.walrus.space';

// Audit W-4: blob ids / quilt-patch ids originate from on-chain indexer data,
// which an attacker can publish. Validate the base64url charset before splicing
// one into a URL so a crafted id (`../`, `%2F`, dot-segments) can't redirect the
// fetch or poison the CDN cache key. A non-conforming id resolves to '' (callers
// already fall back to a placeholder / the 3D PreviewCanvas).
const BLOB_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Build `<aggregator>/v1/blobs/<...path>/<id>` only when `id` is a safe blob id;
 *  otherwise '' so the caller falls back rather than fetching a crafted path. */
function blobUrl(id: string, prefix = ''): string {
  if (!id || !BLOB_ID_RE.test(id)) return '';
  return `${WALRUS_AGGREGATOR}/v1/blobs/${prefix}${id}`;
}

// Resolve a model/variant summary to the GLB URL the aggregator serves:
//   1. patchId  → a quilt-patch slice (L2 NftToken / collection variants, D-035)
//   2. glbBlobId → the standalone L1 content blob (D-037)
//   3. blobId    → legacy Phase-2/3 whole-blob fallback
export function glbUrlForSummary(
  m: Pick<Model3DSummary, 'patchId' | 'glbBlobId' | 'blobId'>,
): string {
  if (m.patchId) return blobUrl(m.patchId, 'by-quilt-patch-id/');
  if (m.glbBlobId) return blobUrl(m.glbBlobId);
  return blobUrl(m.blobId);
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
  if (!first) return null;
  // A malformed/crafted preview id resolves to null (placeholder), never a
  // fetched crafted path (audit W-4).
  return blobUrl(first, 'by-quilt-patch-id/') || null;
}

// plan-026 — ALL preview-still URLs (the captured turntable angles, in order).
// The publish captures DEFAULT_STILL_COUNT evenly-spaced angles; the UI cycles
// them as a faux-turntable (ideation 2026-05-30: "no interactivity needed, so
// faux-turntable = cycle the stills"). Empty when there is no preview.
export function previewStillUrlsForSummary(
  m: Pick<Model3DSummary, 'previewBlobIds'>,
): string[] {
  // Drop any malformed id rather than emit a crafted URL (audit W-4).
  return (m.previewBlobIds ?? [])
    .map((id) => blobUrl(id, 'by-quilt-patch-id/'))
    .filter(Boolean);
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
  if (t.patchId) return blobUrl(t.patchId, 'by-quilt-patch-id/');
  return blobUrl(t.blobId);
}
