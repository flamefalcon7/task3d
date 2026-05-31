// plan-008 U10 — L1 `Model3D` PTB builders (D-032 + D-033 + D-034).
//
//   - buildPayForApiCallPtb: the SUI service-fee for a Tripo generation
//     (D-034, Approach A). Amount + treasury are hardcoded by the builder so
//     the user only signs — no fat-finger surface. The wallet returns the tx
//     digest, which the frontend hands to POST /api/generate for off-chain
//     verification before Tripo runs.
//   - buildPublishPtb: publishes a Model3D as a SHARED object via
//     `model3d::publish` (D-032 — Model3D sells access, not ownership, so it is
//     NOT Kiosk-placed). Consumes the Walrus Blob object id from useWalrusUpload.
//
// Mirrors collectionTxBuilders.ts (TxResult<T> envelope, struct-arg discipline:
// objects via tx.object, primitives via tx.pure; LicenseTerms built on-chain).

import { Transaction, type TransactionResult } from '@mysten/sui/transactions';
import { TESTNET } from './networkConfig';

const CLOCK_OBJECT_ID = '0x6';
const PKG = TESTNET.model3dPackageId;
// D-075 — the shared SealIdRegistry bootstrapped in the v9 `init`. Set to the
// real object id at the v9 deploy ceremony (see networkConfig).
const SEAL_ID_REGISTRY_ID = TESTNET.sealIdRegistryId;

/**
 * Default Tripo service-fee: 0.4 SUI (D-034, re-derived plan-013).
 *
 * Previously 0.1 SUI when Tripo `text_to_model` was a single ~15-credit call.
 * Plan-013's two-step flow chains `text_to_model` → `mesh_segmentation`
 * (~60 credits total, 4× the cost), so the SUI fee is bumped 4× in lockstep
 * to keep the per-generation margin intact. Reversible via this single
 * constant if demo-day feedback warrants tuning.
 */
export const TRIPO_FEE_MIST = 400_000_000n;

/** Treasury that receives the Tripo service-fee (D-034: deployer for demo). */
export const TRIPO_FEE_TREASURY = TESTNET.deployerAddress;

export type TxResult<T> = {
  tx: Transaction;
  handles: T;
  metadata: { target: string; expectedEvents: string[] };
};

export interface LicenseTermsInput {
  policy: number;
  derivativeMintFee: bigint;
  derivativeRoyaltyBps: number; // u16; ≤3000 (D-004)
  commercialUse: boolean;
  requireAttribution: boolean;
}

export interface PayForApiCallArgs {
  /** Fee in MIST. Defaults to TRIPO_FEE_MIST. */
  feeMist?: bigint;
  /** Treasury address. Defaults to TRIPO_FEE_TREASURY. */
  treasury?: string;
}

export interface PublishArgs {
  /** Walrus Blob object id (from useWalrusUpload) — consumed by `publish`. */
  blobObjectId: string;
  shapeType: string;
  paramsJson: string;
  name: string;
  tags: string[];
  lineageBlobId: string;
  /** Standalone Walrus blob id of the GLB (D-037) — resolved via /v1/blobs/<id>. */
  glbBlobId: string;
  /**
   * plan-013 — per-part semantic labels for a segmented-mesh base (Tripo
   * `mesh_segmentation` output). One entry per material/node index in GLB
   * order. Empty array is the legacy single-material sentinel (upload mode
   * and pre-v8 bases); the Move bounds tolerate `length 0`.
   */
  partLabels: string[];
  license: LicenseTermsInput;
}

/**
 * D-075 — args for an ENCRYPTED publish (ALLOW_LIST / RESTRICTED). Adds the Seal
 * envelope fields over PublishArgs. `is_encrypted` is NOT passed (the contract
 * derives it from policy); the policy lives in `license.policy` and MUST be
 * non-PERMISSIONLESS or `publish_encrypted` aborts (ENotEncryptedPolicy).
 */
export interface EncryptedPublishArgs extends PublishArgs {
  /** The Seal-wrapped AES key (EncryptedObject bytes from envelope.encryptBase). */
  sealedKey: Uint8Array;
  /** The client's random Seal-identity prefix (recorded + uniqueness-checked on-chain). */
  sealId: Uint8Array;
  /** Public preview-still Walrus blob ids (ALLOW_LIST only; [] for RESTRICTED). */
  previewBlobIds: string[];
}

