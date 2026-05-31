// Type contracts shared between browser (frontend) and server (backend).
// D-033 removed procedural generation: a Model3D's GLB now comes from Tripo
// prompt-mode (D-023) or a direct user GLB upload. The Generator/Router seam
// is retained but tripo-only (one HardcodedRouter impl).

import { z } from 'zod';

export interface TripoParams {
  shape: 'tripo';
  prompt: string;
}

// Sole generator source post-D-033 (procedural removed).
export type GeneratorSource = 'tripo';

export interface LineageRecord {
  id: string;
  shape: 'tripo';
  params: TripoParams;
  prompt?: string;
  llmDecision?: unknown;
  generatorSource: GeneratorSource;
  createdAt: string;
}

export interface GenerateResult {
  glbBytes: Uint8Array;
  lineageStub: Partial<LineageRecord>;
}

export interface Generator {
  generate(params: TripoParams): Promise<GenerateResult>;
}

export interface RouteInput {
  prompt?: string;
}

export interface RouteResult {
  generator: Generator;
  lineageStub: Partial<LineageRecord>;
}

export interface Router {
  route(input: RouteInput): Promise<RouteResult>;
}

// API response shapes.
// `glbBytes` is base64-encoded GLB (~33% size overhead vs binary, accepted
// for Phase 2 prototype simplicity over multipart).
// `lineageJson` is the full LineageRecord stringified — frontend turns it into
// bytes for Walrus upload alongside the GLB.
export interface GenerateResponse {
  glbBytes: string;
  lineageJson: string;
  lineageStub: Partial<LineageRecord>;
}

// --- Zod schemas (request validation) -------------------------------------
// D-033: only the Tripo prompt schema survives. The 7 procedural shape
// schemas + paramRanges + GenerateParamsSchema were removed with the
// procedural generators.

export const tripoParamsSchema = z.object({
  shape: z.literal('tripo'),
  prompt: z.string().min(1).max(1000),
});

// Summary view of a published Model3D Sui object, surfaced to the Browse UI.
// u64 fields are kept as strings to avoid bigint-across-JSON pain (D-015).
//
// Phase 3 (plan-003 U1 / D-020) — Model3D no longer carries `blob: Blob`; it
// carries `collection_id` + `patch_id` so N variants of one Collection share
// one Walrus quilt blob. `blobId` is retained on the summary for backwards
// compatibility (resolved via Collection.blob.blob_id at indexer time); Phase
// 2 "degenerate-of-1" mints carry `patchId: ''` and `blobId === Collection.blobId`.
export interface Model3DSummary {
  objectId: string;            // Sui object ID
  blobId: string;              // Walrus blob ID (string form per D-015) — resolved from Collection
  collectionId: string;        // Sui object ID of the parent Collection (U1)
  patchId: string;             // synthetic quilt-patch ID (URL-safe base64); '' for degenerate-of-1
  creator: string;             // Sui address
  shapeType: string;           // 'box' | 'chest' | ... | 'tripo'
  paramsJson: string;
  name: string;
  directAccessPrice: string;   // u64 as string
  tags: string[];
  // plan-013 — per-part semantic labels for a segmented-mesh base GLB (Tripo
  // mesh_segmentation output). One entry per material/node index. Empty array
  // is the legacy single-material sentinel: LaunchCollectionPage routes those
  // bases through the pre-segmentation single-row VariantEditor unchanged.
  // Populated by the indexer from the ModelPublished event's `part_labels`
  // payload (no extra getObject required).
  partLabels: string[];
  createdAtMs: string;         // u64 timestamp as string
  lineageBlobId: string;       // D-015
  glbBlobId: string;           // D-037 — standalone Walrus blob id of the GLB mesh ('' if absent)
  derivativeMintFee: string;   // license.derivative_mint_fee (u64 MIST as string) — derive fee an nft creator pays to fork
  derivativeRoyaltyBps: number;// license.derivative_royalty_bps (u16, ≤3000 per D-004) snapshotted into L2 collections
  // plan-026 D-075 — L1 license policy: 0 RESTRICTED · 1 ALLOW_LIST · 2
  // PERMISSIONLESS. Drives catalog visibility + the fork path: RESTRICTED is
  // excluded from the public catalog entirely (private); ALLOW_LIST routes the
  // 3-step encrypted fork; PERMISSIONLESS is the unchanged atomic path. Defaults
  // to PERMISSIONLESS (2) for pre-v9 objects whose JSON carries no policy.
  policy: number;
  // plan-026 D-075 — derived on-chain from policy (encrypted ⇔ policy ≠
  // PERMISSIONLESS). When true, `glbBlobId` holds AES CIPHERTEXT, not a public
  // GLB — NEVER fetch it as a mesh; render `previewBlobIds` stills instead.
  isEncrypted: boolean;
  // plan-026 U4/D-075 — public Walrus blob ids of the watermarked preview stills
  // captured at publish (ALLOW_LIST only; empty for RESTRICTED + PERMISSIONLESS).
  // The pre-payment evaluation affordance for an encrypted ALLOW_LIST base.
  previewBlobIds: string[];
}

