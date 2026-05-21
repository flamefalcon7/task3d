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
  createdAtMs: string;         // u64 timestamp as string
  lineageBlobId: string;       // D-015
  glbBlobId: string;           // D-037 — standalone Walrus blob id of the GLB mesh ('' if absent)
  derivativeMintFee: string;   // license.derivative_mint_fee (u64 MIST as string) — derive fee an nft creator pays to fork
  derivativeRoyaltyBps: number;// license.derivative_royalty_bps (u16, ≤3000 per D-004) snapshotted into L2 collections
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

// Per-variant material specification — input to the backend material-swap
// endpoint. baseColorRgb is RGBA in 0-1 range (matches glTF PBR convention).
// textureId is optional; if absent, the variant only changes the base color
// factor and keeps the base GLB's existing baseColorTexture (typically null
// for Tripo-generated cars).
export interface VariantMaterialSpec {
  baseColorRgb: [number, number, number, number];
  textureId?: TextureId;
}

// Zod schema for the backend /api/collection/build request body. Hard caps
// per plan-003 KTD-6 + SEC-001/SEC-004: ~8MB GLB binary => ~10.7MB base64,
// 1-16 variants, per-variant paramsJson <= 1024 bytes valid JSON.
export const collectionBuildRequestSchema = z.object({
  baseGlbBase64: z.string().min(1).max(11_000_000),
  variants: z
    .array(
      z.object({
        baseColorRgb: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        textureId: z.enum(TEXTURE_LIBRARY).optional(),
        paramsJson: z
          .string()
          .max(1024)
          .refine(
            (s) => {
              try {
                JSON.parse(s);
                return true;
              } catch {
                return false;
              }
            },
            { message: 'paramsJson must be valid JSON <= 1024 bytes' },
          ),
      }),
    )
    .min(1)
    .max(16),
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
