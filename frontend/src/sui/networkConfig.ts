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
// v10 (plan-027 / D-078): fresh republish of v9. Splits the fork fee into a
// one-time soulbound AccessEntitlement (gates Seal decrypt) + a per-launch
// derive fee; adds `access_fee` to LicenseTerms + a `buyers` Table to the
// Model3D `key` struct (layout-breaking → fresh republish); replaces
// `seal_approve_cap` with `seal_approve_entitlement`; bumps VERSION 1→2.
// Re-bootstrapped a fresh TransferPolicy<NftToken> (royalty rule only).
// Supersedes v9 0xba1e84ba… (abandoned on testnet; VERSION tripwire fails-closed).
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0x01baf4fc457047d6ae6d818063feca20038eb2d878ecae7ec9b0d1dd259cd065',
  publisherId:
    '0xa01e054f754fc2d05f4353eafbb9070a1ba9b551cdffc6dbddf71c6e7282c217',
  transferPolicyId:
    '0xd151395b36ba17f016621a183afc67142b5c218956d296b995bc6623501e9b05',
  transferPolicyCapId:
    '0xfc0198a517df73cffd7418f7efb808bd20dcf7a19e72163402ebede9601f0fc4',
  deployerAddress:
    '0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed',
  // Resolved at U5/U17 by reading the deployed TransferPolicy's rules — the
  // royalty rule TypeName lives under this one published kiosk-apps package
  // address (unchanged from v2/v3). This is NOT the @mysten/kiosk SDK default.
  kioskAppsPackageId:
    '0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d',
  // D-075 — the shared SealIdRegistry bootstrapped in the v10 `init`
  // (publish digest Ckpi288e…). The encrypted publish/forge PTBs read this
  // for the seal_id global-uniqueness assert (Resolution G).
  sealIdRegistryId:
    '0x051c7ec1ed09a5e3cf7e5394643da97c72b4f2ba6254379cb4ff430d66be67c7',
} as const;

// Public testnet RPC endpoints. Primary + 1 fallback per U5 spec.
export const TESTNET_RPC_ENDPOINTS = [
  'https://fullnode.testnet.sui.io:443',
  'https://sui-testnet.public.blastapi.io',
] as const;
