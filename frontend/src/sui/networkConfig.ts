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
// v11 (plan-027 follow-up): fresh republish of v10. Lets the base CREATOR launch
// their OWN ALLOW_LIST base without buying an entitlement (relaxes the
// launch_collection/_with_tokens ALLOW_LIST rejection to allow sender==creator);
// non-creators still require the entitlement path. Otherwise identical to v10
// (purchase_access + AccessEntitlement + seal_approve_entitlement; VERSION still 2,
// seal gate unchanged). Re-bootstrapped a fresh TransferPolicy<NftToken>.
// Supersedes v10 0x01baf4fc… (abandoned on testnet).
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0x1cf8aa4d81788469a5ccfe8f6e119872c2afa7840b02f76013273421c90b3b6a',
  publisherId:
    '0x4fd038cd98f98e7ef566ef3d44cc8687794abc439b95210831594c28619d9eb7',
  transferPolicyId:
    '0x2e35d5bf67021c61f84361abfd890e08753c6928c61f69970a388454a9b22c6a',
  transferPolicyCapId:
    '0xa0040ab6ba1177e4fecb116a689da6389214c73d93f069a00a9c3c40efe69d19',
  deployerAddress:
    '0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed',
  // Resolved at U5/U17 by reading the deployed TransferPolicy's rules — the
  // royalty rule TypeName lives under this one published kiosk-apps package
  // address (unchanged from v2/v3). This is NOT the @mysten/kiosk SDK default.
  kioskAppsPackageId:
    '0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d',
  // D-075 — the shared SealIdRegistry bootstrapped in the v11 `init`
  // (publish digest 4B8Nv5NF…). The encrypted publish/forge PTBs read this
  // for the seal_id global-uniqueness assert (Resolution G).
  sealIdRegistryId:
    '0xb303ecb4506a5fb532395e94ad0f6aa01c9ac543467ac73f19a5230cfd4a69a8',
} as const;

// Public testnet RPC endpoints. Primary + 1 fallback per U5 spec.
export const TESTNET_RPC_ENDPOINTS = [
  'https://fullnode.testnet.sui.io:443',
  'https://sui-testnet.public.blastapi.io',
] as const;
