// plan-007 U5 — typed PTB builders for the v2 Kiosk-mediated mint + purchase
// flow. Returns `TxResult<T>` envelopes so callers get the tx + handle map +
// expected-event metadata in a single shape (R6 — typed wrapper from day 1).
//
// Why this module is opinionated:
//
//   - Struct-arg discipline (learnings #1): every on-chain object ref is
//     passed via `tx.object(id)`. Never `tx.pure.*` for an object — the SDK
//     does not type-check this, and a string-pure'd object ref silently
//     fails Move arg type checking at submit time with an opaque "InvalidUsage
//     of argument" runtime error. Pinned here so frontend callers cannot
//     reintroduce the bug.
//
//   - 6-call chain locked inside `buildPurchaseWithKioskPtb`: per R12 doc
//     `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md`, the
//     buyer's PTB MUST compose six Move calls in order to satisfy R3 ("one
//     wallet popup"). Wrapped in personal_kiosk::borrow_val + return_val for
//     PersonalKiosk OwnerCap access, the PTB carries 8 Move commands total.
//     Building these inside one TS function makes it impossible for callers
//     to omit a step.
//
//   - Policy-pinning constraint (model3d.move line 567): the policy_id arg
//     is HARDCODED to `TESTNET.transferPolicyId` per R3 (review). Callers no
//     longer pass a policyId — the builder pins it to the canonical testnet
//     policy. This closes ADV-001 (a malicious caller crafting a PTB against
//     a spoofed policy with no royalty rules).
//
//   - kiosk-apps package address (`KIOSK_APPS_PACKAGE`): the on-chain
//     address that hosts `royalty_rule` + `kiosk_lock_rule` +
//     `personal_kiosk_rule` modules. Pinned from
//     `contracts/networks/testnet.json::kiosk_apps_package_id`, which is
//     the address our Move build resolved (apps@7a07937...). This DIFFERS
//     from the @mysten/kiosk SDK's testnet-default constants — using the
//     SDK defaults would fail `confirm_request`'s rule membership check.

import { Transaction, type TransactionResult } from '@mysten/sui/transactions';
import { TESTNET } from './networkConfig';

// === Framework constants ===

// The Sui framework's own package, where `transfer_policy::confirm_request`
// and `kiosk::lock` live. Always 0x2 by Sui convention.
export const KIOSK_FRAMEWORK_PACKAGE = '0x2';
export const TRANSFER_POLICY_MODULE = 'transfer_policy';
export const KIOSK_MODULE = 'kiosk';

// The deployed kiosk-apps package address (royalty_rule + kiosk_lock_rule +
// personal_kiosk_rule). Resolved at U5 by reading our TransferPolicy's
// rules VecSet on testnet. See networkConfig.ts for the rationale.
export const KIOSK_APPS_PACKAGE = TESTNET.kioskAppsPackageId;

// === Public API types ===

export type TxResult<T> = {
  tx: Transaction;
  handles: T;
  metadata: {
    target: string;
    expectedEvents: string[];
  };
};

export interface LicenseTermsInput {
  policy: number;
  derivativeMintFee: bigint;
  derivativeRoyaltyBps: number; // u16; ≤3000 (D-004)
  commercialUse: boolean;
  requireAttribution: boolean;
}

export interface MintAndListArgs {
  /** Creator's PersonalKiosk-wrapped Kiosk object ID (mutable ref on chain). */
  kioskId: string;
  /** PersonalKioskCap object ID owned by creator (read-only borrow at call). */
  personalKioskCapId: string;
  /** Walrus Blob object — transferred to creator inside `new_model`. */
  blobObjectId: string;
  shapeType: string;
  paramsJson: string;
  name: string;
  tags: string[];
  lineageBlobId: string;
  isEncrypted: boolean;
  license: LicenseTermsInput;
  /** Listing price in MIST. The framework's RoyaltyRule reads this. */
  priceMist: bigint;
}

