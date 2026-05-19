---
title: "Phase 4 provisional builders — testnet-RPC-outage tracker"
plan: docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md
unit: U5
status: cleared
landed_at: 2026-05-19
---

# Phase 4 provisional builders — testnet-RPC-outage tracker

Implements the F26 fallback gate for plan-007 U5. Records the dry-run state
of every Kiosk PTB builder against live testnet at land-time. If any builder
is unverified (PROVISIONAL), `main` MUST NOT receive the PR until the gate
clears.

## Gate

**No merge to `main` until ALL builders are GREEN on a live testnet dry-run.**

If testnet RPC is unreachable at impl time, the corresponding `it` test
emits a `[U5 PROVISIONAL] testnet RPC unreachable — skipping` console
warning and returns early. The orchestrator's review phase grep-checks for
that string and blocks merge if any are present in the latest test run.

## Dual-RPC fallback

Per `frontend/src/sui/networkConfig.ts`:

```ts
export const TESTNET_RPC_ENDPOINTS = [
  'https://fullnode.testnet.sui.io:443',  // Mysten public
  'https://sui-testnet.public.blastapi.io', // BlastAPI public testnet backup
];
```

The test helper `pickReachableClient()` probes each endpoint sequentially
via `getLatestSuiSystemState()` and returns the first reachable client. If
both fail, `liveClient` is null and the dry-run scenarios skip.

## Builder status table (at U5 land-time, 2026-05-19)

| Builder                       | Last dry-run        | RPC hit                          | Status   | Notes |
|-------------------------------|---------------------|----------------------------------|----------|-------|
| `buildMintAndListPtb`         | 2026-05-19 16:40 PT | `fullnode.testnet.sui.io:443`    | GREEN    | Build resolution reached; fake-fixture `does not exist` is the expected failure mode at U5 (real-object dry-run is U6's job). |
| `buildPurchaseWithKioskPtb`   | 2026-05-19 17:14 PT | `fullnode.testnet.sui.io:443`    | GREEN    | 6-Move-call chain (8 PTB cmds incl. personal_kiosk borrow/return wrappers) emits in canonical R1+R2+R12 order. Same fake-fixture caveat as above. |

Both builders are GREEN at land-time. The PROVISIONAL gate did not fire.
This file is retained for U6/U9 future builders — when a new builder lands,
append a row, re-run dry-run, and update the table.

## How a future builder lands here

1. Add the builder to `frontend/src/sui/kioskTxBuilders.ts` (or a new module).
2. Add tests + a dry-run leg that probes `liveClient`.
3. If `liveClient` is null at test time, change `status` to `PROVISIONAL` in
   the table above + set the document frontmatter `status` to `active`.
4. Block PR merge until the dry-run runs cleanly.

## What "GREEN" means at U5 (limitation note)

The U5 dry-run smoke does NOT verify a complete successful transaction. The
fake object IDs we use (0xa…, 0xb…, etc.) fail at the SDK's object-
resolution stage before the Move VM executes. What we DO verify:

  1. The PTB serializes without SDK errors (no encoding bugs in the typed
     wrapper).
  2. The build process reaches the RPC and gets a typed `does not exist`
     error back (proving the encoding is shape-correct, the RPC is live,
     and the SDK accepts the chain).
  3. The 6-Move-call sequence (8 PTB commands with the personal_kiosk
     borrow/return wrappers) matches the R1+R2+R12 canonical order
     (asserted statically via `tx.getData().commands`).

A full success-path dry-run requires real on-chain objects (a creator's
PersonalKiosk + a listed Model3D + a payment Coin). That work belongs to
U6 (creator flow) and U7 (buyer flow). U5's contract is "the typed wrapper
is structurally correct and reaches the live RPC."

## Cross-references

- `frontend/src/sui/kioskTxBuilders.ts` — the builders.
- `frontend/src/sui/kioskTxBuilders.test.ts` — six test scenarios per plan §U5, plus R9 (kiosk-apps package pin) + R13 (edge cases) added during review.
- `frontend/src/sui/networkConfig.test.ts` — R4 parity test: TESTNET wrapper mirrors canonical JSON.
- `frontend/src/sui/networkConfig.ts` — pinned package addresses + RPC fallback list.
- `contracts/networks/testnet.json` — canonical artifact (frontend mirrors this).
- `docs/solutions/kiosk-ptb-patterns/confirm-request-hot-potato.md` — the R12 doc
  defining the 6-Move-call sequence U5 implements (8 PTB cmds counting the
  personal_kiosk borrow/return wrappers).
