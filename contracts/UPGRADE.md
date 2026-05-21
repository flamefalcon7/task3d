# Sui Package Upgrade ABI Rules — `model3d::model3d`

How to evolve the on-chain ABI without breaking existing holders, indexers, or in-flight PTBs. **Source of truth: <https://docs.sui.io/concepts/sui-move-concepts/packages/upgrade>** — re-read before any non-trivial change.

This file applies to **mainnet** upgrades. Testnet republishes are cheap and abandon-in-place; treat testnet PackageIDs as disposable until the mainnet ceremony at U13.

---

## When fields CAN be added to existing structs

Sui supports `additive` and `dep_only` compatible upgrades. For struct fields the rule is narrower than "append-only":

- **`copy + drop` structs (e.g. events like `RoyaltyPaid`, `ModelPublished`)** — **fields cannot be added or removed.** Compatibility is by exact layout. To extend an event, define `RoyaltyPaidV2` alongside and emit both for one upgrade window, then deprecate the old one after indexers migrate. Never edit the old struct in place.
- **`key` objects (`Model3D`, `NftCollection`)** — **fields cannot be added or removed** on an existing struct in a compatible upgrade. The struct layout is part of the on-chain object representation; changing it would invalidate all existing instances. Add a sibling `Model3DV2` struct + new entry fn if a layout change is required, and keep the old `Model3D` accessors functional until indexers migrate. **Deleting a public struct entirely (e.g. `Access` in v3) is also breaking** — it removes type and accessor symbols from the ABI, so it forces a fresh package publish, never a compatible upgrade.
- **`store + copy + drop` value types (e.g. `LicenseTerms`)** — same rule. Editing the field list of a struct held by other live objects breaks deserialization of those objects on read. If `LicenseTerms` needs another field, add `LicenseTermsV2` + a `new_license_terms_v2` constructor + accessor overloads.

The "additive" upgrade flavor refers to **adding new public functions, new public structs, and new public constants** — **not** mutating existing struct layouts.

---

## When entry-function signatures can change

- **Adding new `public fun` / `public entry fun` is always safe** on a compatible upgrade.
- **Renaming or removing an existing public function is NEVER safe.** It breaks every PTB anyone has cached, every signed-but-unsubmitted tx, and every indexer that watches function-call shapes. To deprecate: keep the old function as a thin wrapper that calls the new one, or leave it untouched and direct new clients to the new function.
- **Changing the parameter list or return type of an existing public function is NEVER safe** on a compatible upgrade. Add a new function (e.g. `purchase_with_kiosk_v2`) and migrate callers.
- **`fun init` runs exactly once at original publish.** Upgrades do NOT re-run `init`. If new bootstrap state (e.g. a new shared object) is needed post-upgrade, expose a one-shot `public entry init_v2(...)` and gate it with a one-time flag or with `Publisher`-bearer authorization.

---

## What triggers a new package vs an upgrade

| Change | Compatible upgrade? | If not, what to do |
|---|---|---|
| Add a new `public fun` | ✅ yes | upgrade |
| Add a new `public struct` (any abilities) | ✅ yes | upgrade |
| Add a new `const` | ✅ yes | upgrade |
| Change a `public fun`'s signature | ❌ no | new function alongside; route new clients there |
| Add/remove a field on an existing struct | ❌ no | sibling `StructV2` + migration window |
| Add/remove a struct ability (e.g. add `store` to `Model3D`) | ❌ no — ability bound by layout | **new package publish; original-id changes** |
| Change a `public fun` body without touching its signature | ✅ yes | upgrade |
| Change a `private` function (body or signature) | ✅ yes | upgrade — `private` functions aren't part of the ABI |

A compatible upgrade publishes under a **new `published-at` PackageID** but preserves the **`original-id`** (the first-ever PackageID for this package). Indexers should track `original-id` for cross-upgrade joins. A breaking change publishes a brand new package with a brand new `original-id`; from a client perspective it is a different package.

