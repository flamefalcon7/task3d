---
date: 2026-06-01
type: feat
status: active
origin: docs/brainstorms/2026-06-01-paid-access-entitlement-split-requirements.md
title: "feat: Paid access entitlement — split fork fee into buy-access (once) + derive fee (per-launch)"
---

# feat: Paid Access Entitlement — split fork fee into "buy access (once)" + "derive fee (per-launch)"

**Origin:** `docs/brainstorms/2026-06-01-paid-access-entitlement-split-requirements.md` (carries A1–A4, F1–F4, R1–R12, AE1–AE6). This plan answers HOW; the brainstorm settled WHAT.

**Target network:** Sui testnet. Requires a **fresh contract republish (v10)** — this is layout/ABI-breaking, not a compatible upgrade.

---

## Problem Frame

Today the only way to decrypt an encrypted (ALLOW_LIST) base is to call `launch_collection`, which charges the derive fee and mints a per-collection cap — so (1) a creator who already forked a base is charged **again** every time they launch another collection (and just to *preview*, since preview needs the paid plaintext), and (2) there is **no consumer path** to pay-to-view a premium base. The decrypt gate is coupled to the cap.

This plan **decouples** the two: a one-time **access purchase** mints a soulbound, permanent `AccessEntitlement` that gates Seal decryption, and the **derive fee** is charged per-launch at mint. The same entitlement serves a consumer (view in-app) and a creator (decrypt-to-fork). The decrypt gate moves from the per-collection cap to the entitlement; the cap remains the collection authority (register fee / integrations) but no longer gates decryption.

---

## Key Technical Decisions

1. **Revive the deleted `Access` struct as `AccessEntitlement`** — `key`-only (no `store`), soulbound by ability (the only exit is `transfer::transfer(x, ctx.sender())` from inside the module, mirroring `NftCollectionCreatorCap` at `contracts/model3d/sources/model3d.move:924`). Fields: `id: UID`, `model_id: ID` (points at the `Model3D`), `holder: address`. **No `expires_at_ms`** — permanent for v1 (origin Scope Boundaries defers transferable/time-limited). Mirrors the documented-but-removed `Access` shape (spec §2.8, D-002). *(see origin: R1, R2)*

2. **Model `seal_approve_entitlement` on `seal_approve_creator`, NOT `seal_approve_cap`.** The new ALLOW_LIST gate is a **single-object gate**: `assert!(entitlement.model_id == object::id(model))` ∧ `assert!(entitlement.holder == ctx.sender())` ∧ `is_prefix(&model.seal_id, &id)` ∧ `model.seal_version == VERSION`. The `seal_approve_creator` precedent proves a single-object gate dry-runs with **no per-collection object** — but that gate checks `ctx.sender() == model.creator`, a **fixed** address, whereas the entitlement gate must work for an **arbitrary buyer** AND resolve an owned entitlement object the key server has just seen minted. So "a never-launched consumer can decrypt" is **plausible but NOT live-verified** for the buyer-variable case. **This is a gating risk:** U6/U8/U10 decrypt paths must not be declared done until the U5 Seal pre-flight (Part A) confirms (a) the dry-run PTB populates `ctx.sender()` from the SessionKey signing address, and (b) a **wrong-sender** dry-run is denied (negative test). *(see origin: R3, R9; the key-server dry-run question is moved from "resolved" to "verify in U5 pre-flight")*

3. **Remove `seal_approve_cap` entirely.** Once decryption is entitlement-gated, the cap path is a dead alternate decrypt route — leaving it would let a cap holder decrypt without an entitlement. Delete it and its tests; the cap keeps its register-fee/integration role. Partially reverses D-074/D-075. *(see origin: R3)*

4. **Add `access_fee: u64` to `LicenseTerms`; flip the publish invariant.** D-076's `ALLOW_LIST ⇒ derivative_mint_fee > 0` (at `model3d.move:582-585`, `EAllowListNeedsFee`) becomes `ALLOW_LIST ⇒ access_fee > 0`, and the derive-fee gate is **relaxed** (derive fee may be 0 — AE2). Amends D-076. *(see origin: R4, R8, AE2)*

5. **Payment split + flow reorder.** `purchase_access` routes `access_fee` → base creator (mirroring the fee-routing in `launch_collection_internal:875-887`: `coin::split` to `model.creator`, refund remainder, `coin::destroy_zero` on exact pay). The **derive fee stays on the launch path**, charged at mint. The just-built "unlock-first" authoring is reused but the unlock step becomes a **free entitlement-gated decrypt** (no payment); the derive fee moves to the mint step. **Economics consequence (intended, per origin R5/AE1):** once a buyer holds the entitlement they get the plaintext mesh for the access fee alone — so the **access fee is the content gate**, and the **derive fee is a per-launch provenance/convenience charge** (may be 0). Creators must price the access fee as the primary value capture; the derive fee no longer protects content. Capture this framing in D-078 so the pitch is honest about what each fee buys. *(see origin: F1, F3, R5)*

6. **Enforce R9 on-chain by closing *every* ALLOW_LIST-reachable launch entry — resolved now, not deferred.** The encrypted fork is a 3-step flow: `launch_collection` (step-1, the bare entry `launchEncryptedCollection`/`buildLaunchCollectionPtb` actually calls — pays the fee + mints the cap + empty collection) → decrypt → `mint_tokens` (step-3, cap-gated, no model/fee). `launch_collection_with_tokens` is the **PERMISSIONLESS-only** atomic path. Adding the entitlement assert to a *new* entry while leaving `launch_collection` open for ALLOW_LIST would leave a **bypass hole**: any wallet could call `launch_collection(allowListModel, …)` and fork for free (derive fee may now be 0) without ever buying access. **Decision:** put the ALLOW_LIST entitlement requirement inside `launch_collection_internal` (the shared path all launch entries funnel through) so it cannot be bypassed — thread an `Option<&AccessEntitlement>` that is **required** when `policy == ALLOW_LIST` (assert `model_id` + `holder == sender`) and ignored for PERMISSIONLESS. PERMISSIONLESS public signatures stay source-compatible by passing `option::none()`. This is an enforcement change (U3b, cuttable — see Risks), distinct from the load-bearing decrypt-gate relocation (U3a). *(see origin: R9, R11)*

