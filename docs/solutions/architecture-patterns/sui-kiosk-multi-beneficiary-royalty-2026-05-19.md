---
title: "Sui Kiosk multi-beneficiary royalty — built-in is single-payee; custom TransferPolicy rule splits N ways"
date: 2026-05-19
last_updated: 2026-05-19
status: pattern-documented
category: architecture-patterns
module: model3d-contract
problem_type: architecture_pattern
component: contract
severity: load-bearing-for-v1.1
tags:
  - sui-move
  - kiosk
  - transfer-policy
  - royalty
  - multi-beneficiary
  - upgrade-cap
  - forward-compatibility
related_decisions:
  - D-002  # 1-layer derivation
  - D-004  # 30% royalty cap
  - D-013  # Kiosk + TransferPolicy must-have, L2 cut from Phase 4
  - D-028  # Mainnet milestone-gated
pinned_versions:
  - "@mysten/sui@2.16.x"
  - "@mysten/kiosk SDK (2026-05-08 release train)"
  - sui-framework via Mysten apps/kiosk/sources/rules/
---

## Problem

The v1.1 three-tier creator economy needs **multi-beneficiary royalty** on L2 Derivative sales: original L1 creator + L2 derivative creator both get paid from a single buyer payment, total capped at 30% (D-004). Phase 4 only ships L1 (single-beneficiary, per D-013) but must not paint v1.1 into a corner.

**Question answered here**: can the Phase 4 Kiosk foundation be extended to v1.1's multi-beneficiary case without re-publishing the package or breaking existing on-chain `TransferPolicy<Model3D>` objects?

**Answer**: yes, via a custom `TransferPolicy` rule that **replaces** the built-in `kiosk_rules::royalty_rule`. Phase 4 design choices remain forward-compatible if Derivative is kept as a separate struct type and UpgradeCap is custodied. Researched 2026-05-19 against `@mysten/sui@2.16.x` and the `@mysten/kiosk` SDK 2026-05-08 release train.

---

## Five load-bearing facts

### 1. `TransferPolicy<T>` is per-type — separate structs get separate policies

`public struct TransferPolicy<phantom T> has key, store { id, balance: Balance<SUI>, rules: VecSet<TypeName> }`. Each concrete `T` gets its own policy created via `transfer_policy::new<T>(publisher, ctx)`.

**Design implication**: keep `Derivative` as a **separate struct** from `Model3D`, NOT a `Model3D` with a `parent_id: Option<ID>` field. Separate structs → independent `TransferPolicy<Model3D>` and `TransferPolicy<Derivative>` → Phase 4's L1 policy stays untouched when v1.1 adds the Derivative type. Community convention (BlueMove, SuiFrens) also splits one type per economically distinct asset class to avoid branching inside a single rule.

### 2. Built-in `royalty_rule` is single-beneficiary by design

From `MystenLabs/apps/kiosk/sources/rules/royalty_rule.move`:

- `pay()` calls `transfer_policy::add_to_balance(Rule {}, policy, fee_coin)` — SUI accumulates **inside the `TransferPolicy<T>` object's `Balance<SUI>` field**
- Withdrawal: `transfer_policy::withdraw<T>(self, cap, amount, ctx)` — only the **`TransferPolicyCap<T>` holder** can withdraw
- Beneficiary is implicitly "whoever holds the cap" — not parametrized
- Config (`amount_bp`, `min_amount`) has **no setter**; to change you must `remove_rule` + re-`add`

Phase 4 uses this for L1 (single creator = single beneficiary). v1.1 cannot reuse it for L2.

### 3. Custom multi-beneficiary rule pattern

Custom rules attach via `transfer_policy::add_rule<T, Rule, Config>(witness, policy, cap, cfg)`. `confirm_request` asserts `receipts.length() == rules.length()` — every attached rule must produce exactly one receipt or the purchase aborts (hot-potato discipline).

Reference Move sketch (verified against `sui-framework/sources/kiosk/transfer_policy.move` 2026-05 line numbers):

