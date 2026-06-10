// plan 2026-06-10-001 U1 (KTD-5) — `buildPurchaseAccessPtb` lifted VERBATIM
// from `frontend/src/sui/collectionTxBuilders.ts` so the frontend and the
// backend MCP route share ONE isomorphic copy of the purchase-PTB builder.
// The ONLY change from the frontend original: the `TESTNET.model3dPackageId`
// import is replaced by an explicit `packageId` parameter — the frontend
// passes `TESTNET.model3dPackageId`, the MCP route passes the backend's
// network packageId (from `contracts/networks/testnet.json`). No behavior
// change.
//
// Isomorphic: no DOM, no React — importable from both the browser bundle and
// the Node backend.
//
// Struct-arg discipline (learnings #1): every on-chain object ref goes through
// `tx.object(id)`; primitives through `tx.pure.*`. Never `tx.pure` an object.

import { Transaction } from '@mysten/sui/transactions';

/**
 * Builder result envelope — mirrors the per-file `TxResult<T>` convention in
 * `frontend/src/sui/*TxBuilders.ts` (structurally identical, so frontend
 * wrappers can annotate with their local `TxResult` unchanged).
 */
export type TxResult<T> = {
  tx: Transaction;
  handles: T;
  metadata: {
    target: string;
    expectedEvents: string[];
  };
};

export interface PurchaseAccessArgs {
  /** Shared ALLOW_LIST `Model3D` object id to buy access to. */
  modelId: string;
  /** The base's `license.access_fee` in MIST. Split from gas; the Move side
   *  refunds any excess to the buyer. A per-base value read from
   *  `Model3DSummary.accessFee`, not a builder constant. */
  accessFeeMist: bigint;
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
  packageId: string,
  args: PurchaseAccessArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.accessFeeMist)]);
  tx.moveCall({
    target: `${packageId}::model3d::purchase_access`,
    arguments: [tx.object(args.modelId), coin!],
  });
  return {
    tx,
    handles: {},
    metadata: {
      target: `${packageId}::model3d::purchase_access`,
      expectedEvents: [`${packageId}::model3d::AccessPurchased`],
    },
  };
}