7. **`/launch` catalog via owned-objects-by-type.** Query `objects(filter: { owner, type: "<pkg>::model3d::AccessEntitlement" })` over GraphQL (mirroring `frontend/src/track/useOwnedTokens.ts`), read each entitlement's `model_id`, join to `useModelIndex()`. Show entitlement-held ALLOW_LIST bases + all PERMISSIONLESS bases; exclude encrypted bases with no entitlement. For the *just-bought* entitlement, read it by-id from `objectChanges` in the tx success handler to dodge indexer lag. *(see origin: R10; resolves the catalog-query question)*

8. **Bump `VERSION` 1 → 2.** The `seal_version == VERSION` tripwire on the new gate fails-closed for any abandoned v9 object. Acceptable — fresh republish abandons prior content (R12). *(see origin: R12)*

---

## High-Level Technical Design

*Directional guidance for review, not implementation specification.*

```
BUY ACCESS (F1)                 CONSUMER VIEW (F2)            FORK / LAUNCH (F3)
─────────────                   ──────────────                ─────────────────
purchase_access(model, pay)     SessionKey sign               (precondition: holds entitlement)
  assert pay >= access_fee       → seal_approve_entitlement    "Unlock to design" = FREE decrypt
  split → model.creator            (entitlement + model)         SessionKey → seal_approve_entitlement
  mint AccessEntitlement{         → decrypt key → decrypt GLB    → decrypt base GLB (no payment)
    model_id, holder=sender}     → render in-app (NO download)  author variants live (existing UI)
  transfer::transfer(→ sender)                                 "Mint collection":
  emit AccessPurchased                                          launch_collection(entitlement, pay_derive)
                                                                  assert entitlement binds model+sender
                                                                  charge derive_fee → creator, mint cap
                                                                → mint_tokens (upload quilt + mint)

seal_approve gate (ALLOW_LIST):  entitlement.model_id == id(model)
                                 ∧ entitlement.holder == sender
                                 ∧ is_prefix(model.seal_id, id) ∧ seal_version == VERSION
                                 (RESTRICTED → seal_approve_creator unchanged; PERMISSIONLESS → no gate)
```

---

## Implementation Units

Grouped into three phases. Contract (U1–U5) must land and republish before the frontend units that call the new entries can be browser-verified, but U6–U10 can be **written** against the new ABI in parallel and wired to the new package id at U5.

### Phase A — Contract (`contracts/model3d`)

---

### U1. `AccessEntitlement` struct + `purchase_access` entry + `AccessPurchased` event

**Goal:** A buyer can pay the access fee on an ALLOW_LIST base and receive a soulbound, permanent entitlement; fee routes to the base creator.

**Requirements:** R1, R2, R8 (fee routing); F1; AE1 (no re-charge follows from entitlement being permanent).

**Dependencies:** **U2** (`purchase_access` reads `model.license.access_fee` and the U2 accessor — it will not compile without the field). Land U1+U2 together or U2 first.

**Files:**
- `contracts/model3d/sources/model3d.move` (add struct, entry, event, error code, accessor)
- `contracts/model3d/tests/model3d_tests.move` (covered in U4)

**Approach:**
- Add `public struct AccessEntitlement has key { id: UID, model_id: ID, holder: address }` near the cap definition (~line 319). `key`-only — no `store`.
- Add `public struct AccessPurchased has copy, drop { entitlement_id: ID, model_id: ID, buyer: address, paid: u64 }` near the event block (~line 360), mirroring `CollectionLaunched`.
- Add `entry fun purchase_access(model: &Model3D, payment: Coin<SUI>, ctx: &mut TxContext)`:
  - Assert `model.license.policy == POLICY_ALLOW_LIST` (new error `ENotPurchasable`) — RESTRICTED/PERMISSIONLESS are not purchasable (R11, AE6).
  - Read `let fee = model.license.access_fee;` (field from U2). Assert `coin::value(&payment) >= fee` with a **distinct** new error `EInsufficientAccessFee` (do NOT reuse `EInsufficientDeriveFee=35` / `EFeeTooLow=31` — the frontend error-mapping keys off the codes).
  - `coin::split` the fee → `transfer::public_transfer(fee_coin, model.creator)`; refund remainder to sender; `coin::destroy_zero` the empty remainder (zero-coin hygiene).
  - **Duplicate-purchase guard (idempotency):** prevent a double-click / retry from minting a second entitlement and charging twice. Maintain a `Table<address, bool>` (or dynamic field) of buyers on the `Model3D`; assert the sender is not already present (new error `EAlreadyHasEntitlement`) before charging. This is the on-chain teeth behind AE1 ("never pay again"); the frontend guard alone is insufficient (a dropped-connection retry would re-charge). Note: this requires `purchase_access` to take `&mut Model3D` to mutate the buyers table — confirm the shared-object `&mut` is acceptable (it is; the model is shared).
  - Build entitlement `{ model_id: object::id(model), holder: ctx.sender() }`, `transfer::transfer(entitlement, ctx.sender())` (soulbound — plain `transfer`, not `public_transfer`).
  - `event::emit(AccessPurchased { … })`.
