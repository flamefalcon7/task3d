// plan-010 U1/U2 (D-041) — typed PTB builders for the simple Kiosk marketplace.
//
// Why hand-rolled raw `0x2::kiosk` moveCalls instead of `@mysten/kiosk`'s
// `KioskTransaction` (which the plan originally proposed):
//   1. `KioskClient`/`KioskTransaction` are built around a JSON-RPC client; the
//      app is on dapp-kit + gRPC (`SuiGrpcClient`, per CLAUDE.md). Wiring a
//      second JSON-RPC client just to build a PTB is friction.
//   2. The SDK's `purchaseAndResolve` helper does not fit our policy: it places
//      the bought item into the BUYER's kiosk (we want a plain owned token so
//      /track's owned-token discovery (U11) sees it), and it resolves against
//      the SDK's DEFAULT royalty-rule package — not our pinned
//      `kioskAppsPackageId` (0xe308bb3e…). So the purchase chain is hand-rolled
//      regardless.
//   3. Listing is plain framework calls; hand-rolling keeps this a pure builder
//      module mirroring `collectionTxBuilders.ts` (same `TxResult<T>` envelope,
//      structural-test discipline) with no client injection.
//
// Policy shape (D-036): `TransferPolicy<NftToken>` carries ONLY the royalty
// rule (no kiosk_lock_rule, no personal_kiosk_rule). Consequences for purchase:
//   - the hot-potato `confirm_request` needs exactly ONE receipt (royalty);
//   - with no lock rule the item is freed after confirm and can be
//     `public_transfer`'d to the buyer as a plain owned object.
//
// Royalty math (model3d.move AMOUNT_BP_DEFAULT=500 bps, MIN_ROYALTY_AMOUNT_MIST
// =1_000_000): `owed = max(price * 500 / 10_000, 1_000_000)` MIST.

import { Transaction } from '@mysten/sui/transactions';
import { TESTNET } from './networkConfig';
import { type TxResult } from './collectionTxBuilders';

const PKG = TESTNET.model3dPackageId;

/** Fully-qualified type tag of the tradeable token (Move type identity == package id). */
const NFT_TOKEN_TYPE = `${PKG}::model3d::NftToken`;
/** Sui framework Kiosk type, shared via `public_share_object` when freshly created. */
const KIOSK_TYPE = '0x2::kiosk::Kiosk';

/** Primary-sale royalty rate (bps) baked into the deployed royalty rule. */
const AMOUNT_BP_DEFAULT = 500n;
/** Royalty floor (MIST) baked into the deployed royalty rule. */
const MIN_ROYALTY_AMOUNT_MIST = 1_000_000n;
const BP_DENOMINATOR = 10_000n;

/**
 * The royalty the buyer must pay on a Kiosk-routed sale at `priceMist`, matching
 * the on-chain `royalty_rule::fee_amount` computation:
 *   `max(price * AMOUNT_BP_DEFAULT / 10_000, MIN_ROYALTY_AMOUNT_MIST)`.
 * Exported so the UI can show the buyer the all-in cost (price + royalty).
 */
export function royaltyOwedMist(priceMist: bigint): bigint {
  const byRate = (priceMist * AMOUNT_BP_DEFAULT) / BP_DENOMINATOR;
  return byRate > MIN_ROYALTY_AMOUNT_MIST ? byRate : MIN_ROYALTY_AMOUNT_MIST;
}

export interface ListNftTokenForSaleArgs {
  /** Owned `NftToken` object id to list. Consumed into the kiosk by value. */
  tokenId: string;
  /** Asking price in MIST. */
  priceMist: bigint;
  /** Seller address — receives the `KioskOwnerCap` when a kiosk is created. */
  ownerAddress: string;
  /** Existing seller kiosk (shared object) id. Omit to create a fresh kiosk in
   *  the same PTB. */
  kioskId?: string;
  /** `KioskOwnerCap` id for `kioskId`. Required iff `kioskId` is supplied. */
  kioskCapId?: string;
}

export interface PurchaseNftTokenArgs {
  /** Shared seller `Kiosk` id holding the listed token. */
  kioskId: string;
  /** `NftToken` object id being purchased. */
  tokenId: string;
  /** Listed price in MIST (must match the on-chain listing). */
  priceMist: bigint;
  /** Buyer address — receives the freed token via `public_transfer`. */
  buyerAddress: string;
}

