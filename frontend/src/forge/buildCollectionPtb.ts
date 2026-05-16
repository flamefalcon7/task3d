// U4 — PTB builder for Collection Forge mint (plan-003 KTD-1 + KTD-2).
//
// Chain shape per Spike-B (frontend/src/sui/spike-b-ptb-shape.test.ts) and
// matched against U1's deployed Move contract
// (contracts/model3d/sources/model3d.move):
//
//   1. new_license_terms(...) → LicenseTerms (Result)
//   2. publish_collection(blob, name, slug, license, clock) → Collection (Result, by value)
//   3. For each variant i ∈ [0, N):
//        new_variant_spec(patch_id, params_json, name, tags, price) → VariantSpec (Result)
//        mint_variant(&mut Collection, spec, shape_type, lineage_blob_id, is_encrypted, clock)
//          → Model3D (Result)
//        0x2::transfer::public_share_object<Model3D>(Model3D)
//   4. share_collection(Collection) — consumes the Collection by value
//
// KTD-2 (struct-constructor pattern): we NEVER encode LicenseTerms or
// VariantSpec as pre-serialized BCS bytes; the Sui Move VM type-checks each
// arg against the entry function's parameter type and rejects raw-byte struct
// args. Both structs are built on-chain via their constructor entries and the
// returned Result handle is passed downstream.

import { Transaction } from '@mysten/sui/transactions';

export const MODEL3D_PACKAGE_ID =
  (import.meta.env.VITE_MODEL3D_PACKAGE_ID as string) || '0x0';

const CLOCK_OBJECT_ID = '0x6';

export interface CollectionLicenseInput {
  policy: number;              // u8: 0 RESTRICTED | 1 ALLOW_LIST | 2 PERMISSIONLESS
  derivativeMintFee: bigint;   // u64
  derivativeRoyaltyBps: number; // u16, ≤ 3000 per D-004
  commercialUse: boolean;
  requireAttribution: boolean;
}

export interface CollectionVariantInput {
  patchId: string;       // synthetic quilt-patch id from useWalrusUpload.patchIds[i]
  paramsJson: string;    // ≤ 1024 bytes per Move MAX_VARIANT_PARAMS_JSON_LEN
  name: string;
  tags: string[];
  priceMist: bigint;     // u64 direct_access_price
  lineageBlobId: string; // shared across all variants for v1 (one Walrus quilt blob)
  shapeType: string;     // e.g. 'tripo' for car variants
  isEncrypted: boolean;  // Phase 3 v1 always false (Seal lands in v1.1)
}

export interface BuildCollectionPtbInput {
  // The Sui Blob object id of the quilt holding all N variant GLBs.
  // Comes from useWalrusUpload's UploadResult.blobObjects[0].blobObjectId.
  // (All N WalrusFiles in one writeFilesFlow share a single Sui Blob.)
  quiltBlobObjectId: string;
  collectionName: string;
  collectionSlug: string;
  license: CollectionLicenseInput;
  variants: CollectionVariantInput[];
}

export function buildCollectionPtb(input: BuildCollectionPtbInput): Transaction {
  const tx = new Transaction();

  // 1. LicenseTerms constructor — KTD-2 pattern from publishPtb.ts.
  const license = tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::new_license_terms`,
    arguments: [
      tx.pure.u8(input.license.policy),
      tx.pure.u64(input.license.derivativeMintFee),
      tx.pure.u16(input.license.derivativeRoyaltyBps),
      tx.pure.bool(input.license.commercialUse),
      tx.pure.bool(input.license.requireAttribution),
    ],
  });

  // 2. publish_collection — returns Collection by value. Signature from
  // model3d.move lines 273-300: (blob, name, slug, license, clock, ctx).
  const collection = tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::publish_collection`,
    arguments: [
      tx.object(input.quiltBlobObjectId),
      tx.pure.string(input.collectionName),
      tx.pure.string(input.collectionSlug),
      license,
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  // 3. Per-variant: new_variant_spec → mint_variant(&mut Collection, ...) →
  //    share Model3D. mint_variant signature from model3d.move lines 308-354:
  //    (coll: &mut Collection, spec: VariantSpec, shape_type: String,
  //     lineage_blob_id: String, is_encrypted: bool, clock: &Clock, ctx).
  //    The SDK passes the same Result handle for `collection` to each call;
  //    the runtime treats it as &mut and the value is back to the same Result
  //    slot after each call (Spike-B verified this is legal).
  for (const v of input.variants) {
    const spec = tx.moveCall({
      target: `${MODEL3D_PACKAGE_ID}::model3d::new_variant_spec`,
      arguments: [
        tx.pure.string(v.patchId),
        tx.pure.string(v.paramsJson),
        tx.pure.string(v.name),
        tx.pure.vector('string', v.tags),
        tx.pure.u64(v.priceMist),
      ],
    });
    const model = tx.moveCall({
      target: `${MODEL3D_PACKAGE_ID}::model3d::mint_variant`,
      arguments: [
        collection,
        spec,
        tx.pure.string(v.shapeType),
        tx.pure.string(v.lineageBlobId),
        tx.pure.bool(v.isEncrypted),
        tx.object(CLOCK_OBJECT_ID),
      ],
    });
    // Share the returned Model3D so any wallet can pass &Model3D to
    // purchase_model_access (the marketplace + buy flow assumes shared).
    tx.moveCall({
      target: `0x2::transfer::public_share_object`,
      typeArguments: [`${MODEL3D_PACKAGE_ID}::model3d::Model3D`],
      arguments: [model],
    });
  }

  // 4. share_collection consumes Collection by value (Spike-B PASS pattern).
  tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::share_collection`,
    arguments: [collection],
  });

  return tx;
}

// DEFAULT_LICENSE matches publishPtb.ts so both Phase 2 (single-asset) and
// Phase 3 (Collection) mints use the same default policy unless the UI
// overrides it.
export const DEFAULT_COLLECTION_LICENSE: CollectionLicenseInput = {
  policy: 2,
  derivativeMintFee: 0n,
  derivativeRoyaltyBps: 1000,
  commercialUse: true,
  requireAttribution: false,
};