- Add `#[test_only]` accessors if tests need to read entitlement fields, plus a `destroy_entitlement_for_testing`.

**Patterns to follow:** fee-split/refund at `model3d.move:875-887`; soulbound transfer at `model3d.move:924`; event shape `CollectionLaunched` at `model3d.move:360-364`.

**Test scenarios** (implemented in U4): see U4.

**Verification:** `sui move build` clean; entry appears in the built ABI with the expected arg count.

---

### U2. Add `access_fee` to `LicenseTerms` + flip publish validation

**Goal:** Creators set two independent prices; publish rejects ALLOW_LIST with `access_fee == 0` and accepts `derivative_mint_fee == 0`.

**Requirements:** R4, R8; AE2.

**Dependencies:** none. Land before/with U1 (U1 reads `access_fee`).

**Files:**
- `contracts/model3d/sources/model3d.move` (struct field, constructor signature, validation, accessor)
- `contracts/model3d/tests/model3d_tests.move` (U4 + update `default_license()` / `new_license_terms` call sites)

**Approach:**
- Add `access_fee: u64` to `LicenseTerms` (struct at `model3d.move:197-203`).
- Update `new_license_terms` (line 460) signature to take `access_fee` (decide arg order — append after `derivative_mint_fee` to minimize confusion; **every call site in tests must update**).
- Add `public fun access_fee(license: &LicenseTerms): u64`.
- In `validate_seal_publish` (lines 574-596): **replace** the assert at 582-585 with `assert!(license.policy != POLICY_ALLOW_LIST || license.access_fee > 0, EAllowListNeedsFee)`. Remove the `derivative_mint_fee > 0` requirement for ALLOW_LIST (derive fee may now be 0). Keep `EAllowListNeedsFee` (its meaning shifts from derive→access; note in the ADR).

**Patterns to follow:** existing `LicenseTerms` accessors (476-478); the on-chain struct-construction rule — `LicenseTerms` is built via `new_license_terms`, never passed as a BCS struct arg (see `docs/solutions/integration-issues/sui-ptb-struct-arg-pitfall-2026-05-15.md`).

**Test scenarios** (U4): publish ALLOW_LIST with `access_fee=0` aborts `EAllowListNeedsFee`; publish ALLOW_LIST with `access_fee>0, derive_fee=0` succeeds (Covers AE2); PERMISSIONLESS with both fees 0 succeeds.

**Verification:** `sui move build` clean; all existing tests updated for the new constructor arity compile.

---

### U3. Relocate the decrypt gate to the entitlement (U3a) + enforce ALLOW_LIST launch precondition (U3b)

Split into a **load-bearing** part (U3a) and a **cuttable** enforcement part (U3b) so the cut-line is mechanical, not a judgment call under deadline.

**Goal:** Decryption is gated on the entitlement; the cap no longer decrypts (U3a). ALLOW_LIST launch cannot be performed without the entitlement, through *any* entry (U3b).

**Requirements:** R3 (U3a); R9, R11 (U3b); F3.

**Dependencies:** U1 (entitlement struct).

**Files:**
- `contracts/model3d/sources/model3d.move`
- `contracts/model3d/tests/model3d_tests.move` (U4)

**Approach — U3a (load-bearing, decrypt gate):**
- Bump `VERSION: u64 = 1` → `2` (line 56).
- Add `entry fun seal_approve_entitlement(id: vector<u8>, entitlement: &AccessEntitlement, model: &Model3D, ctx: &TxContext)`:
  - `assert!(entitlement.model_id == object::id(model), <new EEntitlementModelMismatch>)`
  - `assert!(entitlement.holder == ctx.sender(), <new ENotEntitlementHolder>)`
  - `assert!(is_prefix(&model.seal_id, &id), EIdPrefixMismatch)` (preserves the Resolution-G binding — an entitlement for base A cannot decrypt base B)
  - `assert!(model.seal_version == VERSION, ESealVersionMismatch)`
  - Add a `#[test_only] seal_approve_entitlement_for_testing` wrapper mirroring the existing test wrappers (1288-1305).
- **Delete** `seal_approve_cap` (1182-1192) and its `_for_testing` wrapper — this removes the only alternate decrypt route. Remove `ECapCollectionMismatch`/`ECollectionModelMismatch` only if now unused (grep first: referenced in tests + frontend comments per research; abort-code numbers are ABI history — do not reuse 48/49).
- **Keep** `seal_approve_creator` (RESTRICTED, unchanged).

**Approach — U3b (cuttable, R9 launch enforcement):**
- Put the ALLOW_LIST entitlement requirement inside `launch_collection_internal` (847-914) — the shared path **all** launch entries funnel through — so no entry can bypass it (closes the free-fork hole). Add an `entitlement: Option<&AccessEntitlement>` param threaded from every public launch entry (`launch_collection`, `launch_collection_with_tokens`, `launch_collection_with_entitlement` if added): when `policy == POLICY_ALLOW_LIST`, require `Some` and assert `model_id == object::id(model)` ∧ `holder == ctx.sender()` before the fee step; for PERMISSIONLESS, `None` is fine. PERMISSIONLESS public entries stay source-compatible by internally passing `option::none()`.
- If U3b is cut for time: the decrypt gate (U3a) alone still enforces value — a forker who never bought access cannot decrypt and so produces a useless ciphertext-only collection. U3b prevents the *spam/free-provenance* edge, not the core value gate.

**Patterns to follow:** `seal_approve_creator` (1195-1203) single-object gate; `is_prefix` (1165-1174); test wrappers (1288-1305); the existing `EPolicyRestricted` policy gate in `launch_collection_internal` (860-863) is the model for the new ALLOW_LIST gate.

**Test scenarios** (U4): see U4.

