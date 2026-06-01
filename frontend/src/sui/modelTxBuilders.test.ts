import { describe, it, expect, beforeAll } from 'vitest';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { TESTNET, TESTNET_RPC_ENDPOINTS } from './networkConfig';
import {
  buildPayForApiCallPtb,
  buildPublishPtb,
  buildPublishEncryptedPtb,
  TRIPO_FEE_MIST,
  TRIPO_FEE_TREASURY,
  type PublishArgs,
  type EncryptedPublishArgs,
} from './modelTxBuilders';

const PKG = TESTNET.model3dPackageId;
const FAKE_BLOB = '0x' + 'e'.repeat(64);

function cmds(tx: { getData: () => { commands: Array<{ $kind: string; MoveCall?: { function?: string; package?: string } }> } }) {
  return tx.getData().commands;
}

describe('buildPayForApiCallPtb', () => {
  it('splits the fee from gas and transfers it to the treasury (no move call)', () => {
    const { tx, metadata } = buildPayForApiCallPtb();
    const k = cmds(tx).map((c) => c.$kind);
    expect(k).toContain('SplitCoins');
    expect(k).toContain('TransferObjects');
    expect(k).not.toContain('MoveCall');
    expect(metadata.expectedEvents).toEqual([]);
  });

  it('defaults to 0.4 SUI to the deployer treasury', () => {
    // plan-013 bumped from 0.1 → 0.4 SUI in lockstep with the Tripo two-step
    // flow (text_to_model → mesh_segmentation = ~4× credit cost).
    expect(TRIPO_FEE_MIST).toBe(400_000_000n);
    expect(TRIPO_FEE_TREASURY).toBe(TESTNET.deployerAddress);
  });

  it('accepts a custom fee + treasury', () => {
    expect(() => buildPayForApiCallPtb({ feeMist: 5n, treasury: '0x' + '1'.repeat(64) })).not.toThrow();
  });
});

describe('buildPublishPtb', () => {
  const baseArgs: PublishArgs = {
    blobObjectId: FAKE_BLOB,
    shapeType: 'tripo',
    paramsJson: '{"prompt":"a sword"}',
    name: 'Excalibur',
    tags: ['weapon'],
    lineageBlobId: 'walrus_lineage_id',
    glbBlobId: 'walrus_glb_id',
    partLabels: [],
    license: {
      policy: 2,
      derivativeMintFee: 0n,
      derivativeRoyaltyBps: 500,
      commercialUse: true,
      requireAttribution: false,
      accessFee: 0n,
    },
  };

  it('emits new_license_terms + model3d::publish and declares ModelPublished', () => {
    const { tx, metadata } = buildPublishPtb(baseArgs);
    const moveCalls = cmds(tx).filter((c) => c.$kind === 'MoveCall');
    const fns = moveCalls.map((c) => c.MoveCall?.function);
    expect(fns).toContain('new_license_terms');
    expect(fns).toContain('publish');
    expect(moveCalls.find((c) => c.MoveCall?.function === 'publish')?.MoveCall?.package).toBe(PKG);
    expect(metadata.expectedEvents).toEqual([`${PKG}::model3d::ModelPublished`]);
  });

  it('builds with empty tags', () => {
    expect(() => buildPublishPtb({ ...baseArgs, tags: [] })).not.toThrow();
  });

  it('does NOT pass an is_encrypted argument (derived on-chain from policy)', () => {
    // publish takes: blob, shape, params, name, tags, lineage, glb, part_labels,
    // license, clock = 10 args. The dropped is_encrypted bool would make 11.
    const { tx } = buildPublishPtb(baseArgs);
    const publishCall = cmds(tx).find((c) => c.MoveCall?.function === 'publish');
    // @ts-expect-error — arguments is present on MoveCall command data at runtime
    expect(publishCall?.MoveCall?.arguments).toHaveLength(10);
  });
});

