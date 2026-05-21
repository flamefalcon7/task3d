# Phase 4 v6 republish — scratch notes (plan-008 U20/U21 + D-038)

Not a formal Phase-5 doc. Raw deploy record: IDs, digests, gas, bootstrap receipts. Canonical machine-readable copy lives in `contracts/networks/testnet.json`.

- **Date:** 2026-05-21
- **Network:** testnet (`chain_id 4c78adac`)
- **Deployer:** `0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed`
- **What changed (D-038):** adds `public entry fun launch_collection_with_tokens` (one-signature launch + set_register_fee + mint-N owned tokens + share collection + transfer cap) plus two package-private cores (`launch_collection_internal`, `mint_nft_token_internal`). The existing `launch_collection` / `set_register_fee` / `mint_nft_token` public signatures and all struct layouts are **unchanged**. New abort code `EBatchLenMismatch = 37`.
- **Additive-only — but shipped as a fresh republish:** adding a public fn is a *compatible* upgrade (would preserve `original-id` and keep the v5 `TransferPolicy`/`Publisher` valid with no re-bootstrap). Per **D-038** we still republish fresh for consistency with v3/v4/v5 (v5 has no on-chain state worth preserving; re-bootstrap is ~free) and to avoid the published-at/original-id config split mid-sprint. The compatible `sui client upgrade` path is the mainnet-era norm. `Published.toml`'s v5 entry was removed pre-publish; the CLI rewrote it with the v6 id.

## Deployed objects (v6)

| Object | ID |
|---|---|
| package | `0x57e20a134282476a8b338e85258790ab93f8c9b194bed6fa6120561787af4094` |
| UpgradeCap | `0x03e7b1a253bcb2f6844870882ae23e52e96b119454d99723eb2aab59ea8dfc98` |
| Publisher | `0x73ccb3d9619df33e365362b66020ca2608c94949d07735212c7e53935930e549` |
| TransferPolicy\<NftToken\> | `0x0e3981e915fd3413b3a62ff6055bf80d67fc8c3e6b80fd437aade5463ffa2386` |
| TransferPolicyCap\<NftToken\> | `0x8f049a6ec488bc39df1c1920376b766ba8b13db3cc64a41f4fcf7930f801aabc` |
| kiosk-apps package (rules) | `0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d` (unchanged from v2–v5) |

## Transactions

| Step | Digest | Gas |
|---|---|---|
| `publish` | `Ck933ViqRZ8639Zu2Uq6dKHoG1kZwCKJofEx81CqTJzS` | ~0.0526 SUI |
| `ensure_collection_policy` | `DETEAvJUWBV5vuXwa48V5bKiqBKVsVJWCNB9F8VwKXhS` | — |

The bootstrap is `ensure_collection_policy` only (D-032 removed `TransferPolicy<Model3D>`).

## Verification

- **`TransferPolicy<NftToken>` rules VecSet = 1 (royalty only):** read back from the deployed object, `rules.contents = [ 0xe308bb3e…::royalty_rule::Rule ]`.
- `sui move build` clean (no warnings); `sui move test` green (54/54 — includes the 3 new D-038 batch-fn tests: launch+fee+mint-fleet, derive-fee routing, length-mismatch abort).
- `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` updated; parity test (`networkConfig.test.ts`) green.
- Superseded: v5 `0xe0d65c4a…` (abandoned on testnet), and historically v4 `0x3b6b7258…`, v3 `0x35ba17b3…`, v2 `0x563ab54b…`, Phase 3 `0x18a480b3…`.

## RR-001 (follow-up)

Any event subscriber / indexer + the frontend must point at the v6 package `0x57e20a13…`. New U6 builder needed: `buildLaunchCollectionWithTokensPtb` (one-signature path for `LaunchCollectionPage`); the standalone `buildLaunchCollectionPtb` / `buildMintNftTokenPtb` remain for the descope path. U12a's `glb_blob_id` frontend wiring + the base picker now target v6.
