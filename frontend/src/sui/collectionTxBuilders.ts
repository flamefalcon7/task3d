// plan-008 U6 — typed PTB builders for the D-029 NFT collection layer:
// `launch_collection`, `set_register_fee`, `mint_nft_token`,
// `register_integration`. Mirrors `kioskTxBuilders.ts` (TxResult<T> envelope,
// struct-arg discipline, day-1 dry-run reachability).
//
// D-032 context: `Model3D` is a SHARED object (published via `publish`), so
// `launch_collection(model: &Model3D, …)` takes the model by a plain
// `tx.object(modelId)` shared-object ref — any wallet can reference it. The
// only Kiosk-traded type is `NftToken` (minted by `mint_nft_token`).
//
// Payment discipline: `launch_collection` and `register_integration` each take
// a `Coin<SUI>` by value, require `value >= fee`, and refund the remainder to
// the sender. The builders therefore split the fee from gas
// (`tx.splitCoins(tx.gas, [feeMist])`) — callers pass only `feeMist`, not a
// pre-split coin object. A zero fee splits a zero coin (the Move side calls
// `coin::destroy_zero`).
//
// Struct-arg discipline (learnings #1): every on-chain object ref goes through
// `tx.object(id)`; primitives through `tx.pure.*`. Never `tx.pure` an object.

import { Transaction } from '@mysten/sui/transactions';
import { TESTNET } from './networkConfig';

// The Sui framework package (0x2) — where `kiosk::ItemListed` is emitted from.
export const KIOSK_FRAMEWORK_PACKAGE = '0x2';

// On-chain Clock singleton (shared object at 0x6).
const CLOCK_OBJECT_ID = '0x6';

// === Public API types ===

export type TxResult<T> = {
  tx: Transaction;
  handles: T;
  metadata: {
    target: string;
    expectedEvents: string[];
  };
};

const PKG = TESTNET.model3dPackageId;
const NFT_TOKEN_TYPE = `${PKG}::model3d::NftToken`;

export interface LaunchCollectionArgs {
  /** Shared `Model3D` object ID to fork. Referenceable by any wallet (D-032). */
  modelId: string;
  /** Derive fee in MIST (the base model's `license.derivative_mint_fee`).
   *  Split from gas; the Move side refunds any excess to the sender. */
  feeMist: bigint;
}

export interface SetRegisterFeeArgs {
  /** Soulbound `NftCollectionCreatorCap` ID (authority over the collection). */
  capId: string;
  /** Shared `NftCollection` ID. */
  collectionId: string;
  /** New register fee in MIST (a gameDev pays this to `register_integration`). */
  feeMist: bigint;
}

export interface MintNftTokenArgs {
  /** Soulbound `NftCollectionCreatorCap` ID. */
  capId: string;
  /** Shared `NftCollection` ID the token is minted from. */
  collectionId: string;
  /** nft creator's PersonalKiosk-wrapped Kiosk ID (mutable on chain). */
  kioskId: string;
  /** nft creator's `PersonalKioskCap` ID (read-only borrow at call). */
  personalKioskCapId: string;
  /** Token display name (≤ 128 bytes, enforced on chain). */
  name: string;
  /** Listing price in MIST. */
  priceMist: bigint;
}

export interface RegisterIntegrationArgs {
  /** Shared `NftCollection` ID being integrated against. */
  collectionId: string;
  /** Register fee in MIST (must be `>= collection.register_fee`).
   *  Split from gas; excess refunded to the integrator. */
  feeMist: bigint;
  /** UTF-8 JSON `{name,url}` blob (≤ 512 bytes on chain; backend validates the
   *  full schema). Passed as a `vector<u8>`. */
  appMetadata: Uint8Array;
}

// === Builders ===

/**
 * `launch_collection(model: &Model3D, payment: Coin<SUI>, ctx)` — an nft
 * creator forks a shared Model3D into an `NftCollection` (pay-to-derive). The
 * derive fee is split from gas; excess refunds to the caller. Emits
 * `CollectionLaunched`; transfers a soulbound cap + shares the collection.
 */
export function buildLaunchCollectionPtb(
  args: LaunchCollectionArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(args.feeMist)]);
  tx.moveCall({
    target: `${PKG}::model3d::launch_collection`,
    arguments: [tx.object(args.modelId), payment!],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::launch_collection`,
      expectedEvents: [`${PKG}::model3d::CollectionLaunched`],
    },
  };
}

/**
 * `set_register_fee(cap, collection: &mut, fee)` — cap-gated. Sets the SUI a
 * gameDev must pay to `register_integration`. No event.
 */
export function buildSetRegisterFeePtb(
  args: SetRegisterFeeArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::model3d::set_register_fee`,
    arguments: [
      tx.object(args.capId),
      tx.object(args.collectionId),
      tx.pure.u64(args.feeMist),
    ],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::set_register_fee`,
      expectedEvents: [],
    },
  };
}

/**
 * `mint_nft_token(cap, collection, kiosk: &mut, personal_cap, name, price, ctx)`
 * — cap-gated. Mints an `NftToken` and atomically place+lists it in the nft
 * creator's PersonalKiosk (one wallet popup). Emits `NftTokenMinted` + one
 * `kiosk::ItemListed<NftToken>`.
 */
export function buildMintNftTokenPtb(
  args: MintNftTokenArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::model3d::mint_nft_token`,
    arguments: [
      tx.object(args.capId),
      tx.object(args.collectionId),
      tx.object(args.kioskId),
      tx.object(args.personalKioskCapId),
      tx.pure.string(args.name),
      tx.pure.u64(args.priceMist),
    ],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::mint_nft_token`,
      expectedEvents: [
        `${PKG}::model3d::NftTokenMinted`,
        `${KIOSK_FRAMEWORK_PACKAGE}::kiosk::ItemListed<${NFT_TOKEN_TYPE}>`,
      ],
    },
  };
}

/**
 * `register_integration(collection: &mut, payment: Coin<SUI>, app_metadata, clock, ctx)`
 * — a gameDev attests an on-chain integration. Fee split from gas (excess
 * refunded). Emits `IntegrationRegistered`. Aborts `EIntegrationsClosed` /
 * `EFeeTooLow` / `EAlreadyRegistered` / `EAppMetadataTooLong` per the gates.
 */
export function buildRegisterIntegrationPtb(
  args: RegisterIntegrationArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(args.feeMist)]);
  tx.moveCall({
    target: `${PKG}::model3d::register_integration`,
    arguments: [
      tx.object(args.collectionId),
      payment!,
      tx.pure.vector('u8', Array.from(args.appMetadata)),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::register_integration`,
      expectedEvents: [`${PKG}::model3d::IntegrationRegistered`],
    },
  };
}