**Verification:** `sui move build` clean; ABI shows `seal_approve_entitlement`, no `seal_approve_cap`; no public launch entry accepts an ALLOW_LIST model without an entitlement (U4 covers the bypass test).

---

### U4. Move tests — entitlement gate, purchase, flipped publish, fee routing, launch precondition

**Goal:** All new contract behavior is covered, mirroring the existing test structure.

**Requirements:** R1, R2, R3, R8, R9, R11; AE1, AE2, AE3, AE6.

**Dependencies:** U1, U2, U3.

**Execution note:** characterization-first for the touched helpers — update `mint_base_model` / `fork_encrypted_allow_list` / `default_license()` for the new constructor + entitlement before adding new asserts, so the existing green suite stays green through the refactor.

**Files:**
- `contracts/model3d/tests/model3d_tests.move`

**Approach:** Update `default_license()` (~line 81) and all `new_license_terms` call sites for the `access_fee` arg. Refactor `fork_encrypted_allow_list` (2040-2063) into a `buy_access_then_*` helper that mints the entitlement via `purchase_access`. Rewrite the `seal_approve_cap_*` tests (2218-2352) into `seal_approve_entitlement_*` using `seal_approve_entitlement_for_testing`. Add `destroy_entitlement_for_testing` teardown.

**Test scenarios:**
- `purchase_access` happy path: ALLOW_LIST base, pay ≥ access_fee → entitlement minted to buyer, `model_id` binds, fee transferred to creator, `AccessPurchased` emitted. **Covers AE1** (entitlement is permanent ⇒ second purchase never needed).
- `purchase_access` underpay → aborts `EInsufficientAccessFee`.
- `purchase_access` **twice** by the same wallet on the same model → second call aborts `EAlreadyHasEntitlement` (no second charge, no second entitlement). **Reinforces AE1.**
- `purchase_access` on RESTRICTED and on PERMISSIONLESS → aborts `ENotPurchasable`. **Covers AE6** (RESTRICTED not purchasable).
- `purchase_access` exact-pay → no leftover coin (zero-coin hygiene).
- Publish: ALLOW_LIST `access_fee=0` → aborts `EAllowListNeedsFee`; ALLOW_LIST `access_fee>0, derive=0` → ok. **Covers AE2.**
- `seal_approve_entitlement` passes when holder + model + prefix + version all hold. **Covers AE3.**
- Isolation aborts (one per): wrong `model_id` → `EEntitlementModelMismatch`; non-holder sender → `ENotEntitlementHolder`; bad prefix → `EIdPrefixMismatch`; stale `seal_version` → `ESealVersionMismatch`.
- Launch precondition (U3b): for **each** ALLOW_LIST-reachable launch entry, calling without an entitlement (`None`) or with a wrong-holder/wrong-model entitlement → aborts; with a valid entitlement → charges derive fee, mints cap. **Covers R9** + the bypass-hole closure.
- Regression: PERMISSIONLESS launch path unchanged (passes `None`, no entitlement required).

**Verification:** `sui move test` all green; no reference to `seal_approve_cap` remains.

---

### U5. Republish v10 + wire package id

**Goal:** Deploy the new package to testnet and point the app at it.

**Requirements:** R12; Dependencies/Assumptions (fresh republish).

**Dependencies:** U1–U4 (build + tests green).

**Files:**
- `contracts/networks/testnet.json` (canonical artifact — new `model3dPackageId`, `publisherId`, `transferPolicyId`, `transferPolicyCapId`, `sealIdRegistryId`, etc.)
- `frontend/src/sui/networkConfig.ts` (mirror — parity-checked by `frontend/src/sui/networkConfig.test.ts`)
- `contracts/UPGRADE.md` (append the v10 republish note)

**Approach:** Fresh `sui client publish` (NOT upgrade — gate relocation must not leave old ungated bytecode callable; D-040 rationale). Re-bootstrap `ensure_collection_policy<NftToken>` + `SealIdRegistry` `init` (the v3–v9 precedent makes this routine). Capture all new object ids, update both `testnet.json` and `networkConfig.ts` in the **same commit**, run `networkConfig.test.ts` to confirm parity. **Pre-flight:** the VERSION bump fails-closed (silently) on every v9 object — enumerate any pinned/committed v9 object ids (demo models, test fixtures, sample data) and confirm none are relied on post-republish, since the breakage is invisible until a decrypt is attempted.

**Test scenarios:** `Test expectation: none — deployment + config wiring; correctness is the parity test (`networkConfig.test.ts`) staying green and the post-deploy Seal pre-flight (U10 verification).`

**Verification:** parity test green; a manual `getObject` on the new package id resolves; Seal live-verification Part A pre-flight (entry-fn arg-count assertions + registry shape + key-server reachability) passes.

---

### Phase B — Frontend (`frontend`, `shared`)

---

### U6. Shared types + PTB builders for the new ABI

**Goal:** The app can read `accessFee`, publish with it, call `purchase_access`, and build the entitlement-based `seal_approve`.

**Requirements:** R3, R4, R8, R10; F1.

**Dependencies:** U5 (package id) for runtime; can be written against the planned ABI before deploy.

