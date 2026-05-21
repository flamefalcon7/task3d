# Phase 4 v7 republish — scratch notes (plan-009 U2 + D-040)

Not a formal Phase-5 doc. Raw deploy record: IDs, digests, bootstrap receipt. Canonical machine-readable copy lives in `contracts/networks/testnet.json`.

- **Date:** 2026-05-21
- **Network:** testnet (`chain_id 4c78adac`)
- **Deployer:** `0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed`
- **What changed (D-040):** L1 license-policy ENFORCEMENT. New abort `EPolicyRestricted = 38` + an `assert!(policy == POLICY_PERMISSIONLESS || ctx.sender() == model.creator, EPolicyRestricted)` at the top of the package-private `launch_collection_internal`. Covers both `launch_collection` and `launch_collection_with_tokens`. `/create` UI dropped the ALLOW_LIST option; ALLOW_LIST(1) collapses to creator-only on chain (fail-safe).

## Why fresh republish, not `sui client upgrade`

A compatible upgrade was attempted first (published-at `0x134807cd862f3ec69ec69832e4b3545a0ea95cadd8d49cb8b382c1c0d7882a25`, version 2, original-id preserved `0x57e20a13…`) and then **abandoned**. Reason (surfaced by the plan-009 code review — security + adversarial + api-contract all flagged it): a Sui compatible upgrade does not retire the prior package version. The pre-enforcement bytecode at the old id stays permanently callable, so a hand-crafted PTB targeting it bypasses the new assert — the gate would be honor-system only. A fresh republish has no prior version of itself → enforcement holds for all content under the new id, and it keeps a single package id (no published-at/original-id split). See `contracts/UPGRADE.md` ("General rule": republish when the change must DENY behavior the old version allowed).

## Deployed objects (v7)

| Object | ID |
|---|---|
| package (original-id == published-at, v1) | `0x3f53506b076bb9e43fbf8fc1333375530aeb97ad54e2ad81fdd36a9d595d0861` |
| UpgradeCap | `0xcd587052abfd7174d3f07ff87f9853aae1d233583f65091b00989f96c2dcca75` |
| Publisher | `0xee62b4643aaa22db193d8044748df0a05a70b6769c13f2ec509ae0c71457ad03` |
| TransferPolicy\<NftToken\> | `0x3ffa22b3472adcc89c7b9d11749d8b17ae0ced2dddfda38e191dc846d2bb2146` |
| TransferPolicyCap\<NftToken\> | `0x76cc696054ce4475989a750c12b1775796e5872137df27f003900382201cf48b` |
| kiosk-apps package (rules) | `0xe308bb3ed5367cd11a9c7f7e7aa95b2f3c9a8f10fa1d2b3cff38240f7898555d` (unchanged from v2–v6) |

## Transactions

| Step | Digest |
|---|---|
| `publish` | `Cdubzmx8TCWehYvp3jRBhvk7n9g3cxJa6YgFmUUicon1` |
| `ensure_collection_policy` | `B8MXhFp1SbQJPVJKfZgQyeGZ1Y4tCfZnMUAbT4YGJeGQ` |

The bootstrap is `ensure_collection_policy` only (D-032 removed `TransferPolicy<Model3D>`).

## Verification

- **`TransferPolicy<NftToken>` rules VecSet = 1 (royalty only):** the `ensure_collection_policy` tx created exactly one `RuleKey` dynamic field — `0xe308bb3e…::royalty_rule::Rule` — confirmed in the tx object changes.
- `sui move test` green (58/58 — includes the 3 single-path D-040 abort tests + the new `launch_collection_with_tokens_restricted_non_creator_aborts` batch-path test from the code-review fix).
- `contracts/networks/testnet.json` + `frontend/src/sui/networkConfig.ts` updated to the v7 single id; parity test (`networkConfig.test.ts`) green; full frontend suite 308/308; backend 110/110.
- Superseded: v6 `0x57e20a13…` (+ its abandoned compatible-upgrade published-at `0x134807cd…`), and historically v5 `0xe0d65c4a…`, v4 `0x3b6b7258…`, v3 `0x35ba17b3…`, v2 `0x563ab54b…`, Phase 3 `0x18a480b3…`.

## Plan 010 (D-041) marketplace smoke — LIVE cross-wallet, 2026-05-21

Keystore-signed smoke (`/tmp/market-smoke.mjs`, not committed) verifying the Kiosk list+purchase chain logic end-to-end on v7. Bootstrapped a token from scratch (v7 was empty) and ran:

| Step | Tx | Created |
|---|---|---|
| `publish` v7 Model3D (PERMISSIONLESS, 500 bps) | `46VaNbxgxMxqfALRi9vd58wRBEkNiwPQNUV8mZf1G7cM` | Model3D `0x6f60c598f0910603f1f9895bc339146844c02e8726b8d0c6ede301a65efc2a12` |
| `launch_collection_with_tokens` (mint 1) | `GJXfUmCr8YyS3PvBmpGpsZ12QtX8escZVKG6ZBPAURpd` | NftToken `0xc88e0691d8d36de7f13d4358f74ec141b1a8d0f7f83631a8f09920e3d9bd7397` |
| **list** (`kiosk::new` → `place_and_list` → `public_share_object` → cap to seller) | `39Hqw3Bh8Aoaw3tKzGgTPNgFPTEodimf1jEfivQvgUHE` | Kiosk `0x6e0e76604408180d3bfa6d3f17a1719d7d37e2208c49018b6a2f6ce1eeef9644` |
| **purchase** (`kiosk::purchase` → `royalty_rule::pay`@`0xe308bb3e` → `confirm_request` → `public_transfer`) | `Ziugq72afUrKHXU3pEMgjAjWDBzaLzn2VTQkidNTpKY` | — |

Seller = deployer `0x3116881c…`; buyer = `0x43d9a99c…` (funded 2 SUI). Price 1 SUI, royalty 0.05 SUI (`max(price·500/10000, 1e6)`). **Result:** the purchased NftToken ends up `AddressOwner = buyer` as a plain owned object — confirming the royalty-only `confirm_request` succeeds with exactly the royalty receipt and (no lock rule) the token is freed for /track discovery. The `kioskTxBuilders.ts` PTB shapes are thus validated against the live v7 package + policy. Only the dapp-kit browser signing path remains for a manual UI check.

These objects persist as v7 seed data for the UI check / U15 demo (Model3D `0x6f60c598…` forkable; NftToken `0xc88e0691…` owned by `0x43d9a99c…`).

## Follow-up

- Live cross-wallet abort confirmation (a non-creator wallet forks a RESTRICTED model → abort 38) folds into the U15 four-actor demo (needs a 2nd wallet + a published RESTRICTED model). Logic covered by Move tests.
- Plan 010 (Kiosk marketplace) targets the v7 package + the fresh `transfer_policy_id` / `transfer_policy_cap_id` above. **Chain logic verified live (see smoke above); browser signing-path UI check pending.**
