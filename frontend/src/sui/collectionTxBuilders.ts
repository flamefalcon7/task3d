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

export interface MintTokensArgs {
  /** Soulbound `NftCollectionCreatorCap` ID issued by step-1 `launch_collection`. */
  capId: string;
  /** Shared `NftCollection` ID (created empty in step 1; quilt set here). */
  collectionId: string;
  /** D-076 — the post-bake Walrus quilt blob id (unknown at launch; variants
   *  are baked in step 2 AFTER the base decrypts). Length-bounded by
   *  MAX_BLOB_ID_LEN on chain. */
  quiltBlobId: string;
  /** Token display names; index-aligned with `tokenPatchIds`. ≤128 B each. */
  tokenNames: string[];
  /** Quilt-patch ids each minted token binds; index-aligned with `tokenNames`. */
  tokenPatchIds: string[];
}

export interface SealApproveEntitlementArgs {
  /** The FULL Seal identity the EncryptedObject was sealed under
   *  (`[seal_id prefix][nonce]`) — recovered via `EncryptedObject.parse().id`,
   *  NOT the on-chain `model.seal_id` prefix alone. On-chain
   *  `seal_approve_entitlement` asserts `is_prefix(model.seal_id, id)`, which
   *  this full id satisfies. */
  id: Uint8Array;
  /** plan-027 D-078 — soulbound `AccessEntitlement` ID (proves the caller bought
   *  access). This REPLACES the cap as the decrypt gate. */
  entitlementId: string;
  /** The encrypted base `Model3D` object id the entitlement binds to. */
  baseModelId: string;
}

export interface PurchaseAccessArgs {
  /** Shared ALLOW_LIST `Model3D` object id to buy access to. */
  modelId: string;
  /** The base's `license.access_fee` in MIST. Split from gas; the Move side
   *  refunds any excess to the buyer. A per-base value read from
   *  `Model3DSummary.accessFee`, not a builder constant. */
  accessFeeMist: bigint;
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
 * D-076 — STEP 3 of the encrypted ALLOW_LIST 3-step fork:
 * `mint_tokens(cap, collection: &mut, quilt_blob_id, token_names, token_patch_ids, ctx)`.
 * Cap-gated. Sets the collection's post-bake quilt blob id (unknown at the
 * step-1 `launch_collection` because the variants are baked AFTER the base is
 * decrypted in step 2) and batch-mints one plain owned `NftToken` per index-
 * aligned (name, patch) pair, emitting one `NftTokenMinted` each. PERMISSIONLESS
 * keeps the atomic `launch_collection_with_tokens` (its base is public, so its
 * quilt is baked before launch — no split needed).
 *
 * Mirrors `buildLaunchCollectionWithTokensPtb`'s arg style: objects via
 * `tx.object`, the quilt id via `tx.pure.string`, the parallel name/patch
 * vectors via `tx.pure.vector('string', …)`. Guards the length mismatch
 * client-side (Move aborts `EBatchLenMismatch`) to fail before signing.
 */
export function buildMintTokensPtb(
  args: MintTokensArgs,
): TxResult<Record<string, never>> {
  if (args.tokenNames.length !== args.tokenPatchIds.length) {
    throw new Error(
      `buildMintTokensPtb: tokenNames (${args.tokenNames.length}) and ` +
        `tokenPatchIds (${args.tokenPatchIds.length}) must be the same length`,
    );
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::model3d::mint_tokens`,
    arguments: [
      tx.object(args.capId),
      tx.object(args.collectionId),
      tx.pure.string(args.quiltBlobId),
      tx.pure.vector('string', args.tokenNames),
      tx.pure.vector('string', args.tokenPatchIds),
    ],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::mint_tokens`,
      expectedEvents: [`${PKG}::model3d::NftTokenMinted`],
    },
  };
}

/**
 * plan-027 D-078 — the Seal key-server DRY-RUN gate, built as `txBytes` for
 * `SealClient.decrypt` (NOT signed/executed). REPLACES the deleted
 * `seal_approve_cap`: the decrypt gate now hangs off the soulbound
 * `AccessEntitlement`, not the per-collection cap, so a consumer who never
 * launched a collection can still decrypt. `seal_approve_entitlement(id,
 * entitlement, model)` is `entry` (invokable in the dry-run PTB) but not
 * `public`; the key servers dry-run it against the latest package version and
 * release key shares iff it does NOT abort. Its invariant is:
 *   entitlement.model_id == id(model)  ∧  entitlement.holder == sender
 *   ∧  is_prefix(model.seal_id, id)    ∧  model.seal_version == VERSION
 *
 * `id` MUST be the FULL Seal identity (`[seal_id][nonce]`) the EncryptedObject
 * was sealed under — recover it via `EncryptedObject.parse(sealedKey).id`
 * (the on-chain `model.seal_id` is only the prefix; the nonce is lost there).
 *
 * Callers build `txBytes` with `tx.build({ client, onlyTransactionKind: true })`
 * (a transaction KIND, not a full tx — no gas/sender) and pass it to
 * `decryptKey(client, sealedKey, sessionKey, txBytes)`. This builder returns the
 * unbuilt `Transaction` so callers can build against their own client.
 */
export function buildSealApproveEntitlementPtb(
  args: SealApproveEntitlementArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::model3d::seal_approve_entitlement`,
    arguments: [
      tx.pure.vector('u8', Array.from(args.id)),
      tx.object(args.entitlementId),
      tx.object(args.baseModelId),
    ],
  });
  return {
    tx,
    handles: {},
    metadata: {
      // No on-chain effect: this is a dry-run-only gate (key servers invoke it).
      target: `${PKG}::model3d::seal_approve_entitlement`,
      expectedEvents: [],
    },
  };
}

/**
 * plan-027 D-078 — `purchase_access(model: &mut Model3D, payment: Coin<SUI>,
 * ctx)`. A consumer/forker buys one-time access to an ALLOW_LIST base: pays
 * `access_fee` to the base creator and receives a soulbound `AccessEntitlement`.
 * The fee is split from gas (`tx.splitCoins(tx.gas, [accessFeeMist])`); the Move
 * side refunds any excess to the buyer and idempotency-guards a double purchase.
 * Mirrors `buildLaunchCollectionPtb`'s split-from-gas shape (caller passes only
 * `accessFeeMist`, not a pre-split coin). Emits `AccessPurchased`.
 */
export function buildPurchaseAccessPtb(
  args: PurchaseAccessArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.accessFeeMist)]);
  tx.moveCall({
    target: `${PKG}::model3d::purchase_access`,
    arguments: [tx.object(args.modelId), coin!],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${PKG}::model3d::purchase_access`,
      expectedEvents: [`${PKG}::model3d::AccessPurchased`],
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