export interface PurchaseWithKioskArgs {
  /** Buyer's PersonalKiosk Kiosk object ID. MUST already be a PersonalKiosk
   *  (wrapped via `personal_kiosk::new` upstream — U5 does NOT auto-wrap;
   *  U6's purchase flow runs `ensure_buyer_kiosk` separately if needed). */
  buyerKioskId: string;
  /** PersonalKioskCap wrapper ID — builder will `borrow_val` to extract
   *  the inner KioskOwnerCap intra-PTB, then `return_val` after
   *  `confirm_request`. The buyer's wallet has NO standalone OwnerCap
   *  to surface; PersonalKioskCap stores `Option<KioskOwnerCap>` and
   *  the cap must be borrowed via the personal_kiosk module entry
   *  points. (R2 — review.) */
  buyerPersonalKioskCapId: string;
  /** Seller's Kiosk holding the listed Model3D. */
  sellerKioskId: string;
  // policyId removed (R3) — builder hardcodes TESTNET.transferPolicyId.
  // See model3d.move:567-577 which delegates policy-pinning to this
  // builder (ADV-001 mitigation: malicious caller cannot redirect to
  // a spoofed policy with no royalty rules).
  /** The listed Model3D object ID. */
  modelId: string;
  /** Coin<SUI> object ID for the FULL listing price. Caller must
   *  splitCoins to the exact price beforehand (kiosk::purchase asserts
   *  payment.value() == listing.price). */
  paymentCoinId: string;
  /** Royalty amount (MIST), pre-computed via
   *  `royalty_rule::fee_amount(policy, price)`. Caller queries upstream
   *  because the rule's value depends on policy state. */
  royaltyAmount: bigint;
}

// === LicenseTerms helper ===

/**
 * Build the on-chain LicenseTerms struct via a same-PTB
 * `new_license_terms` moveCall and return the Result handle for
 * downstream consumption. This is the struct-arg pattern from
 * publishPtb.ts: the Move VM type-checks struct args by Move-type, not by
 * BCS bytes, so we MUST construct the struct on-chain.
 */
function attachNewLicenseTerms(
  tx: Transaction,
  license: LicenseTermsInput,
): TransactionResult {
  return tx.moveCall({
    target: `${TESTNET.model3dPackageId}::model3d::new_license_terms`,
    arguments: [
      tx.pure.u8(license.policy),
      tx.pure.u64(license.derivativeMintFee),
      tx.pure.u16(license.derivativeRoyaltyBps),
      tx.pure.bool(license.commercialUse),
      tx.pure.bool(license.requireAttribution),
    ],
  });
}

// === Public builders ===

/**
 * Build the atomic mint + place + list PTB. Single wallet popup (R3 /
 * AE1). Emits one ModelPublished + one kiosk::ItemListed.
 *
 * Move signature reference (model3d.move line 509):
 *   public entry fun mint_and_list(
 *       kiosk_obj: &mut Kiosk,
 *       personal_cap: &PersonalKioskCap,
 *       blob: Blob,
 *       shape_type: String,
 *       params_json: String,
 *       name: String,
 *       tags: vector<String>,
 *       lineage_blob_id: String,
 *       is_encrypted: bool,
 *       license: LicenseTerms,
 *       clock: &Clock,
 *       price: u64,
 *       ctx: &mut TxContext,
 *   )
 */
export function buildMintAndListPtb(
  args: MintAndListArgs,
): TxResult<{ licenseHandle: TransactionResult }> {
  const tx = new Transaction();
  const licenseHandle = attachNewLicenseTerms(tx, args.license);

  tx.moveCall({
    target: `${TESTNET.model3dPackageId}::model3d::mint_and_list`,
    arguments: [
      tx.object(args.kioskId), // &mut Kiosk
      tx.object(args.personalKioskCapId), // &PersonalKioskCap
      tx.object(args.blobObjectId), // Blob (by value)
      tx.pure.string(args.shapeType),
      tx.pure.string(args.paramsJson),
      tx.pure.string(args.name),
      tx.pure.vector('string', args.tags),
      tx.pure.string(args.lineageBlobId),
      tx.pure.bool(args.isEncrypted),
      licenseHandle, // LicenseTerms (Result from new_license_terms)
      tx.object('0x6'), // Clock
      tx.pure.u64(args.priceMist),
    ],
  });

  return {
    tx,
    handles: { licenseHandle },
    metadata: {
      target: `${TESTNET.model3dPackageId}::model3d::mint_and_list`,
      expectedEvents: [
        `${TESTNET.model3dPackageId}::model3d::ModelPublished`,
        // ItemListed is generic over Model3D; pin the full type so U6/U8
        // event filters can match by exact-type. The framework emits with
        // the package-qualified Model3D type-arg.
        `${KIOSK_FRAMEWORK_PACKAGE}::kiosk::ItemListed<${TESTNET.model3dPackageId}::model3d::Model3D>`,
      ],
    },
  };
}