```move
module model3d::split_royalty_rule;

use sui::transfer_policy::{Self as tp, TransferPolicy, TransferPolicyCap, TransferRequest};
use sui::coin::{Self, Coin};
use sui::sui::SUI;

public struct Rule has drop {}  // witness, keys the rule slot
public struct Config has store, drop {
    total_bp: u16,                  // <= 3000 (30% per D-004) — enforced by us, NOT framework
    beneficiaries: vector<address>,
    bps: vector<u16>,               // sums to total_bp; same length as beneficiaries
    min_amount: u64,
}

const ECapExceeded: u64 = 0;
const EBadShape: u64 = 1;

public fun add<T>(
    policy: &mut TransferPolicy<T>, cap: &TransferPolicyCap<T>,
    total_bp: u16, beneficiaries: vector<address>,
    bps: vector<u16>, min_amount: u64,
) {
    assert!(total_bp <= 3000, ECapExceeded);                       // D-004 cap
    assert!(beneficiaries.length() == bps.length(), EBadShape);
    // also assert sum(bps) == total_bp
    tp::add_rule(Rule {}, policy, cap, Config { total_bp, beneficiaries, bps, min_amount });
}

public fun pay<T>(
    policy: &mut TransferPolicy<T>, request: &mut TransferRequest<T>,
    payment: &mut Coin<SUI>, ctx: &mut TxContext,
) {
    let cfg: &Config = tp::get_rule(Rule {}, policy);
    let paid = tp::paid(request);
    let total_fee = std::u64::max(
        (paid as u128 * cfg.total_bp as u128 / 10_000) as u64,
        cfg.min_amount,
    );
    let mut fee_coin = coin::split(payment, total_fee, ctx);
    let n = cfg.beneficiaries.length();
    let mut i = 0;
    while (i < n - 1) {
        let share = (total_fee as u128 * *cfg.bps.borrow(i) as u128 / cfg.total_bp as u128) as u64;
        transfer::public_transfer(coin::split(&mut fee_coin, share, ctx), *cfg.beneficiaries.borrow(i));
        i = i + 1;
    };
    // Last beneficiary gets the REMAINDER (not computed share) to absorb integer-division dust.
    // Otherwise coin::destroy_zero() would fail on stranded mist.
    transfer::public_transfer(fee_coin, *cfg.beneficiaries.borrow(n - 1));
    tp::add_receipt(Rule {}, request);
}
```

**Critical**: do NOT attach both `royalty_rule` AND `split_royalty_rule` to the same policy. They're keyed by separate `TypeName`s so the framework allows it — but `confirm_request` would then require BOTH receipts, double-charging the buyer. Custom rule **replaces** the built-in, doesn't supplement it.

### 4. UpgradeCap hot-swap works on existing policy objects

From `docs.sui.io/concepts/sui-move-concepts/packages/upgrade`:

- Adding new modules (e.g., `model3d::split_royalty_rule` in v1.1) is **compatible** under the default policy. Phase 4's published `model3d` v1 can be upgraded to v1.1 with the new module added — no break.
- **Existing `TransferPolicy<Model3D>` objects survive upgrades unchanged**. Type identity is resolved by *origin package ID*, not latest. Module `init` does NOT re-run.
- **Rule swap on the SAME policy object**: `transfer_policy::remove_rule<Model3D, royalty_rule::Rule, royalty_rule::Config>(policy, cap)` (consumes the Config via `drop`) then `split_royalty_rule::add<Model3D>(policy, cap, ...)`. Object ID stays the same. The `Config: store + drop` ability bound on `remove_rule` is what makes this safe.

**Operational constraint**: this only works if the `UpgradeCap` AND the `TransferPolicyCap<Model3D>` are both still in custody. Loss of either bricks the policy.

### 5. Snapshot pattern for L2 `base_royalty_bps`

At Derivative mint time, copy the L1 `Model3D.royalty_bps` value into the Derivative struct's `base_royalty_bps: u16` field. **Do NOT** look up the live L1 value at sale time — that defeats the snapshot guarantee (creator could retroactively change L1 royalty and affect already-minted Derivatives). Standard pattern; no framework support needed.

---

## Footguns

