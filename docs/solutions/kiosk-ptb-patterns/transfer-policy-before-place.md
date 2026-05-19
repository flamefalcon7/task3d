---
title: "TransferPolicy bootstrap ordering: attach all rules before sharing, before any place"
date: 2026-05-19
status: pattern-documented
category: kiosk-ptb-patterns
module: model3d-contract
problem_type: ordering_invariant
component: contract
tags:
  - sui-move
  - kiosk
  - transfer-policy
  - royalty-rule
  - kiosk-lock-rule
  - personal-kiosk-rule
  - hot-potato
  - upgrade-compat
related_decisions:
  - D-002
  - D-004
  - D-013
pinned_versions:
  - "sui-framework 1.72.1 (framework/mainnet branch)"
  - "Mysten apps/kiosk @ main (2026-05-19)"
  - "Move edition 2024.beta"
---

# TransferPolicy bootstrap ordering: attach all rules before sharing, before any place

Second R12 capture for plan-007 Phase 4. Documents why `ensure_transfer_policy` is a single monolithic entry function instead of three separate ones, and why the rule-attach must precede both the policy share AND the first `kiosk::place<Model3D>` anywhere on chain.

## Problem

`sui::transfer_policy::confirm_request<T>` runs a **two-stage check** on the `TransferRequest<T>` against the `TransferPolicy<T>`:

```move
// Stage 1 — cardinality:
assert!(receipts_count == self.rules.length(), EPolicyNotSatisfied);
// Stage 2 — membership: iterate receipts, assert each receipt's TypeName
// is present in self.rules (a VecSet<TypeName>). A buyer cannot satisfy
// N rules by stacking N receipts of the wrong type.
```

The failure modes this creates:

1. **Missing rule, present receipt** (cardinality fails first). Buyer's PTB calls `royalty_rule::pay` (producing a receipt) on a policy that no longer has `royalty_rule` attached → receipt count exceeds rule count → `EPolicyNotSatisfied`.
2. **Present rule, missing receipt** (cardinality fails first). Policy has `royalty_rule` attached; buyer's PTB skips `royalty_rule::pay` → rule count exceeds receipt count → `EPolicyNotSatisfied`.
3. **Right count, wrong types** (membership fails). Cardinality passes (N receipts, N rules) but the receipts are of unrelated TypeNames (e.g., buyer crafts dummy receipts hoping to bypass) → membership iteration fails → `EPolicyNotSatisfied`.

Both modes manifest at the buyer's `confirm_request` call, not at the deployer's bootstrap call. A half-configured policy passes `sui move build` and `sui client publish` cleanly. The bug appears later, when a buyer tries to purchase — by which point the policy is shared, the cap may be on a hardware wallet, and reconfiguration becomes a custody operation.

The third footgun: **`kiosk::place<T>` does not assert anything about the policy.** A creator can `place<Model3D>` a Model3D into their Kiosk before any `TransferPolicy<Model3D>` exists; the place succeeds. The eventual buyer's purchase then aborts at `confirm_request` because either (a) no policy exists for `T` and `confirm_request` fails to fetch one, or (b) the policy exists but lacks the rules the buyer's PTB satisfied. Place-then-policy is silently broken.

## The U3 pattern

`ensure_transfer_policy` runs all three steps inside one entry function:

```move
public entry fun ensure_transfer_policy(publisher: &Publisher, ctx: &mut TxContext) {
    assert!(package::from_package<Model3D>(publisher), EWrongPublisher);

    // (1) Create policy + cap. Both are by-value bindings in this scope; no
    // other tx can observe the policy until (3).
    let (mut policy, cap) = tp::new<Model3D>(publisher, ctx);

    // (2) Attach all three built-in rules. Each `add` mutates the in-scope
    // `policy`'s `rules: VecSet<TypeName>` set; no chance of a partial
    // attach being externally visible.
    royalty_rule::add<Model3D>(&mut policy, &cap, AMOUNT_BP_DEFAULT, MIN_ROYALTY_AMOUNT_MIST);
    kiosk_lock_rule::add<Model3D>(&mut policy, &cap);
    personal_kiosk_rule::add<Model3D>(&mut policy, &cap);

    // (3) Share the now fully-configured policy + transfer cap to caller.
    transfer::public_share_object(policy);
    transfer::public_transfer(cap, ctx.sender());
}
```

The deployer flow becomes: `sui client publish` (creates Publisher) → `sui client call ensure_transfer_policy` (creates + configures + shares the policy in one tx) → first `mint_and_list` (U4). The policy is never visible in a half-configured state.

## Why one entry fn instead of three