**Files:**
- `shared/src/types.ts` (add `accessFee: string` to `Model3DSummary`; the new field sits beside `derivativeMintFee` at ~line 98)
- `frontend/src/buy/hooks.ts` (`jsonToSummary` — map `license.access_fee`)
- `frontend/src/browse/useModelIndex.ts` (`nodeToSummary` — parallel mapping, see comment at ~line 69)
- `frontend/src/sui/modelTxBuilders.ts` (`LicenseTermsInput` + `attachNewLicenseTerms` — add the `access_fee` `tx.pure` arg matching `new_license_terms`)
- `frontend/src/sui/collectionTxBuilders.ts` (replace `buildSealApproveCapPtb` 327-349 with `buildSealApproveEntitlementPtb`; add `buildPurchaseAccessPtb`)
- `frontend/src/collection/encryptedFork.ts` (`PACKAGE_ID` re-export; the `decryptEncryptedBase` call site that invokes the seal_approve builder, 159-164)
- `frontend/src/seal/decryptAndView.ts` (new — extract the SessionKey → seal_approve_entitlement → `decryptEncryptedBase` sequence into a shared helper so U8 and U10 both consume a stable artifact)

**Approach:**
- `buildSealApproveEntitlementPtb`: target `${PKG}::model3d::seal_approve_entitlement`; args `[tx.pure.vector('u8', id), tx.object(entitlementId), tx.object(baseModelId)]`. **Drop** `collectionId`/`capId`. `id` is still the FULL Seal identity (`EncryptedObject.parse(sealedKey).id` via `recoverFullSealId`), NOT the on-chain prefix.
- `buildPurchaseAccessPtb({ modelId, accessFeeMist })`: target `${PKG}::model3d::purchase_access`; `tx.splitCoins(tx.gas, [accessFeeMist])`, args `[tx.object(modelId), coin]`. `accessFeeMist` is a caller arg read from `Model3DSummary.accessFee` (a per-base value, not a builder constant), mirroring `buildLaunchCollectionPtb`'s `feeMist`. The Move side refunds any excess.
- Update `LicenseTermsInput` (modelTxBuilders.ts:44-50) + the `tx.pure` arg list in `attachNewLicenseTerms` (115-126) for `access_fee`. Update the `encodeLicenseTerms` BCS snapshot if present (field-order regression).

**Patterns to follow:** existing `buildSealApproveCapPtb` (the builder being replaced); coin-splitting in existing fee PTBs; **test PTBs with `dryRunTransactionBlock`, not `JSON.stringify(tx.getData())`** (sui-ptb-struct-arg-pitfall learning).

**Test scenarios:**
- `buildPurchaseAccessPtb` produces a PTB that **dry-runs** successfully against the deployed package (target name + arg count + coin arg correct).
- `buildSealApproveEntitlementPtb` dry-runs; first arg is the full seal id; object arg is the entitlement, not a cap.
- `jsonToSummary` / `nodeToSummary` map `access_fee` → `accessFee` (string mist) for an ALLOW_LIST node; default `'0'` when absent.
- `attachNewLicenseTerms` round-trips `accessFee` into the publish PTB (dry-run).

**Verification:** `npx vitest run` for the touched modules green; dry-run assertions pass against the new package id.

---

### U7. CreateModelPage — access-fee input + flipped client guard

**Goal:** A creator publishing an ALLOW_LIST base sets a required access fee and an optional derive fee.

**Requirements:** R4, R8; AE2.

**Dependencies:** U6.

**Files:**
- `frontend/src/creator/CreateModelPage.tsx`

**Approach:** Add an `accessFeeSui` input shown when `policy === POLICY_ALLOW_LIST`. Relabel the existing fee input back to a plain "DERIVATIVE MINT FEE (SUI) — optional" for ALLOW_LIST (it was the unlock-price gate; that role moves to access fee). **Move** the client guard at 677-680 from `derivativeMintFee <= 0` to `accessFee <= 0` for ALLOW_LIST; allow derive fee = 0. Thread `accessFee: suiToMist(accessFeeSui)` into the license object assembled in `onMint` (743-749) and through `attachNewLicenseTerms`. **Policy-flip behavior (decision):** when `policy` changes away from ALLOW_LIST, reset `accessFeeSui` to empty (it cannot be charged on PERMISSIONLESS/RESTRICTED anyway) so a stale value can't silently ride into publish; returning to ALLOW_LIST shows the empty/placeholder input.

**Patterns to follow:** existing policy-card + fee-input wiring (977-1006); `suiToMist` helper.

**Test scenarios:**
- ALLOW_LIST selected → access-fee input renders (testid); PERMISSIONLESS → it does not.
- Submitting ALLOW_LIST with access fee 0 → blocked client-side with the access-fee message. **Covers AE2** (client mirror of the on-chain assert).
- Submitting ALLOW_LIST with access fee > 0 and derive fee 0 → allowed; license object carries both fees.
- `onMint` publish PTB includes `access_fee` (dry-run/mock assertion).

**Verification:** `npx vitest run CreateModelPage` green; tsc adds **zero** new errors over the 32 baseline (delete stale `*.tsbuildinfo` first).

---

### U8. ModelDetailPage — buy access + consumer in-app view (no download)

**Goal:** On an ALLOW_LIST base, a visitor can buy access (mint entitlement) and an entitlement holder can view the decrypted mesh in-app with no file download.

**Requirements:** R6, R7, R8, R11; F1, F2; AE5, AE6.

**Dependencies:** U6 (hard). U9 (soft — the "already owns access" check can be driven inline from the purchase `objectChanges` / a slim owned-objects read, then wired to `useOwnedEntitlements` once U9 lands; this lets U8/U9 proceed in parallel). The decrypt+render helper is **extracted into a shared module in U6** (`frontend/src/seal/decryptAndView.ts`) so U8 and U10 depend on a stable artifact, not a LaunchCollectionPage internal.

**Files:**
- `frontend/src/buy/ModelDetailPage.tsx`
- `frontend/src/buy/hooks.ts` (if a small "has entitlement for this model" selector is added over `useOwnedEntitlements`)
- `frontend/src/seal/decryptAndView.ts` (shared decrypt+render helper — created in U6, consumed here and in U10)

**Interaction states (decision — implementer must not invent these):**

