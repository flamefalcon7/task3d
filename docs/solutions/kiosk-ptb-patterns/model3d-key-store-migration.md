---
title: "Model3D ability change: key → key + store (Phase 2 → Phase 4 migration)"
date: 2026-05-19
status: pattern-documented
category: kiosk-ptb-patterns
module: model3d-contract
problem_type: ability_migration
component: contract
tags:
  - sui-move
  - kiosk
  - abilities
  - migration
  - one-time-witness
  - upgrade-compat
related_decisions:
  - D-013
  - D-016
pinned_versions:
  - "sui-framework 1.72.1"
  - "Move edition 2024.beta"
  - "Walrus testnet-contracts (main as of 2026-05-19)"
---

# Model3D ability change: key → key + store (Phase 2 → Phase 4 migration)

First R12 capture for plan-007 Phase 4. Documents why we re-published the `model3d` package under a new PackageID instead of upgrading in place, and why every Phase 2 holdover is caught by the compiler rather than by a runtime test.

## Problem

Phase 2 declared `public struct Model3D has key` and shipped Model3D objects to all wallets via `transfer::share_object(model)`. That worked for the Phase 2 buy-flow because `share_object` requires only `key`. Phase 3 added the Collection wrapper but kept the share-object distribution pattern (Phase 3 didn't yet need Kiosk).

Phase 4 (D-013) requires Kiosk + TransferPolicy for protocol-level royalty enforcement. The Sui Kiosk standard's `kiosk::place<T>(self, item)` carries the bound `T: store`. **A `key`-only object cannot be placed in a Kiosk** — the type-checker rejects the call. To make Model3D Kiosk-placeable, the struct must gain the `store` ability.

`store` is a layout-relevant ability in Sui's compatibility model (see `contracts/UPGRADE.md`). Adding `store` to an existing struct is **NOT** a compatible upgrade — it breaks the on-chain object layout for existing Phase 2 instances. We can't `sui client publish --upgrade` our way from Phase 2 to Phase 4; we must publish a new package, accept a new `original-id`, and abandon Phase 2 testnet objects.

## The change

The struct header diff is one line:

```move
// Phase 2 / Phase 3:
public struct Model3D has key { ... }

// Phase 4:
public struct Model3D has key, store { ... }
```

Every Phase 2 holdover the compiler catches:

- `transfer::share_object(model)` — `share_object` is overloaded across abilities, but in combination with `has key, store` Sui's lint `share_owned` fires (an object with `store` should normally circulate as owned, not shared). Phase 2 used `#[allow(lint(share_owned))]` to suppress this; Phase 4 removes the suppression and the call.
- `&Model3D` parameters on entry fns that assume shared semantics — type-checks fine on its own, but every PTB that built around fetching a `SharedObjectRef` for `Model3D` breaks at frontend BCS time (`tx.object(sharedId)` resolves to an Owned ref under Kiosk semantics).
- `mint_model_access(&model, ...)` Phase 2 path — removed at the entry-fn level; the compiler erases all calls to it because the function no longer exists.

Net effect: rip out the Phase 2 entry fns + their tests + their frontend PTB callers, change the struct header, let the Move compiler tell you everywhere else that still needs to move. Nothing escapes static checks.

## Why not migrate Phase 2 objects

Two reasons, both grounded in standing decisions:

- **D-013 (Phase 4 promotes Kiosk + TransferPolicy to must-have).** Phase 2's `share_object`-based ownership is incompatible with Kiosk's `place` semantics by Move-VM type rules — see "Problem" above. No in-place migration path exists.
- **D-016 (Phase 2 `publish_and_share` Model3D → Phase 4 Kiosk-mediated).** Phase 2 testnet was a tracer-bullet build, not a production surface. R1 verification (`docs/reports/phase-4-day-1-verification.md` §1) confirmed no external surface (Twitter / Discord / dev-log) references the Phase 2 PackageID — the only seven in-repo references are working notes that update at U2 commit time. There are no Phase 2 mainnet objects to migrate.

The Phase 2 testnet PackageID (`0x18a480b3ff…`) and its mints remain on chain, but the frontend no longer queries them. The `useOwnedVariants` Access-based discovery path that Phase 2/3 used is rewritten at U10 (Kiosk-protocol KTD) to read Kiosk contents instead of Access objects; U2 leaves the Access struct definition in place so U10's rewrite is local.

## Forward-compat note

`has key, store` is the long-term shape for any Sui object intended to circulate through Kiosk, TransferPolicy, custody contracts, or marketplace registries. The sui-move-bootcamp examples (and the Mysten OriginByte family) standardize on `key, store` for tradeable assets. Keeping the ability set after Phase 4 means future features (auctions, escrow, derivative-mint flows) don't need another ability migration.

What stays `key`-only:

- `Access` (intentionally soulbound — `key` without `store` cannot be wrapped, placed in a Kiosk, or `public_transfer`'d after mint). The plan explicitly excludes Access from this migration (Kiosk-protocol KTD reroutes discovery at U10, not the Access type itself).
- `Publisher` (Sui-framework type, `key`-only by definition).
- `TransferPolicyCap<Model3D>` (Sui-framework Kiosk type).

What now has `key, store`:

- `Model3D` (Phase 4 — this doc).

## See also

- `contracts/UPGRADE.md` — when this kind of change can/can't be an upgrade.
- `docs/decisions.md` D-013, D-016 — the decisions that forced the migration.
- `docs/reports/phase-4-day-1-verification.md` §1 — R1 visibility-check basis for abandoning Phase 2 testnet objects.
- plan-007 U3 (next R12 capture) — `transfer-policy-before-place.md` will document the order-of-operations gotcha when first using the new ability set.
