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

export const TESTNET = {
  network: 'testnet' as const,
  chainId: '4c78adac',
  model3dPackageId:
    '0x563ab54bf9b6e76d6e61a7f0c8be3157e354750e8e435814dfa0b5232f4b0893',
  publisherId:
    '0x740773948b164712f622aabe503545de118dceea132cf165883e97a0a8dbc6f1',
  transferPolicyId:
    '0x198bfe335f7844b117cc1cb3f38e9f99956259bb21bacce07490dc31e7bc3735',
  transferPolicyCapId:
    '0xb673e31b2e03d8e599b51b7e729a4243c136f27c6f1bae8716b955258d6cc906',
  deployerAddress:
    '0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed',
  // Resolved at U5 by reading the deployed TransferPolicy's rules VecSet
  // — all three rule TypeNames live under this one published kiosk-apps
  // package address. This is NOT the @mysten/kiosk SDK's testnet default.
  kioskAppsPackageId:
    '0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d',
} as const;

// Public testnet RPC endpoints. Primary + 1 fallback per U5 spec.
export const TESTNET_RPC_ENDPOINTS = [
  'https://fullnode.testnet.sui.io:443',
  'https://sui-testnet.public.blastapi.io',
] as const;
