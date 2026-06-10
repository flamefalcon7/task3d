// plan 2026-06-10-001 U1 (KTD-5) — shared `jsonToSummary` tests.
//
// Fixtures derive from the raw Move-object JSON shape the frontend parses
// (Sui GraphQL `asMoveObject.contents.json` for a `model3d::Model3D`):
// snake_case fields, u64s as strings, `license` sub-struct carrying
// access_fee / derivative_mint_fee / derivative_royalty_bps / policy.
// Expected outputs are byte-identical to the pre-lift
// `frontend/src/buy/hooks.ts:jsonToSummary` mapping (no behavior change).

import { describe, it, expect } from 'vitest';
import { jsonToSummary } from './jsonToSummary.js';

const OBJECT_ID = '0x' + '7'.repeat(64);
const CREATOR = '0x' + 'c'.repeat(64);
const COLLECTION_ID = '0x' + 'd'.repeat(64);

// v10 encrypted ALLOW_LIST base (plan-026/027): policy 1, is_encrypted true,
// glb_blob_id holds AES ciphertext, watermarked preview stills present.
const ENCRYPTED_JSON: Record<string, unknown> = {
  collection_id: COLLECTION_ID,
  patch_id: 'patch-01',
  creator: CREATOR,
  shape_type: 'tripo',
  params_json: '{"shape":"tripo","prompt":"a low-poly fox"}',
  name: 'Fox',
  direct_access_price: '5000000',
  tags: ['animal', 'fox'],
  part_labels: ['body', 'tail'],
  created_at_ms: '1765432100000',
  lineage_blob_id: 'lineageBlobAAA',
  glb_blob_id: 'cipherBlobBBB',
  license: {
    derivative_mint_fee: '7000000',
    access_fee: '2000000',
    derivative_royalty_bps: 500,
    policy: 1,
  },
  is_encrypted: true,
  preview_blob_ids: ['previewBlob1', 'previewBlob2'],
};

// Pre-v9 public object: legacy `blob.blob_id`, NO license fields, NO policy,
// NO is_encrypted, NO preview_blob_ids — exercises every default branch.
const LEGACY_PUBLIC_JSON: Record<string, unknown> = {
  blob: { blob_id: 'legacyBlobZZZ' },
  creator: CREATOR,
  shape_type: 'box',
  params_json: '{"shape":"box"}',
  name: 'Crate',
  tags: [],
};

describe('jsonToSummary (shared)', () => {
  it('maps an encrypted ALLOW_LIST Move JSON to the full Model3DSummary', () => {
    expect(jsonToSummary(OBJECT_ID, ENCRYPTED_JSON)).toEqual({
      objectId: OBJECT_ID,
      blobId: '',
      collectionId: COLLECTION_ID,
      patchId: 'patch-01',
      creator: CREATOR,
      shapeType: 'tripo',
      paramsJson: '{"shape":"tripo","prompt":"a low-poly fox"}',
      name: 'Fox',
      directAccessPrice: '5000000',
      tags: ['animal', 'fox'],
      partLabels: ['body', 'tail'],
      createdAtMs: '1765432100000',
      lineageBlobId: 'lineageBlobAAA',
      glbBlobId: 'cipherBlobBBB',
      derivativeMintFee: '7000000',
      accessFee: '2000000',
      derivativeRoyaltyBps: 500,
      policy: 1,
      isEncrypted: true,
      previewBlobIds: ['previewBlob1', 'previewBlob2'],
    });
  });

  it('maps a legacy public object via every default branch', () => {
    expect(jsonToSummary(OBJECT_ID, LEGACY_PUBLIC_JSON)).toEqual({
      objectId: OBJECT_ID,
      // Legacy `blob.blob_id` fallback path.
      blobId: 'legacyBlobZZZ',
      collectionId: '',
      patchId: '',
      creator: CREATOR,
      shapeType: 'box',
      paramsJson: '{"shape":"box"}',
      name: 'Crate',
      directAccessPrice: '0',
      tags: [],
      partLabels: [],
      createdAtMs: '0',
      lineageBlobId: '',
      glbBlobId: '',
      // No license sub-struct → fee defaults.
      derivativeMintFee: '0',
      accessFee: '0',
      derivativeRoyaltyBps: 0,
      // Pre-v9 default: PERMISSIONLESS (2), public.
      policy: 2,
      isEncrypted: false,
      previewBlobIds: [],
    });
  });

  it('prefers top-level blob_id when the legacy blob struct is absent', () => {
    const summary = jsonToSummary(OBJECT_ID, {
      ...LEGACY_PUBLIC_JSON,
      blob: undefined,
      blob_id: 'flatBlobYYY',
    });
    expect(summary.blobId).toBe('flatBlobYYY');
  });

  it('keeps u64 license fees as STRINGS (D-015 bigint-across-JSON discipline)', () => {
    const summary = jsonToSummary(OBJECT_ID, ENCRYPTED_JSON);
    expect(typeof summary.accessFee).toBe('string');
    expect(typeof summary.derivativeMintFee).toBe('string');
    expect(typeof summary.derivativeRoyaltyBps).toBe('number');
  });
});
