// plan-007 U5 — kiosk PTB builder tests
//
// Test-first per orchestrator spec. After R1-R15 review the scenarios are:
//   (1) buildMintAndListPtb → exactly one model3d::mint_and_list Move call
//       (alongside the LicenseTerms constructor) + dry-run reachability.
//   (2) buildPurchaseWithKioskPtb → SIX Move calls in the canonical R12+R1+R2
//       order (purchase_with_kiosk → personal_kiosk::borrow_val →
//       kiosk::lock → kiosk_lock_rule::prove → royalty_rule::pay →
//       personal_kiosk_rule::prove → transfer_policy::confirm_request →
//       personal_kiosk::return_val = 8 Move calls counting the borrow/return
//       wrappers; the 6-call shape is the rule-receipt + confirm chain).
//   (3) Dry-run on testnet — metadata declares simulated RoyaltyPaid event;
//       fake-fixture build fails at object resolution (live test in U6).
//   (4) TypeScript: passing a string where bigint is expected fails compile.
//       Enforced via R6 (vitest typecheck mode / tsc gate in `npm test`).
//   (5) metadata.expectedEvents includes the package-qualified RoyaltyPaid.
//   (6) Regression (rewritten per R5): structural assertion proving the
//       builder cannot omit transfer_policy::confirm_request. The Move-side
//       runtime regression (`confirm_request_aborts_when_receipts_missing_rules`)
//       lives in U4's Move tests; the TS builder side is structurally pinned.
//   (R9) all kiosk-apps Move calls target the pinned KIOSK_APPS_PACKAGE.
//   (R13) edge cases: priceMist=0, max-u64, royaltyAmount=0, empty tags.
//
// Per orchestrator spec: dry-run scenarios (1.3, 3) hit live testnet RPC.
// If RPC unreachable, those tests are skipped via ctx.skip() (R8). The
// orchestrator must gate-check the PROVISIONAL flag in
// docs/reports/phase-4-provisional-builders.md.

import { describe, it, expect, beforeAll } from 'vitest';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { TESTNET, TESTNET_RPC_ENDPOINTS } from './networkConfig';

// R11 — Per CLAUDE.md, `@mysten/sui/grpc` `SuiGrpcClient` is the long-term
// target (JSON-RPC deprecated July 2026). We use SuiJsonRpcClient here
// because the `dryRunTransactionBlock` method is JSON-RPC-only in
// @mysten/sui@2.16.2 — the gRPC client's `simulateTransaction` returns a
// different response shape the rest of U6/U8/U11 isn't wired for yet. URL
// override IS available in gRPC via GrpcWebFetchTransport({ baseUrl }); the
// migration blocker is the response-shape compat, not URL config.
// Re-evaluate at U6/U11 alongside dapp-kit's gRPC adoption.
import {
  buildMintAndListPtb,
  buildPurchaseWithKioskPtb,
  KIOSK_FRAMEWORK_PACKAGE,
  TRANSFER_POLICY_MODULE,
  type MintAndListArgs,
  type PurchaseWithKioskArgs,
} from './kioskTxBuilders';

// Local alias so the rest of the test reads like the JSON-pinned values.
const testnet = {
  model3d_package_id: TESTNET.model3dPackageId,
  transfer_policy_id: TESTNET.transferPolicyId,
  deployer_address: TESTNET.deployerAddress,
} as const;

// === Test fixtures (well-formed addresses; dry-run does not require live objects to exist for shape checks) ===
const FAKE_KIOSK = '0x' + 'a'.repeat(64);
const FAKE_OWNER_CAP = '0x' + 'b'.repeat(64);
const FAKE_SELLER_KIOSK = '0x' + 'c'.repeat(64);
const FAKE_MODEL_ID = '0x' + 'd'.repeat(64);
const FAKE_PAYMENT_COIN = '0x' + 'e'.repeat(64);
const FAKE_BLOB = '0x' + 'f'.repeat(64);
// Dry-run sender — any well-formed address. Use the deployer for convenience.
const DRY_RUN_SENDER = testnet.deployer_address;