// --- Phase 3 Collection Forge types (plan-003 KTD-5, U3, U5) --------------

// 8 curated textures bundled in backend/assets/textures/ as PNG files. KTD-5
// single-source-of-truth: this constant feeds the backend zod enum
// (collectionBuildRequestSchema), the frontend Forge variant dropdown, and any
// future Move event encoding for indexer searches. Adding a texture requires
// editing only this array AND dropping the PNG into backend/assets/textures/.
export const TEXTURE_LIBRARY = [
  'matte',
  'chrome',
  'carbon-fiber',
  'brushed-metal',
  'gold',
  'camo',
  'gradient',
  'wood-grain',
] as const;

export type TextureId = (typeof TEXTURE_LIBRARY)[number];

// plan-013 — mirrors Move's MAX_PARTS=64. Frontend zod cap on per-variant
// `partColors` length. Bumping requires the Move constant to move in lockstep
// (segmented GLBs exceeding the on-chain ceiling can't be published anyway).
//
// LOCKSTEP CONTRACT: this constant must equal `MAX_PARTS` in
// `contracts/model3d/sources/model3d.move`. See that file's comment block on
// MAX_PARTS for the lockstep policy. No cross-language enforcement is
// feasible at hackathon scope.
export const MAX_PARTS_FE = 64;

// Per-variant material specification — input to the backend material-swap
// endpoint. plan-013: positional per-part array (one entry per material/node
// index in the segmented base GLB). Backend asserts
// `partColors.length === materials.length` at build time and fails closed with
// PartCountMismatchError (422 part_count_mismatch) on drift. Legacy
// single-material bases use a length-1 array (one entry → materials[0]); the
// editor surfaces this as a one-row palette UX.
//
// baseColorRgb is RGBA in 0-1 range (matches glTF PBR convention). textureId
// is per-part optional; if absent for a given part, the swap pipeline keeps
// THAT material's existing baseColorTexture and only sets baseColorFactor
// (TINT mode: factor × baked texture).
//
// plan A2 (upload segmentation) — `materialName` is an OPTIONAL order-independent
// key. When EVERY partColors entry carries one, the backend swap maps each entry
// to the material with that glTF `materials[].name` instead of by array position.
// This decouples the recolor from the (divergent) Babylon-mesh-order vs
// gltf-transform-material-order problem that bites arbitrary uploaded GLBs. When
// absent (legacy bases, Tripo-without-names), the backend falls back to the
// positional `partColors[i] → materials[i]` path. The forge attaches it only for
// bijective bases whose part material names are unique + non-empty (see
// frontend extractMaterialNames). NOT persisted on-chain — transport-only.
export interface VariantMaterialSpec {
  partColors: Array<{
    baseColorRgb: [number, number, number, number];
    textureId?: TextureId;
    materialName?: string;
  }>;
}