The naive alternative — `create_policy(publisher)` + `add_royalty_rule(cap)` + `add_lock_rule(cap)` + `add_personal_kiosk_rule(cap)` — lets the deployer accidentally share the policy after step 1, before steps 2-4. There is no way to retroactively delay sharing once `transfer::public_share_object(policy)` runs; the policy ID is broadcast and any buyer's wallet can resolve it.

A single entry fn that does the whole bootstrap is **fail-safe by construction**: there is no possible ordering in which a configured policy exists without all three rules. A reviewer at PR time also sees the full rule set in one place — adding a rule later requires editing this function (which then propagates to its test, which has `has_rule` assertions for all attached rules).

The cost is that adding a fourth rule post-deploy is impossible without a `TransferPolicyCap`-holder operation (`remove_rule` + `add_rule` on a custom flow). That's acceptable for Phase 4 — the cap stays with the creator/deployer; v1.1's multi-beneficiary case will swap the built-in royalty_rule for a custom `split_royalty_rule` via the cap.

## Built-in vs custom rules

Phase 4 uses three built-ins from `MystenLabs/apps/kiosk/sources/rules/`:

- `kiosk::royalty_rule` — `add<T: key + store>(policy, cap, amount_bp: u16, min_amount: u64)`. Single-beneficiary. Accumulates SUI into the policy's internal `Balance<SUI>`; only `TransferPolicyCap<T>` holder can `withdraw`. **Floor (not rounding):** `royalty_owed = max(price * amount_bp / 10_000, min_amount)`. With Phase 4 settings (500 bps + 1_000_000 mist), zero/micro-priced listings still owe the floor; the crossover where `amount_bp` dominates is at price = 0.02 SUI. The `amount * 10_000 / price == amount_bp` event-replay invariant only holds above the crossover. The public `royalty_rule::fee_amount<T>(policy, paid): u64` accessor lets buyer-side PTBs compute the owed amount before signing.
- `kiosk::kiosk_lock_rule` — `add<T>(policy, cap)`. Forces purchased items to be `lock`'d in the buyer's Kiosk; `kiosk::take` is impossible post-purchase. Required for D-013 resale royalty enforcement.
- `kiosk::personal_kiosk_rule` — `add<T>(policy, cap)`. Restricts purchases to PersonalKiosk-typed Kiosks. Buyers cannot transfer their Kiosk's `KioskOwnerCap` to another address (PersonalKiosk wraps it as soulbound).

The v1.1 multi-beneficiary case (L2 derivative royalty) cannot use the built-in `royalty_rule` because it's single-payee by design (see `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md`). The swap path is `tp::remove_rule<Model3D, RoyaltyRule, Config>(...)` followed by `split_royalty_rule::add<Model3D>(...)` on the same `TransferPolicy<Model3D>` object — policy ID preserved, no republish needed. UpgradeCap discipline (R2) and TransferPolicyCap custody must both hold for this path to remain executable.

## PersonalKioskRule implication for the frontend

The buyer-side Kiosk MUST be created via `kiosk::personal_new(ctx)` (or `sui::personal_kiosk` SDK helpers), not `kiosk::new(ctx)`. A vanilla Kiosk does not satisfy `personal_kiosk_rule`'s receipt requirement, and the buyer's `confirm_request` will abort. This propagates into:

- U5's `kioskTxBuilders.ts` — `buildEnsureBuyerKioskPtb` must call `personal_new`.
- U6's purchase flow — first-time buyers without a PersonalKiosk get a one-time setup popup before they can purchase.

The creator-side `ensure_creator_kiosk` (U4) has the same constraint for symmetry — a creator listing into a vanilla Kiosk would prevent the very transfer policy they're trying to enforce.

## Cross-references

- `contracts/model3d/sources/model3d.move` — `ensure_transfer_policy` entry function + `AMOUNT_BP_DEFAULT` / `MIN_ROYALTY_AMOUNT_MIST` constants.
- `contracts/model3d/tests/model3d_tests.move` — `ensure_transfer_policy_succeeds_with_correct_publisher_and_attaches_three_rules` + `from_package_check_rejects_foreign_type` + `min_royalty_amount_mist_constant_value`.
- `contracts/UPGRADE.md` — TransferPolicyCap custody + Publisher custody constraints (#7, #8).
- `docs/decisions.md` — D-002 (1-layer derivation), D-004 (30% royalty cap), D-013 (Kiosk + TransferPolicy must-have).
- `docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md` — U3 (this unit), U4 (purchase_with_kiosk + lock_rule observation), U5 (frontend kiosk builders).
- `docs/solutions/kiosk-ptb-patterns/model3d-key-store-migration.md` — prior R12 capture (ability migration that this builds on).
- `docs/solutions/architecture-patterns/sui-kiosk-multi-beneficiary-royalty-2026-05-19.md` — v1.1 custom `split_royalty_rule` swap path.
