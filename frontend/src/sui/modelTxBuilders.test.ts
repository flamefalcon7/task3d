import { describe, it, expect, beforeAll } from 'vitest';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { TESTNET, TESTNET_RPC_ENDPOINTS } from './networkConfig';
import {
  buildPayForApiCallPtb,
  buildPublishPtb,
  TRIPO_FEE_MIST,
  TRIPO_FEE_TREASURY,
  type PublishArgs,
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
    isEncrypted: false,
    license: {
      policy: 2,
      derivativeMintFee: 0n,
      derivativeRoyaltyBps: 500,
      commercialUse: true,
      requireAttribution: false,
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
      isEncrypted: false,
      license: {
        policy: 0,
        // @ts-expect-error — derivativeMintFee must be bigint
        derivativeMintFee: 0,
        derivativeRoyaltyBps: 0,
        commercialUse: false,
        requireAttribution: false,
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
      isEncrypted: false,
      license: { policy: 2, derivativeMintFee: 0n, derivativeRoyaltyBps: 0, commercialUse: false, requireAttribution: false },
    });
    tx.setSender(TESTNET.deployerAddress);
    let err: Error | null = null;
    try {
      await tx.build({ client: liveClient });
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err?.message ?? '').toMatch(/does not exist/);
  });
});
