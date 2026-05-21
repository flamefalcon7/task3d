// plan-007 U5 — frontend-local view of contracts/networks/testnet.json.
//
// Why duplicate the values instead of importing the JSON?
// The frontend's tsconfig.app.json has `include: ["src"]`. The canonical
// artifact file at `../../contracts/networks/testnet.json` is OUTSIDE src/,
// so direct JSON import would either be skipped by `tsc -b` or require a
// rootDir relaxation that we don't want to make casually. This wrapper:
//
//   1. is the SINGLE place in the frontend where deployed package addresses
//      are pinned — every Phase 4 PTB builder reads from here;
//   2. is kept in lockstep with the canonical JSON manually. If
//      contracts/networks/testnet.json changes, update this file in the
//      same commit. The parity test in `networkConfig.test.ts` imports
//      the JSON via vitest's Vite resolver and asserts every field
//      mirrors the canonical value — drift fails the test loudly.
//
// Per docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md:
// the kiosk_apps_package_id is CRITICAL — it's the address our deployed
// TransferPolicy resolved when published with apps@7a07937... and differs
// from the @mysten/kiosk SDK's testnet-defaults constants. Frontend MUST
// use OUR pinned value or `confirm_request` fails the rule membership check.

// v7 (D-040): fresh republish of v6. Adds L1 license-policy ENFORCEMENT — a new
// `EPolicyRestricted = 38` abort + an assert in `launch_collection_internal` so
// a RESTRICTED (or ALLOW_LIST, which collapses to creator-only in v1) base model
// can only be forked by its creator; PERMISSIONLESS stays open to any payer.
//
// Shipped as a FRESH republish (not a compatible `sui client upgrade`): a
// compatible upgrade leaves the prior, UNENFORCED package version permanently
// callable (a hand-crafted PTB targeting the old id bypasses the gate). A fresh
// republish has no prior version of itself, so enforcement holds for ALL content
// under this package id — and it keeps a single package id (no published-at /
// original-id split). Consistent with the v3–v6 republish precedent (D-038).
// Re-bootstrapped a fresh TransferPolicy<NftToken> (royalty rule only, D-036).
//
// Everything else carries over from v6: Model3D is a shared object carrying
// glb_blob_id (D-037); mint yields a plain owned token; listing is a separate
// opt-in Kiosk PTB. `transferPolicyId`/`transferPolicyCapId` hold the NftToken
// policy. Supersedes v6 0x57e20a13… (abandoned on testnet).
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0x3f53506b076bb9e43fbf8fc1333375530aeb97ad54e2ad81fdd36a9d595d0861',
  publisherId:
    '0xee62b4643aaa22db193d8044748df0a05a70b6769c13f2ec509ae0c71457ad03',
  transferPolicyId:
    '0x3ffa22b3472adcc89c7b9d11749d8b17ae0ced2dddfda38e191dc846d2bb2146',
  transferPolicyCapId:
    '0x76cc696054ce4475989a750c12b1775796e5872137df27f003900382201cf48b',
  deployerAddress:
    '0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed',
  // Resolved at U5/U17 by reading the deployed TransferPolicy's rules — the
  // royalty rule TypeName lives under this one published kiosk-apps package
  // address (unchanged from v2/v3). This is NOT the @mysten/kiosk SDK default.
  kioskAppsPackageId:
    '0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d',
} as const;

// Public testnet RPC endpoints. Primary + 1 fallback per U5 spec.
export const TESTNET_RPC_ENDPOINTS = [
  'https://fullnode.testnet.sui.io:443',
  'https://sui-testnet.public.blastapi.io',
] as const;
