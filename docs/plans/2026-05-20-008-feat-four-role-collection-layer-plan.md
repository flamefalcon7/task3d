---
date: 2026-05-20
type: feat
title: "Phase 4 realignment — four-role NFT collection layer + integration registry (D-029)"
origin: docs/brainstorms/2026-05-19-four-role-product-realignment.md
supersedes: docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md (pending units U6–U14)
status: active
---

# Phase 4 realignment — four-role NFT collection layer + integration registry

## Summary

Reverse D-013 and ship the NFT collection layer as real v1 surface (per **D-029**). A mesh creator publishes a `Model3D` (existing `mint_and_list`, shipped); an nft creator pays-to-derive via `launch_collection` and receives a key-only `NftCollectionCreatorCap` carrying the collection's `register_fee` + integration registry; a gameDev pays the fee to `register_integration` (on-chain B2B attestation, license-gated); a user browses, buys (L1 Model3D **or** L2 collection token, coexisting), and drives the asset. Procedural generation is removed; pay-per-generate is descoped to v1.1 (6/21 Tripo is service-funded); the dead `Access` surface is deleted.

**This plan supersedes plan-007's pending units (U6–U14).** plan-007 U1–U5 (Move v2 Kiosk contract + TransferPolicy + `mint_and_list`/`purchase_with_kiosk` + typed `kioskTxBuilders.ts`) are **shipped** and are the cited foundation. Four still-valid plan-007 units are carried forward by reference (see *Carried Unchanged*); the rest are reworked or replaced below.

**Locked decision (2026-05-20):** the Move delta lands as a **v3 republish** (fresh PackageID), not an in-place upgrade — because physically deleting the public `Access` struct + accessors (R22) breaks compatible-upgrade rules. Republishing now is low-cost: the frontend is not yet migrated and no demo pre-bake exists, so there is no v2 on-chain state to protect.

> **⚠️ D-030 amendment (2026-05-20, post U1–U4 code review).** The integration gate is **collection-level, not a model-license snapshot.** `NftCollection` carries `integration_policy: u8` (set by the nft creator via cap-gated `set_integration_policy`, default `POLICY_PERMISSIONLESS`); the old `base_policy` snapshot field is **removed**. `register_integration` gates on `collection.integration_policy`; abort `ELicenseRestricted` → **`EIntegrationsClosed`**. The base model's `license.policy` is **display/Browse metadata only** — derivation (`launch_collection`) is gated purely by the pay-to-derive fee (a `RESTRICTED` base can still be forked, by design). Wherever this plan says "integration gate = `base_policy`/`license.policy`," read `collection.integration_policy`. The Browse integration filter (U8/U14) reads the **collection's** `integration_policy`, not the model's. See D-030.

> **⚠️ D-032 amendment (2026-05-20, U5 shipped).** Model3D is now a **shared object** sold via `publish` (sells *access*, not ownership); the L1 Kiosk path (`mint_and_list` / `purchase_with_kiosk` / `TransferPolicy<Model3D>` / `RoyaltyPaid`) was **removed**. The package shipped as **v3** (PackageID `0x35ba17b3…`), not "v2". Wherever this plan's body says `mint_and_list`/`purchase_with_kiosk` for L1, read `publish` + `take_shared<Model3D>`. U10 shipped as the `/create` wizard on `publish` (Tripo pay-gate + GLB upload), not a `mint_and_list` rebuild. See D-032.

> **⚠️ D-035 + D-036 amendment (2026-05-20) — triggers a v4 republish; resequences U6/U11/U12; adds U16+U17.** Two accepted ADRs change the L2 surface:
> - **D-035** — `NftCollection` gains `quilt_blob_id: String`; `NftToken` gains `patch_id: String`; `launch_collection` gains a `quilt_blob_id` param; `mint_nft_token` gains a `patch_id` param. Each token binds one on-chain **quilt patch** (a colored variant), reconnecting the Phase-3 quilt + material-swap pipeline (backend `/api/collection/build`, `by-quilt-patch-id` aggregator, `frontend/src/forge/VariantEditor`, `Model3DSummary.patchId`). Resolution: token `getObject` → `patch_id` → aggregator → variant GLB (closes the L2 GLB-blob-id gap; L1 `Model3D` GLB still uses the `?blob=` hatch for the demo).
> - **D-036** — `mint_nft_token` no longer auto-places into Kiosk: it mints a **plain owned `NftToken`** and `public_transfer`s it to the caller (drops `kiosk_obj`/`personal_cap` + `place_and_list`). Listing-for-sale is a separate opt-in Kiosk `place_and_list` PTB. `ensure_collection_policy` keeps **only `royalty_rule`** (removes `kiosk_lock_rule` + `personal_kiosk_rule`) so a Kiosk-bought token can be taken out and used freely — gameDev/`/track`-friendly.
> - **Sequencing:** these Move-struct field additions are not in-place upgradeable → a **v4 fresh republish** (new `U16` Move source delta + `U17` republish, mirroring the U1–U4/U5 shape). **U6** shipped against v3 and needs a delta pass (see its v4-revision note). **U11** and **U12** (both not yet started) are rewritten below against v4. The `confirm_request` hot-potato for any resale/buy PTB now satisfies **only** `royalty_rule`. See D-035, D-036.

---

## Problem Frame

plan-007 was mid-flight (U5 shipped, U6 dispatching) when role coherence broke: two competing mint surfaces existed, procedural generation was being abandoned, and "who uses this and for what" had drifted from D-013's two-actor framing. A realignment brainstorm + 7-persona doc-review surfaced that the register-fee and integration-registry concepts the team wants are inherently **NFT-collection-level**, not base-`Model3D`-level — which only coheres if the collection layer is a real object in v1. D-013 had deferred exactly that. D-029 reverses it.

The agent recorded an explicit **ROI dissent** (D-029 Consequences): this adds unvalidated surface on a tight clock where the 70%-weighted Real-World Application + Product/UX axes reward concreteness and polish. The user chose to build it for a demonstrable composable economy + Sui-native technical depth. This plan foregrounds the **mandatory descope order** (Scope Boundaries) that makes the path survivable.

---

## Foundation: What plan-007 Already Shipped (do not re-implement)

Verified against `contracts/model3d/sources/model3d.move` on 2026-05-20:

- `Model3D has key, store` (line 130); `LicenseTerms { policy, derivative_mint_fee, derivative_royalty_bps, commercial_use, require_attribution }` (118) — **the collection layer reads `license.policy` for the integration gate and `derivative_royalty_bps` for the royalty snapshot; no `Model3D` field change needed.**
- `MODEL3D` OTW + `init` claims `Publisher` (207); `ensure_transfer_policy` (251); `ensure_creator_kiosk` (480); `mint_and_list` entry (509); `purchase_with_kiosk` public fun (595); `RoyaltyPaid` (191); `ModelPublished { …, policy }` (160).
- Policy constants: `POLICY_RESTRICTED = 0`, `POLICY_ALLOW_LIST = 1`, `POLICY_PERMISSIONLESS = 2` (41–43). Abort codes in use: `0, 10–14, 20, 21` — **new codes start at 30** (no collision).
- Frontend typed PTB layer `frontend/src/sui/kioskTxBuilders.ts` (plan-007 U5) with `TxResult<T>` envelope + dry-run-from-day-1 discipline.

**Not yet migrated (this plan owns it):** the frontend still runs the obsolete Phase-2 flow — `ForgePage` → `buildCollectionPtb` (`publish_collection` / `mint_variant`, functions that do **not** exist in v2), `useOwnedVariants` Access discovery, `publishPtb.ts`, plus the procedural `/generate` + `CreatorFlow` + `ShapePicker` surface and backend `generators/` + `agent/router.ts`.