| State | Trigger | UI |
|---|---|---|
| Not connected (ALLOW_LIST) | no wallet | "Connect wallet to buy access" (reuse existing ConnectButton; mirrors CLAUDE.md "login required before mint") — no purchase CTA |
| No entitlement | connected, not a holder | "Buy access — {fee} SUI" CTA (fee formatted SUI from mist) |
| Purchase pending | `signAndExecute` in flight | CTA disabled + spinner |
| Purchase failed | tx/sign error | error message + re-enabled CTA |
| Decrypting | purchase ok OR "View" tapped | viewer area shows centered spinner + "Decrypting model…"; action disabled |
| Decrypt failed after purchase | decrypt throws post-mint | distinct message "Access confirmed — decryption failed" + a named **"Retry decrypt"** button (NOT the purchase CTA; never re-purchases) |
| Viewing | decrypt ok | mesh mounted in Babylon viewer; **no** download/export affordance |
| RESTRICTED, non-creator | policy RESTRICTED | no buy-access action (AE6) |
| PERMISSIONLESS | policy 2 | unchanged public render |

**Approach:**
- Branch on `model.policy`: **ALLOW_LIST** → show a "Buy access — {accessFee} SUI" CTA when the wallet holds no entitlement; when it does, show a "View model" action. **RESTRICTED** → no buy-access action (AE6); creator-only view. **PERMISSIONLESS** → unchanged (public).
- Buy: `buildPurchaseAccessPtb` → `signAndExecute` → on success read the new entitlement id from `objectChanges` (dodge indexer lag) and flip to the "View" state. `purchase_access` is a single atomic tx (pay + mint), so a failure mints nothing — retry is clean; **no double-charge risk** at this step (distinct from the old pay-then-decrypt cap flow).
- View: SessionKey (reuse `getCachedSession`) → `buildSealApproveEntitlementPtb` → `decryptEncryptedBase` (entitlement) → render the decrypted GLB in the **in-app Babylon viewer only**. **No** raw-file download / object-URL link is exposed (R7). Reuse the v9 fresh-object retry (~4× backoff) for the post-purchase decrypt race.
- **Idempotent view:** if decrypt fails after a successful purchase, retry re-runs only the free decrypt dry-run (entitlement already minted) — never re-purchase. Key resume off the owned entitlement id.

**Patterns to follow:** `useModelById` fetch (hooks.ts:7-18); the existing `isEncrypted` branch (74-117); the SessionKey + decrypt path in `LaunchCollectionPage.onUnlock`; the `pendingCapRef` idempotent-resume shape (now keyed off the entitlement).

**Test scenarios:**
- ALLOW_LIST, not connected → "Connect wallet to buy access" prompt, no purchase CTA.
- ALLOW_LIST, connected, no entitlement → "Buy access" CTA visible with the fee rendered in **SUI** (mist→SUI conversion at the display site); clicking builds the purchase PTB (mock signAndExecute) and on success transitions to "Decrypting"→"View".
- ALLOW_LIST, entitlement held → "View" action; triggering it calls the decrypt helper and mounts the viewer; **no download/export affordance present in the DOM**. **Covers AE5.**
- RESTRICTED, non-creator → no buy-access action rendered. **Covers AE6.**
- PERMISSIONLESS → unchanged public render (regression).
- Decrypt fails after purchase → retry calls decrypt again, purchase PTB **not** re-issued (assert builder called once).

**Verification:** `npx vitest run ModelDetailPage` green; tsc baseline unchanged. Browser pre-wallet portion via `agent-browser` (assert CTA states + absence of a download link); the wallet-signed buy + decrypt is user-run in real Chrome + Slush (sign-in-gated; agent-browser has no Slush).

---

### U9. `useOwnedEntitlements` hook

**Goal:** Read all `AccessEntitlement` objects a wallet holds, keyed to base `model_id`, for the catalog and the detail-page "already owns access" check.

**Requirements:** R10; F4.

**Dependencies:** U5 (package id / type tag).

**Files:**
- `frontend/src/collection/useOwnedEntitlements.ts` (new) — or co-locate beside `useOwnedTokens.ts`
- `frontend/src/collection/useOwnedEntitlements.test.ts` (new)

**Approach:** Mirror `frontend/src/track/useOwnedTokens.ts` exactly: GraphQL `objects(filter: { owner: SuiAddress, type: "<pkg>::model3d::AccessEntitlement" })`, map `node.asMoveObject.contents.json.model_id`, expose a `Set<modelId>` plus the raw entitlement ids (needed as the `seal_approve` object arg). Include a `reloadKey` param to force refetch after a purchase. **Introspect the live endpoint** for the exact filter/cursor shape — don't trust doc/LLM memory (events-schema-drift precedent).

**Patterns to follow:** `useOwnedTokens.ts` (query shape, `tokenTypeTag()`, `reloadKey`, `nodeToToken`).

**Test scenarios:**
- Returns the set of `model_id`s for a wallet holding two entitlements (mock GraphQL response).
- Empty wallet → empty set, no error.
- `reloadKey` change triggers refetch.
- Pagination is **out of scope at hackathon scale** — fetch the first page only with a `// TODO: pagination not implemented` comment. No cursor test (no evaluator wallet exceeds one page; `useOwnedTokens` makes the same single-page assumption).

**Verification:** `npx vitest run useOwnedEntitlements` green.

---

### U10. LaunchCollectionPage — entitlement-gated free decrypt + accessible-bases catalog + derive-fee-at-mint

**Goal:** /launch lists only forkable bases; "Unlock to design" is a free entitlement-gated decrypt; the derive fee is charged at mint.

**Requirements:** R5, R9, R10; F3, F4; AE3, AE4.