/**
 * Build the SIX-Move-call buyer PTB (8 PTB commands total, including the
 * PersonalKiosk borrow/return wrappers). One wallet popup (R3). Per R12
 * doc, the Move calls in order are:
 *
 *   (1) model3d::purchase_with_kiosk(seller_kiosk, policy, model_id, payment)
 *       → (Model3D, TransferRequest<Model3D>)
 *   (2) personal_kiosk::borrow_val(buyer_personal_kiosk_cap)
 *       → (KioskOwnerCap, Borrow) — extracts the wrapped OwnerCap intra-PTB
 *   (3) kiosk::lock<Model3D>(buyer_kiosk, borrowed_owner_cap, policy, item)
 *       → locks item into buyer's PersonalKiosk
 *   (4) kiosk_lock_rule::prove<Model3D>(request, buyer_kiosk)
 *       → adds KioskLockRule receipt
 *   (5) royalty_rule::pay<Model3D>(policy, request, royalty_coin)
 *       → adds RoyaltyRule receipt
 *   (6) personal_kiosk_rule::prove<Model3D>(buyer_kiosk, request)
 *       → adds PersonalKioskRule receipt
 *   (7) transfer_policy::confirm_request<Model3D>(policy, request)
 *       → consumes the TransferRequest hot-potato. Aborts
 *         EPolicyNotSatisfied if any rule's receipt is missing.
 *   (8) personal_kiosk::return_val(buyer_personal_kiosk_cap, owner_cap, borrow)
 *       → consumes the Borrow hot-potato and returns the OwnerCap to wrapper.
 *
 * Plus one PTB `splitCoins` primitive between (4) and (5) for the royalty
 * payment.
 *
 * Why (4) `kiosk_lock_rule::prove` exists: `kiosk::lock` only sets the
 * `is_locked` flag — it does NOT emit a rule receipt. The SDK's
 * `resolveKioskLockRule` (kiosk-apps source, src/tx/rules/resolve.ts:100-132)
 * emits both. Without the prove call, the policy's 3-rule cardinality
 * check at `confirm_request` fails (only 2 receipts present).
 *
 * Omitting any step:
 *   - Omitting (7): the SDK does not enforce hot-potato consumption, but
 *     the Move VM rejects the tx at execution because TransferRequest<T>
 *     has no `drop` ability. Dry-run surfaces this as a value-leak error.
 *   - Omitting (4), (5), or (6): runtime EPolicyNotSatisfied (cardinality
 *     fails first, then membership).
 *   - Omitting (3): runtime — kiosk_lock_rule's prove asserts the item is
 *     locked in the destination Kiosk.
 *   - Omitting (2) or (8): Move runtime rejects — the Borrow hot-potato
 *     from (2) must be consumed by (8) (no `drop` ability on Borrow).
 *
 * All eight commands are emitted internally so frontend callers physically
 * cannot omit a step.
 */
