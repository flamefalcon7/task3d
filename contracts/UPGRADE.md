# Sui Package Upgrade ABI Rules — `model3d::model3d`

How to evolve the on-chain ABI without breaking existing holders, indexers, or in-flight PTBs. **Source of truth: <https://docs.sui.io/concepts/sui-move-concepts/packages/upgrade>** — re-read before any non-trivial change.

This file applies to **mainnet** upgrades. Testnet republishes are cheap and abandon-in-place; treat testnet PackageIDs as disposable until the mainnet ceremony at U13.

---

## When fields CAN be added to existing structs

Sui supports `additive` and `dep_only` compatible upgrades. For struct fields the rule is narrower than "append-only":

- **`copy + drop` structs (e.g. events like `RoyaltyPaid`, `ModelPublished`)** — **fields cannot be added or removed.** Compatibility is by exact layout. To extend an event, define `RoyaltyPaidV2` alongside and emit both for one upgrade window, then deprecate the old one after indexers migrate. Never edit the old struct in place.
- **`key` objects (`Model3D`, `Access`)** — **fields cannot be added or removed** on an existing struct in a compatible upgrade. The struct layout is part of the on-chain object representation; changing it would invalidate all existing instances. Add a sibling `Model3DV2` struct + new entry fn if a layout change is required, and keep the old `Model3D` accessors functional until indexers migrate.
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

---

## Before any upgrade — checklist

1. [ ] `sui move build` clean (no warnings introduced by the diff)
2. [ ] `sui move test` green; existing tests cover the unchanged surface
3. [ ] New public surface has its own tests (init, events, abilities, entry fns)
4. [ ] `sui client publish --dry-run` (or `--upgrade` dry-run) succeeds locally against the current network state
5. [ ] `Published.toml` and any frontend `.env*` files updated with the new `published-at` PackageID
6. [ ] `original-id` preserved (compatible upgrade) OR explicitly bumped (new package)
7. [ ] UpgradeCap custody verified — testnet uses the dev's interactive Sui CLI keychain; mainnet uses a hardware wallet or multisig (R2)
8. [ ] **Publisher custody verified** — `init` transfers Publisher to deployer (`ctx.sender()`); for mainnet, transfer Publisher to a hardware wallet or multisig **immediately after publish** so a compromised deploy key can't claim TransferPolicy rules ahead of legitimate U3 work. Loss of Publisher = cannot create or rotate TransferPolicy<Model3D>; recovery requires republish under a new `original-id`.
8. [ ] Indexers + replay fixtures updated for any new event types (R12 capture if non-obvious)
9. [ ] CHANGELOG entry (Phase 5) cites the upgrade ID, what changed, and what clients must update
10. [ ] If a struct grew a V2 sibling: indexer subscribes to both old + new event types for the migration window
