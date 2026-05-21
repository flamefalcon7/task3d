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

## Follow-up

- Live cross-wallet abort confirmation (a non-creator wallet forks a RESTRICTED model → abort 38) folds into the U15 four-actor demo (needs a 2nd wallet + a published RESTRICTED model). Logic covered by Move tests.
- Plan 010 (Kiosk marketplace) targets the v7 package + the fresh `transfer_policy_id` / `transfer_policy_cap_id` above.