export function buildPurchaseWithKioskPtb(
  args: PurchaseWithKioskArgs,
): TxResult<Record<string, never>> {
  const tx = new Transaction();

  // Type tag for the generic <Model3D> on framework + apps calls.
  const MODEL3D_TYPE = `${TESTNET.model3dPackageId}::model3d::Model3D`;

  // (1) purchase_with_kiosk → returns (item, request) as TWO consecutive
  // Result handles. The SDK exposes the multi-result via `purchaseResult[0]`
  // (item) and `purchaseResult[1]` (request).
  // policyId is HARDCODED to TESTNET.transferPolicyId per R3 — ADV-001
  // mitigation (callers cannot redirect to a spoofed policy).
  const purchaseResult = tx.moveCall({
    target: `${TESTNET.model3dPackageId}::model3d::purchase_with_kiosk`,
    arguments: [
      tx.object(args.sellerKioskId),
      tx.object(TESTNET.transferPolicyId),
      tx.pure.id(args.modelId),
      tx.object(args.paymentCoinId),
    ],
  });
  // SDK guarantees indices 0/1 exist for a fn returning a 2-tuple.
  // The `TransactionResult` type's NestedResult[] is array-typed but the
  // tsconfig's `noUncheckedIndexedAccess` widens to `| undefined`.
  // Non-null assertions are safe here per the Move ABI.
  const item = purchaseResult[0]!;
  const request = purchaseResult[1]!;

  // (2) personal_kiosk::borrow_val(self: &mut PersonalKioskCap)
  //     → (KioskOwnerCap, Borrow) — Returns the wrapped OwnerCap + a Borrow
  //     hot-potato that MUST be returned via return_val. Per @mysten/kiosk
  //     source `src/contracts/kiosk/personal_kiosk.ts:122-184`. R2 — review.
  const borrowResult = tx.moveCall({
    target: `${KIOSK_APPS_PACKAGE}::personal_kiosk::borrow_val`,
    arguments: [tx.object(args.buyerPersonalKioskCapId)],
  });
  const borrowedOwnerCap = borrowResult[0]!;
  const ownerCapBorrow = borrowResult[1]!;

  // (3) kiosk::lock<Model3D>(buyer_kiosk, borrowed_owner_cap, policy, item)
  //     Framework signature:
  //       public fun lock<T: key + store>(
  //           self: &mut Kiosk,
  //           cap: &KioskOwnerCap,
  //           _policy: &TransferPolicy<T>,
  //           item: T,
  //       )
  //     borrowedOwnerCap is the Result handle from (2), NOT a tx.object ID.
  tx.moveCall({
    target: `${KIOSK_FRAMEWORK_PACKAGE}::${KIOSK_MODULE}::lock`,
    typeArguments: [MODEL3D_TYPE],
    arguments: [
      tx.object(args.buyerKioskId),
      borrowedOwnerCap,
      tx.object(TESTNET.transferPolicyId),
      item,
    ],
  });

  // (4) kiosk_lock_rule::prove<Model3D>(request, buyer_kiosk)
  //     ARG ORDER IS REVERSED from personal_kiosk_rule::prove —
  //     verified against `@mysten/kiosk` source
  //     `src/contracts/kiosk/kiosk_lock_rule.ts:62-87`
  //     `parameterNames = ['request', 'kiosk']`. R1 — review.
  //     kiosk::lock only sets `is_locked`; this call adds the rule receipt.
  tx.moveCall({
    target: `${KIOSK_APPS_PACKAGE}::kiosk_lock_rule::prove`,
    typeArguments: [MODEL3D_TYPE],
    arguments: [request, tx.object(args.buyerKioskId)],
  });

  // (5) royalty_rule::pay<Model3D>(policy, request, royalty_coin)
  //     The royalty_coin is split from gas to the EXACT royaltyAmount the
  //     caller pre-computed via `royalty_rule::fee_amount(policy, price)`.
  //     splitCoins is a PTB primitive — gas resolution at submit time
  //     supplies the source coin.
  const splitResult = tx.splitCoins(tx.gas, [tx.pure.u64(args.royaltyAmount)]);
  const royaltyCoin = splitResult[0]!;
  tx.moveCall({
    target: `${KIOSK_APPS_PACKAGE}::royalty_rule::pay`,
    typeArguments: [MODEL3D_TYPE],
    arguments: [tx.object(TESTNET.transferPolicyId), request, royaltyCoin],
  });

  // (6) personal_kiosk_rule::prove<Model3D>(buyer_kiosk, request)
  //     parameterNames = ['kiosk', 'request'] — note: OPPOSITE order from
  //     kiosk_lock_rule::prove above.
  tx.moveCall({
    target: `${KIOSK_APPS_PACKAGE}::personal_kiosk_rule::prove`,
    typeArguments: [MODEL3D_TYPE],
    arguments: [tx.object(args.buyerKioskId), request],
  });

  // (7) transfer_policy::confirm_request<Model3D>(policy, request)
  //     Consumes the TransferRequest hot-potato. Below this point the
  //     framework verifies receipt cardinality + membership against the
  //     policy's three-rule VecSet.
  tx.moveCall({
    target: `${KIOSK_FRAMEWORK_PACKAGE}::${TRANSFER_POLICY_MODULE}::confirm_request`,
    typeArguments: [MODEL3D_TYPE],
    arguments: [tx.object(TESTNET.transferPolicyId), request],
  });

  // (8) personal_kiosk::return_val(self, cap, borrow)
  //     Borrow hot-potato must be consumed — return the OwnerCap to the
  //     wrapper. Per @mysten/kiosk source `personal_kiosk.ts:185-212`. R2.
  tx.moveCall({
    target: `${KIOSK_APPS_PACKAGE}::personal_kiosk::return_val`,
    arguments: [
      tx.object(args.buyerPersonalKioskCapId),
      borrowedOwnerCap,
      ownerCapBorrow,
    ],
  });

  return {
    tx,
    handles: {},
    metadata: {
      target: `${TESTNET.model3dPackageId}::model3d::purchase_with_kiosk`,
      expectedEvents: [
        `${TESTNET.model3dPackageId}::model3d::RoyaltyPaid`,
      ],
    },
  };
}
