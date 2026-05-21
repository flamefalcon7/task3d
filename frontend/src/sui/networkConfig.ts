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

// v6 (D-038): fresh republish of v5. Adds the batch entry fn
// `launch_collection_with_tokens` (one-signature launch + set_register_fee +
// mint-N + share + transfer cap); existing public signatures + struct layouts
// are unchanged (purely additive — would qualify for a compatible upgrade, but
// shipped fresh for consistency per D-038). Everything else carries over from
// v5: Model3D is a shared object carrying glb_blob_id (D-037); the only
// TransferPolicy is for NftToken and carries ONLY the royalty rule (D-036);
// mint yields a plain owned token; listing is a separate opt-in Kiosk PTB.
// `transferPolicyId`/`transferPolicyCapId` hold the NftToken policy (generic
// field names kept for config stability). Supersedes v5 0xe0d65c4a….
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0x57e20a134282476a8b338e85258790ab93f8c9b194bed6fa6120561787af4094',
  publisherId:
    '0x73ccb3d9619df33e365362b66020ca2608c94949d07735212c7e53935930e549',
  transferPolicyId:
    '0x0e3981e915fd3413b3a62ff6055bf80d67fc8c3e6b80fd437aade5463ffa2386',
  transferPolicyCapId:
    '0x8f049a6ec488bc39df1c1920376b766ba8b13db3cc64a41f4fcf7930f801aabc',
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
