// plan-008 U6 — collection PTB builder tests.
//
// Pattern mirrors kioskTxBuilders.test.ts: structural assertions via
// `tx.getData()` (no live objects required) + one RPC-reachability leg gated
// on testnet reachability. The v3 package has no minted Model3D/collection
// objects yet, so the live leg uses fake well-formed IDs that fail at the
// SDK's object-resolution stage ("does not exist") — that still proves the PTB
// encoding is well-formed and reaches the RPC. Runtime abort-code verification
// (EFeeTooLow / EWrongCollectionCap) lives in the Move tests
// (`register_integration_below_fee_aborts`, `set_register_fee_with_mismatched_cap_aborts`).

import { describe, it, expect, beforeAll } from 'vitest';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { TESTNET, TESTNET_RPC_ENDPOINTS } from './networkConfig';
import {
  buildLaunchCollectionPtb,
  buildLaunchCollectionWithTokensPtb,
  buildSetRegisterFeePtb,
  buildMintNftTokenPtb,
  buildRegisterIntegrationPtb,
  type LaunchCollectionArgs,
  type LaunchCollectionWithTokensArgs,
  type SetRegisterFeeArgs,
  type MintNftTokenArgs,
  type RegisterIntegrationArgs,
} from './collectionTxBuilders';

const PKG = TESTNET.model3dPackageId;

const FAKE_MODEL = '0x' + '1'.repeat(64);
const FAKE_CAP = '0x' + '2'.repeat(64);
const FAKE_COLLECTION = '0x' + '3'.repeat(64);
const DRY_RUN_SENDER = TESTNET.deployerAddress;

const LAUNCH_ARGS: LaunchCollectionArgs = {
  modelId: FAKE_MODEL,
  feeMist: 0n,
  quiltBlobId: 'quiltBlobIdABC',
};
const SET_FEE_ARGS: SetRegisterFeeArgs = {
  capId: FAKE_CAP,
  collectionId: FAKE_COLLECTION,
  feeMist: 2_000_000n,
};
const MINT_ARGS: MintNftTokenArgs = {
  capId: FAKE_CAP,
  collectionId: FAKE_COLLECTION,
  name: 'Racer #1',
  patchId: 'patchId01',
};
const BATCH_ARGS: LaunchCollectionWithTokensArgs = {
  modelId: FAKE_MODEL,
  feeMist: 0n,
  quiltBlobId: 'quiltBlobIdABC',
  registerFeeMist: 2_000_000n,
  tokenNames: ['Racer #1', 'Racer #2'],
  tokenPatchIds: ['patch01', 'patch02'],
};
const REGISTER_ARGS: RegisterIntegrationArgs = {
  collectionId: FAKE_COLLECTION,
  feeMist: 2_000_000n,
  appMetadata: new TextEncoder().encode(
    JSON.stringify({ name: 'CoolGame', url: 'https://coolgame.example' }),
  ),
};

function moveCalls(tx: { getData: () => { commands: unknown[] } }) {
  return tx
    .getData()
    .commands.filter(
      (c): c is { $kind: 'MoveCall'; MoveCall?: { module?: string; function?: string; package?: string; arguments?: unknown[] } } =>
        (c as { $kind?: string }).$kind === 'MoveCall',
    );
}

// === launch_collection ===
describe('buildLaunchCollectionPtb', () => {
  it('emits one model3d::launch_collection call preceded by a splitCoins', () => {
    const { tx, metadata } = buildLaunchCollectionPtb(LAUNCH_ARGS);
    const cmds = tx.getData().commands;
    expect(cmds.some((c) => (c as { $kind?: string }).$kind === 'SplitCoins')).toBe(true);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall?.function).toBe('launch_collection');
    expect(calls[0]!.MoveCall?.package).toBe(PKG);
    // v4 arity: model, payment, quilt_blob_id (3). A dropped quiltBlobId or a
    // transposed arg would change this count.
    expect(calls[0]!.MoveCall?.arguments).toHaveLength(3);
    expect(metadata.expectedEvents).toEqual([`${PKG}::model3d::CollectionLaunched`]);
  });

  it('builds with a non-zero derive fee', () => {
    expect(() =>
      buildLaunchCollectionPtb({ modelId: FAKE_MODEL, feeMist: 5_000_000n, quiltBlobId: 'q' }),
    ).not.toThrow();
  });
});

// === launch_collection_with_tokens (D-038, one-signature batch) ===
describe('buildLaunchCollectionWithTokensPtb', () => {
  it('emits one batch call after a splitCoins, declaring CollectionLaunched + NftTokenMinted', () => {
    const { tx, metadata } = buildLaunchCollectionWithTokensPtb(BATCH_ARGS);
    const cmds = tx.getData().commands;
    expect(cmds.some((c) => (c as { $kind?: string }).$kind === 'SplitCoins')).toBe(true);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall?.function).toBe('launch_collection_with_tokens');
    expect(calls[0]!.MoveCall?.package).toBe(PKG);
    // Arity: model, payment, quilt_blob_id, register_fee, token_names,
    // token_patch_ids (6). The two vectors are one arg each regardless of N.
    expect(calls[0]!.MoveCall?.arguments).toHaveLength(6);
    expect(metadata.expectedEvents).toEqual([
      `${PKG}::model3d::CollectionLaunched`,
      `${PKG}::model3d::NftTokenMinted`,
    ]);
  });

  it('builds with a single token and a zero derive fee', () => {
    expect(() =>
      buildLaunchCollectionWithTokensPtb({
        ...BATCH_ARGS,
        feeMist: 0n,
        tokenNames: ['Solo'],
        tokenPatchIds: ['patchSolo'],
      }),
    ).not.toThrow();
  });

  it('throws before signing when names and patch ids differ in length (mirrors EBatchLenMismatch)', () => {
    expect(() =>
      buildLaunchCollectionWithTokensPtb({
        ...BATCH_ARGS,
        tokenNames: ['a', 'b'],
        tokenPatchIds: ['only-one'],
      }),
    ).toThrow(/same length/);
  });
});