1. **Rule key is `RuleKey<Rule>` — one rule per witness type per policy.** Can't attach two rules of the same witness type. To support per-buyer-tier configs, encode inside one Config rather than adding the rule twice.

2. **Integer-division dust when splitting N ways**: ALWAYS give the LAST beneficiary `coin::split(payment, remaining)` instead of computing their share. Otherwise stranded mist breaks `coin::destroy_zero`.

3. **`TransferPolicyCap<T>` is an owned object**. If the EOA loses the key, the policy is bricked: no rule changes, no withdrawals. Hackathon-acceptable; for v1.1 consider wrapping the cap in a shared admin object with Multisig.

4. **Publisher object is required for `transfer_policy::new<T>`** — must come from `package::claim` in module `init`. Keep it; if `public_transfer`'d away, you cannot create additional policies for `T` later.

5. **`@mysten/kiosk` SDK `TransferPolicyManager` only knows 5 built-in rules.** For our custom `split_royalty_rule`, the frontend must register a custom resolver:
   ```ts
   kioskClient.addRuleResolver({
     rule: `${PACKAGE_ID}::split_royalty_rule::Rule`,
     packageId: PACKAGE_ID,
     resolveRuleFunction: ({ txb, itemType, price, ... }) => {
       txb.moveCall({
         target: `${PACKAGE_ID}::split_royalty_rule::pay`,
         typeArguments: [itemType],
         arguments: [policy, request, paymentCoin],
       });
     },
   });
   ```
   Phase 4's U5 PTB wrapper doesn't need this hook today, but designing the wrapper so the rule-resolver layer is pluggable keeps v1.1 cheap.

6. **30% cap (D-004) is NOT enforced by built-in `royalty_rule`** — only `assert!(amount_bp < 10_000)` (<100%). Phase 4 uses 500 bps (5%) so safe, but the constraint must be enforced in v1.1's `split_royalty_rule::add`.

---

## Application to Phase 4 design decisions

| Concern | Phase 4 (now) | v1.1 (future) | Phase 4 forward-compat constraint |
|---|---|---|---|
| Royalty rule | Built-in `royalty_rule`, 500 bps single-beneficiary | Custom `split_royalty_rule`, multi-beneficiary | None — built-in is hot-swappable via UpgradeCap |
| Derivative struct | N/A | Separate struct (not `Model3D` with `parent_id`) | Phase 4 must NOT pre-add a `parent_id` field to `Model3D` — would commit us to the shared-policy path |
| UpgradeCap custody | EOA-owned by creator | Same key needed to publish v1.1 module add | Don't lose the key; plan-007 U13 separates `SUI_MAINNET_DEPLOY_KEY` already |
| TransferPolicyCap | EOA-owned | Same key needed for rule swap | Same |
| PTB wrapper | Hardcoded `royalty_rule::pay` chain | Custom resolver via `kioskClient.addRuleResolver` | If U5 wrapper is generic (treats the royalty-pay step as an injectable PTB segment), v1.1 swap is one-line config. If hardcoded, refactor needed. **Not Phase 4 work to plumb the abstraction, but worth noting.** |

---

## Sources

- [sui-framework `transfer_policy.move`](https://github.com/MystenLabs/sui/blob/main/crates/sui-framework/packages/sui-framework/sources/kiosk/transfer_policy.move)
- [Mysten apps repo — built-in kiosk rules](https://github.com/MystenLabs/apps/tree/main/kiosk/sources/rules)
- [Sui framework — `sui::transfer_policy` docs](https://docs.sui.io/references/framework/sui/transfer_policy)
- [Empowering Creators with Sui Kiosk — Mysten blog](https://www.mystenlabs.com/blog/empowering-creators-with-sui-kiosk)
- [Upgrading Packages — Sui docs](https://docs.sui.io/concepts/sui-move-concepts/packages/upgrade)
- [@mysten/kiosk SDK — TransferPolicyTransaction](https://sdk.mystenlabs.com/kiosk/kiosk-client/transfer-policy-transaction/introduction)
- [@mysten/kiosk SDK — using custom rule resolvers](https://sdk.mystenlabs.com/kiosk/kiosk-client/transfer-policy-transaction/using-the-manager)