/**
 * List an owned `NftToken` for sale in a Kiosk.
 *
 * Two shapes:
 *  - **existing kiosk** (`kioskId` + `kioskCapId` given): one `place_and_list`
 *    against the seller's shared kiosk.
 *  - **fresh kiosk** (both omitted): `kiosk::new` → `place_and_list` →
 *    `public_share_object(kiosk)` → transfer the `KioskOwnerCap` to the seller,
 *    all in one PTB. The new kiosk id is NOT known until execution — the caller
 *    reads it from the tx effects (a created object of type `0x2::kiosk::Kiosk`)
 *    and persists it for discovery (U3, approach (a)).
 */
export function buildListNftTokenForSalePtb(
  args: ListNftTokenForSaleArgs,
): TxResult<Record<string, never>> {
  const { tokenId, priceMist, ownerAddress, kioskId, kioskCapId } = args;
  if ((kioskId == null) !== (kioskCapId == null)) {
    throw new Error(
      'buildListNftTokenForSalePtb: kioskId and kioskCapId must be supplied together',
    );
  }

  const tx = new Transaction();

  if (kioskId != null && kioskCapId != null) {
    tx.moveCall({
      target: '0x2::kiosk::place_and_list',
      typeArguments: [NFT_TOKEN_TYPE],
      arguments: [
        tx.object(kioskId),
        tx.object(kioskCapId),
        tx.object(tokenId),
        tx.pure.u64(priceMist),
      ],
    });
  } else {
    const [kiosk, kioskCap] = tx.moveCall({ target: '0x2::kiosk::new' });
    tx.moveCall({
      target: '0x2::kiosk::place_and_list',
      typeArguments: [NFT_TOKEN_TYPE],
      arguments: [kiosk!, kioskCap!, tx.object(tokenId), tx.pure.u64(priceMist)],
    });
    tx.moveCall({
      target: '0x2::transfer::public_share_object',
      typeArguments: [KIOSK_TYPE],
      arguments: [kiosk!],
    });
    tx.transferObjects([kioskCap!], tx.pure.address(ownerAddress));
  }

  return {
    tx,
    handles: {},
    metadata: {
      target: '0x2::kiosk::place_and_list',
      expectedEvents: [],
    },
  };
}

/**
 * Purchase a listed `NftToken` (royalty-only policy hot-potato chain):
 *   (1) split `priceMist` from gas → payment coin
 *   (2) `kiosk::purchase<NftToken>(kiosk, tokenId, payment)` → (item, request)
 *   (3) split the royalty (`royaltyOwedMist(price)`) from gas → royalty coin
 *   (4) `royalty_rule::pay<NftToken>(policy, request, royaltyCoin)`  ← our pkg
 *   (5) `transfer_policy::confirm_request<NftToken>(policy, request)` consumes
 *       the request (1 receipt == 1 rule)
 *   (6) `transfer::public_transfer(item, buyer)` — freed (no lock rule)
 *
 * The whole chain is one PTB / one signature; the un-droppable `request`
 * forces (5) to be present, and the framework checks the royalty receipt there.
 */
export function buildPurchaseNftTokenPtb(
  args: PurchaseNftTokenArgs,
): TxResult<Record<string, never>> {
  const { kioskId, tokenId, priceMist, buyerAddress } = args;
  const tx = new Transaction();

  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);
  const [item, request] = tx.moveCall({
    target: '0x2::kiosk::purchase',
    typeArguments: [NFT_TOKEN_TYPE],
    arguments: [tx.object(kioskId), tx.pure.id(tokenId), payment!],
  });

  const [royalty] = tx.splitCoins(tx.gas, [tx.pure.u64(royaltyOwedMist(priceMist))]);
  tx.moveCall({
    target: `${TESTNET.kioskAppsPackageId}::royalty_rule::pay`,
    typeArguments: [NFT_TOKEN_TYPE],
    arguments: [tx.object(TESTNET.transferPolicyId), request!, royalty!],
  });
  tx.moveCall({
    target: '0x2::transfer_policy::confirm_request',
    typeArguments: [NFT_TOKEN_TYPE],
    arguments: [tx.object(TESTNET.transferPolicyId), request!],
  });
  tx.transferObjects([item!], tx.pure.address(buyerAddress));

  return {
    tx,
    handles: {},
    metadata: {
      target: '0x2::kiosk::purchase',
      expectedEvents: [],
    },
  };
}