**Correction (verified against the tree, 2026-05-20): plan-007 U6–U14 were NEVER built — git history shows only plan-006 (racetrack) + plan-007 U1–U5 commits.** Concretely, *none* of the following exist yet: any backend `SuiClient`; `backend/src/events/` (`eventPollerBase`, any indexer); `backend/src/api/listings.ts` or any `GET /api/listings`; the `RoyaltyReceiptOverlay`; the buyer purchase-error handling. **Browse today reads on-chain via client-side GraphQL** (`frontend/src/browse/useModelIndex.ts` → `SUI_GRAPHQL_ENDPOINT`) — there is no backend listing index. (Network config **does** exist and shipped at U5: the canonical `contracts/networks/testnet.json` + its typed frontend mirror `frontend/src/sui/networkConfig.ts`, kept in sync by a parity test — U5 below updates these in place for the v3 PackageID rather than creating a new file.) This corrects an earlier draft that treated those as carried shipped foundation. Consequence: the only true shipped foundation is the **v2 Move contract + `frontend/src/sui/kioskTxBuilders.ts`**. Everything else plan-008 references from plan-007 is *pending work to build*, not infrastructure to extend — see the reframed *Pending from plan-007* section and the rescoped U7/U8 below.

---

## High-Level Technical Design

Directional guidance for review, not implementation specification.

### Object graph (after v3 republish)

```
Model3D (key, store)                      ← mesh creator; L1 sale unchanged (purchase_with_kiosk)
  └─ license: LicenseTerms { policy, derivative_royalty_bps, derivative_mint_fee, … }

NftCollection (shared)                     ← nft creator, via launch_collection (pay-to-derive)
  ├─ base_model_id: ID                     ← snapshot link to the Model3D
  ├─ base_creator: address                 ← royalty + derive-fee payee
  ├─ base_royalty_bps: u16                  ← snapshot of license.derivative_royalty_bps (≤ 3000, D-004)
  ├─ integration_policy: u8                 ← nft creator's L2 gate (set_integration_policy; default PERMISSIONLESS). NOT a model-license snapshot (D-030)
  ├─ register_fee: u64                      ← set via set_register_fee (cap-gated)
  └─ integrations: Table<address, IntegrationRecord>   ← per-(integrator) uniqueness + "Used by" source

NftCollectionCreatorCap (key ONLY = soulbound)   ← authority over its NftCollection
  └─ collection_id: ID                      ← re-anchors spec.md §1.7 #3 "soulbound by Move ability"

NftToken (key, store)                      ← Fork B tradeable token minted from a collection
  └─ TransferPolicy<NftToken> (per-type)    ← royalty enforced on Kiosk resale

(Access struct DELETED — receipt of ownership is the key+store token / Model3D itself)
```

### F3 register_integration — control flow

```
register_integration(collection, payment: Coin<SUI>, app_metadata: vector<u8>, ctx)
  1. assert collection.integration_policy == POLICY_PERMISSIONLESS  else abort EIntegrationsClosed (30), emit nothing
  2. assert payment.value() >= collection.register_fee   else abort EFeeTooLow (31)
  3. assert !collection.integrations.contains(sender)     else abort EAlreadyRegistered (32)  [per-pair anti-spam]
  4. assert app_metadata.length() <= APP_METADATA_MAX     else abort EAppMetadataTooLong (33)
  5. route payment → base/cap-holder (transfer::public_transfer; dust-to-last if split)
  6. integrations.add(sender, IntegrationRecord { app_metadata, ts })
  7. emit IntegrationRegistered { collection_id, integrator, ts }   ← inside frame → rolls back atomically
```

Backend validates the **full** `app_metadata` schema (UTF-8 JSON, `name` + `url` only) before storing; on-chain check is length-only. Frontend renders it as **text nodes only** (never `innerHTML`).

---

## Requirements Trace

| R-ID (origin) | Plan coverage |
|---|---|
| R1 four real actors | U10/U12/U13/U14 (surfaces) + U15 (pitch/demo) |
| R2 base/derivative split; L1+L2 coexist | U1 (`launch_collection`, pay-to-derive) + U3 (L2 token) + U16 (v4: patch variants + owned-token mint) + L1 `publish` (D-032, shipped) |
| R3 Tripo-only; procedural removed | U9 |
| R4 Tripo service-funded; pay-per-generate → v1.1 | U10 (no SUI charge at generate) + Scope Boundaries |
| R5 `license.policy` radio at publish | U10 |
| R6 publish or discard after Tripo | U10 |
| R7 `launch_collection` entry fn | U1 |
| R8 key-only `NftCollectionCreatorCap` holds fee + registry | U1 |
| R9 cap-gated `set_register_fee` | U2 |
| R10 collection listable; resale royalty via TransferPolicy | U3 + U16 (v4: royalty-only policy, owned-token mint, opt-in list-for-sale) |
| R11 registry addressable through collection | U1 (Table on collection) |
| R12 `register_integration` fee-gated, routes to cap holder | U4 |
| R13 abort `ELicenseRestricted` on restricted base; UI message + filter link | U4 (Move) + U13 (UI) |
| R14 `app_metadata` bounded + schema-constrained + text-node render | U4 (length) + U7 (schema) + U14 (render) |
| R15 anti-spam: fee + per-(integrator,collection) uniqueness | U4 |
| R16 emit `IntegrationRegistered`; indexer; "Used by" with states | U4 + U7 + U14 |
| R17 Browse integration filter; indexer captures `license.policy` | U8 (capture) + U14 (filter) |
| R18 four-archetype pitch slide | U15 |
| R19 four-actor demo; Tiny Racetrack = gameDev; honest disclosure | U15 |
| R20 README four-archetype hero | U15 |
| R21 delete `/generate` + `CreatorFlow` + procedural UI; one canonical mint; redirects | U9 + U10 |
| R22 delete `Access` (struct + accessors + test helper) + frontend path | U1 (Move, via republish) + U11 (frontend) |

| AE (origin) | Plan coverage |
|---|---|
| AE1 launch_collection → collection + cap w/ settable fee | U1 Move tests |
| AE2 register_integration payment < / ≥ fee | U4 Move tests |
| AE3 restricted base → abort ELicenseRestricted | U4 Move tests + U13 UI |
| AE4 app_metadata HTML payload renders inert | U7 schema test + U14 render test |
| AE5 second register by same integrator aborts | U4 Move tests |
| AE6 permissionless collection w/ integration → "Used by" + filter | U7 + U14 tests |
| AE7 restricted at publish → POLICY_RESTRICTED recorded | U10 test + U1 Move test |

| F (origin) | Plan coverage |
|---|---|
| F1 mesh creator generate-and-publish | U9 + U10 |
| F2 nft creator launch-collection | U1 + U6 + U12 |
| F3 gameDev pay-and-register | U4 + U6 + U7 + U13 |
| F4 user browse-buy-use | U14 + carried plan-007 (purchase/overlay/nav) |

---

## Implementation Units

### U1. Move v3 — delete `Access`; add `NftCollection` + key-only `NftCollectionCreatorCap` + `launch_collection` (pay-to-derive)

**Goal:** In the v3 source, delete the `Access` struct + its accessors (`access_target_id` / `access_holder` / `access_expires_at_ms`) + `destroy_access_for_testing`. Add `NftCollection` (shared), key-only `NftCollectionCreatorCap`, and `launch_collection(model: &Model3D, payment: Coin<SUI>, ctx)` which snapshots the base model's creator/royalty/policy, routes the derive fee (`license.derivative_mint_fee`) to the base creator (Fork A), creates the shared collection with an empty integration `Table`, and transfers the cap to the caller.

**Requirements:** R2, R7, R8, R11, R22 (Move half); AE1, AE7 (records policy snapshot)

**Dependencies:** none (foundation = shipped plan-007 Move)

**Files:**
- `contracts/model3d/sources/model3d.move` (delete Access surface; add structs + `launch_collection` + `CollectionLaunched` event + new abort-code constants block `ELicenseRestricted=30 … EWrongCollectionCap=34`)
- `contracts/model3d/tests/model3d_tests.move` (add launch tests; delete Access-helper tests)
- `contracts/UPGRADE.md` (note: v3 is a fresh republish, not a compatible upgrade — Access removal forces it)
- `docs/solutions/kiosk-ptb-patterns/cap-gated-collection-launch.md` (NEW — R12-style capture: key-only cap pattern + pay-to-derive royalty snapshot; flagged as a documented gap by learnings researcher)