The Phase 2 → Phase 4 jump on testnet was a breaking change (Model3D ability set changed from `has key` to `has key, store`). We could not upgrade in place; we re-published under a new PackageID and abandoned the Phase 2 testnet objects.

The Phase 4 **v2 → v3** jump (D-029, four-role collection layer) is likewise a **breaking change, not a compatible upgrade**: v3 *deletes* the public `Access` struct + its accessors (`access_target_id` / `access_holder` / `access_expires_at_ms`) + `destroy_access_for_testing`. Removing public ABI symbols is incompatible, so v3 republishes under a fresh `original-id` (U5). This is low-cost now — the frontend is not yet migrated off the obsolete Phase-2 flow and no demo pre-bake exists, so there is no v2 on-chain state worth preserving. v3 *adds* `NftCollection` / `NftCollectionCreatorCap` / `NftToken` / `launch_collection` / `set_register_fee` / `register_integration` / `mint_nft_token` (all additive on their own — only the `Access` deletion forces the republish).

**D-032 (also in v3):** `Model3D` is now published as a SHARED object via `publish`; the L1 Kiosk path (`mint_and_list`, `purchase_with_kiosk`, `ensure_transfer_policy`, the `RoyaltyPaid` event) is **removed**. Removing public functions/structs is breaking — it rides the same v3 republish. The only `TransferPolicy` in v3 is for `NftToken`; the U5 bootstrap therefore runs only `ensure_collection_policy`.

**v3 shipped 2026-05-20 (testnet):** `package_id 0x35ba17b3…`, `upgrade_cap 0x0a3c1c5f…`, `publisher 0x00808fed…`, `TransferPolicy<NftToken> 0xf1816cae…` (+ cap `0xc2b91b69…`). Superseded v2 `0x563ab54b…`. See `docs/reports/phase-4-v3-republish.md` + `contracts/networks/testnet.json`.

**v4 (D-035 + D-036) — another breaking change, fresh republish (U16/U17):** v4 *adds fields* to two existing `key` structs — `NftCollection.quilt_blob_id` and `NftToken.patch_id` — which is **not** a compatible upgrade (struct layout is part of the on-chain object representation; see the rule above). It also changes the signatures of two existing public entry fns (`launch_collection` += `quilt_blob_id`, `mint_nft_token` drops `kiosk_obj`/`personal_cap`/`price` and adds `patch_id`) and edits the `NftTokenMinted` event layout (`copy+drop` events cannot change in place) — each independently breaking. So v4 republishes under a fresh `original-id`, abandoning v3 testnet state. Still low-cost: no v3 demo pre-bake or migrated frontend depends on the abandoned objects. The v4 `ensure_collection_policy` attaches **only** the royalty rule (D-036 dropped `kiosk_lock_rule` + `personal_kiosk_rule`), so a bought `NftToken` is freely usable; `mint_nft_token` now `public_transfer`s a plain owned token and listing-for-sale is a separate opt-in Kiosk PTB.

**v4 shipped 2026-05-20 (testnet):** `package_id 0x3b6b7258…`, `upgrade_cap 0xe39adcd3…`, `publisher 0x09f80e91…`, `TransferPolicy<NftToken> 0x9607bcf1…` (+ cap `0x85de8533…`). Rules VecSet verified = **royalty only** (1 rule). Superseded v3 `0x35ba17b3…`. See `docs/reports/phase-4-v4-republish.md` + `contracts/networks/testnet.json`.

**v5 (D-037) — another breaking change, fresh republish (U18/U19):** v5 *adds a field* to the `Model3D` `key` struct — `glb_blob_id: String` (mirrors `lineage_blob_id`: same `MAX_BLOB_ID_LEN` bound + `EBlobIdMalformed` code) — which is **not** a compatible upgrade (struct layout is on-chain object representation). It also changes the signatures of two existing public fns (`new_model` and the `publish` entry fn both gain a `glb_blob_id: String` param, threaded into `validate_publish_inputs`), each independently breaking. The `ModelPublished` event layout is **unchanged** — the GLB resolves from the object field, so the indexer needs no new event field. So v5 republishes under a fresh `original-id`, abandoning v4 testnet state. Still low-cost: no v4 demo pre-bake or migrated frontend depends on the abandoned objects. Motivation: close the L1 GLB-resolution gap — a published `Model3D` carries a standalone Walrus blob (resolved via `/v1/blobs/<glb_blob_id>`) so Browse previews the base mesh and an nft creator can fork it.