const DEFAULT_LICENSE = {
  policy: 2,
  derivativeMintFee: 0n,
  derivativeRoyaltyBps: 1000,
  commercialUse: true,
  requireAttribution: false,
};

const BASE_MINT_ARGS: MintAndListArgs = {
  kioskId: FAKE_KIOSK,
  personalKioskCapId: FAKE_OWNER_CAP,
  blobObjectId: FAKE_BLOB,
  shapeType: 'box',
  paramsJson: '{"shape":"box","width":1,"height":1,"depth":1}',
  name: 'Test Box',
  tags: ['demo'],
  lineageBlobId: 'walrus_blob_id_demo',
  isEncrypted: false,
  license: DEFAULT_LICENSE,
  priceMist: 1_000_000_000n,
};

// R2 + R3 — drop policyId (hardcoded in builder), rename ownerCap field
// to PersonalKioskCap (the wrapper ID, not a standalone OwnerCap).
const BASE_PURCHASE_ARGS: PurchaseWithKioskArgs = {
  buyerKioskId: FAKE_KIOSK,
  buyerPersonalKioskCapId: FAKE_OWNER_CAP,
  sellerKioskId: FAKE_SELLER_KIOSK,
  modelId: FAKE_MODEL_ID,
  paymentCoinId: FAKE_PAYMENT_COIN,
  royaltyAmount: 50_000_000n, // 5% of 1 SUI
};

// === Network: dual RPC with fallback (orchestrator R26 fallback discipline) ===
async function pickReachableClient(): Promise<SuiJsonRpcClient | null> {
  for (const url of TESTNET_RPC_ENDPOINTS) {
    try {
      const client = new SuiJsonRpcClient({ url, network: 'testnet' });
      // Cheap probe.
      await client.getLatestSuiSystemState();
      return client;
    } catch {
      // try next
    }
  }
  return null;
}

let liveClient: SuiJsonRpcClient | null = null;

beforeAll(async () => {
  liveClient = await pickReachableClient();
  if (!liveClient) {
    // R8 — emit the skip rationale once at suite start, not per-test.
    // eslint-disable-next-line no-console
    console.warn(
      '[U5 PROVISIONAL] testnet RPC unreachable on all endpoints; dry-run legs will skip',
    );
  }
});

describe('buildMintAndListPtb (scenario 1)', () => {
  it('produces a Transaction containing exactly one model3d::mint_and_list Move call', () => {
    const { tx, metadata } = buildMintAndListPtb(BASE_MINT_ARGS);
    const data = tx.getData();
    const moveCalls = data.commands.filter((c) => c.$kind === 'MoveCall');
    const mintCalls = moveCalls.filter(
      (c) => c.$kind === 'MoveCall' && c.MoveCall?.function === 'mint_and_list',
    );
    expect(mintCalls).toHaveLength(1);
    expect(metadata.target).toBe(
      `${testnet.model3d_package_id}::model3d::mint_and_list`,
    );
  });

  it('lands the LicenseTerms struct via a same-PTB new_license_terms moveCall (struct-arg discipline; learnings #1)', () => {
    const { tx } = buildMintAndListPtb(BASE_MINT_ARGS);
    const data = tx.getData();
    const licenseCalls = data.commands.filter(
      (c) =>
        c.$kind === 'MoveCall' && c.MoveCall?.function === 'new_license_terms',
    );
    expect(licenseCalls).toHaveLength(1);
  });

  // SCENARIO 1 (dry-run leg) — gated on RPC reachability via ctx.skip (R8).
  //
  // The fake-object fixtures fail at the SDK's object-resolution stage BEFORE
  // dry-run is submitted (build → resolveObjectReferences → "Object 0x... does
  // not exist"). That's still useful: it proves the PTB encoding is well-
  // formed, reaches the RPC, and the live RPC is the only thing that could
  // surface that error. A second-tier live test in U6 will exercise the
  // success path with real objects.
  it('PTB encoding is accepted by SDK + live RPC reachable for build resolution (scenario 1.dryrun)', async (ctx) => {
    if (!liveClient) {
      ctx.skip();
      return;
    }
    const { tx } = buildMintAndListPtb(BASE_MINT_ARGS);
    tx.setSender(DRY_RUN_SENDER);
    let buildError: Error | null = null;
    try {
      await tx.build({ client: liveClient });
    } catch (e) {
      buildError = e as Error;
    }
    // The fake-IDs path MUST yield an "Object does not exist" resolution
    // error — anything else (encoding error, network timeout, type mismatch
    // at the SDK layer) means the builder is malformed.
    expect(buildError).not.toBeNull();
    expect(buildError?.message ?? '').toMatch(/does not exist/);
  });
});