**Approach:**
- `NftCollection has key` (shared via `transfer::share_object`): `{ id, base_model_id, base_creator, base_royalty_bps, base_policy, register_fee: u64 (init 0), integrations: Table<address, IntegrationRecord> }`.
- `NftCollectionCreatorCap has key` (NO `store` → soulbound): `{ id, collection_id }`.
- `launch_collection`: read `model.license` accessors (already public); `assert base_royalty_bps <= MAX_DERIVATIVE_ROYALTY_BPS` (D-004); pay `license.derivative_mint_fee` from `payment` to `model.creator` (Fork A pay-to-derive), return remainder to caller; create + share collection; transfer cap to `ctx.sender()`; emit `CollectionLaunched { collection_id, base_model_id, nft_creator }`.
- `IntegrationRecord has store { app_metadata: vector<u8>, registered_at_ms: u64 }`.

**Test scenarios:**
- **Covers AE1.** `launch_collection` with valid payment → one `NftCollection` shared tied to `base_model_id`; one `NftCollectionCreatorCap` owned by caller; `register_fee == 0`; derive fee arrived at `model.creator`.
- **Covers AE7.** base model `POLICY_RESTRICTED` → collection records `base_policy == 0`.
- `base_royalty_bps > 3000` path aborts (`EWrongRoyaltyRate`/D-004 cap).
- `payment < derivative_mint_fee` aborts.
- Cap has `key` only — compile-time/struct-tag assertion it lacks `store`.
- Compile: `Access` struct + 3 accessors + `destroy_access_for_testing` absent (grep + `sui move build`).

**Verification:** `sui move build` clean; `sui move test` green; first new R12 doc landed.

---

### U2. Move v3 — `set_register_fee` (cap-gated)

**Goal:** Cap holder sets/updates the collection's `register_fee`. Only the matching cap authorizes the change.

**Requirements:** R9

**Dependencies:** U1

**Files:** `contracts/model3d/sources/model3d.move` (+`set_register_fee`); `contracts/model3d/tests/model3d_tests.move`

**Approach:** `set_register_fee(cap: &NftCollectionCreatorCap, collection: &mut NftCollection, fee: u64)`: `assert cap.collection_id == object::id(collection)` else `EWrongCollectionCap (34)`; set `collection.register_fee = fee`.

**Test scenarios:**
- Cap matching collection → fee updated; subsequent read reflects it.
- Mismatched cap (different collection) → aborts `EWrongCollectionCap`.
- Fee set to 0 is allowed (free integration is valid).

**Verification:** `sui move test` green.

---

### U3. Move v3 — tradeable `NftToken` (`key + store`) + `mint_nft_token` + `TransferPolicy<NftToken>`

**Goal:** Fork B. A distinct `NftToken` type minted from a collection, listed on the minter's Kiosk, with its **own** `TransferPolicy<NftToken>` (royalty enforced on resale; per-type policy, per learnings #4). Coexists with the unchanged L1 `Model3D` sale.

**Requirements:** R2 (L2 leg), R10

**Dependencies:** U1 (collection), foundation `Publisher`/Kiosk helpers

**Files:** `contracts/model3d/sources/model3d.move` (+`NftToken`, `ensure_collection_policy(publisher, ctx)`, `mint_nft_token(cap, collection, kiosk, kioskCap, …)`); `contracts/model3d/tests/model3d_tests.move`; `docs/solutions/kiosk-ptb-patterns/per-type-transfer-policy.md` (NEW)