**v5 shipped 2026-05-21 (testnet):** `package_id 0xe0d65c4a…`, `upgrade_cap 0x9642c230…`, `publisher 0xcd1943f4…`, `TransferPolicy<NftToken> 0xd7677bb0…` (+ cap `0xb09e9a2e…`). Rules VecSet verified = **royalty only** (1 rule: `0xe308bb3e…::royalty_rule::Rule`). Superseded v4 `0x3b6b7258…`. publish digest `FMfF83md…`, bootstrap digest `Fxq1XDj6…`. See `docs/reports/phase-4-v5-republish.md` + `contracts/networks/testnet.json`.

**v6 (D-038) — the first ADDITIVE-only change; shipped as a fresh republish anyway (U20/U21):** v6 adds one new `public entry fun launch_collection_with_tokens` (one-signature launch + set-fee + mint-N) plus two package-private cores (`launch_collection_internal`, `mint_nft_token_internal`); the existing `launch_collection` / `set_register_fee` / `mint_nft_token` public signatures and the struct layouts are **unchanged**. Per the table above this qualifies as a **compatible upgrade** (adding a public fn is additive; preserving `original-id` would keep the v5 `TransferPolicy`/`Publisher` valid with no re-bootstrap). Per **D-038** we still ship it as a **fresh republish** for consistency with v3/v4/v5 (v5 has no on-chain state worth preserving; re-bootstrap is ~free) and to avoid introducing the published-at/original-id config split mid-sprint. The compatible `sui client upgrade` path is the mainnet-era approach once real state exists. New abort code `EBatchLenMismatch = 37`.

**v6 shipped 2026-05-21 (testnet):** `package_id 0x57e20a13…`, `upgrade_cap 0x03e7b1a2…`, `publisher 0x73ccb3d9…`, `TransferPolicy<NftToken> 0x0e3981e9…` (+ cap `0x8f049a6e…`). Rules VecSet verified = **royalty only** (1 rule: `0xe308bb3e…::royalty_rule::Rule`). Superseded v5 `0xe0d65c4a…`. publish digest `Ck933Viq…`, bootstrap digest `DETEAvJU…`. See `docs/reports/phase-4-v6-republish.md` + `contracts/networks/testnet.json`.

---

## Before any upgrade — checklist

1. [ ] `sui move build` clean (no warnings introduced by the diff)
2. [ ] `sui move test` green; existing tests cover the unchanged surface
3. [ ] New public surface has its own tests (init, events, abilities, entry fns)
4. [ ] `sui client publish --dry-run` (or `--upgrade` dry-run) succeeds locally against the current network state
5. [ ] `Published.toml` and any frontend `.env*` files updated with the new `published-at` PackageID
6. [ ] `original-id` preserved (compatible upgrade) OR explicitly bumped (new package)
7. [ ] UpgradeCap custody verified — testnet uses the dev's interactive Sui CLI keychain; mainnet uses a hardware wallet or multisig (R2)
8. [ ] **Publisher custody verified** — `init` transfers Publisher to deployer (`ctx.sender()`); for mainnet, transfer Publisher to a hardware wallet or multisig **immediately after publish** so a compromised deploy key can't claim TransferPolicy rules ahead of legitimate U3 work. Loss of Publisher = cannot create or rotate TransferPolicy<NftToken> (the only policy type since D-032); recovery requires republish under a new `original-id`.
8. [ ] Indexers + replay fixtures updated for any new event types (R12 capture if non-obvious)
9. [ ] CHANGELOG entry (Phase 5) cites the upgrade ID, what changed, and what clients must update
10. [ ] If a struct grew a V2 sibling: indexer subscribes to both old + new event types for the migration window
