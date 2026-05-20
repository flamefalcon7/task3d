---
title: "Cap-gated collection launch: soulbound key-only cap + pay-to-derive royalty snapshot"
date: 2026-05-20
status: pattern-documented
category: kiosk-ptb-patterns
module: model3d-contract
problem_type: capability_pattern
component: contract
tags:
  - sui-move
  - capability
  - soulbound
  - pay-to-derive
  - d-029
---

# Cap-gated collection launch (D-029 / plan-008 U1)

## Problem

The four-role economy needs an nft-creator authority object that:
1. cannot be sold or transferred away (it gates fee-setting + future mint authority over a shared `NftCollection`), and
2. is minted by *deriving* from a base `Model3D` while paying the base creator — without the base creator losing the base asset (perpetual-royalty story).

## Pattern

**Soulbound by ability, not by guard.** The authority object is `key`-only:

```move
public struct NftCollectionCreatorCap has key {   // NO `store`
    id: UID,
    collection_id: ID,
}
```

A `key`-only struct cannot be wrapped, Kiosk-placed, or moved via `transfer::public_transfer` — the only way it leaves the module is `transfer::transfer(cap, addr)` from inside the defining module. That is the entire soulbound enforcement; no runtime check is needed. This re-anchors the "soulbound by Move ability" role that the deleted `Access` struct used to hold (spec.md §1.7 #3).

**Snapshot the base royalty at launch.** `base_royalty_bps` is *copied* into the shared `NftCollection` at `launch_collection` time, not read live from the base model later. The base model's `license` is immutable post-mint (no setter exists), so the snapshot can't drift — but snapshotting also decouples the collection from the base object's lifetime.

> **D-030 update (2026-05-20):** an earlier version of this pattern also snapshotted `base_policy` (the model license's policy) to gate integration. That was removed — the integration gate is a **collection-level** decision (`NftCollection.integration_policy`, set by the nft creator via `set_integration_policy`, default `PERMISSIONLESS`), not a model-license snapshot. The base model's `license.policy` is display-only at L2; derivation is gated purely by the pay-to-derive fee. See [[register-integration-fee-gated-registry]] and D-030.

**Pay-to-derive (Fork A).** Route `license.derivative_mint_fee` from the caller's payment `Coin<SUI>` to `model.creator`, return the remainder:

```move
let fee = model.license.derivative_mint_fee;
assert!(coin::value(&payment) >= fee, EInsufficientDeriveFee);
if (fee > 0) {
    let fee_coin = coin::split(&mut payment, fee, ctx);
    transfer::public_transfer(fee_coin, model.creator);
};
if (coin::value(&payment) == 0) { coin::destroy_zero(payment) }
else { transfer::public_transfer(payment, ctx.sender()) };
```

## Gotchas

- **Distinct abort code for the derive-fee shortfall.** `EInsufficientDeriveFee (35)` is separate from `register_integration`'s `EFeeTooLow (31)` — they are different fee gates on different actors; collapsing them would mislead the frontend's error-mapping.
- **Zero-coin hygiene.** A fee of 0 (or exact payment) leaves a zero-value coin. `coin::destroy_zero` instead of transferring a 0-coin object avoids littering the caller's inbox with empty coins.
- **`Table` teardown in tests.** `NftCollection.integrations: Table<address, IntegrationRecord>` cannot be `drop`'d (`IntegrationRecord` has only `store`, no `drop`). The test helper uses `table::destroy_empty`, which is correct for launch-level tests where the registry is always empty; U4 register tests must `remove` records before teardown.
- **The D-004 royalty re-assert is defensive/unreachable.** `new_model` already enforces `derivative_royalty_bps <= MAX_DERIVATIVE_ROYALTY_BPS` at mint, and `Model3D` is only constructed there, so the launch-time re-assert can't fire through the validated path. Kept as documentation of the invariant at the snapshot site; not separately unit-tested (would require a validation-bypassing constructor).
