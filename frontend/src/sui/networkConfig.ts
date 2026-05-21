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

// v5 (D-037): fresh republish of v4. Model3D gained `glb_blob_id` (standalone
// Walrus blob, resolved via /v1/blobs/<glb_blob_id>) — adding a field to a
// `key` struct is not in-place upgradeable, hence the fresh package. Everything
// else carries over from v4: Model3D is a shared object; the only TransferPolicy
// is for NftToken and carries ONLY the royalty rule (D-036 removed lock +
// personal_kiosk); mint_nft_token yields a plain owned token; listing is a
// separate opt-in Kiosk PTB. `transferPolicyId`/`transferPolicyCapId` hold the
// NftToken policy (generic field names kept for config stability). Supersedes
// v4 0x3b6b7258….
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0xe0d65c4a48c9f0b52251a5e6d97bfcec09fbd94c6b0d342c1057a019ec05309b',
  publisherId:
    '0xcd1943f44e7cb029161b0a81be678a5a909c84287ee686bc1e7278e1c113b671',
  transferPolicyId:
    '0xd7677bb04c32f43f3064c3c2e5e95c9e66bc09da63c3bb7f526ca2538b4774e8',
  transferPolicyCapId:
    '0xb09e9a2ebee8bd75be36a48243c95a24698581aca73ecc35c74632ba695cae35',
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
