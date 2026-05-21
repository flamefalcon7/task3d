// plan-010 U1/U2 (D-041) — Kiosk marketplace PTB builder tests.
//
// Pattern mirrors collectionTxBuilders.test.ts: structural assertions via
// `tx.getData()` (no live objects required) + one RPC-reachability leg gated on
// testnet reachability (fake IDs → object-resolution "does not exist", which
// still proves the PTB encoding is well-formed and the framework/our-pkg
// targets resolve). Runtime royalty/abort behavior is the framework's job
// (confirm_request cardinality), exercised live in the four-actor smoke (U4).

import { describe, it, expect, beforeAll } from 'vitest';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { TESTNET, TESTNET_RPC_ENDPOINTS } from './networkConfig';
import {
  buildListNftTokenForSalePtb,
  buildPurchaseNftTokenPtb,
  royaltyOwedMist,
  type ListNftTokenForSaleArgs,
  type PurchaseNftTokenArgs,
} from './kioskTxBuilders';

const FAKE_TOKEN = '0x' + '1'.repeat(64);
const FAKE_KIOSK = '0x' + '2'.repeat(64);
const FAKE_KIOSK_CAP = '0x' + '3'.repeat(64);
const SELLER = TESTNET.deployerAddress;
const BUYER = '0x' + '4'.repeat(64);

function cmds(tx: { getData: () => { commands: unknown[] } }) {
  return tx.getData().commands as { $kind: string }[];
}
function moveCalls(tx: { getData: () => { commands: unknown[] } }) {
  return cmds(tx).filter(
    (c): c is { $kind: 'MoveCall'; MoveCall: { module?: string; function?: string; arguments?: unknown[]; typeArguments?: string[] } } =>
      c.$kind === 'MoveCall',
  );
}
function kindCount(tx: { getData: () => { commands: unknown[] } }, kind: string) {
  return cmds(tx).filter((c) => c.$kind === kind).length;
}

const LIST_NEW: ListNftTokenForSaleArgs = {
  tokenId: FAKE_TOKEN,
  priceMist: 1_000_000_000n,
  ownerAddress: SELLER,
};
const LIST_EXISTING: ListNftTokenForSaleArgs = {
  ...LIST_NEW,
  kioskId: FAKE_KIOSK,
  kioskCapId: FAKE_KIOSK_CAP,
};
const PURCHASE: PurchaseNftTokenArgs = {
  kioskId: FAKE_KIOSK,
  tokenId: FAKE_TOKEN,
  priceMist: 1_000_000_000n,
  buyerAddress: BUYER,
};

// === royaltyOwedMist (mirrors on-chain royalty_rule::fee_amount) ===
describe('royaltyOwedMist', () => {
  it('applies the 5% rate above the floor', () => {
    // 1 SUI * 500 / 10_000 = 0.05 SUI = 50_000_000 MIST (> 1_000_000 floor)
    expect(royaltyOwedMist(1_000_000_000n)).toBe(50_000_000n);
  });

  it('clamps to the 0.001 SUI floor when the rate-based amount is smaller', () => {
    // 0.01 SUI * 500 / 10_000 = 5_000 MIST → below floor → 1_000_000
    expect(royaltyOwedMist(10_000_000n)).toBe(1_000_000n);
  });

  it('returns the floor for a zero price', () => {
    expect(royaltyOwedMist(0n)).toBe(1_000_000n);
  });
});

// === list-for-sale ===
describe('buildListNftTokenForSalePtb', () => {
  it('existing kiosk: one place_and_list on NftToken, no kiosk creation/transfer', () => {
    const { tx } = buildListNftTokenForSalePtb(LIST_EXISTING);
    const calls = moveCalls(tx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.MoveCall.module).toBe('kiosk');
    expect(calls[0]!.MoveCall.function).toBe('place_and_list');
    expect(calls[0]!.MoveCall.typeArguments).toEqual([`${TESTNET.model3dPackageId}::model3d::NftToken`]);
    // self, cap, item, price
    expect(calls[0]!.MoveCall.arguments).toHaveLength(4);
    expect(kindCount(tx, 'TransferObjects')).toBe(0);
  });

  it('fresh kiosk: new → place_and_list → public_share_object, then transfer the cap to the seller', () => {
    const { tx } = buildListNftTokenForSalePtb(LIST_NEW);
    const calls = moveCalls(tx);
    expect(calls.map((c) => c.MoveCall.function)).toEqual([
      'new',
      'place_and_list',
      'public_share_object',
    ]);
    // the KioskOwnerCap is transferred back to the seller
    expect(kindCount(tx, 'TransferObjects')).toBe(1);
  });

  it('throws when only one of kioskId / kioskCapId is supplied', () => {
    expect(() =>
      buildListNftTokenForSalePtb({ ...LIST_NEW, kioskId: FAKE_KIOSK }),
    ).toThrow(/together/);
    expect(() =>
      buildListNftTokenForSalePtb({ ...LIST_NEW, kioskCapId: FAKE_KIOSK_CAP }),
    ).toThrow(/together/);
  });
});

// === purchase (royalty-only hot-potato) ===
describe('buildPurchaseNftTokenPtb', () => {
  it('chains purchase → royalty_rule::pay → confirm_request in order', () => {
    const { tx } = buildPurchaseNftTokenPtb(PURCHASE);
    const calls = moveCalls(tx);
    expect(calls.map((c) => c.MoveCall.function)).toEqual([
      'purchase',
      'pay',
      'confirm_request',
    ]);
    expect(calls[0]!.MoveCall.module).toBe('kiosk');
    expect(calls[1]!.MoveCall.module).toBe('royalty_rule');
    expect(calls[2]!.MoveCall.module).toBe('transfer_policy');
    // every call is on the NftToken type
    for (const c of calls) {
      expect(c.MoveCall.typeArguments).toEqual([`${TESTNET.model3dPackageId}::model3d::NftToken`]);
    }
  });

  it('splits two coins from gas (price + royalty) and transfers the freed item to the buyer', () => {
    const { tx } = buildPurchaseNftTokenPtb(PURCHASE);
    expect(kindCount(tx, 'SplitCoins')).toBe(2);
    expect(kindCount(tx, 'TransferObjects')).toBe(1);
  });

  it('pays royalty against our pinned kiosk-apps package, not the SDK default', () => {
    const { tx } = buildPurchaseNftTokenPtb(PURCHASE);
    const pay = moveCalls(tx).find((c) => c.MoveCall.function === 'pay');
    expect((pay as { MoveCall: { package?: string } }).MoveCall.package).toBe(
      TESTNET.kioskAppsPackageId,
    );
  });
});

// === TypeScript type discipline ===
describe('type discipline', () => {
  it('priceMist must be bigint, not string (compile-time)', () => {
    const bad: PurchaseNftTokenArgs = {
      kioskId: FAKE_KIOSK,
      tokenId: FAKE_TOKEN,
      buyerAddress: BUYER,
      // @ts-expect-error — priceMist must be bigint
      priceMist: '1',
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
    console.warn('[U1/U2 PROVISIONAL] testnet RPC unreachable; dry-run reachability leg skipped');
  }
});

describe('PTB encoding reaches live RPC (fake IDs → object-resolution error)', () => {
  it('purchase PTB resolves framework + our royalty_rule targets, fails on the fake kiosk object', async (ctx) => {
    if (!liveClient) {
      ctx.skip();
      return;
    }
    const { tx } = buildPurchaseNftTokenPtb(PURCHASE);
    tx.setSender(SELLER);
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
