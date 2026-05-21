---
title: L1 license policy enforcement (RESTRICTED vs PERMISSIONLESS)
type: feat
status: active
created: 2026-05-21
origin: conversation (post-U14 honesty-gap review)
related_adr: D-040 (to be written at impl start)
---

# L1 license policy enforcement

## Problem

`Model3D.license.policy` (one of RESTRICTED=0 / ALLOW_LIST=1 / PERMISSIONLESS=2)
is **stored but never enforced**. `launch_collection_internal`
(`contracts/model3d/sources/model3d.move:588`) explicitly comments that
`license.policy` is NOT consulted — derivation is gated only by the pay-to-derive
fee. So a creator who picks "restricted" in `/create` gets no protection: anyone
who pays the fork fee can still fork. This contradicts the core pitch
("creators set license terms for composable IP") and is an honesty gap a judge
will catch.

`LicenseTerms` has **no allow-list field** (`policy, derivative_mint_fee,
derivative_royalty_bps, commercial_use, require_attribution`), so ALLOW_LIST
can't be enforced without adding an on-chain address list + UI — out of scope
for v1.

## Decision (proposed D-040)

Collapse L1 policy to **two enforced meanings** for v1:
- **PERMISSIONLESS (2)** — anyone who pays the fork fee may derive (current behavior).
- **RESTRICTED (0)** — only the base model's creator may derive.
- **ALLOW_LIST (1)** — dropped from the UI. On-chain it is treated as
  non-permissionless → creator-only (same as RESTRICTED), so any legacy/odd
  value fails safe. The constant may stay in Move (no struct change) or be
  removed; **keep it** to avoid churn.

Enforcement is a single additive assert in `launch_collection_internal`:
`assert!(policy == PERMISSIONLESS || ctx.sender() == model.creator, EPolicyRestricted)`.

This is **purely additive** (no struct/signature change) → eligible for a
**compatible upgrade** (no fresh republish). The project has historically done
fresh republishes for consistency; decide at impl. A compatible upgrade keeps
the package id stable and avoids re-bootstrapping the TransferPolicy/royalty +
config mirrors, which is the cheaper path now that the four-role loop is live.

## Scope boundaries (non-goals)
- No ALLOW_LIST address-list data structure or UI.
- No change to the pay-to-derive fee mechanics or royalty.
- No change to L2 (`NftCollection.integration_policy` is separate, D-030).

## Implementation Units

### U1. Move — enforce policy in launch_collection
**Goal:** non-permissionless base models can only be forked by their creator.
**Files:** `contracts/model3d/sources/model3d.move` (assert in
`launch_collection_internal`; new abort const `EPolicyRestricted` = next free in
the 30s block — confirm not colliding with 30–37 already used; likely 38 if free,
else next); `contracts/model3d/tests/model3d_tests.move`.
**Approach:** add the assert at the top of `launch_collection_internal` (covers
both `launch_collection` and `launch_collection_with_tokens`, since both route
through it). Read `model.license.policy` + `model.creator`.
**Test scenarios:**
- PERMISSIONLESS base → non-creator forks OK (existing behavior preserved).
- RESTRICTED base → non-creator fork **aborts EPolicyRestricted**.
- RESTRICTED base → creator forks OK.
- ALLOW_LIST(1) base → non-creator aborts (fails safe as creator-only).
**Verification:** `sui move test` green incl. the new abort cases.

### U2. Republish-or-upgrade + config
**Goal:** ship U1 to testnet.
**Approach:** **Preferred: compatible upgrade** (`sui client upgrade` with the
existing UpgradeCap) since U1 is additive — package id stays
`0x57e20a13…`, no TransferPolicy/bootstrap re-do, no config churn. If a fresh
republish is chosen instead, mirror the U21/U17 process (new package id →
`contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` +
`Published.toml` + re-bootstrap policy) and write a `docs/reports/` republish note.
**Verification:** on-chain — a RESTRICTED model fork by a non-creator wallet
aborts; PERMISSIONLESS still forks. Frontend tests + build green.

### U3. /create UI — two policy options
**Goal:** the mint wizard offers **Open (permissionless)** vs **Restricted
(creator-only)** only; copy explains each plainly.
**Files:** `frontend/src/creator/CreateModelPage.tsx` (+ test). Wherever the
policy radio/select is built — drop the ALLOW_LIST option; map Open→2,
Restricted→0. Default = Open (permissionless) to match the marketplace pitch.
**Test scenarios:** selecting Restricted publishes with `policy=0`; Open → `policy=2`;
no ALLOW_LIST option rendered.
**Verification:** tests green; manual — publish one of each, confirm on chain.

## Risks / unknowns
- Confirm the next free abort code (30–37 are used: EIntegrationsClosed=30 …
  EAppMetadataTooLong=33; EBatchLenMismatch=37; check 34–36 / 38).
- Compatible-upgrade path: confirm the UpgradeCap is held by the deployer
  keystore and the package was published with a compatible policy.
- `/create` may currently hardcode a policy or already only offer a subset —
  verify the current control before editing.

## Sequencing
Standalone and small. Do **before** Plan 010 (marketplace) so the republish/upgrade
lands first and the marketplace frontend targets the final package id.