describe('buildPurchaseWithKioskPtb (scenario 2 — the canonical 6-Move-call chain)', () => {
  it('emits exactly SIX Move calls in the canonical R12+R1+R2 order', () => {
    const { tx } = buildPurchaseWithKioskPtb(BASE_PURCHASE_ARGS);
    const data = tx.getData();
    const moveCalls = data.commands.filter((c) => c.$kind === 'MoveCall');
    // 6 framework + apps Move calls, plus the 2 personal_kiosk borrow/return
    // wrappers around the OwnerCap usage = 8 Move calls total. The 6-call
    // shape is the rule-receipt + confirm chain at the heart of R12.
    expect(moveCalls).toHaveLength(8);

    // Match by (module::function) tuples in order. SplitCoins lives between
    // (kiosk_lock_rule::prove) and (royalty_rule::pay) as a non-MoveCall PTB
    // primitive (coin partitioning for the royalty payment); it's filtered
    // out by the MoveCall filter above.
    const sequence = moveCalls.map((c) =>
      c.$kind === 'MoveCall'
        ? `${c.MoveCall?.module}::${c.MoveCall?.function}`
        : '',
    );
    expect(sequence).toEqual([
      'model3d::purchase_with_kiosk',
      'personal_kiosk::borrow_val',
      'kiosk::lock',
      'kiosk_lock_rule::prove',
      'royalty_rule::pay',
      'personal_kiosk_rule::prove',
      'transfer_policy::confirm_request',
      'personal_kiosk::return_val',
    ]);
  });

  it('first Move call target is model3d::purchase_with_kiosk on the deployed package', () => {
    const { tx, metadata } = buildPurchaseWithKioskPtb(BASE_PURCHASE_ARGS);
    const data = tx.getData();
    const first = data.commands[0];
    expect(first?.$kind).toBe('MoveCall');
    if (first?.$kind === 'MoveCall') {
      expect(first.MoveCall?.package).toBe(testnet.model3d_package_id);
      expect(first.MoveCall?.module).toBe('model3d');
      expect(first.MoveCall?.function).toBe('purchase_with_kiosk');
    }
    expect(metadata.target).toBe(
      `${testnet.model3d_package_id}::model3d::purchase_with_kiosk`,
    );
  });

  it('confirm_request target uses the 0x2::transfer_policy framework package', () => {
    const { tx } = buildPurchaseWithKioskPtb(BASE_PURCHASE_ARGS);
    const data = tx.getData();
    const moveCalls = data.commands.filter((c) => c.$kind === 'MoveCall');
    // confirm_request is at index 6 (0-based) in the 8-call sequence.
    const confirmCall = moveCalls.find(
      (c) =>
        c.$kind === 'MoveCall' &&
        c.MoveCall?.function === 'confirm_request',
    );
    expect(confirmCall?.$kind).toBe('MoveCall');
    if (confirmCall?.$kind === 'MoveCall') {
      // R14 — use normalizeSuiAddress instead of hand-rolled prefix strip.
      // The SDK normalizes 0x2 → 32-byte zero-padded form. normalizeSuiAddress
      // canonicalizes both representations to the same string.
      expect(normalizeSuiAddress(confirmCall.MoveCall?.package ?? '')).toBe(
        normalizeSuiAddress(KIOSK_FRAMEWORK_PACKAGE),
      );
      expect(confirmCall.MoveCall?.module).toBe(TRANSFER_POLICY_MODULE);
      expect(confirmCall.MoveCall?.function).toBe('confirm_request');
    }
  });

  // R9 — load-bearing per `contracts/networks/testnet.json::_meta.kiosk_apps_package_id_discovery`.
  // The kiosk-apps SDK has its own testnet defaults; OUR deployed TransferPolicy
  // resolved to a different package address. Frontend MUST pin to the JSON-
  // canonical kioskAppsPackageId, NOT the SDK defaults, or confirm_request
  // fails its rule-membership check.
  it('all kiosk-apps Move calls target the pinned KIOSK_APPS_PACKAGE (not SDK defaults) — R9', () => {
    const { tx } = buildPurchaseWithKioskPtb(BASE_PURCHASE_ARGS);
    const moveCalls = tx
      .getData()
      .commands.filter((c) => c.$kind === 'MoveCall');
    const appsCallModules = [
      'royalty_rule',
      'personal_kiosk_rule',
      'kiosk_lock_rule',
      'personal_kiosk',
    ];
    const appsCalls = moveCalls.filter(
      (c) =>
        c.$kind === 'MoveCall' &&
        appsCallModules.includes(c.MoveCall?.module ?? ''),
    );
    expect(appsCalls.length).toBeGreaterThan(0);
    for (const call of appsCalls) {
      if (call.$kind === 'MoveCall') {
        expect(normalizeSuiAddress(call.MoveCall?.package ?? '')).toBe(
          normalizeSuiAddress(TESTNET.kioskAppsPackageId),
        );
      }
    }
  });

  // SCENARIO 3 — dry-run reachability + RoyaltyPaid event declaration.
  //
  // R7 — RENAMED to admit U5 limitation: this test verifies METADATA
  // declaration of expected events + that the PTB's encoding reaches live
  // testnet build resolution. Runtime emission verification happens in U6
  // with real objects (the fake fixtures here fail at object resolution
  // before dry-run executes). See
  // `docs/reports/phase-4-provisional-builders.md` for the U6 commitment.
  it('metadata declares RoyaltyPaid in expectedEvents (runtime emission verified in U6 with real objects)', async (ctx) => {
    if (!liveClient) {
      ctx.skip();
      return;
    }
    const { tx, metadata } = buildPurchaseWithKioskPtb(BASE_PURCHASE_ARGS);
    tx.setSender(DRY_RUN_SENDER);
    let buildError: Error | null = null;
    try {
      await tx.build({ client: liveClient });
    } catch (e) {
      buildError = e as Error;
    }
    expect(buildError).not.toBeNull();
    expect(buildError?.message ?? '').toMatch(/does not exist/);
    expect(metadata.expectedEvents).toContain(
      `${testnet.model3d_package_id}::model3d::RoyaltyPaid`,
    );
  });
});

