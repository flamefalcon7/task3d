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
  buildSetRegisterFeePtb,
  buildMintNftTokenPtb,
  buildRegisterIntegrationPtb,
  KIOSK_FRAMEWORK_PACKAGE,
  type LaunchCollectionArgs,
  type SetRegisterFeeArgs,
  type MintNftTokenArgs,
  type RegisterIntegrationArgs,
} from './collectionTxBuilders';

const PKG = TESTNET.model3dPackageId;

const FAKE_MODEL = '0x' + '1'.repeat(64);
const FAKE_CAP = '0x' + '2'.repeat(64);
const FAKE_COLLECTION = '0x' + '3'.repeat(64);
const FAKE_KIOSK = '0x' + '4'.repeat(64);
const FAKE_PERSONAL_CAP = '0x' + '5'.repeat(64);
const DRY_RUN_SENDER = TESTNET.deployerAddress;

const LAUNCH_ARGS: LaunchCollectionArgs = { modelId: FAKE_MODEL, feeMist: 0n };
const SET_FEE_ARGS: SetRegisterFeeArgs = {
  capId: FAKE_CAP,
  collectionId: FAKE_COLLECTION,
  feeMist: 2_000_000n,
};
const MINT_ARGS: MintNftTokenArgs = {
  capId: FAKE_CAP,
  collectionId: FAKE_COLLECTION,
  kioskId: FAKE_KIOSK,
  personalKioskCapId: FAKE_PERSONAL_CAP,
  name: 'Racer #1',
  priceMist: 1_000_000_000n,
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
      (c): c is { $kind: 'MoveCall'; MoveCall?: { module?: string; function?: string; package?: string } } =>
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
    expect(metadata.expectedEvents).toEqual([`${PKG}::model3d::CollectionLaunched`]);
  });

  it('builds with a non-zero derive fee', () => {
    expect(() => buildLaunchCollectionPtb({ modelId: FAKE_MODEL, feeMist: 5_000_000n })).not.toThrow();
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

// === mint_nft_token ===
describe('buildMintNftTokenPtb', () => {
  it('emits one mint_nft_token call and declares NftTokenMinted + ItemListed<NftToken>', () => {
    const { tx, metadata } = buildMintNftTokenPtb(MINT_ARGS);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall?.function).toBe('mint_nft_token');
    expect(metadata.expectedEvents).toContain(`${PKG}::model3d::NftTokenMinted`);
    expect(
      metadata.expectedEvents.some(
        (e) => e === `${KIOSK_FRAMEWORK_PACKAGE}::kiosk::ItemListed<${PKG}::model3d::NftToken>`,
      ),
    ).toBe(true);
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
      // @ts-expect-error — feeMist must be bigint
      feeMist: '0',
    };
    expect(bad).toBeDefined();
  });

  it('mint requires the kiosk + cap fields (compile-time)', () => {
    // @ts-expect-error — kioskId is required
    const bad: MintNftTokenArgs = {
      capId: FAKE_CAP,
      collectionId: FAKE_COLLECTION,
      personalKioskCapId: FAKE_PERSONAL_CAP,
      name: 'x',
      priceMist: 1n,
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
    const { tx } = buildLaunchCollectionPtb({ modelId: FAKE_MODEL, feeMist: 0n });
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
