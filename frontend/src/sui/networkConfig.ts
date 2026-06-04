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
// v12 (security audit remediation D-085/D-086/D-087): fresh republish of v11.
// Tightens on-chain validation — D-085 fixed 32-byte seal_id, D-086 mint_tokens
// quilt write-once, D-087 policy whitelist + no self-registration/self-purchase.
// Mechanically upgrade-compatible, BUT per contracts/UPGRADE.md v7/D-040 a
// DENY-tightening change must be a FRESH republish: a compatible upgrade leaves
// the old package id callable, so a crafted PTB against it would bypass the new
// asserts. VERSION still 2 (seal gate semantics unchanged). Re-bootstrapped a
// fresh TransferPolicy<NftToken> (royalty rule only). Supersedes v11 0x1cf8aa4d…
// (abandoned on testnet).
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0xbf0affb8d02ab9133ebe308cef7e163a6ea0010f823123481720773ff32802d1',
  publisherId:
    '0x0e23f9126e154da89039d64edbf2ae5fe8e394fbd743fda1f17f218691c36c9c',
  transferPolicyId:
    '0x8f7ef10d646e64494ce4463f7567d6de8cf9fcb6af43b5f61d4e78dae5ac1317',
  transferPolicyCapId:
    '0xe8a9586a6b1337ed0fccea3c3018fff8a075f05ff366029deb7ef81f8f2f17d2',
  deployerAddress:
    '0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed',
  // Resolved at U5/U17 by reading the deployed TransferPolicy's rules — the
  // royalty rule TypeName lives under this one published kiosk-apps package
  // address (unchanged from v2/v3). This is NOT the @mysten/kiosk SDK default.
  kioskAppsPackageId:
    '0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d',
  // D-075 — the shared SealIdRegistry freshly created in the v12 `init`
  // (publish digest 9gzrkk2s…). The encrypted publish/forge PTBs read this
  // for the seal_id global-uniqueness assert (Resolution G).
  sealIdRegistryId:
    '0x048e36ee5e3d4a4f7dd76db394891ccecf51fde8f928269a8a486aa58254e850',
} as const;

// Public testnet RPC endpoints. Primary + 1 fallback per U5 spec.
export const TESTNET_RPC_ENDPOINTS = [
  'https://fullnode.testnet.sui.io:443',
  'https://sui-testnet.public.blastapi.io',
] as const;