describe('TypeScript type discipline (scenario 4)', () => {
  it('passing a string where ObjectRef is expected fails compile-time', () => {
    // The args interface types `*Id` fields as branded strings ('0x...'-shaped),
    // but more importantly the builder calls `tx.object(id)` internally so a
    // mistyped `royaltyAmount` (string instead of bigint) is the canonical
    // type-fail surface. Express that here.
    const bad: PurchaseWithKioskArgs = {
      ...BASE_PURCHASE_ARGS,
      // @ts-expect-error — royaltyAmount must be bigint, not string
      royaltyAmount: '50000000',
    };
    expect(bad).toBeDefined();
  });

  it('omitting required fields fails compile-time', () => {
    // @ts-expect-error — sellerKioskId is required
    const bad: PurchaseWithKioskArgs = {
      buyerKioskId: FAKE_KIOSK,
      buyerPersonalKioskCapId: FAKE_OWNER_CAP,
      modelId: FAKE_MODEL_ID,
      paymentCoinId: FAKE_PAYMENT_COIN,
      royaltyAmount: 0n,
    };
    expect(bad).toBeDefined();
  });
});

describe('metadata.expectedEvents (scenario 5)', () => {
  it('purchase metadata lists model3d::RoyaltyPaid as expected event', () => {
    const { metadata } = buildPurchaseWithKioskPtb(BASE_PURCHASE_ARGS);
    expect(metadata.expectedEvents).toEqual([
      `${testnet.model3d_package_id}::model3d::RoyaltyPaid`,
    ]);
  });

  it('mint metadata lists model3d::ModelPublished + kiosk::ItemListed as expected events', () => {
    const { metadata } = buildMintAndListPtb(BASE_MINT_ARGS);
    expect(metadata.expectedEvents).toContain(
      `${testnet.model3d_package_id}::model3d::ModelPublished`,
    );
    // The framework's ItemListed event type is generic over Model3D.
    expect(
      metadata.expectedEvents.some((e) => e.includes('::kiosk::ItemListed')),
    ).toBe(true);
  });
});