/**
 * Build the Tripo service-fee payment: split the exact fee from gas and
 * transfer it to the treasury. The user only signs; amount + destination are
 * fixed by the builder (D-034 Approach A — no user-error surface). The wallet
 * returns the digest the backend verifies before calling Tripo.
 */
export function buildPayForApiCallPtb(
  args: PayForApiCallArgs = {},
): TxResult<Record<string, never>> {
  const feeMist = args.feeMist ?? TRIPO_FEE_MIST;
  const treasury = args.treasury ?? TRIPO_FEE_TREASURY;
  const tx = new Transaction();
  const [fee] = tx.splitCoins(tx.gas, [tx.pure.u64(feeMist)]);
  tx.transferObjects([fee!], tx.pure.address(treasury));
  return {
    tx,
    handles: {},
    metadata: { target: 'sui::pay::tripo_service_fee', expectedEvents: [] },
  };
}

function attachNewLicenseTerms(tx: Transaction, license: LicenseTermsInput): TransactionResult {
  return tx.moveCall({
    target: `${PKG}::model3d::new_license_terms`,
    arguments: [
      tx.pure.u8(license.policy),
      tx.pure.u64(license.derivativeMintFee),
      tx.pure.u16(license.derivativeRoyaltyBps),
      tx.pure.bool(license.commercialUse),
      tx.pure.bool(license.requireAttribution),
    ],
  });
}

/**
 * Build the `model3d::publish` PTB — the UNENCRYPTED (PERMISSIONLESS) path.
 * Constructs LicenseTerms on-chain then publishes the Model3D as a SHARED object
 * (one wallet popup; D-032). `is_encrypted` is derived on-chain from policy
 * (D-075), so it is no longer a PTB argument. Passing a non-PERMISSIONLESS
 * license here aborts (ESealFieldsInconsistent) — use buildPublishEncryptedPtb.
 */
export function buildPublishPtb(args: PublishArgs): TxResult<{ licenseHandle: TransactionResult }> {
  const tx = new Transaction();
  const licenseHandle = attachNewLicenseTerms(tx, args.license);
  tx.moveCall({
    target: `${PKG}::model3d::publish`,
    arguments: [
      tx.object(args.blobObjectId),
      tx.pure.string(args.shapeType),
      tx.pure.string(args.paramsJson),
      tx.pure.string(args.name),
      tx.pure.vector('string', args.tags),
      tx.pure.string(args.lineageBlobId),
      tx.pure.string(args.glbBlobId),
      tx.pure.vector('string', args.partLabels),
      licenseHandle,
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return {
    tx,
    handles: { licenseHandle },
    metadata: {
      target: `${PKG}::model3d::publish`,
      expectedEvents: [`${PKG}::model3d::ModelPublished`],
    },
  };
}

/**
 * D-075 — build the `model3d::publish_encrypted` PTB for an ENCRYPTED
 * (ALLOW_LIST / RESTRICTED) base. Same one-popup shape as `publish`, plus the
 * shared `SealIdRegistry` (asserts the seal_id is globally unique — Resolution G)
 * and the Seal envelope fields. The bytes at `glbBlobId` must be the AES
 * CIPHERTEXT (from envelope.encryptBase), never the plaintext GLB. `sealedKey` /
 * `sealId` are passed as `vector<u8>`.
 */
export function buildPublishEncryptedPtb(
  args: EncryptedPublishArgs,
): TxResult<{ licenseHandle: TransactionResult }> {
  const tx = new Transaction();
  const licenseHandle = attachNewLicenseTerms(tx, args.license);
  tx.moveCall({
    target: `${PKG}::model3d::publish_encrypted`,
    arguments: [
      tx.object(SEAL_ID_REGISTRY_ID),
      tx.object(args.blobObjectId),
      tx.pure.string(args.shapeType),
      tx.pure.string(args.paramsJson),
      tx.pure.string(args.name),
      tx.pure.vector('string', args.tags),
      tx.pure.string(args.lineageBlobId),
      tx.pure.string(args.glbBlobId),
      tx.pure.vector('string', args.partLabels),
      tx.pure.vector('u8', Array.from(args.sealedKey)),
      tx.pure.vector('u8', Array.from(args.sealId)),
      tx.pure.vector('string', args.previewBlobIds),
      licenseHandle,
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return {
    tx,
    handles: { licenseHandle },
    metadata: {
      target: `${PKG}::model3d::publish_encrypted`,
      expectedEvents: [`${PKG}::model3d::ModelPublished`],
    },
  };
}
