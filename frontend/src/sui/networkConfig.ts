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

// v4 (D-035/D-036): fresh republish of v3. Model3D is still a shared object;
// the only TransferPolicy is for NftToken, and it now carries ONLY the royalty
// rule (D-036 removed lock + personal_kiosk). mint_nft_token yields a plain
// owned token; listing is a separate opt-in Kiosk PTB. `transferPolicyId`/
// `transferPolicyCapId` hold the NftToken policy (generic field names kept for
// config stability). Supersedes v3 0x35ba17b3….
export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0x3b6b7258831f43ad926d3f961b6a77edbce7c5845262c5dfb7d783147158eb03',
  publisherId:
    '0x09f80e91d766bfe71a0a6288e9aeab0c4e0929d60dee5c851a8e2b867dccce5e',
  transferPolicyId:
    '0x9607bcf10be57e99269f6dab4e4e3b5e9aa0527066d5ea14a7985d7ddd6f0342',
  transferPolicyCapId:
    '0x85de8533f4279f56c889d72c952864c73eb471719818856e3005331a475d49ff',
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
