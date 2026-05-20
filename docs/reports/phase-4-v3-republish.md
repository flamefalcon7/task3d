# Phase 4 v3 republish — scratch notes (plan-008 U5 + D-032)

Not a formal Phase-5 doc. Raw deploy record: IDs, digests, gas, bootstrap receipts. Canonical machine-readable copy lives in `contracts/networks/testnet.json`.

- **Date:** 2026-05-20
- **Network:** testnet (`chain_id 4c78adac`)
- **Deployer:** `0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed`
- **Why fresh package (not upgrade):** D-029 deletes the public `Access` struct + D-032 removes the L1 Kiosk public fns — both break compatible-upgrade rules → new `original-id`. `Published.toml`'s v2 `[published.testnet]` entry was removed to allow the republish; the CLI rewrote it with the v3 ID.

## Deployed objects (v3)

| Object | ID |
|---|---|
| package | `0x35ba17b3188b639cb79ac132979c632168889831a9ecbf63e9f3b69e8eed6785` |
| UpgradeCap | `0x0a3c1c5f14c91da247cea5e0230b24098d1ea79387dd6fcb226578e24f9d8567` |
| Publisher | `0x00808fedbc652b50436f85a1882107ebac2cc283d508bf32efc691ea5286720f` |
| TransferPolicy\<NftToken\> | `0xf1816cae676afefa0d8d2b3734347fb240d0547b0736dd62e0c9f31500e57272` |
| TransferPolicyCap\<NftToken\> | `0xc2b91b69009ad9d331bdffe9c94fec2902ddb9e0a2e69792bfe9a4695c8860f4` |
| kiosk-apps package (rules) | `0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d` (unchanged from v2) |

## Transactions

| Step | Digest | Gas |
|---|---|---|
| `publish` | `AuzWcL4fUbgLL3uvaqPfwpuzYU5p9EGa4Uqr1fVk2yab` | ~0.0494 SUI |
| `ensure_collection_policy` | `CA6oX21RtzFCd3mj8EM9kxcrhmvyFVeV7tJZwdkonSh1` | — |

No `ensure_transfer_policy` call — D-032 removed `TransferPolicy<Model3D>`. The bootstrap is `ensure_collection_policy` only.

## Verification

- `TransferPolicy<NftToken>` rules VecSet = 3: `royalty_rule::Rule`, `kiosk_lock_rule::Rule`, `personal_kiosk_rule::Rule` (all under `0xe308bb3e…`).
- `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` updated; parity test (`networkConfig.test.ts`) green.
- Superseded: v2 `0x563ab54b…`, Phase 3 `0x18a480b3…` (both abandoned on testnet).

## RR-001 (follow-up)

Any event subscriber / indexer must point at the v3 package `0x35ba17b3…`. No backend indexer exists yet (U7 builds it); the client-side GraphQL Browse (`useModelIndex`) must filter on the v3 package.

## Note for U6+

`networkConfig.ts` keeps the generic `transferPolicyId` / `transferPolicyCapId` field names (now holding the **NftToken** policy) so the obsolete `kioskTxBuilders.ts` still compiles. U6 reworks builders into `collectionTxBuilders.ts` (NftToken Kiosk chain) and can rename then. The frontend is otherwise still on the pre-D-032 flow.
