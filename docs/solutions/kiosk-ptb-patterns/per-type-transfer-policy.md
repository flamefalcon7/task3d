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
  - d-035
  - d-036
---

# Per-type TransferPolicy (D-029 / plan-008 U3)

## Problem

L2 tradeable `NftToken` resales must enforce royalty on the Kiosk. `TransferPolicy<T>` is generic over the item type, so `Model3D`'s policy does **not** cover `NftToken` — the framework's `confirm_request<NftToken>` reads `TransferPolicy<NftToken>`, a different shared object with a different ID.

## Pattern

Bootstrap a per-`NftToken` policy via an L2 analog of `ensure_transfer_policy`.

> **D-036 update (v4, 2026-05-20):** the policy now carries **only the royalty rule**. The original v3 version (below) attached three rules (royalty + `kiosk_lock_rule` + `personal_kiosk_rule`); D-036 dropped the latter two so a bought `NftToken` is freely usable (gameDev-friendly) and is *taken out* of the sale rather than re-locked into a Kiosk.

```move
// v4 (D-036) — royalty-only
public entry fun ensure_collection_policy(publisher: &Publisher, ctx: &mut TxContext) {
    assert!(package::from_package<NftToken>(publisher), EWrongPublisher);
    let (mut policy, cap) = tp::new<NftToken>(publisher, ctx);
    royalty_rule::add<NftToken>(&mut policy, &cap, AMOUNT_BP_DEFAULT, MIN_ROYALTY_AMOUNT_MIST);
    transfer::public_share_object(policy);
    transfer::public_transfer(cap, ctx.sender());
}
```

- Same ordering invariant as before: attach the rule *before* sharing (fail-safe by construction; see `transfer-policy-before-place.md`).
- Since D-032 the package creates **only** `TransferPolicy<NftToken>` (Model3D is shared, not Kiosk-traded), so the bootstrap runs only `ensure_collection_policy`.

### confirm_request consequence (royalty-only)

With a single royalty rule, the resale hot-potato chain is just **pay royalty → `confirm_request`** — no `kiosk_lock_rule::prove`, no `personal_kiosk_rule::prove`. The buyer receives the `NftToken` by value from `kiosk::purchase` and keeps it (no re-lock):

```move
let (item, mut request) = kiosk::purchase<NftToken>(&mut kiosk, token_id, payment);
royalty_rule::pay<NftToken>(&mut policy, &mut request, royalty_coin);
let (_id, _paid, _from) = tp::confirm_request<NftToken>(&policy, request);
// `item` is now freely owned — no kiosk::lock required.
```

- **Minting no longer touches a Kiosk (D-036).** `mint_nft_token` `public_transfer`s a plain owned token to the caller. Listing-for-sale is a *separate opt-in* PTB the owner composes (`kiosk::place_and_list<NftToken>`), so the v3 "atomic place+list at mint" shape is gone.

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

`NftTokenMinted { token_id, collection_id, base_model_id, nft_creator, patch_id }` was added (analog of `ModelPublished`) as an indexer anchor. **v4 (D-036) update:** `mint_nft_token` now `public_transfer`s a plain owned token to the caller (no Kiosk placement), so the new token's object id is directly observable in the PTB effects — the event is convenience, not the only observation point. The `patch_id` field (D-035) lets an indexer resolve the variant GLB straight from the event without a follow-up `getObject`.
