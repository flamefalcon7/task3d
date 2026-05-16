// U4 — Collection Forge PTB shape (test-first per plan-003 execution note).
//
// The Spike-B test at frontend/src/sui/spike-b-ptb-shape.test.ts validated the
// borrow-then-consume Result-handle pattern is encodable by the SDK. THIS test
// pins the production builder's exact command sequence + struct-constructor
// usage so we never regress to the PTB struct-arg pitfall (encoding
// LicenseTerms/VariantSpec as raw bytes).
//
// Command-count formula: 1 (new_license_terms) + 1 (publish_collection)
//   + N × 3 (new_variant_spec + mint_variant + transfer::public_share_object)
//   + 1 (share_collection)
// = 3 + 3N

import { describe, it, expect } from 'vitest';
import { buildCollectionPtb, type BuildCollectionPtbInput } from './buildCollectionPtb';

const FAKE_BLOB_OBJECT_ID = '0x' + 'c'.repeat(64);

function makeInput(variantCount: number): BuildCollectionPtbInput {
  return {
    quiltBlobObjectId: FAKE_BLOB_OBJECT_ID,
    collectionName: 'Neon Drift Series',
    collectionSlug: 'neon-drift',
    license: {
      policy: 2,
      derivativeMintFee: 0n,
      derivativeRoyaltyBps: 1000,
      commercialUse: true,
      requireAttribution: false,
    },
    variants: Array.from({ length: variantCount }, (_, i) => ({
      patchId: `patch-${i}`,
      paramsJson: '{}',
      name: `Variant ${i}`,
      tags: ['neon', `v${i}`],
      priceMist: 100_000_000n,
      lineageBlobId: 'lineage-blob-id',
      shapeType: 'tripo',
      isEncrypted: false,
    })),
  };
}

function moveCallCommands(tx: ReturnType<typeof buildCollectionPtb>) {
  return tx
    .getData()
    .commands.filter((c) => c.$kind === 'MoveCall');
}

