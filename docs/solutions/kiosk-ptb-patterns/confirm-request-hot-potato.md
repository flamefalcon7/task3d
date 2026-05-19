---
title: "TransferRequest hot-potato: split of responsibilities between Move entry fns and frontend PTB chains"
date: 2026-05-19
status: pattern-documented
category: kiosk-ptb-patterns
module: model3d-contract
problem_type: composition_boundary
component: contract
tags:
  - sui-move
  - kiosk
  - transfer-policy
  - transfer-request
  - hot-potato
  - ptb-composition
  - royalty-rule
  - personal-kiosk-rule
  - kiosk-lock-rule
related_decisions:
  - D-013
  - D-016
pinned_versions:
  - "sui-framework 1.72.1 (framework/testnet)"
  - "Mysten apps/kiosk @ 7a07937149c0af057be8f6747e60d0f1acd88fde"
  - "Move edition 2024.beta"
---

# TransferRequest hot-potato: split of responsibilities between Move entry fns and frontend PTB chains

Third R12 capture for plan-007 Phase 4. Documents why `purchase_with_kiosk` is `public fun` (not `entry`), why it returns the unconsumed `TransferRequest<Model3D>`, and what the frontend PTB builder is required to do with it. The split exists because Kiosk's `TransferRequest` is a hot potato — a struct with no abilities (`has` clause is empty: no `key`, no `store`, no `drop`, no `copy`) — and the framework relies on its un-droppability to force every purchase tx through `confirm_request`.

## Problem

`kiosk::purchase<T>(self, id, payment): (T, TransferRequest<T>)` returns the item PLUS a `TransferRequest<T>` that records what the buyer must prove. The TransferRequest has no `drop` ability, so:

```move
let (item, request) = kiosk::purchase<Model3D>(&mut kiosk, model_id, payment);
// ...nothing else...
}  // ← Move compiler rejects: `request` cannot be dropped
```

The framework guarantee: **a purchase tx CANNOT complete unless `confirm_request<T>(policy, request)` consumes the request**. Below `confirm_request`, the rules attached to `TransferPolicy<T>` are checked (rule-receipt cardinality + membership; see `transfer-policy-before-place.md`). The hot-potato pattern + the policy attached at U3 + the rules attached at U3 are the three layers that make protocol-level royalty enforcement work.

Once `confirm_request` consumes the request, the policy's RoyaltyRule has its `pay` receipt, the `personal_kiosk_rule` has its proof, and the `kiosk_lock_rule` has forced the item into the buyer's Kiosk via the buyer-side `kiosk::lock` call earlier in the same PTB. Skipping any step fails one of two checks: receipt-count cardinality fails first, or membership-by-type fails after.

## Why `purchase_with_kiosk` is `public fun`, not `entry`

`public entry fun` in Sui Move requires every return type to have `drop`. Otherwise the runtime cannot guarantee the value won't be abandoned at tx exit. `TransferRequest<T>` is precisely the type designed to violate this — it has zero abilities by construction (`sui::transfer_policy::TransferRequest<phantom T> {}` has no `has` clause at all).

So `purchase_with_kiosk` cannot be `entry`. The signature shape is:

```move
public fun purchase_with_kiosk(
    kiosk_obj: &mut Kiosk,
    policy: &TransferPolicy<Model3D>,
    model_id: ID,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
): (Model3D, TransferRequest<Model3D>)
```

