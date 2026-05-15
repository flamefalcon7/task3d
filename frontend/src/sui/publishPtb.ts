import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

// MODEL3D_PACKAGE_ID — testnet deploy lands later; '0x0' is a code-complete
// placeholder so the PTB builder & tests compile until VITE_MODEL3D_PACKAGE_ID
// is wired up.
export const MODEL3D_PACKAGE_ID =
  (import.meta.env.VITE_MODEL3D_PACKAGE_ID as string) || '0x0';

export interface LicenseTermsInput {
  policy: number; // 0 RESTRICTED | 1 ALLOW_LIST | 2 PERMISSIONLESS
  derivativeMintFee: bigint;
  derivativeRoyaltyBps: number; // u16; ≤3000 (D-004)
  commercialUse: boolean;
  requireAttribution: boolean;
}

export const DEFAULT_LICENSE: LicenseTermsInput = {
  policy: 2,
  derivativeMintFee: 0n,
  derivativeRoyaltyBps: 1000,
  commercialUse: true,
  requireAttribution: false,
};

// BCS schema matching spec §2.8 LicenseTerms field order.
const LicenseTermsBcs = bcs.struct('LicenseTerms', {
  policy: bcs.u8(),
  derivative_mint_fee: bcs.u64(),
  derivative_royalty_bps: bcs.u16(),
  commercial_use: bcs.bool(),
  require_attribution: bcs.bool(),
});

export function encodeLicenseTerms(l: LicenseTermsInput): Uint8Array {
  return LicenseTermsBcs.serialize({
    policy: l.policy,
    derivative_mint_fee: l.derivativeMintFee,
    derivative_royalty_bps: l.derivativeRoyaltyBps,
    commercial_use: l.commercialUse,
    require_attribution: l.requireAttribution,
  }).toBytes();
}

export interface BuildPublishPtbInput {
  blobObjectId: string; // Walrus Blob object ID
  shapeType: string;
  paramsJson: string;
  name: string;
  tags: string[];
  lineageBlobId: string; // string form per D-015
  directAccessPrice: bigint;
  isEncrypted: boolean; // Phase 2 always false
  license: LicenseTermsInput;
}

export function buildPublishPtb(input: BuildPublishPtbInput): Transaction {
  const tx = new Transaction();
  const licenseBytes = encodeLicenseTerms(input.license);
  tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::publish_and_share`,
    arguments: [
      tx.object(input.blobObjectId),
      tx.pure.string(input.shapeType),
      tx.pure.string(input.paramsJson),
      tx.pure.string(input.name),
      tx.pure.vector('string', input.tags),
      tx.pure.string(input.lineageBlobId),
      tx.pure.u64(input.directAccessPrice),
      tx.pure.bool(input.isEncrypted),
      tx.pure.vector('u8', Array.from(licenseBytes)),
      tx.object('0x6'),
    ],
  });
  return tx;
}