**Dependencies:** U6 (builders), U9 (entitlement hook), U5 (package id).

**Files:**
- `frontend/src/collection/LaunchCollectionPage.tsx`
- `frontend/src/collection/encryptedFork.ts` (the decrypt orchestration loses the cap dependency; `launchEncryptedCollection`/`mintEncryptedTokens` keep the derive-fee + cap at mint time)
- `frontend/src/collection/LaunchCollectionPage.test.tsx`

**Approach:**
- **Catalog (R10/F4):** from `forkable` (currently `models.filter(m => m.glbBlobId !== '')`, line 430), render in two visual states (decision — not "may"): **launchable** = PERMISSIONLESS bases ∪ ALLOW_LIST bases whose `objectId ∈ useOwnedEntitlements()` set (full card, click to fork); **locked** = ALLOW_LIST bases the wallet has no entitlement for, shown as a grayed/locked card with a "Buy access on model page" link to `/model/:id`. Showing locked cards (rather than hiding them) keeps the catalog from looking empty for a new wallet and gives forkers a visible path to acquire access. RESTRICTED non-creator bases are not shown.
- **Unlock = free decrypt:** the existing `onUnlock` drops the step-1 `launchEncryptedCollection` payment. It now does: SessionKey → `buildSealApproveEntitlementPtb` (entitlement id from `useOwnedEntitlements`) → `decryptEncryptedBase` → `setBaseGlb(plaintext)`. No cap, no payment here. The "Unlock to design — pay … SUI" copy becomes "Unlock to design — decrypt (free, you own access)".
- **Derive fee at mint:** `onMintEncrypted` now charges the derive fee — call the step-1 `launch_collection` entry (now taking the entitlement per U3b) which pays `derive_fee` + mints the cap + empty collection, then `mint_tokens` step-3 (upload quilt + mint into that collection). The cap is created **here, at mint**, not at unlock — so the existing `buildLaunchCollectionPtb`/`mintEncryptedTokens` helpers move from the unlock step to the mint step, with the entitlement object added to the launch arg list. (`launch_collection_with_tokens` stays PERMISSIONLESS-only.)
- Remove the now-dead `unlockedCap`/`pendingCapRef` *payment* semantics; if a ref is still needed it keys off the entitlement, but since unlock no longer pays, the double-charge guard is no longer load-bearing at unlock (it moves, if anywhere, to the single mint payment which is naturally one tx).
- Public (PERMISSIONLESS) path unchanged (`onLaunch` atomic).

**Patterns to follow:** the existing `onUnlock`/`onMintEncrypted` split and `isEncryptedBase`/`needsUnlock` gating (783-933); `useOwnedTokens` for the catalog join; the SessionKey/decrypt helpers.

**Test scenarios:**
- Catalog: wallet with an entitlement for encrypted base X but not Y → X rendered launchable, Y rendered as a **locked card** with a `/model/:id` buy-access link, public base Z launchable. **Covers AE4** (Y is not launchable without the entitlement; locked ≠ forkable).
- Pick X → "Unlock to design (free)" gate; triggering it decrypts (mock) and mounts the live editor with **no payment PTB issued**. **Covers AE3.**
- Mint: `onMintEncrypted` issues the entitlement-gated launch (charges derive fee, mock) + `mint_tokens`; passes the entitlement id; derive fee read from the base summary.
- Derive fee = 0 base → unlock + mint succeed with a zero derive payment (Covers R5 "derive may be 0" UI path).
- Re-pick base → catalog/decrypt state resets.
- Regression: PERMISSIONLESS launch unchanged.

**Verification:** `npx vitest run LaunchCollectionPage` green; tsc baseline unchanged. Browser pre-wallet portion (catalog filtering visible at `/launch` after sign-in; assert X present / Y absent). Wallet-signed unlock + mint user-run in real Chrome + Slush, confirming the recolored variants render live and the derive fee is the only charge.

---

### Phase C — Docs

---

### U11. ADR D-078 + spec §3.7 rewrite + decision-reversal bookkeeping

**Goal:** Capture the decrypt-gate relocation and fee split per the Decision Reversal Protocol; stop the docs from describing cap-as-gate as live.

**Requirements:** origin Key Decisions; CLAUDE.md Decision Reversal Protocol.

**Dependencies:** U1–U10 (so the ADR reflects what shipped).

**Files:**
- `docs/decisions.md` (new **D-078**; update Status/Related lines on D-074, D-075, D-076)
- `docs/spec.md` (§3.7 — rewrite to entitlement-gated decryption + the two-fee model + "L1 Model3D + access entitlement + L2 Collection/NftToken" relabel; drop "L3 Access" framing)
- `docs/phase-progress.md` (session wrap)
- `CLAUDE.md` (Core Architecture L1/L2/L3 block + Core Constraints — re-label access as an L1 entitlement, not L3)

**Approach:** D-078 `Amends D-076` (fee gate moves derive→access; derive may be 0) and `Partially reverses D-074/D-075` (decrypt gate cap→entitlement; cap retains register-fee/integration only). Set D-074/075/076 "Related" pointers to D-078; do not mark them Superseded (they remain mostly in force). Update the three-tier description in CLAUDE.md and spec §3.7 to the entitlement framing. **Record two honesty boundaries explicitly** so the pitch doesn't overclaim: (a) the in-app "no download" (R7) is **UX friction, not DRM** — plaintext GLB bytes reach the browser heap after decryption and a technical user can extract them; true DRM is out of scope for v1; (b) `LicenseTerms` (incl. `access_fee`) is **immutable post-publish** in v1 (no setter entry planned), so there is no creator-side fee-change race against a buyer — and confirm no existing code path mutates a shared `Model3D`'s license.