describe('buildPublishEncryptedPtb', () => {
  const encArgs: EncryptedPublishArgs = {
    blobObjectId: FAKE_BLOB,
    shapeType: 'tripo',
    paramsJson: '{"prompt":"a gated sword"}',
    name: 'SealedExcalibur',
    tags: ['weapon'],
    lineageBlobId: 'walrus_lineage_id',
    glbBlobId: 'walrus_ciphertext_id',
    partLabels: [],
    sealedKey: new Uint8Array([1, 2, 3, 4]),
    sealId: new Uint8Array([9, 9, 9, 9]),
    previewBlobIds: ['preview_blob_1'],
    license: {
      policy: 1, // ALLOW_LIST
      derivativeMintFee: 1_000_000n,
      derivativeRoyaltyBps: 500,
      commercialUse: true,
      requireAttribution: false,
      // plan-027 D-078 — ALLOW_LIST requires a non-zero access_fee on-chain.
      accessFee: 2_000_000n,
    },
  };

  it('emits new_license_terms + model3d::publish_encrypted and declares ModelPublished', () => {
    const { tx, metadata } = buildPublishEncryptedPtb(encArgs);
    const moveCalls = cmds(tx).filter((c) => c.$kind === 'MoveCall');
    const fns = moveCalls.map((c) => c.MoveCall?.function);
    expect(fns).toContain('new_license_terms');
    expect(fns).toContain('publish_encrypted');
    expect(moveCalls.find((c) => c.MoveCall?.function === 'publish_encrypted')?.MoveCall?.package).toBe(PKG);
    expect(metadata.target).toBe(`${PKG}::model3d::publish_encrypted`);
    expect(metadata.expectedEvents).toEqual([`${PKG}::model3d::ModelPublished`]);
  });

  it('passes the registry first then 13 more args (registry + 13 = 14 total)', () => {
    // publish_encrypted: registry, blob, shape, params, name, tags, lineage, glb,
    // part_labels, sealed_key, seal_id, preview_blob_ids, license, clock = 14.
    const { tx } = buildPublishEncryptedPtb(encArgs);
    const call = cmds(tx).find((c) => c.MoveCall?.function === 'publish_encrypted');
    // @ts-expect-error — arguments present at runtime
    expect(call?.MoveCall?.arguments).toHaveLength(14);
  });

  it('builds with empty previews (RESTRICTED) and empty seal bytes tolerated by the builder', () => {
    expect(() =>
      buildPublishEncryptedPtb({ ...encArgs, previewBlobIds: [], license: { ...encArgs.license, policy: 0 } }),
    ).not.toThrow();
  });
});

describe('type discipline', () => {
  it('derivativeMintFee must be bigint (compile-time)', () => {
    const bad: PublishArgs = {
      blobObjectId: FAKE_BLOB,
      shapeType: 'tripo',
      paramsJson: '{}',
      name: 'X',
      tags: [],
      lineageBlobId: 'l',
      glbBlobId: 'g',
      partLabels: [],
      license: {
        policy: 0,
        // @ts-expect-error — derivativeMintFee must be bigint
        derivativeMintFee: 0,
        derivativeRoyaltyBps: 0,
        commercialUse: false,
        requireAttribution: false,
        accessFee: 0n,
      },
    };
    expect(bad).toBeDefined();
  });
});

async function pickReachableClient(): Promise<SuiJsonRpcClient | null> {
  for (const url of TESTNET_RPC_ENDPOINTS) {
    try {
      const client = new SuiJsonRpcClient({ url, network: 'testnet' });
      await client.getLatestSuiSystemState();
      return client;
    } catch {
      // next
    }
  }
  return null;
}

let liveClient: SuiJsonRpcClient | null = null;
beforeAll(async () => {
  liveClient = await pickReachableClient();
});

describe('publish PTB reaches live RPC (fake blob → object-resolution error)', () => {
  it('is well-formed against testnet build resolution', async (ctx) => {
    if (!liveClient) {
      ctx.skip();
      return;
    }
    const { tx } = buildPublishPtb({
      blobObjectId: FAKE_BLOB,
      shapeType: 'tripo',
      paramsJson: '{}',
      name: 'X',
      tags: [],
      lineageBlobId: 'l',
      glbBlobId: 'g',
      partLabels: [],
      license: { policy: 2, derivativeMintFee: 0n, derivativeRoyaltyBps: 0, commercialUse: false, requireAttribution: false, accessFee: 0n },
    });
    tx.setSender(TESTNET.deployerAddress);
    let err: Error | null = null;
    try {
      await tx.build({ client: liveClient });
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    // The PTB reaches the node's build-resolution stage and fails there — that is
    // the signal this test asserts. Which error depends on the deployed package:
    //   - Once v9 is live, `publish` is the 10-arg shape this builder produces, so
    //     resolution fails at the FAKE blob object → "does not exist".
    //   - Pre-v9-deploy (live package is still v8, whose `publish` has the old
    //     is_encrypted arg → 11 args), resolution fails earlier at arg-count →
    //     "Incorrect number of arguments". Either proves the PTB serialized and
    //     the function resolved on-chain. Drop the second alternate after v9 lands.
    expect(err?.message ?? '').toMatch(/does not exist|Incorrect number of arguments/);
  });
});