Callers (buyer's PTB) thread the two return values into subsequent Move calls in the SAME PTB. A PTB-level binding of `(item, request)` is valid; the Move compiler's drop check applies to function bodies, not to PTB transactions where the value flows into another call that consumes it.

## The buyer's mandatory 6-call PTB chain (wrapped in personal_kiosk borrow/return)

For R3 ("ONE wallet popup per purchase") to hold, the buyer's frontend PTB builder (`U5 kioskTxBuilders.ts`) MUST compose all six rule/confirm Move calls in a single PTB, plus the two `personal_kiosk::borrow_val` / `return_val` wrappers needed to extract the OwnerCap from PersonalKioskCap. Total: 8 Move calls + 1 PTB-primitive `splitCoins` for the royalty payment.

```
(1) purchase_with_kiosk(seller_kiosk, policy, model_id, payment)
        → (item, request)

(2) personal_kiosk::borrow_val(buyer_personal_kiosk_cap)
        → (KioskOwnerCap, Borrow)
        — PersonalKioskCap stores Option<KioskOwnerCap> internally; the
          OwnerCap has no standalone object ID, only the wrapper does.
          borrow_val returns a Borrow hot-potato that MUST be returned
          via return_val at step (8). Per @mysten/kiosk source
          `src/contracts/kiosk/personal_kiosk.ts:122-184`.

(3) kiosk::lock<Model3D>(buyer_kiosk, borrowed_owner_cap, policy, item)
        — moves the item into the buyer's PersonalKiosk with the
          lock_rule-required `is_locked` flag set. NOTE: kiosk::lock only
          sets the flag; it does NOT add a rule receipt. That's step (4).

(4) kiosk_lock_rule::prove<Model3D>(request, buyer_kiosk)
        — adds the KioskLockRule receipt by proving the item is locked
          in the destination Kiosk. ARG ORDER IS REVERSED from
          personal_kiosk_rule::prove (request first, kiosk second) —
          verified against `src/contracts/kiosk/kiosk_lock_rule.ts:62-87`
          `parameterNames = ['request', 'kiosk']`. The SDK's
          `resolveKioskLockRule` (src/tx/rules/resolve.ts:100-132) emits
          both kiosk::lock AND kiosk_lock_rule::prove for this reason.

(5) royalty_rule::pay<Model3D>(policy, &mut request, royalty_coin)
        — buyer pays the royalty amount (queried beforehand via
          royalty_rule::fee_amount(policy, price)) into the
          TransferPolicy's internal Balance<SUI>. Adds a Receipt of
          TypeName<RoyaltyRule>::Rule to the request.

(6) personal_kiosk_rule::prove<Model3D>(&buyer_kiosk, &mut request)
        — asserts buyer_kiosk is a PersonalKiosk (was wrapped via
          kiosk::personal_kiosk::new). Adds a Receipt of
          TypeName<PersonalKioskRule::Rule> to the request. arg order
          is `[kiosk, request]` — OPPOSITE of (4) kiosk_lock_rule::prove.

(7) sui::transfer_policy::confirm_request<Model3D>(policy, request)
        — consumes the request hot potato. Two-stage check inside
          the framework:
            stage 1: request.receipts.length() == policy.rules.length()
            stage 2: each receipt's TypeName ∈ policy.rules (VecSet<TypeName>)
          Aborts EPolicyNotSatisfied (= 0 in sui::transfer_policy)
          on either failure. On success, returns
          (item_id, paid, from_kiosk_id) tuple consumed at top level.

(8) personal_kiosk::return_val(buyer_personal_kiosk_cap, owner_cap, borrow)
        — consumes the Borrow hot-potato from step (2). The Borrow
          struct has no `drop` ability; failing to call return_val
          rejects the PTB the same way an unconsumed TransferRequest
          would.
```

A buyer who splits any of these across two PTBs experiences:

- **(1) alone in PTB A**: Move 2024 compiler statically rejects the PTB. The `request` binding has no consumer in PTB A.
- **(1) + (5) in PTB A, then (7) in PTB B**: same compile-time rejection in PTB A; the `item` from (1) also has no consumer.
- **Skipping (4)** but running (5) + (6) + (7): cardinality fails first (`receipts.length() == 2` vs `rules.length() == 3`) → EPolicyNotSatisfied at runtime.
- **Skipping (5)** or **(6)** with the other rules present: same cardinality / membership failure at (7).
- **Skipping (7)**: PTB A compile-fails — `request` binding unused.
- **Skipping (2) or (8)**: Borrow hot-potato either never created or never consumed — Move runtime / SDK build-time rejection.

This means the R3 "one popup" property is enforced not by an entry-fn boundary (which doesn't exist here), but by the **composition of Move 2024's drop-checker + the framework's hot-potato design + the policy's 3-rule cardinality**. The frontend builder's job is to lay the 6-call (8-with-borrow-wrappers) sequence in one PTB; if it does, the framework guarantees the rest.

## What Move would catch vs what the framework catches

| Failure mode | Caught by |
|---|---|
| Buyer PTB never binds (7) confirm_request | **Compiler** (Move 2024 drop check on `request`) |
| Buyer PTB binds (7) with 0 receipts | **Framework** (`EPolicyNotSatisfied`, code 0 in `sui::transfer_policy`) |
| Buyer PTB binds (7) with 1 or 2 receipts (skips one rule) | **Framework** (`EPolicyNotSatisfied` — cardinality fails first) |
| Buyer PTB binds (7) with 3 receipts of wrong TypeName (e.g., spoofed) | **Framework** (`EPolicyNotSatisfied` — membership fails) |
| Buyer PTB skips (4) `kiosk_lock_rule::prove` | **Framework** (`EPolicyNotSatisfied` — cardinality fails OR membership fails depending on what's present) |
| Buyer PTB binds (7) but never called (6) personal_kiosk_rule on a vanilla Kiosk | **Framework** (`EKioskNotOwned = 1` in `kiosk::personal_kiosk_rule`) |
| Buyer PTB binds (7) but `item` was never `kiosk::lock`'d in step (3) | **Framework** (lock_rule's `prove` asserts the item is locked in the destination Kiosk) |
| Buyer PTB calls (2) borrow_val but never (8) return_val | **Compiler / SDK** (Borrow hot-potato has no `drop`; equivalent to TransferRequest leak) |
| Underpayment in (1) (`payment.value() < listing.price`) | **Framework** (`EIncorrectAmount = 1` in `sui::kiosk`) |
| Item already purchased / delisted between PTB build and submit | **Framework** (`kiosk::purchase` aborts) |

The split between "compile-time guaranteed" and "runtime guaranteed" matters for test design (see plan-007 §U4 `confirm_request_aborts_when_receipts_missing_rules`) and for `docs/open-questions.md` OQ-018 (why we cannot write a runtime test for the hot-potato un-droppability — Move 2024 statically rejects any such test body).

## Why `purchase_with_kiosk` emits `RoyaltyPaid` BEFORE the buyer's PTB satisfies the rules

`purchase_with_kiosk` emits `RoyaltyPaid` inside its own call frame (step 1 of the chain), not after `confirm_request`. The amount field is read from `royalty_rule::fee_amount(policy, price)` — which is the rule's deterministic computation of what the buyer WILL pay in step (3). Because the buyer's PTB is atomic, either all five steps land or the tx aborts and the event is rolled back. So:

- **Successful tx**: `RoyaltyPaid` appears in the tx effects with the actual amount paid.
- **Aborted tx (any step 2-5 fails)**: `RoyaltyPaid` is rolled back along with everything else. No event reaches indexers.

This is the only way the event can carry the rule's computed amount in a Move-level guarantee — `confirm_request` doesn't expose the post-hoc payment amount, and re-querying after confirm_request would require a separate read of the rule's state.

The U2-locked R6 guard (`assert!(fee_amount(policy, 1_000_000_000) * 10_000 / 1_000_000_000 == AMOUNT_BP_DEFAULT as u64, EWrongRoyaltyRate)`) fires BEFORE the emit, so the event's hardcoded `royalty_bps = AMOUNT_BP_DEFAULT` cannot drift silently if a TransferPolicyCap holder reconfigures the rule. See `model3d.move` `purchase_with_kiosk` header doc for the policy-pinning constraint (ADV-002 attack discussion).

## Cross-references

- `contracts/model3d/sources/model3d.move` — `purchase_with_kiosk` (public fun, NOT entry) + `EWrongRoyaltyRate` guard + policy-pinning constraint doc-block.
- `contracts/model3d/tests/model3d_tests.move` — `confirm_request_aborts_when_receipts_missing_rules` (runtime cardinality test), `purchase_with_kiosk_aborts_on_payment_less_than_price` (framework underpayment), `purchase_with_kiosk_aborts_when_rule_bps_drifted` (ADV-002 second-policy attack), `personal_kiosk_rule_blocks_vanilla_kiosk_purchase` (PersonalKiosk requirement).
- `docs/open-questions.md` — OQ-018 (Move 2024 statically rejects the would-be runtime test for hot-potato un-droppability).
- `docs/solutions/kiosk-ptb-patterns/transfer-policy-before-place.md` — second R12 capture; confirm_request two-stage check + rule semantics.
- `docs/solutions/kiosk-ptb-patterns/model3d-key-store-migration.md` — first R12 capture; ability migration that this builds on.
- `docs/decisions.md` — D-013 (Kiosk + TransferPolicy must-have, protocol-level royalty), D-016 (Phase 2 share_object Model3D ≠ Kiosk).
- `docs/plans/2026-05-19-007-feat-phase-4-kiosk-race-on-mint-plan.md` — U4 (this unit), U5 (frontend PTB builder that composes the 5 calls), U6 (creator-side flow), U8 (indexer joining on RoyaltyPaid).
