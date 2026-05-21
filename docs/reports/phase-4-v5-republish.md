# Phase 4 v5 republish — scratch notes (plan-008 U18/U19 + D-037)

Not a formal Phase-5 doc. Raw deploy record: IDs, digests, gas, bootstrap receipts. Canonical machine-readable copy lives in `contracts/networks/testnet.json`.

- **Date:** 2026-05-21
- **Network:** testnet (`chain_id 4c78adac`)
- **Deployer:** `0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed`
- **Why fresh package (not upgrade):** D-037 adds a field (`glb_blob_id: String`) to the existing `key` struct `Model3D`, and changes the signatures of `new_model` + the `publish` entry fn (both gain a `glb_blob_id` param). Adding a struct field is not a compatible upgrade (struct layout is part of the on-chain object representation), and changing a public fn signature is independently breaking → new `original-id`. `Published.toml`'s v4 `[published.testnet]` entry was removed to allow the republish; the CLI rewrote it with the v5 ID.
- **`ModelPublished` event layout unchanged:** the GLB resolves from the `Model3D.glb_blob_id` object field, so the indexer needs no new event field.

## Deployed objects (v5)

| Object | ID |
|---|---|
| package | `0xe0d65c4a48c9f0b52251a5e6d97bfcec09fbd94c6b0d342c1057a019ec05309b` |
| UpgradeCap | `0x9642c230f428875af4b0ccbda486cc88a1575cee774b69ba3521267a05b44bed` |
| Publisher | `0xcd1943f44e7cb029161b0a81be678a5a909c84287ee686bc1e7278e1c113b671` |
| TransferPolicy\<NftToken\> | `0xd7677bb04c32f43f3064c3c2e5e95c9e66bc09da63c3bb7f526ca2538b4774e8` |
| TransferPolicyCap\<NftToken\> | `0xb09e9a2ebee8bd75be36a48243c95a24698581aca73ecc35c74632ba695cae35` |
| kiosk-apps package (rules) | `0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d` (unchanged from v2/v3/v4) |

## Transactions

| Step | Digest | Gas |
|---|---|---|
| `publish` | `FMfF83mdwJKkgLDnjuLjPrwXc1HYCUXeyJSDHy8sfUiL` | ~0.0502 SUI |
| `ensure_collection_policy` | `Fxq1XDj6jdrjeAoyk15wrMjdSuwv53rEseZK9RMNryKf` | — |

No `ensure_transfer_policy` call — D-032 removed `TransferPolicy<Model3D>`. The bootstrap is `ensure_collection_policy` only.

## Verification

- **`TransferPolicy<NftToken>` rules VecSet = 1 (royalty only):** read back from the deployed object, `rules.contents = [ 0xe308bb3e…::royalty_rule::Rule ]`. D-036's royalty-only policy carries over unchanged in v5; on-chain confirms exactly one rule. The bootstrap tx created exactly one `RuleKey` dynamic field (royalty), corroborating.
- `sui move build` clean (no warnings); `sui move test` green (51/51 — includes the 2 new D-037 glb-blob-id bound tests).
- `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` updated; parity test (`networkConfig.test.ts`) green.
- Superseded: v4 `0x3b6b7258…` (abandoned on testnet), and historically v3 `0x35ba17b3…`, v2 `0x563ab54b…`, Phase 3 `0x18a480b3…`.

## RR-001 (follow-up)

Any event subscriber / indexer must point at the v5 package `0xe0d65c4a…`. The U7 backend `IntegrationRegistered` indexer + the client-side GraphQL Browse (`useModelIndex`) must filter on the v5 package id. The frontend PTB builders (`collectionTxBuilders.ts`) need no signature change for v5 (the D-035/D-036 surface is unchanged); only the **L1 publish path** changes (U10 follow-up).

## U10 follow-up (folds into U12 prep)

`Model3D.glb_blob_id` is now the canonical L1 GLB pointer:
- `/create` uploads the GLB as a **standalone** Walrus blob (not quilted with lineage) and passes its blob-id string to `buildPublishPtb({ …, glbBlobId })`.
- `buildPublishPtb` adds the `glbBlobId` arg (now `publish` takes it positionally after `lineageBlobId`).
- `useModelIndex` reads `json.glb_blob_id`.
- Resolution: `/v1/blobs/<glb_blob_id>` (sub-decision (i) — whole-blob, not by-quilt-patch-id which is L2-only).

This unblocks U12 (an nft creator can fork an L1 base whose GLB now resolves) and fixes L1 Browse preview.
