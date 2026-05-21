// plan-008 U6 — typed PTB builders for the D-029 NFT collection layer:
// `launch_collection`, `set_register_fee`, `mint_nft_token`,
// `register_integration`. Mirrors `kioskTxBuilders.ts` (TxResult<T> envelope,
// struct-arg discipline, day-1 dry-run reachability).
//
// D-032 context: `Model3D` is a SHARED object (published via `publish`), so
// `launch_collection(model: &Model3D, …)` takes the model by a plain
// `tx.object(modelId)` shared-object ref — any wallet can reference it.
// D-036: `mint_nft_token` yields a PLAIN OWNED `NftToken` (no Kiosk at mint);
// Kiosk placement is a separate opt-in listing step (a future
// `place_and_list<NftToken>` builder, not yet implemented).
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

export interface LaunchCollectionArgs {
  /** Shared `Model3D` object ID to fork. Referenceable by any wallet (D-032). */
  modelId: string;
  /** Derive fee in MIST (the base model's `license.derivative_mint_fee`).
   *  Split from gas; the Move side refunds any excess to the sender. */
  feeMist: bigint;
  /** D-035 — the Walrus quilt blob id holding this collection's variant
   *  patches. Stored on the collection; each minted token binds one patch by
   *  id. Length-bounded by MAX_BLOB_ID_LEN on chain. */
  quiltBlobId: string;
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
  /** Token display name (≤ 128 bytes, enforced on chain). */
  name: string;
  /** D-035 — quilt-patch id this token binds (the colored variant). Length-
   *  bounded by MAX_PATCH_ID_LEN on chain. */
  patchId: string;
}

export interface LaunchCollectionWithTokensArgs {
  /** Shared `Model3D` object ID to fork (D-032). */
  modelId: string;
  /** Derive fee in MIST (base model's `license.derivative_mint_fee`). Split
   *  from gas; the Move side refunds excess to the sender. */
  feeMist: bigint;
  /** D-035 — Walrus quilt blob id holding the collection's variant patches. */
  quiltBlobId: string;
  /** Register fee in MIST set on the new collection (what a gameDev later pays
   *  to `register_integration`). Folded in so launch + set-fee is one signature. */
  registerFeeMist: bigint;
  /** Token display names; index-aligned with `tokenPatchIds`. ≤16, each ≤128 B. */
  tokenNames: string[];
  /** Quilt-patch ids each minted token binds; index-aligned with `tokenNames`. */
  tokenPatchIds: string[];
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
 * `launch_collection(model: &Model3D, payment: Coin<SUI>, quilt_blob_id, ctx)`
 * — an nft creator forks a shared Model3D into an `NftCollection`
 * (pay-to-derive), pinning the collection's variant quilt blob (D-035). The
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
    arguments: [tx.object(args.modelId), payment!, tx.pure.string(args.quiltBlobId)],
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
 * `launch_collection_with_tokens(model, payment, quilt_blob_id, register_fee,
 * token_names, token_patch_ids, ctx)` (D-038) — the one-signature nft-creator
 * path: forks the shared Model3D, sets the register fee, mints N owned
 * NftTokens (one per index-aligned name/patch pair), then shares the collection
 * + transfers the soulbound cap. Collapses launch + set_register_fee + N mints
 * into a single wallet popup. The derive fee is split from gas (excess
 * refunded). Emits `CollectionLaunched` + one `NftTokenMinted` per token.
 *
 * Names and patch ids MUST be the same length (the Move side aborts
 * `EBatchLenMismatch`); the builder guards it client-side to fail before signing.
 */
export function buildLaunchCollectionWithTokensPtb(
  args: LaunchCollectionWithTokensArgs,
): TxResult<Record<string, never>> {
  if (args.tokenNames.length !== args.tokenPatchIds.length) {
    throw new Error(
      `buildLaunchCollectionWithTokensPtb: tokenNames (${args.tokenNames.length}) and ` +
        `tokenPatchIds (${args.tokenPatchIds.length}) must be the same length`,
    );
  }
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(args.feeMist)]);
  tx.moveCall({
    target: `${PKG}::model3d::launch_collection_with_tokens`,
    arguments: [
      tx.object(args.modelId),
      payment!,
      tx.pure.string(args.quiltBlobId),
      tx.pure.u64(args.registerFeeMist),
      tx.pure.vector('string', args.tokenNames),
      tx.pure.vector('string', args.tokenPatchIds),
    ],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::launch_collection_with_tokens`,
      expectedEvents: [
        `${PKG}::model3d::CollectionLaunched`,
        `${PKG}::model3d::NftTokenMinted`,
      ],
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
 * `mint_nft_token(cap, collection, name, patch_id, ctx)` — cap-gated. Mints an
 * `NftToken` bound to one quilt patch (D-035) and `public_transfer`s it to the
 * caller as a PLAIN OWNED object (D-036) — NO Kiosk placement. Emits only
 * `NftTokenMinted` (no `ItemListed`). Listing-for-sale is a separate opt-in
 * `place_and_list<NftToken>` PTB (a dedicated builder is deferred — see
 * plan-008 "Deferred to Follow-Up Work").
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
      tx.pure.string(args.name),
      tx.pure.string(args.patchId),
    ],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::mint_nft_token`,
      expectedEvents: [`${PKG}::model3d::NftTokenMinted`],
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
