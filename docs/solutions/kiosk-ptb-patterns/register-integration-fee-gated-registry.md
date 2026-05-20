---
title: "Fee-gated on-chain integration registry: per-(integrator,collection) uniqueness + emit-in-frame"
date: 2026-05-20
status: pattern-documented
category: kiosk-ptb-patterns
module: model3d-contract
problem_type: registry_pattern
component: contract
tags:
  - sui-move
  - registry
  - table
  - anti-spam
  - events
  - d-029
---

# Fee-gated integration registry (D-029 / plan-008 U4)

## Problem

A gameDev attests an on-chain B2B integration with an NFT collection. The attestation must be: fee-gated (the nft creator's revenue), license-gated (only permissionless collections accept it), anti-spammed (no flooding), and indexable off-chain for a buyer-facing "Used by" view — without the integrator owning a token or holding the collection's cap.

## Pattern

`register_integration(collection: &mut NftCollection, payment, app_metadata, clock, ctx)` — a permissionless-to-*call* entry fn gated entirely by runtime checks, in this exact order:

```
1. integration_policy == POLICY_PERMISSIONLESS  else EIntegrationsClosed (30)
2. payment.value() >= register_fee        else EFeeTooLow (31)
3. !integrations.contains(sender)          else EAlreadyRegistered (32)
4. app_metadata.length() <= APP_METADATA_MAX  else EAppMetadataTooLong (33)
5. split fee -> nft_creator; return change -> sender
6. integrations.add(sender, IntegrationRecord { app_metadata, registered_at_ms })
7. event::emit(IntegrationRegistered { collection_id, integrator, registered_at_ms })
```

### Key decisions

- **Integration gate is collection-level, not a model-license snapshot (D-030).** Gate 1 reads `collection.integration_policy` — owned by the nft creator (cap holder), set via `set_integration_policy`, default `PERMISSIONLESS` at launch. It is **not** the base model's `license.policy`: `register_integration` is an L2 action whose fee accrues to the nft creator, so the open/closed decision belongs at the level whose owner earns from it. (An earlier draft snapshotted `model.license.policy` into `base_policy` and gated on that — corrected by D-030; the abort renamed `ELicenseRestricted` → `EIntegrationsClosed` since it now means "this collection is closed," and fires for `ALLOW_LIST` too.)
- **Fee payee = `nft_creator`, not `base_creator`.** The register fee is the *nft creator's* integration revenue. `NftCollection` stores `nft_creator` (recorded at `launch_collection`) precisely so the fee can route to them without the soulbound cap as an argument — the integrator who pays does not hold it. `base_creator` (mesh creator) is a *different* payee: derive fee at launch + secondary royalty. (The plan originally under-specified this; resolved by adding the `nft_creator` field.)
- **Per-(integrator, collection) uniqueness lives on-chain** via `Table<address, IntegrationRecord>.contains(sender)`. This is *why the Table must exist on-chain* regardless of indexing strategy — it is the anti-spam gate, not just storage.
- **Emit inside the call frame, last.** Every `assert!` precedes the `event::emit`, so any abort rolls the event back atomically (same discipline as `RoyaltyPaid`). AE3's "restricted base → no event" is guaranteed structurally, not by a separate guard.
- **Lean event — no `app_metadata` duplication.** `IntegrationRegistered` carries only `{ collection_id, integrator, registered_at_ms }`. The `Table` is the single on-chain source of truth for `app_metadata`; the U7 indexer learns the pair from the event, then resolves `app_metadata` from the Table via `getDynamicFieldObject(tableId, { type: "address", value: integrator })`. Deliberately chosen over carrying `app_metadata` in the event (which would store the same bytes twice).
- **Coin handling mirrors `launch_collection`.** Split exactly `register_fee` to the payee, return overpayment to the integrator, `destroy_zero` on exact pay — so the integrator is never overcharged and no stray zero-coins litter inboxes.

## Reading a Table entry off-chain (the cost of the lean event)

`Table<K,V>` entries are dynamic fields whose object IDs are derived (`hash(tableUid ‖ BCS(key) ‖ keyType)`), not friendly top-level IDs. To read one integrator's record: `getObject(collectionId)` → read the `integrations` Table UID → `getDynamicFieldObject(tableUid, { type: "address", value: integrator })`. To list all of a collection's integrators: `getDynamicFields(tableUid)` (paged) + one `getDynamicFieldObject` per key. The U7 indexer accepts this extra read per event in exchange for not duplicating `app_metadata` on-chain.

## app_metadata defense in depth (R14 / AE4)

On-chain enforces **length only** (`APP_METADATA_MAX = 512`). The backend (U7) validates the full schema (UTF-8 JSON, `name`+`url` only, `name` ≤ 64 NFC + confusable guard, `url` ≤ 256 https-only). The frontend (U14) renders `name`/`url` as text nodes + a scheme-allowlisted `<a href>`, never `dangerouslySetInnerHTML`. The on-chain length cap is a sub-bound that the backend's per-field caps fit inside.