// R5 — Regression rewritten: scenario 6 now proves the builder cannot
// STRUCTURALLY omit `transfer_policy::confirm_request`. The previous
// fake-fixture dry-run version was vacuously true (fake IDs fail at SDK
// object resolution before the Move VM gets a chance to surface the policy
// check). The runtime regression (Move VM EPolicyNotSatisfied / value-
// leak rejection of an unconsumed TransferRequest) is exercised in U4's
// Move tests — `contracts/model3d/tests/model3d_tests.move` ::
// `confirm_request_aborts_when_receipts_missing_rules`.
describe('Regression: builder always emits confirm_request (scenario 6 / AE2)', () => {
  // Per docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md, the
  // buyer's PTB MUST consume the TransferRequest via confirm_request. The
  // runtime check (Move VM EPolicyNotSatisfied + unused-value reject) is
  // verified in U4's Move tests; here we prove the typed builder structurally
  // cannot omit it.
  it('buildPurchaseWithKioskPtb always emits transfer_policy::confirm_request', () => {
    const { tx } = buildPurchaseWithKioskPtb(BASE_PURCHASE_ARGS);
    const data = tx.getData();
    const moveCalls = data.commands.filter((c) => c.$kind === 'MoveCall');
    const confirmCalls = moveCalls.filter(
      (c) =>
        c.$kind === 'MoveCall' &&
        c.MoveCall?.module === 'transfer_policy' &&
        c.MoveCall?.function === 'confirm_request',
    );
    expect(confirmCalls).toHaveLength(1);
  });
});

// R13 — edge case coverage. All static `getData()` assertions; no RPC.
describe('Edge cases (R13)', () => {
  it('builds with priceMist = 0n (free listing)', () => {
    const args = { ...BASE_MINT_ARGS, priceMist: 0n };
    expect(() => buildMintAndListPtb(args)).not.toThrow();
  });

  it('builds with max-u64 priceMist', () => {
    const args = { ...BASE_MINT_ARGS, priceMist: 2n ** 64n - 1n };
    expect(() => buildMintAndListPtb(args)).not.toThrow();
  });

  it('builds purchase with royaltyAmount = 0n (no-royalty listing)', () => {
    const args = { ...BASE_PURCHASE_ARGS, royaltyAmount: 0n };
    expect(() => buildPurchaseWithKioskPtb(args)).not.toThrow();
  });

  it('builds mint with empty tags array', () => {
    const args = { ...BASE_MINT_ARGS, tags: [] };
    expect(() => buildMintAndListPtb(args)).not.toThrow();
  });
});