**Approach:**
- `NftToken has key, store { id, collection_id, base_model_id, name, … }`.
- `ensure_collection_policy(publisher: &Publisher, ctx)`: creates `TransferPolicy<NftToken>` + attaches RoyaltyRule + LockRule + PersonalKioskRule (mirror plan-007 U3's `ensure_transfer_policy` shape). One-time per package.
- `mint_nft_token`: cap-gated mint; place + list into the nft creator's Kiosk (analog of `mint_and_list`).
- Resale uses the same hot-potato `confirm_request` chain as L1 (reuse plan-007 U5 builder shape in U6).

**Execution note:** Test-first — write the resale-royalty Move integration test before the entry fn.

**Test scenarios:**
- `mint_nft_token` → `NftToken` placed + listed in creator Kiosk; `TransferPolicy<NftToken>` has three rules.
- Resale via full confirm_request chain → royalty routed to `base_creator`; ownership transfers.
- Resale PTB omitting `confirm_request` aborts (hot-potato unconsumed).
- Non-cap-holder cannot `mint_nft_token`.

**Verification:** `sui move test` green; second/third R12 docs landed.

> **Descope hooks:** this entire unit is **descope level 0** — if the buffer is tight, drop the `NftToken` Move type altogether and let the demo's "user buys" beat use L1 `purchase_with_kiosk` (already shipped). If kept, its sale/resale *UI* is also the first polish to cut (descope #1). The collection + registry (U1/U4) prove the composable economy with or without tradeable tokens.

---

### U4. Move v3 — `register_integration` + registry + `IntegrationRegistered`

**Goal:** Fee-gated, license-gated, anti-spammed B2B integration attestation. The novel pitch surface.

**Requirements:** R12, R13 (Move), R14 (length), R15, R16 (emit); AE2, AE3, AE5

**Dependencies:** U1, U2

**Files:** `contracts/model3d/sources/model3d.move` (+`register_integration`, `IntegrationRegistered`, `APP_METADATA_MAX`, abort codes 30–33); `contracts/model3d/tests/model3d_tests.move`; `docs/solutions/kiosk-ptb-patterns/register-integration-fee-gated-registry.md` (NEW — captures fee-gated registry + per-pair uniqueness, both flagged as documented gaps)

**Approach:** the control flow in High-Level Design. Fee routing via `transfer::public_transfer` to `base_creator`/cap-holder (dust-to-last if split). Emit **inside** the call frame so an abort rolls back the event (pattern from `RoyaltyPaid`). On-chain validates `app_metadata` **length** only; backend (U7) validates schema.

**Test scenarios:**
- **Covers AE2.** `payment < register_fee` → abort `EFeeTooLow`, no registry entry, no event. `payment >= register_fee` → fee at cap holder, `integrations` has entry, `IntegrationRegistered` emitted.
- **Covers AE3.** base `POLICY_RESTRICTED` → abort `ELicenseRestricted`, **no event emitted**.
- **Covers AE5.** same `(integrator, collection)` twice → second aborts `EAlreadyRegistered`.
- `app_metadata` over `APP_METADATA_MAX` → abort `EAppMetadataTooLong`.
- Exact-fee boundary (`payment == register_fee`) → succeeds.

**Verification:** `sui move test` green; R12 doc landed.

---

### U5. Move v3 republish to testnet + bootstrap + config

**Goal:** Publish the v3 package fresh (new PackageID), then run the one-time bootstrap: `ensure_transfer_policy` (Model3D) + `ensure_collection_policy` (NftToken). Write `networks/testnet.json`. Capture UpgradeCap to the interactive Sui CLI keychain (per plan-007 R2 / D-029 key custody).

**Requirements:** foundation for all frontend/backend units; R22 (republish is the deletion mechanism)

**Dependencies:** U1, U2, U3, U4

**Files:** `contracts/networks/testnet.json` (UPDATE in place — new PackageID + Publisher + both policy IDs + `kiosk_apps_package_id`); `frontend/src/sui/networkConfig.ts` (UPDATE the typed mirror; keep `networkConfig.test.ts` parity green); `contracts/UPGRADE.md`; `docs/reports/phase-4-v3-republish.md` (NEW — scratch notes: gas, IDs, bootstrap receipts; not a formal Phase-5 doc)

**Approach:** `sui client publish`; record `package_id`, `publisher_id`, `transfer_policy_model3d_id`, `transfer_policy_nfttoken_id`, `upgrade_cap_id` into both config files (the R4 parity test guards drift). Run bootstrap calls (`ensure_transfer_policy` + `ensure_collection_policy`). Abort guard: refuse publish if `SUI_MAINNET_DEPLOY_KEY` is in env (plan-007 F19).

**Test scenarios:** Test expectation: none — deploy artifact. Verification = config populated + bootstrap receipts.

**Verification:** new package on testnet (Sui Explorer); `contracts/networks/testnet.json` + `networkConfig.ts` updated (parity test green, no nulls); both TransferPolicies show three rules; republish notes committed.

---

### U6. Frontend `collectionTxBuilders.ts` — typed PTB wrappers

**Goal:** Typed PTB layer for `launch_collection`, `set_register_fee`, `mint_nft_token`, `register_integration`. Mirrors plan-007 `kioskTxBuilders.ts` (`TxResult<T>` envelope, struct-arg-pitfall avoidance, dry-run-from-day-1).

**Requirements:** R6-adjacent (typed wrapper discipline); F2/F3 plumbing

**Dependencies:** U5

**Files:** `frontend/src/sui/collectionTxBuilders.ts` (NEW) + `.test.ts`; `frontend/package.json` (uses existing `@mysten/kiosk`)

**Approach:** flat primitive params or `new_*` constructors for any struct arg (never `tx.pure` a struct — learnings #5). `app_metadata` passed as `tx.pure.vector('u8', utf8Bytes)`. Each builder ships a `dryRunTransactionBlock` smoke test against U5's republished package; PROVISIONAL tracking if testnet RPC down (plan-007 pattern).

**Execution note:** Test-first for dry-run smokes.

**Test scenarios:**
- `buildLaunchCollectionPtb` → dry-run succeeds; effects show `CollectionLaunched`.
- `buildRegisterIntegrationPtb` with under-fee payment → dry-run aborts `EFeeTooLow` (regression for AE2).
- `buildSetRegisterFeePtb` with mismatched cap → dry-run aborts `EWrongCollectionCap`.
- TS: passing a string where ObjectRef expected fails at compile time.

**Verification:** Vitest green; dry-run smokes green against v3 package.

> **v4-revision note (D-035/D-036, post-U16/U17).** U6 shipped against v3 and needs a delta pass once v4 lands: `buildLaunchCollectionPtb` gains a `quiltBlobId` arg; `buildMintNftTokenPtb` **drops** the Kiosk args (`kioskId`/`personalKioskCapId`) + the `kiosk::ItemListed` expectation and **gains** a `patchId` arg (now a pure mint→`public_transfer`); add a **separate** `buildListNftTokenForSalePtb` (standard Kiosk `place_and_list`) for the opt-in sale path, whose `confirm_request`/buy chain satisfies **only** `royalty_rule` (lock + personal_kiosk rules removed per D-036). Re-point all builder dry-run smokes at the v4 PackageID.

---

### U7. Backend `SuiClient` + `IntegrationRegistered` indexer + "Used by" API + `app_metadata` schema validation

**Goal:** Stand up the backend's **first on-chain read capability from zero** (no `eventPollerBase` or any indexer exists today — feasibility P0). Build a *minimal, single-topic* `IntegrationRegistered` poll loop (NOT the full plan-007 indexer framework), validate `app_metadata` schema, expose "Used by" per collection.

**Requirements:** R14 (schema), R16 (indexer + API)

**Dependencies:** U5 (events fire). **No plan-007 backend infra to reuse — this unit builds it.**

**Files:**
- `backend/src/sui/client.ts` (NEW — single `SuiJsonRpcClient` per D-019; reads package/policy IDs from `contracts/networks/testnet.json` updated by U5. *Noted tension with CLAUDE.md's gRPC stack line — following the ADR/D-019; gRPC migration is post-submission.*)
- `backend/src/events/integrationIndexer.ts` (NEW — **self-contained** poll loop + in-memory cursor for the single `IntegrationRegistered` topic; no shared poller base) + `.test.ts`
- `backend/src/lib/appMetadataSchema.ts` (NEW — see schema spec below) + `.test.ts`
- `backend/src/api/collections.ts` (NEW — `GET /api/collections/:id/integrations`; public read; `:id` validated against `/^0x[0-9a-fA-F]{64}$/`; per-IP rate limit) + `.test.ts`

**Approach:** poll cadence 2s (not AE3-critical). Validate `app_metadata` on ingest; store only valid records; drop + log invalid. "Used by" returns `[{ name, url, integrator, registered_at_ms }]`.

**`appMetadataSchema` spec (security review — apply, don't defer):**
- UTF-8 JSON object, exactly the keys `name` + `url`; reject any extra key.
- `name`: ≤ 64 chars; **Unicode NFC-normalized**; reject if it contains confusable/control characters (homoglyph-phishing guard — "Used by" is a buyer trust signal).
- `url`: ≤ 256 chars; **`https:` scheme only** — explicitly reject `http:`, `javascript:`, `data:`, and schemeless. The clickable `<a href>` in U14 is the residual XSS/phishing surface; the danger lives in the `href`, not in text rendering.
- These caps are sub-bounds inside the on-chain `APP_METADATA_MAX` (U4) total-vector cap.

**Test scenarios:**
- **Covers AE4 (validation half).** `app_metadata` rejected (not stored) for each: `<script>` in `name`; extra JSON key; `url` of `javascript:alert(1)`, `data:text/html,…`, `http://…`, or schemeless; `name` > 64 chars; `url` > 256 chars; a confusable/homoglyph `name` (e.g., Cyrillic lookalikes). Valid `{name,url(https)}` accepted.
- `integrationIndexer` materializes a record from a real testnet `IntegrationRegistered`.
- `GET /api/collections/:id/integrations` returns `[]` for unknown collection; populated list after one registration.
- Malformed `:id` → 400 without lookup; 11th request in window → 429.

**Verification:** tests green; manual testnet smoke — register via `register_integration` → record appears in API within poll window.

---

### U8. Browse query carries collection `integration_policy` (Browse filter enabler — client-side)

**Goal (D-030 corrected):** Surface each **collection's** `integration_policy` so the "available for integration" filter (U14) shows only collections the nft creator has left open (`POLICY_PERMISSIONLESS`). The integration filter is about *collections accepting integrations*, which is the collection-level `integration_policy` — **not** the base model's `license.policy`. **There is no backend listing indexer — Browse is client-side GraphQL today** — so this is a small client query change, NOT a backend build.

**Requirements:** R17 (data half)

**Dependencies:** U5 (v3 package), U12 (launch writes collections)

**Files:** `frontend/src/browse/useModelIndex.ts` (extend the client query to read `NftCollection.integration_policy` for browsed collections; the public accessor is `collection_integration_policy`) + test.

**Approach:** `NftCollection.integration_policy` is a public field (read via `collection_integration_policy` / object field); fetch it in the browse query and expose it on the collection DTO. No new backend, no indexer. (Model `license.policy` may still be surfaced separately as display metadata — U10's mint radio — but it does NOT drive the integration filter.) (If a later phase introduces a backend listing index, the filter can move server-side then — YAGNI now.)

**Test scenarios:**
- Browse DTO includes `integration_policy` matching each collection's on-chain value.
- Open (PERMISSIONLESS) vs closed (RESTRICTED/ALLOW_LIST) collections surface distinct values to the filter (U14).

**Verification:** tests green; browse model objects carry `policy`; U14 filter consumes it.

---

### U9. Remove procedural generation surface (R3 / R21 / OQ-019)

**Goal:** Delete all procedural generation code and the `/generate` route. Closes OQ-019; the grep gate is the acceptance check.

**Requirements:** R3, R21

**Dependencies:** none (can run early, parallel to Move work)

**Files (delete):** `frontend/src/creator/CreatorFlow.tsx` (+test); `frontend/src/components/ShapePicker.tsx` (+test); `backend/src/generators/` (box/chest/cylinder/sphere/sword/hammer/platform + tests); `backend/src/routes/shapes.ts`.
**Files (simplify):** `backend/src/agent/router.ts` (drop `HardcodedRouter` procedural generators → Tripo-only dispatch); `shared/src/types.ts` (drop `ShapeId` union + per-shape param schemas + `paramRanges`; keep Tripo `Generator`/`Router`/`LineageRecord`); `backend/src/lib/schema.ts` (drop `proceduralParamsSchemas`); `backend/src/app.ts` (remove `/api/shapes` route + `HardcodedRouter` wiring); `frontend/src/App.tsx` (remove `/generate` route).

**Test scenarios:**
- OQ-019 grep gate: no `ShapePicker`, `HardcodedRouter`, procedural generator imports, or `/api/shapes` references remain (grep returns empty).
- `pnpm test` (frontend + backend + shared) green after deletions — no dangling imports.
- Backend boots without the shapes route; Tripo generate route still serves.

**Verification:** grep gate empty; `pnpm test` green; backend + frontend build clean.

---

### U10. Canonical mint page on `mint_and_list` + `license.policy` radio + Tripo service-funded

**Goal:** Rebuild the mint page on the v3 contract (`mint_and_list` via plan-007 `kioskTxBuilders.ts`), replacing the obsolete `buildCollectionPtb`/`publish_collection` flow. Add a `license.policy` radio (permissionless default / restricted). No SUI charge at generate (R4 service-funded). `/generate` + `/forge` → redirect to the canonical route.

**Requirements:** R3, R4, R5, R6, R21, AE7 (publish records policy)

**Dependencies:** U6 (or plan-007 U5 builders for `mint_and_list`), U9

**Files:** `frontend/src/forge/ForgePage.tsx` (rebuild → single Tripo→Walrus→`mint_and_list` flow; OR new `frontend/src/create/CreatePage.tsx` — resolve canonical route name during impl, default keep `/forge`) + test; delete `frontend/src/forge/buildCollectionPtb.ts` + `frontend/src/sui/publishPtb.ts`; `frontend/src/creator/MintButton.tsx` (reuse — popup-count copy); `frontend/src/App.tsx` (redirects).

**Approach:** Tripo generate (service-funded) → preview → `license.policy` radio → Walrus upload (`writeFilesFlow`, 2 popups, unchanged) → `mint_and_list` (1 popup). Total 3 popups.

**Test scenarios:**
- **Covers AE7.** Selecting "restricted" → `mint_and_list` called with `policy = POLICY_RESTRICTED (0)`; default radio = permissionless (2).
- Happy path: generate → upload → `mint_and_list` signed → success w/ Explorer link; total popups = 3 (spy).
- `/generate` and old `/forge` paths redirect to canonical route.
- Wallet rejection on Sui step → error toast + Retry (integration with carried plan-007 U9).

**Verification:** tests green; manual testnet smoke — publish a permissionless + a restricted model; both appear in Browse with correct policy.

---

### U11. `/track` discovery = owned `NftToken` → `patch_id` quilt resolution (R22 frontend; rewritten for D-035/D-036)

**Goal (rewritten):** `/track` reflects **NFT ownership**, not the dead `Access` path. The user owns `NftToken` objects (per D-036 they are **plain owned objects** — no Kiosk walk needed). The carousel lists the connected wallet's owned `NftToken`s; each token's drivable GLB resolves through its on-chain `patch_id` (D-035). `?model=<tokenId>` drives a specific token directly; the `?blob=<blobId>` dev escape hatch is retained.

**Why this changed:** the original "`getObject(Model3D) → blob`" approach was based on the stale Phase-2/3 Model3D shape — the v3/v4 `Model3D` has **no GLB blob field** (only `lineage_blob_id`; the GLB `Blob` is a separate creator-owned object). D-035 puts a resolvable `patch_id` on the `NftToken` instead, so L2 driving resolves cleanly via the collection quilt. D-036 makes owned tokens plain objects, so discovery is a simple owned-objects query (the earlier Kiosk-walk wrinkle is gone).

**Requirements:** R22 (frontend half); consumes D-035 (patch_id resolution) + D-036 (owned-object discovery)

**Dependencies:** U16 + U17 (v4 package: `NftToken.patch_id`, `NftCollection.quilt_blob_id`, owned-not-Kiosk mint), U12 (a real minted token to discover). **No longer a standalone frontend unit** — needs v4 + a minted token on testnet.

**Files:**
- `frontend/src/track/useOwnedVariants.ts` → **rename to `usePublishedModels`→ actually `useOwnedTokens.ts`**: delete the two-pass `Access` GraphQL discovery; replace with "query owned objects of type `${pkg}::model3d::NftToken` for the connected wallet" → map each to `{ tokenId, patchId, collectionId, baseModelId, name }`. (Resolve final filename during impl; the export must reflect "owned NftTokens", not "owned variants".)
- `frontend/src/track/TrackPage.tsx`: `?model=<tokenId>` → `useSuiClient().getObject(tokenId, { showContent })` → read `patch_id` → build the aggregator `by-quilt-patch-id` URL → mount scene. Carousel (no `?model=`) consumes `useOwnedTokens`. Keep `?blob=` hatch. `racetrackScene.ts` untouched (still takes pre-fetched `carGlbBytes`).
- **Delete** `frontend/src/track/stubListingLookup.ts` (+ replace its `aggregatorUrlForVariant` patch-id branch usage — already supports `by-quilt-patch-id`).
- Tests: `frontend/src/track/useOwnedTokens.test.ts` (rewrite from `useOwnedVariants.test.ts`), `frontend/src/track/TrackPage.test.tsx` (update).

**Approach:** owned-objects query via the frontend `SuiJsonRpcClient` (`getOwnedObjects` filtered by `StructType`), NOT GraphQL Access discovery. `getObject(tokenId)` for the `?model=` single-drive path. GLB bytes come from the aggregator `by-quilt-patch-id/{patch_id}` URL (the existing `aggregatorUrlForVariant` patch branch).

**Test scenarios:**
- `?model=<tokenId>` present → `getObject` mock returns a token with `patch_id` → scene mounts with the `by-quilt-patch-id` GLB for that patch.
- `?model=` absent + wallet connected → `getOwnedObjects(NftToken)` mock populates the carousel; selecting a token drives its patch.
- `?blob=<id>` present → drives that blob directly (dev hatch), bypassing on-chain lookup.
- No `Access`/`buy_access` references remain **in `frontend/src/track/`** (track-scoped grep; the frontend-wide purge is a separate follow-up — see Scope Boundaries).

**Verification:** tests green; manual smoke — a wallet that owns a minted `NftToken` sees it in the carousel and drives its colored variant; `?model=<tokenId>` drives that token.

---

### U12. nft creator launch-collection page — variant authoring (quilt) + mint-per-patch + `set_register_fee` UI (F2; expanded for D-035)

**Goal (expanded):** The nft-creator surface, now carrying the D-035 variant flow: pick a base Model3D → author **N colored variants** (reuse the Phase-3 `VariantEditor`) → build + upload the **quilt** → `launch_collection(base, quilt_blob_id, …)` (pay derive fee) → receive soulbound cap → set `register_fee` → **mint one `NftToken` per patch** (plain owned token per D-036). Tokens are NOT auto-listed; "list for sale" is a separate opt-in (deferred / U6 builder).

**Requirements:** R7, R8, R9, R10; consumes D-035 (quilt variants) + D-036 (owned-token mint)

**Dependencies:** U16 + U17 (v4 package), U6 (v4-revised builders: `buildLaunchCollectionPtb` +`quiltBlobId`, `buildMintNftTokenPtb` +`patchId`), U8

**Files:**
- `frontend/src/collection/LaunchCollectionPage.tsx` (NEW) + test — base picker + variant authoring + launch + cap + fee + mint.
- Reuse `frontend/src/forge/VariantEditor.tsx` + `VariantPreview.tsx` (Phase-3 color/material authoring — already built).
- Reuse backend `POST /api/collection/build` (material-swap → N GLBs; already built) + the Phase-3 quilt-upload path (`frontend/src/forge/buildCollectionPtb.ts` holds the quilt-upload shape — extract/reuse, do not call the dead `publish_collection`).
- `frontend/src/collection/SetRegisterFee.tsx` (NEW) + test.
- `frontend/src/App.tsx` (route).

**Approach:** base Model3D picker (client-side GraphQL, like Browse) → `VariantEditor` to define N variants (baseColorRgb + optional textureId) → `POST /api/collection/build` returns N GLBs → pack + upload as ONE Walrus quilt (Phase-3 `writeFilesFlow`/quilt path) → capture `quilt_blob_id` + per-variant `patch_id`s → `buildLaunchCollectionPtb({ modelId, feeMist, quiltBlobId })` → on success surface the soulbound cap + a `register_fee` input (`buildSetRegisterFeePtb`) → loop `buildMintNftTokenPtb({ capId, collectionId, name, patchId })` per variant (each a plain owned token, D-036). Cap is soulbound — copy explains it cannot be transferred.

**Test scenarios:**
- Author 3 variants → `/api/collection/build` called with 3 specs → quilt upload yields 1 blob_id + 3 patch_ids (mock Walrus).
- Launch happy path → `buildLaunchCollectionPtb` carries `quiltBlobId`; `CollectionLaunched`; cap shown; fee form enabled.
- Mint-per-patch → `buildMintNftTokenPtb` called once per patch with the right `patchId`; no Kiosk args passed (D-036); no `ItemListed` expected.
- Set fee → `set_register_fee` signed; UI reflects new fee.
- Wallet rejection on launch → toast + Retry.

**Verification:** tests green; manual smoke — author a 3-color collection from a published model, launch (quilt uploaded), set a fee, mint 3 owned tokens; each drives its own color on `/track`.

> **Descope hook (revised):** if buffer collapses, drop the multi-variant authoring and mint a **single** token off the base model's own GLB (1 patch / no material-swap), keeping the launch + cap + fee + registry economy intact. The colored fleet is the polish cut, not the economy.

---

### U13. gameDev register-integration page (F3)

**Goal:** The gameDev surface: find an eligible collection → pay `register_fee` → submit `app_metadata` (name + url) → `register_integration`. Restricted-license attempts show a human message + link to the Browse filter (never a raw abort code).

**Requirements:** R12, R13 (UI), R14 (form constraints)

**Dependencies:** U6, U7

**Files:** `frontend/src/integration/RegisterIntegrationPage.tsx` (NEW) + test; `frontend/src/App.tsx` (route).

**Approach:** form with `name` + `url` (client-validate `https:`-only + length to match the U7 backend schema — reject `javascript:`/`data:`/`http:` before submit). **Re-fetch the collection's current `register_fee` via `getObject` immediately before building/signing the PTB** (TOCTOU: the cap holder may have raised the fee since page load; the on-chain check is authoritative but a stale UI value would abort `EFeeTooLow` — refresh-then-sign avoids a confusing failure). `buildRegisterIntegrationPtb`. Map abort → friendly copy: `ELicenseRestricted` → "This collection does not accept integrations" + link to `/browse?filter=integration`; `EFeeTooLow` → "Increase payment to ≥ {fee}"; `EAlreadyRegistered` → "You've already registered this collection."

**Test scenarios:**
- **Covers AE3 (UI half).** `ELicenseRestricted` abort → friendly message + filter link; no raw code shown.
- Under-fee abort → fee guidance; duplicate abort → already-registered message.
- Valid `name`+`url` accepted; `url` with disallowed scheme rejected client-side before submit.

**Verification:** tests green; manual smoke — register against a permissionless collection; attempt against a restricted one and see the friendly path.

---

### U14. Browse integration filter + collection/NFT detail "Used by" (XSS-safe)

**Goal:** Browse "available for game integration" filter (R17) and a collection detail "Used by" section with loading / empty / restricted states, rendering `app_metadata` as **text nodes only** (R14, AE4).

**Requirements:** R16, R17; AE4 (render half), AE6

**Dependencies:** U7, U8

**Files:** `frontend/src/browse/BrowsePage.tsx` (amend — `?filter=integration` shows only `policy == PERMISSIONLESS`); `frontend/src/collection/CollectionDetailPage.tsx` (NEW or amend existing) + test; `frontend/src/collection/UsedBySection.tsx` (NEW) + test.

**Approach:** filter reads the collection's `integration_policy` from the U8-enriched DTO (D-030 — not the model `license.policy`). "Used by" calls `GET /api/collections/:id/integrations`; render `name` + `url` via React text children + a sanitized `<a href>` (scheme-allowlisted) — never `dangerouslySetInnerHTML`. States: loading skeleton / "No integrations yet" / "Not accepting integrations" (collection `integration_policy` ≠ permissionless).

**Test scenarios:**
- **Covers AE6.** Permissionless collection with one integration → "Used by" lists the app; Browse `?filter=integration` includes it; restricted collection excluded from filter.
- **Covers AE4 (render half).** `app_metadata.name` containing `<img onerror>` / `<script>` renders as inert text; injected markup does not execute; only the validated `url` is clickable.
- Empty + loading + restricted states each render their copy.

**Verification:** tests green; manual smoke — filter shows only permissionless; detail page "Used by" renders a registered app safely.

---

### U15. Four-actor demo recording + four-archetype pitch slide + README hero + honest disclosure

**Goal:** Re-narrate the demo around the four actors (Tom mesh / Lisa nft / gameDev / Marcus user); Tiny Racetrack is the gameDev integration use case. Four-archetype pitch slide; README hero; honest team-controlled-wallet disclosure. Amends plan-007 U12 (recording) + U14 (README).

**Requirements:** R18, R19, R20

**Dependencies:** U10, U12, U13, U14 (+ carried plan-007 demo units)

**Files:** `pitch/recording-assets/take-log.md` + `final-take.mov` + `obs-scene.json`; `pitch/four-archetype-slide.*`; `docs/reports/phase-4-recording-report.md`; `README.md` (four-archetype hero + honest disclosure + Phase-2/v3 package note).

**Approach:** demo arc: mesh creator publishes (license radio) → nft creator launches collection + sets fee → gameDev pays + registers integration (fee visible on Explorer) → user buys + drives → "Used by" reverse lookup resolves on screen. README discloses the four archetypes are team-controlled wallets for 6/21 unless a real external integrator is recruited.

**Test scenarios:** Test expectation: none — recording + docs; verification = artifacts.

**Verification:** `final-take.mov` shows the full four-actor arc; pitch slide + README committed; honest disclosure present.

---

### U16. Move v4 — L2 variant patch + owned-token mint (D-035 + D-036 source delta)

**Goal:** Add the on-chain variant + owned-token surface in the Move source: `NftCollection.quilt_blob_id`, `NftToken.patch_id`, the `launch_collection`/`mint_nft_token` signature changes, and the royalty-only `TransferPolicy<NftToken>`. Move tests cover the new fields + the no-Kiosk mint.

**Requirements:** consumes D-035 + D-036; advances R10 (royalty-on-resale) + R2 (L2 leg)

**Dependencies:** U1–U4 (the v3 collection layer this modifies). **Lands in the same source as a fresh v4 republish (U17).**

**Files:**
- `contracts/model3d/sources/model3d.move`:
  - `NftCollection` += `quilt_blob_id: String` (length-bounded by `MAX_BLOB_ID_LEN`); add public accessor `collection_quilt_blob_id`.
  - `NftToken` += `patch_id: String`; add public accessor `nft_token_patch_id`.
  - `launch_collection` += `quilt_blob_id: String` param (validate length; store on collection).
  - `mint_nft_token`: **drop** `kiosk_obj`/`personal_cap` + `place_and_list`; **add** `patch_id: String` param; mint + `transfer::public_transfer(token, ctx.sender())`. `NftTokenMinted` event may carry `patch_id` (optional, for the indexer).
  - `ensure_collection_policy`: keep **only** `royalty_rule::add` — remove `kiosk_lock_rule::add` + `personal_kiosk_rule::add`.
  - New abort code if needed: `EPatchIdMalformed` (next free in the 30s block).
- `contracts/model3d/tests/model3d_tests.move`: update `launch_collection`/`mint_nft_token` callsites; add the new-field + owned-mint + royalty-only assertions.
- `contracts/UPGRADE.md` (note: v4 is another fresh republish — struct field additions are not in-place upgradeable).
- `docs/solutions/kiosk-ptb-patterns/per-type-transfer-policy.md` (UPDATE — royalty-only rule set + the confirm_request consequence; supersedes the three-rule note from U3).

**Execution note:** Test-first — write the "mint yields a plain owned token (no Kiosk, no ItemListed)" + "token carries the supplied patch_id" tests before changing the entry fn.

**Test scenarios:**
- `launch_collection(base, payment, quilt_blob_id)` → collection stores `quilt_blob_id`; accessor returns it; over-`MAX_BLOB_ID_LEN` aborts.
- `mint_nft_token(cap, collection, name, price?, patch_id)` → a **plain owned** `NftToken` transferred to caller; `nft_token_patch_id` returns the supplied patch; **no Kiosk placement, no `ItemListed` event**.
- Multiple tokens may share one `patch_id` (a "red edition").
- `ensure_collection_policy` → `TransferPolicy<NftToken>` has **exactly** `royalty_rule` (assert lock + personal_kiosk rules absent).
- A standard Kiosk `place_and_list` + `purchase` + `confirm_request` chain on an `NftToken` satisfies royalty-only and lets the buyer **take** the token out (no lock).
- Non-cap-holder cannot `mint_nft_token`.

**Verification:** `sui move build` clean; `sui move test` green; per-type-policy doc updated.

---

### U17. Move v4 republish to testnet + bootstrap + config (mirrors U5)

**Goal:** Fresh v4 publish (new PackageID), rerun the bootstrap (`ensure_collection_policy`, now royalty-only), and update both config mirrors. Same process + safety guards as U5.

**Requirements:** foundation for the v4-dependent frontend units (U6 delta, U11, U12); R22 already satisfied in v3.

**Dependencies:** U16

**Files:** `contracts/networks/testnet.json` (UPDATE — new v4 PackageID + Publisher + `TransferPolicy<NftToken>` id/cap + `kiosk_apps_package_id` + `supersedes_v3_package_id`); `frontend/src/sui/networkConfig.ts` (UPDATE the typed mirror; keep `networkConfig.test.ts` parity green); `contracts/UPGRADE.md`; `docs/reports/phase-4-v4-republish.md` (NEW — gas, IDs, bootstrap receipts).

**Approach:** `sui client publish`; record IDs into both config files (parity test guards drift); run `ensure_collection_policy` bootstrap. Same env guard as U5: refuse publish if `SUI_MAINNET_DEPLOY_KEY` is set. Verify the new `TransferPolicy<NftToken>` shows **one** rule (royalty only).

**Test scenarios:** Test expectation: none — deploy artifact. Verification = config populated + bootstrap receipt + single-rule policy.

**Verification:** new v4 package on Sui Explorer; `testnet.json` + `networkConfig.ts` updated (parity green, no nulls); `TransferPolicy<NftToken>` shows exactly the royalty rule; republish notes committed.

---

## Pending from plan-007 (build per plan-007 spec — NONE are shipped)

These plan-007 units were **never built** (only U1–U5 shipped). They remain in-scope Phase-4 deliverables; execute them per their plan-007 spec, **adjusted for the no-backend-indexer reality** (plan-007 assumed a backend `eventPollerBase`/indexer that does not exist — wherever those units called for backend polling, use client-side polling instead). Each carries a first-class v3 acceptance criterion below. Listed here so plan-008 is the complete index of remaining Phase-4 work.

- **plan-007 U8 — RoyaltyReceiptOverlay** (R10). Fires on L1 (and L2 if it ships) purchase. **Build the event poll client-side** (frontend polls Sui for `RoyaltyPaid`); the plan-007 backend `royaltyIndexer` is not a prerequisite. **Acceptance: overlay fires off the v3-package `RoyaltyPaid` event shape.**
- **plan-007 U9 — purchase error handling** (R5a). Reused by U10 mint + U13 register flows.
- **plan-007 U10 — interstitial + auto-nav** (the buy-and-drive beat). Pairs with plan-008 U11's `?model=` discovery. **Acceptance: nav handoff resolves the v3 model object, not an Access path.**
- **plan-007 U11 — demo pre-bake** (Tom's listing + event-replay capture). **Acceptance: pre-baked against the U5 v3 PackageID, re-baked if the package is republished again.**
- **plan-007 U13 — mainnet pre-bake script** (R13/R14). **Acceptance: deploy script includes the new collection-layer entry fns + both `ensure_transfer_policy` and `ensure_collection_policy` bootstrap.**
- **plan-007 U14 — single-network build config** (`network.ts`, R7; reads `contracts/networks/testnet.json` / `networkConfig.ts` from U5). README portion folded into U15.

> The L2 `NftToken` buy path (U3) is additive; for 6/21 the "user buys" demo beat may use L1 `purchase_with_kiosk` to limit scope (see U3 descope hooks).

---

## Key Technical Decisions

- **v3 republish, not in-place upgrade (locked 2026-05-20).** Deleting the public `Access` struct + accessors breaks compatible-upgrade rules → fresh PackageID. Low-cost now (no migrated frontend, no pre-bake to lose). All Move delta lands in one publish (U5).
- **register_fee + integration registry live on `NftCollection` / its key-only cap, never on `Model3D`** (D-029). Fee is collection-level. No `Model3D` field change → the existing struct is untouched even though we republish for other reasons.
- **`base_royalty_bps` is a snapshot taken at `launch_collection`** from `license.derivative_royalty_bps`. ≤ 30% cap (D-004). *(D-030: the old `base_policy` snapshot is removed; the integration gate is the collection's own `integration_policy`, default PERMISSIONLESS, cap-set via `set_integration_policy` — not a model-license snapshot.)*
- **Pay-to-derive (Fork A), not buy-to-own.** nft creator pays `derivative_mint_fee` to the mesh creator at launch; mesh creator keeps the base + earns royalty. Preserves the perpetual-royalty story.
- **L1 + L2 coexist (Fork B).** L1 `purchase_with_kiosk` (Model3D) unchanged; L2 `NftToken` (`key+store`) is additive with its own `TransferPolicy<NftToken>` (per-type).
- **`Access` cut (Fork B'); "soulbound by Move ability" re-anchors to the key-only `NftCollectionCreatorCap`** (spec.md §1.7 #3).
- **`register_integration` is fee-gated, not ownership-coupled (Fork C).** B2B license at collection level; gameDev need not own a token. Anti-spam = fee + per-(integrator,collection) uniqueness.
- **New abort codes start at 30** (`EIntegrationsClosed=30` [renamed from `ELicenseRestricted` per D-030]`, EFeeTooLow=31, EAlreadyRegistered=32, EAppMetadataTooLong=33, EWrongCollectionCap=34, EInsufficientDeriveFee=35`) — existing range is `0,10–14,20,21`.
- **`IntegrationRegistered` emitted inside the call frame** so an aborted fee-routing/uniqueness tx rolls back the event (pattern from `RoyaltyPaid`).
- **`app_metadata`: on-chain length-bounded; backend schema-validates (UTF-8 JSON `name`+`url` only, URL scheme allowlist); frontend renders text-nodes-only.** Defense in depth (R14, AE4).
- **Backend uses `SuiJsonRpcClient` (D-019)** for the 6/21 indexer. *Noted tension with CLAUDE.md's gRPC stack line — following the ADR; gRPC migration is post-submission.*
- **No backend listing indexer is built; Browse stays client-side GraphQL (`useModelIndex`).** plan-007's backend `eventPollerBase`/listing-indexer was never built; rather than build that whole subsystem, the only new backend is a single-topic `IntegrationRegistered` indexer (U7) for "Used by". The Browse integration filter reads the collection's `integration_policy` client-side (U8, per D-030). Scope-reducing, codebase-grounded; a server-side index can come later (YAGNI).
- **Coin fee routing uses dust-to-last-beneficiary** if ever split (learnings #4) to avoid stranded mist.

---

## Test Strategy

- **Move tests (U1–U4):** entry-fn happy + abort paths; AE1/AE2/AE3/AE5/AE7 as Move integration tests. Test-first for U3 resale royalty.
- **PTB builder dry-run (U6):** every builder dry-runs against the U5 v3 package; PROVISIONAL tracking if RPC down (plan-007 discipline).
- **Backend (U7/U8):** integration with real testnet event stream + mocked-payload unit tests; schema-validation + rate-limit + input-validation tests mandatory.
- **Frontend (U9–U14):** Vitest + RTL; XSS render test (AE4) is mandatory; abort→friendly-copy mapping tests (U13).
- **E2E (manual):** full four-actor arc on testnet, recorded as rehearsal-as-test (U15 + carried plan-007 U11).
- **Grep gates:** OQ-019 (no procedural refs, U9); no `Access`/`buy_access` frontend refs (U11); no `Access` Move surface (U1).

---

## Scope Boundaries

### Carried from origin / D-013 (do not re-litigate)
- Seal encryption (hard license enforcement) — v1.1
- Forensic watermark — v1.1
- FloorPriceRule, KioskExtensions, multi-creator collections
- gRPC migration (post-submission, D-019)

### Deferred to v1.1 / mainnet window (per D-029)
- **Pay-per-generate backend** (user pays SUI per Tripo call; replay protection, session binding, refund) — 6/21 Tripo is service-funded
- nft creator dashboard beyond the per-collection detail page
- gameDev full discovery directory beyond the Browse filter + detail reverse lookup
- Multi-layer derivation (D-002 still caps at 1 layer)

### Deferred to Follow-Up Work
- **Frontend `Access`/`buy_access` dead-code purge.** The v3 republish (U1) deleted the `Access` Move struct, but the L1 buy-access UI still references it across ~12 frontend files: `buy/` (`ModelDetailPage`, `BuyAccessButton`, `hooks`), `browse/` (`useModelIndex`, `ModelCard`, `CollectionCard`), `collection/` (`useCollectionBySlug`, `CollectionDetailPage`), and `sui/purchaseAccessPtb.ts`. All of it is dead against v3/v4. U11's grep gate is therefore **track-scoped** (clean within `frontend/src/track/`), not frontend-wide. The full purge is its own unit — naturally bundled with the U8/U14 Browse rework, since L1 access-sale is a v1.1 Seal-gated concern (D-031) that may be reworked rather than just deleted. **Do not fold it into U11.**

### Mandatory contingency — worst-case descope order (first to cut first)
The realignment makes the 6/21 buffer **−5 to +4.5 working days**. If buffer hits zero, cut in this order (cumulative — each step fires only if still over budget after the prior). Each step names the **unit-IDs voided/modified** so the cut is mechanical, not narrative:

0. **L2 `NftToken` Move type (U3) entirely** — the collection + registry already prove composability; nothing in the success criteria requires the user to buy an L2 token. **Voids U3; the "user buys" demo beat falls back to L1 `purchase_with_kiosk` (already shipped).** Lowest-regret cut — purely additive surface.
1. **Collection-layer UI polish** — raw-but-functional over polished. **Modifies U12/U13/U14** (drop visual polish, keep functional flows).
2. **nft creator as a separate flow** — fall back to **path B** (mesh creator launches own collection inline). **Voids U12; keeps U1/U2/U4 cap+registry + the on-chain fee story intact.**
3. **`register_fee` mechanics** — fall back to **free** `register_integration` with per-(integrator,collection) uniqueness as the only anti-spam. **Voids U2; modifies U4** (drop fee-routing + `EFeeTooLow`) and **U6** (drop `buildSetRegisterFeePtb`). (U12's fee UI is already gone via step 2.)
4. **Last resort — narrative-only:** **voids U1–U14 collection work; keeps U15** pitch framing only.

> **Note (2026-05-20, user-confirmed):** steps 2 and 3 are **swapped relative to D-029's origin order** (which cut fee mechanics before the nft-creator UI). Rationale: "`register_integration` fee routing is visible on Sui Explorer" is a stated success criterion, so the on-chain fee story must outlive a mere separate-UI page. This refines D-029's contingency sequencing; it does not change what D-029 builds.

**Hard floor:** the demo recording (U15) + a working buy-and-drive beat are the root deliverables for pitch + video. Never sacrifice them to preserve collection-layer depth.

### Outside this product's identity
- "Cross-game asset portability" as a primary pitch claim (StepN/Axie failure mode, spec.md §1.7)
- Bring-your-own-Tripo-key per-creator subscription (superseded by service-funded demo + v1.1 pay-per-generate)

---

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | D-029 scope overruns the negative buffer | **High** | 6/21 submission incomplete | Mandatory descope order above; demo + buy-drive beat are the hard floor |
| 2 | v3 republish bootstrap (two TransferPolicies + Kiosk) surfaces a Kiosk gotcha | Medium | 1–2 day delay | Reuse shipped plan-007 U3 `ensure_transfer_policy` shape; R12 captures; dry-run from day 1 |
| 3 | `register_integration` fee-routing / Coin handling bug | Medium | Fee lost or tx aborts wrongly | Test-first abort matrix (AE2); dust-to-last rule; emit-inside-frame rollback |
| 4 | `app_metadata` XSS slips through | Low-medium | Stored-XSS in "Used by" | Triple defense: Move length + backend schema + text-node render; AE4 test mandatory |
| 5 | Backend SuiClient is net-new infra, underestimated | Medium | Indexer slips | U7 scoped as new infra (not extension); reuse `eventPollerBase`; JSON-RPC per D-019 |
| 6 | Frontend mint teardown bigger than R21 (ForgePage on obsolete flow) | Medium | U10 larger than a refactor | U10 explicitly a rebuild on `mint_and_list`, not an edit; `publishPtb`/`buildCollectionPtb` deleted |
| 7 | Per-pair uniqueness via `Table` undocumented pattern | Low-medium | Move design churn | Capture in R12 doc (flagged gap); standard `Table<address, _>` keying |
| 8 | L2 token path balloons (own policy + sale UI) | Medium | Time sink | U3 Move proves economy; token sale/resale UI is descope #1 |

---

## System-Wide Impact

- **mesh creators:** mint page rebuilt on `mint_and_list`; new `license.policy` radio; procedural option gone.
- **nft creators (new actor):** launch-collection + soulbound cap + fee setting.
- **gameDevs (new actor):** pay-to-register integration; license-gated.
- **users:** L1 buy unchanged; L2 token buy additive; `Access`-based `/track` discovery replaced by `?model=`.
- **dev team:** first backend `SuiClient`; new `collectionTxBuilders.ts` discipline; `docs/solutions/kiosk-ptb-patterns/*` gains cap-gated-launch, per-type-policy, fee-gated-registry captures.
- **judges:** four-archetype framing; each archetype takes a real on-chain action; fee routing visible on Explorer; honest staging disclosure.
- **contract identity:** **fresh v3 PackageID** — README must note the v2 (and Phase-2) packages are deliberately superseded.

---

## Dependencies / Prerequisites

- `@mysten/kiosk` + `@mysten/sui@2.16.x` (JSON-RPC, D-019) — already installed.
- v3 republish target = fresh package (supersedes v2 `0x563ab54b…`); UpgradeCap captured to interactive CLI keychain.
- Testnet SUI for ~50 publish/launch/register/purchase ops.
- Tripo service-funded budget for demo generates (team absorbs).
- **Working-day budget (honest, per D-029):** 23–24 available; committed Phase-4 remaining + Phase-5 = 13–17; new net scope +6.5–11.5 → **buffer −5 to +4.5.** Descope order is mandatory, not optional.

---

## Outstanding Questions

### Deferred to Implementation
- [U1/U3] `NftCollection` shared-object vs owned — default **shared** (registry needs multi-writer access for `register_integration`); confirm Kiosk listing semantics for `NftToken` don't require otherwise.
- [U6] `collectionTxBuilders` return-handle composition for chained `launch_collection` → `set_register_fee` (envelope shape discovered at impl).
- [U7] "Used by" reverse-lookup: indexer-derived view (chosen) vs event-history scan per collection — start with the indexer Table; scan only if cursor gaps appear.
- [U10] Canonical mint route name (`/forge` retained vs new `/create`) — default retain `/forge`, redirect `/generate`.
- [U13] `url` scheme allowlist exact set (`https` only vs `https`+`http`) — confirm with security posture at impl.
