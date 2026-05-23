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

// v8 (plan-013 U1): fresh republish of v7. Adds `part_labels: vector<String>`
// to the Model3D `key` struct (and to the ModelPublished event payload) for
// per-part semantic tagging of segmented base GLBs (Tripo mesh_segmentation
// output). The `publish` and `new_model` entry-fn signatures gain a
// `part_labels` parameter, threaded through `validate_publish_inputs` with
// new bounds (MAX_PARTS=64, MAX_TAG_LEN carry-forward) and abort codes
// (ETooManyParts=39, EPartLabelTooLong=40).
//
// Shipped as a FRESH republish (not a compatible `sui client upgrade`):
// adding a field to an existing `key` struct mutates on-chain layout —
// incompatible per Sui upgrade rules. The entry-fn signature change is
// independently breaking. Consistent with the v3–v7 republish precedent.
// Re-bootstrapped a fresh TransferPolicy<NftToken> (royalty rule only,
// D-036 carry-forward).
//
// Everything else carries over from v7: L1 license-policy enforcement
// (D-040); Model3D shared object w/ glb_blob_id (D-037); mint yields a
// plain owned token; listing is a separate opt-in Kiosk PTB.
// `transferPolicyId`/`transferPolicyCapId` hold the NftToken policy.
// Supersedes v7 0x3f53506b… (abandoned on testnet).
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0x9e673aa768928a5bd8f5e4e1c1538b3bffd8a0f8e0cd7b2cba6939b796ff892c',
  publisherId:
    '0xd966383845ae5835a70b192270460235d6c8eff3c89e66d631baaaeb301642ec',
  transferPolicyId:
    '0x308fc8932a6587acb55a51cf89728ed4abaedb690daa8e9e05da21cb1566fe49',
  transferPolicyCapId:
    '0x46ed256d43192ab5a216c1e72804a4021de2ddf6bed17fa237a94171152db052',
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