// Zod schema for the backend /api/collection/build request body. Hard caps
// per plan-003 KTD-6 + SEC-001/SEC-004: 1-16 variants, per-variant paramsJson
// <= 1024 bytes valid JSON. The base64 cap is sized to the SAME 12 MB binary
// ceiling the /create GLB upload enforces (CreateModelPage MAX_GLB_BYTES) so any
// model that can be published can also be forked — 12 MiB → ceil(n/3)*4 ≈
// 16,777,216 chars; rounded up to 16,800,000 for padding margin.
//
// plan-013 — `baseColorRgb` + `textureId` collapsed into a positional
// `partColors` array (1..MAX_PARTS_FE). The pre-segmentation single-color
// shape is now expressed as a length-1 `partColors` array, not a flat field.
export const collectionBuildRequestSchema = z.object({
  baseGlbBase64: z.string().min(1).max(16_800_000),
  variants: z
    .array(
      z.object({
        partColors: z
          .array(
            z.object({
              baseColorRgb: z.tuple([z.number(), z.number(), z.number(), z.number()]),
              textureId: z.enum(TEXTURE_LIBRARY).optional(),
              // plan A2 — optional name-keyed swap anchor (see VariantMaterialSpec).
              // Generous length cap (material names aren't on-chain; this is just a
              // lookup key) — wide enough for UUID-suffixed exporter names.
              materialName: z.string().min(1).max(256).optional(),
            }),
          )
          .min(1)
          .max(MAX_PARTS_FE),
        paramsJson: z
          .string()
          .max(1024)
          .refine(
            (s) => {
              try {
                const parsed: unknown = JSON.parse(s);
                // plan-013 (review pass S3): tighten to object — plan-013 R10
                // says paramsJson stores the canonical palette/lineage shape
                // (`{ palette, texture }`) for round-trip on collection re-open.
                // The old `JSON.parse` no-throw check accepted `'null'`, `'42'`,
                // `'"foo"'`, `'[]'` — all of which break the U7 round-trip
                // (`JSON.parse(paramsJson).palette` → undefined / TypeError).
                return (
                  typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                );
              } catch {
                return false;
              }
            },
            { message: 'paramsJson must be a JSON object (not null/array/scalar) <= 1024 bytes' },
          ),
      }),
    )
    .min(1)
    .max(16),
  // plan-026 D-075 / U5 — encrypted-base hardening hint. Present ONLY when the
  // forked base is encrypted (ALLOW_LIST): the forker has already paid + minted
  // the soulbound NftCollectionCreatorCap (step 1), and the decrypted plaintext
  // is now transiting this endpoint for the material-swap bake (step 2). The
  // backend treats a request carrying this as sensitive — no body logging, no
  // plaintext persistence — and verifies the submitting JWT's wallet actually
  // OWNS `capId` (a non-owner who scraped the ciphertext can't bake). Omitted
  // for the unencrypted path, which keeps its existing behavior untouched.
  encryptedBase: z
    .object({
      // 0x-prefixed Sui object ids of the in-flight cap + collection.
      capId: z.string().regex(/^0x[0-9a-fA-F]+$/),
      collectionId: z.string().regex(/^0x[0-9a-fA-F]+$/),
    })
    .optional(),
});

export type CollectionBuildRequest = z.infer<typeof collectionBuildRequestSchema>;

export interface CollectionBuildResponse {
  variants: Array<{ glbBase64: string }>;
}

// Frontend-facing Collection summary — populated by the indexer from the
// CollectionPublished Move event (U1). One Collection holds the shared quilt
// Blob; N Model3D objects (variants) reference it via Model3DSummary.collectionId.
export interface CollectionMeta {
  collectionId: string;        // Sui object ID of the Collection
  blobId: string;              // Walrus blob ID of the shared quilt
  creator: string;             // Sui address
  name: string;
  slug: string;                // URL-safe identifier; '_legacy' for Phase 2 degenerate-of-1
  variantCount: number;        // 1..16
  createdAtMs: string;         // u64 timestamp as string
}