describe('buildCollectionPtb', () => {
  it('chains_license_then_publish_collection_then_N_mint_variant_then_share_collection_in_correct_order', () => {
    const tx = buildCollectionPtb(makeInput(3));
    const cmds = moveCallCommands(tx);

    // Expected command sequence for N=3:
    //   0: new_license_terms
    //   1: publish_collection
    //   2: new_variant_spec (v0)
    //   3: mint_variant (v0)
    //   4: public_share_object<Model3D> (v0)
    //   5: new_variant_spec (v1)
    //   6: mint_variant (v1)
    //   7: public_share_object<Model3D> (v1)
    //   8: new_variant_spec (v2)
    //   9: mint_variant (v2)
    //  10: public_share_object<Model3D> (v2)
    //  11: share_collection
    const names = cmds.map((c) =>
      c.$kind === 'MoveCall' ? c.MoveCall?.function : '<other>',
    );
    expect(names).toEqual([
      'new_license_terms',
      'publish_collection',
      'new_variant_spec',
      'mint_variant',
      'public_share_object',
      'new_variant_spec',
      'mint_variant',
      'public_share_object',
      'new_variant_spec',
      'mint_variant',
      'public_share_object',
      'share_collection',
    ]);
  });

  it('uses_new_license_terms_constructor_not_raw_bytes', () => {
    const tx = buildCollectionPtb(makeInput(2));
    const cmds = moveCallCommands(tx);
    // The LicenseTerms MUST be constructed via new_license_terms (KTD-2).
    // Anti-regression: if anyone ever swaps to tx.pure.vector('u8', ...), the
    // Sui Move VM will type-check fail at runtime — we catch it here at build.
    const newLicenseTermsCalls = cmds.filter(
      (c) =>
        c.$kind === 'MoveCall' && c.MoveCall?.function === 'new_license_terms',
    );
    expect(newLicenseTermsCalls).toHaveLength(1);

    // publish_collection's license arg must be a Result handle (the output of
    // new_license_terms), NOT a Pure arg.
    const publishCall = cmds.find(
      (c) =>
        c.$kind === 'MoveCall' && c.MoveCall?.function === 'publish_collection',
    );
    expect(publishCall).toBeDefined();
    if (publishCall?.$kind === 'MoveCall') {
      const args = publishCall.MoveCall?.arguments ?? [];
      // Args: [blob:object, name:pure, slug:pure, license:Result, clock:object]
      const licenseArg = args[3];
      expect(licenseArg?.$kind).toBe('Result');
    }
  });

  it('uses_new_variant_spec_constructor_for_each_variant', () => {
    const tx = buildCollectionPtb(makeInput(4));
    const cmds = moveCallCommands(tx);
    const newVariantSpecCalls = cmds.filter(
      (c) =>
        c.$kind === 'MoveCall' && c.MoveCall?.function === 'new_variant_spec',
    );
    expect(newVariantSpecCalls).toHaveLength(4);

    // Each mint_variant's spec arg must be a Result handle from new_variant_spec
    const mintCalls = cmds.filter(
      (c) => c.$kind === 'MoveCall' && c.MoveCall?.function === 'mint_variant',
    );
    expect(mintCalls).toHaveLength(4);
    for (const cmd of mintCalls) {
      if (cmd.$kind === 'MoveCall') {
        const args = cmd.MoveCall?.arguments ?? [];
        // Args: [coll:Result, spec:Result, shape_type:pure, lineage_blob_id:pure,
        //        is_encrypted:pure, clock:object]
        expect(args[0]?.$kind).toBe('Result'); // collection borrow
        expect(args[1]?.$kind).toBe('Result'); // spec from new_variant_spec
      }
    }
  });

  it('command_count_is_2_plus_3N_plus_1', () => {
    // N=3 → 2 + 9 + 1 = 12
    const tx3 = buildCollectionPtb(makeInput(3));
    expect(tx3.getData().commands).toHaveLength(2 + 3 * 3 + 1);

    // N=16 → 2 + 48 + 1 = 51
    const tx16 = buildCollectionPtb(makeInput(16));
    expect(tx16.getData().commands).toHaveLength(2 + 3 * 16 + 1);
  });

  it('variants_array_size_16_works_without_throwing', () => {
    expect(() => buildCollectionPtb(makeInput(16))).not.toThrow();
  });

  it('mint_variant_borrows_same_collection_handle_across_all_variants', () => {
    const tx = buildCollectionPtb(makeInput(3));
    const cmds = moveCallCommands(tx);
    const mintCalls = cmds.filter(
      (c) => c.$kind === 'MoveCall' && c.MoveCall?.function === 'mint_variant',
    );
    // All 3 mint_variants should reference the same Result(1) handle for the
    // Collection (publish_collection is command index 1; new_license_terms is 0).
    for (const cmd of mintCalls) {
      if (cmd.$kind === 'MoveCall') {
        const firstArg = cmd.MoveCall?.arguments?.[0];
        expect(firstArg?.$kind).toBe('Result');
        if (firstArg?.$kind === 'Result') {
          expect(firstArg.Result).toBe(1);
        }
      }
    }
  });

  it('share_collection_consumes_the_same_collection_handle', () => {
    const tx = buildCollectionPtb(makeInput(2));
    const cmds = moveCallCommands(tx);
    const shareColl = cmds.find(
      (c) =>
        c.$kind === 'MoveCall' && c.MoveCall?.function === 'share_collection',
    );
    expect(shareColl).toBeDefined();
    if (shareColl?.$kind === 'MoveCall') {
      const firstArg = shareColl.MoveCall?.arguments?.[0];
      expect(firstArg?.$kind).toBe('Result');
      if (firstArg?.$kind === 'Result') {
        expect(firstArg.Result).toBe(1); // publish_collection's index
      }
    }
  });
});
