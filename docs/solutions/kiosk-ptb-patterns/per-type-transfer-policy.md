---
title: "Per-type TransferPolicy: NftToken needs its own policy, distinct from Model3D"
date: 2026-05-20
status: pattern-documented
category: kiosk-ptb-patterns
module: model3d-contract
problem_type: type_system_constraint
component: contract
tags:
  - sui-move
  - kiosk
  - transfer-policy
  - generics
  - d-029
---

# Per-type TransferPolicy (D-029 / plan-008 U3)

## Problem

L2 tradeable `NftToken` resales must enforce royalty on the Kiosk. `TransferPolicy<T>` is generic over the item type, so `Model3D`'s policy does **not** cover `NftToken` — the framework's `confirm_request<NftToken>` reads `TransferPolicy<NftToken>`, a different shared object with a different ID.

## Pattern

Bootstrap a second policy with the **same three built-in rules**, via an L2 analog of `ensure_transfer_policy`:

```move
public entry fun ensure_collection_policy(publisher: &Publisher, ctx: &mut TxContext) {
    assert!(package::from_package<NftToken>(publisher), EWrongPublisher);
    let (mut policy, cap) = tp::new<NftToken>(publisher, ctx);
    royalty_rule::add<NftToken>(&mut policy, &cap, AMOUNT_BP_DEFAULT, MIN_ROYALTY_AMOUNT_MIST);
    kiosk_lock_rule::add<NftToken>(&mut policy, &cap);
    personal_kiosk_rule::add<NftToken>(&mut policy, &cap);
    transfer::public_share_object(policy);
    transfer::public_transfer(cap, ctx.sender());
}
```

- Same ordering invariant as the `Model3D` bootstrap: attach all rules *before* sharing (fail-safe by construction; see `transfer-policy-before-place.md`).
- Run **both** `ensure_transfer_policy` (Model3D) and `ensure_collection_policy` (NftToken) at the one-time U5 deploy bootstrap. The network config pins **two** policy IDs; the frontend selects by item type.
- `mint_nft_token` is the L2 analog of `mint_and_list` — cap-gated, atomic place+list into the creator's PersonalKiosk, one wallet popup. Resale is **not** wrapped in Move: buyers compose `kiosk::purchase<NftToken>` + lock/royalty/personal-prove/`confirm_request` in a PTB, identical in shape to the `Model3D` buyer flow.

## Gotcha — test setup ordering (cost us a red run)

In `test_scenario`, calling `init_for_testing(ctx)` and `system::new_for_testing(ctx)` in the **same** transaction (`ts::begin`'s tx0) leaves the `Publisher` unreachable — the subsequent `take_from_sender<Publisher>` aborts with `EEmptyInventory (3)`.

**Fix:** run `init_for_testing` in its own tx first, `next_tx`, take the `Publisher`, then create the Walrus `System` in a later tx:

```move
init_for_testing(sc.ctx());            // tx0 — claims + transfers Publisher
sc.next_tx(CREATOR);
let publisher = sc.take_from_sender<Publisher>();   // now reachable
ensure_collection_policy(&publisher, sc.ctx());
sc.return_to_sender(publisher);
sc.next_tx(CREATOR);
let policy = ts::take_shared<TransferPolicy<NftToken>>(sc);
let mut system = system::new_for_testing(sc.ctx()); // create System *after* init
```

The existing `phase4_bootstrap` helper already followed this order implicitly (system was created in the test body before calling bootstrap, with a `next_tx` between); the new `nfttoken_bootstrap` helper had to be reordered to match.

## Note

`NftTokenMinted { token_id, collection_id, base_model_id, nft_creator }` was added (analog of `ModelPublished`) so the frontend/indexer and tests can resolve the minted token's id without parsing the PTB — `mint_nft_token` places the token straight into the Kiosk, so the id is otherwise not externally observable.