**Test scenarios:** `Test expectation: none — documentation.`

**Verification:** D-078 follows the ADR template; spec §3.7 no longer presents cap-as-decrypt-gate as current; CLAUDE.md architecture block matches the shipped model.

---

## System-Wide Impact

| Surface | Change | Affected parties |
|---|---|---|
| Sui Move package | New struct + entry + event; `LicenseTerms` field; gate relocation; VERSION bump; **fresh package id** | All on-chain reads/writes — every PTB builder must point at v10 |
| Seal decrypt path | `seal_approve` first object arg changes cap → entitlement | Key-server dry-run (re-verify live), forge decrypt PTB |
| `Model3DSummary` | new `accessFee` field | both indexer mappers, detail page, create page |
| `/model/:id` | new buy-access + consumer view | consumers (new audience), creators |
| `/launch` | catalog filtered to accessible bases; unlock now free | forkers |
| Old v9 testnet objects | abandoned (VERSION tripwire fails-closed) | acceptable (R12) |

---

## Scope Boundaries

### Deferred to Follow-Up Work
- Inline "buy access" *on /launch* itself — v1 routes forkers to `/model/:id` to purchase, then the base appears in the catalog. An inline buy-access shortcut is a later convenience.
- Pagination of `useOwnedEntitlements` beyond the first page if a wallet holds more entitlements than one GraphQL page (document the cap with `log` if hit; unlikely at hackathon scale).

### Deferred for later (from origin)
- Transferable, time-limited, or subscription access — entitlement is soulbound + permanent for v1.
- The frontend-only "cap-reuse" stopgap — superseded by the real entitlement model; not built.

### Outside this product's identity (from origin)
- Royalty rail (`derivative_royalty_bps` on resale) — unchanged.
- Register fee / integration economics — unchanged; the cap keeps owning those.
- Multi-layer derivation — still 1-layer capped.
- A separate access marketplace / discovery surface beyond browse + model detail.

---

## Risks & Mitigations

- **Timeline (highest).** Contract republish + 5 frontend surfaces + docs against a ~20-day window with demo/deck still ahead. **Cut-line if time runs short** (in order of what to drop — *corrected so the pitch payload is protected*): (1) `/launch` locked-card polish (show fewer states) → (2) **U3b** on-chain launch-precondition assert (decrypt-gating alone still enforces value; U3b only closes the free-provenance edge) → (3) U9 pagination niceties. **Protect last:** U8's consumer-view *render* — it is the origin's **success criterion #1** (the demonstrable "pay-to-access premium 3D content" beat the recorded demo video is built around). Dropping it first would ship the version that *least* supports the pitch. The **irreducible core** for the pitch is: U1–U7 + **U9** + **U10** + **U8 consumer-view render** + U5 republish. U11 docs are important but **not submission-blocking** (no evaluator-visible behavior) — do them after U10/U8 ship. Surfaced for visibility — the user chose full scope; this is the insurance order, not a scope change.
- **Seal key-server dry-run with the new arg (gating).** The entitlement PTB changes the `seal_approve` first object arg, and the gate is now buyer-variable (not the fixed-creator precedent — see Decision #2). This is one of two seams never live-verified even in v9. **Gate U6/U8/U10 decrypt paths on the U5 Part A pre-flight: confirm `ctx.sender()` is populated from the SessionKey signer AND that a wrong-sender dry-run is denied. Re-run Part B (real Slush) before declaring U8/U10 done.**
- **Demo-arc dress rehearsal.** The judge-facing payoff is one flow: buy-access → view rendered mesh → fork. Before the cut-line decision bites, run the full arc end-to-end on testnet in real Slush as an explicit milestone (not just per-unit unit tests) — the unverified Seal seam fails only at real-Slush time, and discovering that late could sink the demo inside the ~20-day window.
- **Fresh-object race after purchase.** Key server may not see a just-minted entitlement; reuse the existing ~4× backoff retry on the entitlement decrypt; read the entitlement by-id from `objectChanges` for the catalog/state flip.
- **Constructor-arity break.** Adding `access_fee` to `new_license_terms` breaks every Move test call site and the publish PTB builder — update them in the same change (U2/U6), test with `dryRunTransactionBlock` not JSON inspection.
- **Dead error codes.** Removing `seal_approve_cap` may orphan `ECapCollectionMismatch`/`ECollectionModelMismatch` — verify no other references before deleting.
- **tsc baseline.** Respect the 32-error baseline; delete stale `*.tsbuildinfo` before counting; the bar is zero NEW errors.

---

## Dependencies / Assumptions

- Fresh `sui client publish` (v10), not upgrade — gate relocation must not leave old ungated bytecode callable (D-040).
- Reuses the just-built "unlock-first" authoring; the unlock step loses its payment (decrypt is now entitlement-gated and free), and the derive fee moves to mint.
- Entitlement ownership is queryable by (wallet, type) via GraphQL owned-objects — verify filter/cursor shape against the live endpoint.
- PERMISSIONLESS bases are unencrypted — no entitlement, no decrypt (unchanged).
- Frontend-touching units (U7–U10) dispatch the **5-reviewer roster** including `ce-julik-frontend-races-reviewer` (CLAUDE.md). Confirm the roster actually completes (prior socket-error flakiness).

---

## Execution Posture

- **Contract (U1–U4):** tests mirror the existing `model3d_tests.move` structure; characterization-first on the shared helpers (`default_license`, `fork_encrypted_allow_list`) so the green suite survives the constructor/gate refactor.
- **Frontend (U6–U10):** PTB correctness verified with `dryRunTransactionBlock`, not PTB-JSON inspection. Seal seam mocked in unit tests; the live key-server round-trip is the manual Part A/Part B checklist, not CI.
