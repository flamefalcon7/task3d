# Phase 4 v4 republish — scratch notes (plan-008 U16/U17 + D-035/D-036)

Not a formal Phase-5 doc. Raw deploy record: IDs, digests, gas, bootstrap receipts. Canonical machine-readable copy lives in `contracts/networks/testnet.json`.

- **Date:** 2026-05-20
- **Network:** testnet (`chain_id 4c78adac`)
- **Deployer:** `0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed`
- **Why fresh package (not upgrade):** D-035 adds fields to two existing `key` structs (`NftCollection.quilt_blob_id`, `NftToken.patch_id`), D-036 changes the signatures of `launch_collection` + `mint_nft_token`, and the `NftTokenMinted` event layout changed — each independently breaks compatible-upgrade rules → new `original-id`. `Published.toml`'s v3 `[published.testnet]` entry was removed to allow the republish; the CLI rewrote it with the v4 ID.

## Deployed objects (v4)

| Object | ID |
|---|---|
| package | `0x3b6b7258831f43ad926d3f961b6a77edbce7c5845262c5dfb7d783147158eb03` |
| UpgradeCap | `0xe39adcd33c8d2d693da637a338b2733f9dfeba88240108c67b2d256524bee710` |
| Publisher | `0x09f80e91d766bfe71a0a6288e9aeab0c4e0929d60dee5c851a8e2b867dccce5e` |
| TransferPolicy\<NftToken\> | `0x9607bcf10be57e99269f6dab4e4e3b5e9aa0527066d5ea14a7985d7ddd6f0342` |
| TransferPolicyCap\<NftToken\> | `0x85de8533f4279f56c889d72c952864c73eb471719818856e3005331a475d49ff` |
| kiosk-apps package (rules) | `0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d` (unchanged from v2/v3) |

## Transactions

| Step | Digest | Gas |
|---|---|---|
| `publish` | `8rFxGjtRyt4krVPtN5ujPcBSHcoGfHtHES91NyPVYRGk` | ~0.0496 SUI |
| `ensure_collection_policy` | `25xdsvTFTLoiCxhtc5dQKeHrHn961H4kCfM6djzdt7yW` | — |

No `ensure_transfer_policy` call — D-032 removed `TransferPolicy<Model3D>`. The bootstrap is `ensure_collection_policy` only.

## Verification

- **`TransferPolicy<NftToken>` rules VecSet = 1 (royalty only):** read back from the deployed object, `rules.contents = [ e308bb3e…::royalty_rule::Rule ]`. D-036 removed `kiosk_lock_rule` + `personal_kiosk_rule`; on-chain confirms exactly one rule. The bootstrap tx created exactly one `RuleKey` dynamic field (royalty), corroborating.
- `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` updated; parity test (`networkConfig.test.ts`) green.
- Superseded: v3 `0x35ba17b3…` (abandoned on testnet), and historically v2 `0x563ab54b…`, Phase 3 `0x18a480b3…`.

## RR-001 (follow-up)

Any event subscriber / indexer must point at the v4 package `0x3b6b7258…`. The U7 backend `IntegrationRegistered` indexer + the client-side GraphQL Browse (`useModelIndex`) must filter on the v4 package id. The frontend PTB builders (U6 `collectionTxBuilders.ts`) need their v4 revision: `buildLaunchCollectionPtb` += `quiltBlobId`, `buildMintNftTokenPtb` drops kiosk args + adds `patchId` (now a plain mint+transfer, no `ItemListed`), plus a new `buildListNftTokenForSalePtb` for the opt-in sale path.

## Note for U11/U12

`NftToken.patch_id` is now resolvable: token `getObject` → `patch_id` → the parent collection's `quilt_blob_id` → by-quilt-patch-id aggregator → variant GLB. U11 (`/track`) discovers owned `NftToken`s via `getOwnedObjects` (no Kiosk walk — D-036 mints are plain owned). U12 (nft-creator launch) authors variants → `/api/collection/build` quilt → `launch_collection(base, quiltBlobId)` → `mint_nft_token` per patch.