// === set_register_fee ===
describe('buildSetRegisterFeePtb', () => {
  it('emits one set_register_fee call with cap + collection + fee, no events', () => {
    const { tx, metadata } = buildSetRegisterFeePtb(SET_FEE_ARGS);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall?.function).toBe('set_register_fee');
    expect(metadata.expectedEvents).toEqual([]);
  });

  it('builds with fee = 0 (free integration)', () => {
    expect(() => buildSetRegisterFeePtb({ ...SET_FEE_ARGS, feeMist: 0n })).not.toThrow();
  });
});

// === mint_nft_token (v4, D-036: plain owned mint, no Kiosk) ===
describe('buildMintNftTokenPtb', () => {
  it('emits one mint_nft_token call declaring only NftTokenMinted (no ItemListed)', () => {
    const { tx, metadata } = buildMintNftTokenPtb(MINT_ARGS);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall?.function).toBe('mint_nft_token');
    // v4 arity: cap, collection, name, patch_id (4). name and patch_id are both
    // pure.string — a transposition or a dropped arg would change this count.
    expect(calls[0]!.MoveCall?.arguments).toHaveLength(4);
    expect(metadata.expectedEvents).toEqual([`${PKG}::model3d::NftTokenMinted`]);
    // D-036: mint no longer touches a Kiosk → no ItemListed event.
    expect(
      metadata.expectedEvents.some((e) => e.includes('kiosk::ItemListed')),
    ).toBe(false);
  });

  it('takes no splitCoins (no price/payment at mint)', () => {
    const { tx } = buildMintNftTokenPtb(MINT_ARGS);
    expect(
      tx.getData().commands.some((c) => (c as { $kind?: string }).$kind === 'SplitCoins'),
    ).toBe(false);
  });
});

// === register_integration ===
describe('buildRegisterIntegrationPtb', () => {
  it('splits the fee from gas and emits register_integration with a clock arg', () => {
    const { tx, metadata } = buildRegisterIntegrationPtb(REGISTER_ARGS);
    const cmds = tx.getData().commands;
    expect(cmds.some((c) => (c as { $kind?: string }).$kind === 'SplitCoins')).toBe(true);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall?.function).toBe('register_integration');
    expect(metadata.expectedEvents).toEqual([`${PKG}::model3d::IntegrationRegistered`]);
  });

  it('builds with an empty app_metadata blob', () => {
    expect(() =>
      buildRegisterIntegrationPtb({ ...REGISTER_ARGS, appMetadata: new Uint8Array() }),
    ).not.toThrow();
  });
});

// === TypeScript type discipline ===
describe('type discipline', () => {
  it('feeMist must be bigint, not string (compile-time)', () => {
    const bad: LaunchCollectionArgs = {
      modelId: FAKE_MODEL,
      quiltBlobId: 'q',
      // @ts-expect-error — feeMist must be bigint
      feeMist: '0',
    };
    expect(bad).toBeDefined();
  });

  it('mint requires patchId (compile-time)', () => {
    // @ts-expect-error — patchId is required
    const bad: MintNftTokenArgs = {
      capId: FAKE_CAP,
      collectionId: FAKE_COLLECTION,
      name: 'x',
    };
    expect(bad).toBeDefined();
  });
});

// === Live RPC reachability (gated) ===
async function pickReachableClient(): Promise<SuiJsonRpcClient | null> {
  for (const url of TESTNET_RPC_ENDPOINTS) {
    try {
      const client = new SuiJsonRpcClient({ url, network: 'testnet' });
      await client.getLatestSuiSystemState();
      return client;
    } catch {
      // try next endpoint
    }
  }
  return null;
}

let liveClient: SuiJsonRpcClient | null = null;
beforeAll(async () => {
  liveClient = await pickReachableClient();
  if (!liveClient) {
    // eslint-disable-next-line no-console
    console.warn('[U6 PROVISIONAL] testnet RPC unreachable; dry-run reachability leg skipped');
  }
});

describe('PTB encoding reaches live RPC (fake IDs → object-resolution error)', () => {
  it('launch_collection PTB is well-formed and reaches RPC build resolution', async (ctx) => {
    if (!liveClient) {
      ctx.skip();
      return;
    }
    const { tx } = buildLaunchCollectionPtb({ modelId: FAKE_MODEL, feeMist: 0n, quiltBlobId: 'q' });
    tx.setSender(DRY_RUN_SENDER);
    let err: Error | null = null;
    try {
      await tx.build({ client: liveClient });
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err?.message ?? '').toMatch(/does not exist/);
  });

  it('launch_collection_with_tokens PTB is well-formed and reaches RPC build resolution', async (ctx) => {
    if (!liveClient) {
      ctx.skip();
      return;
    }
    // Resolves the v6 batch fn signature against the real package; a wrong arg
    // count or type would fail at build resolution rather than object lookup.
    const { tx } = buildLaunchCollectionWithTokensPtb(BATCH_ARGS);
    tx.setSender(DRY_RUN_SENDER);
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
