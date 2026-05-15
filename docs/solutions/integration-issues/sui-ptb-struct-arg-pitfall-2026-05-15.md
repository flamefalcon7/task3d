---
title: Sui PTB struct-typed arg cannot be passed as raw BCS bytes
date: 2026-05-15
category: integration-issues
module: model3d-contract
problem_type: integration_issue
component: tooling
symptoms:
  - "Every PTB invocation of model3d::publish_and_share fails at dry-run / sign time"
  - "Move VM type-error: argument expected struct but got vector<u8>"
  - "Walrus blob already paid (register + certify completed) when the publish PTB reverts → orphaned paid storage on every failed mint attempt"
root_cause: wrong_api
resolution_type: code_fix
severity: critical
tags:
  - sui-move
  - ptb
  - bcs
  - dapp-kit
  - move-2024
  - walrus
related_components:
  - frontend
  - sui
---

# Sui PTB struct-typed arg cannot be passed as raw BCS bytes

## Problem

The frontend PTB builder for `model3d::publish_and_share` BCS-serialized the `LicenseTerms` struct into a `Uint8Array` and passed it as `tx.pure.vector('u8', Array.from(licenseBytes))`. The Move entry function declares the parameter as `license: LicenseTerms` — a struct value, not `vector<u8>`. Sui's Move VM type-checks each PTB argument against the entry function's signature, and **there is no mechanism to pass pre-BCS-serialized struct bytes for a struct-typed parameter via `tx.pure.*`**. Every mint attempt would have failed at dry-run / sign time.

The bug was caught by **4 independent ce-code-review personas** (correctness, api-contract, project-standards, adversarial) before the contract was deployed to testnet, so no real funds were lost — but unit tests would not have caught it because `publishPtb.test.ts` only asserted that `JSON.stringify(tx.getData())` contained the target string `'publish_and_share'`. That assertion passed with the broken encoding.

## Symptoms

- `sui client publish` + first PTB call from frontend → Move VM aborts with "expected `LicenseTerms`, found `vector<u8>`" (or similar UnusedValueWithoutDrop / type-mismatch)
- Walrus `executeRegister` + `executeCertify` complete (storage paid + locked for the configured epoch count) **before** the publish PTB fires — so every failed mint attempt orphans paid Walrus storage with no on-chain Model3D referencing it
- `publishPtb.test.ts` reports green because it only inspects the serialized PTB JSON for the target name, not BCS argument typing
- `sui move test` passes (Move tests construct `LicenseTerms` via `new_license_terms()` directly; they don't exercise the PTB encoding path)
- Move package builds and deploys cleanly — the bug is purely on the client side

## What Didn't Work

- **Adding a BCS snapshot test for `encodeLicenseTerms`**: catches drift in field ordering inside the bytes (`policy: u8 | derivative_mint_fee: u64 | derivative_royalty_bps: u16 | commercial_use: bool | require_attribution: bool`), but says nothing about whether those bytes are actually accepted by the Move VM as a struct value.
- **Asserting `serialized.includes('publish_and_share')`**: confirms the moveCall target exists in the PTB, never verifies argument types.
- **Trusting the BCS encoding because Move tests pass locally**: Move-side tests build the struct in-module via `new_license_terms(...)`. They never exercise the cross-boundary BCS-bytes-as-argument path the frontend would use.

## Solution

Split the PTB into **two chained `moveCall`s**. Construct `LicenseTerms` on-chain via the existing `model3d::new_license_terms` constructor, then pass that call's Result as the `license` argument to `publish_and_share`.

**Before (broken):**

```ts
// frontend/src/sui/publishPtb.ts
export function buildPublishPtb(input: BuildPublishPtbInput): Transaction {
  const tx = new Transaction();
  const licenseBytes = encodeLicenseTerms(input.license);  // BCS bytes
  tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::publish_and_share`,
    arguments: [
      tx.object(input.blobObjectId),
      tx.pure.string(input.shapeType),
      // ... other args ...
      tx.pure.vector('u8', Array.from(licenseBytes)),  // ❌ struct passed as vector<u8>
      tx.object('0x6'),
    ],
  });
  return tx;
}
```

**After (correct):**

```ts
// frontend/src/sui/publishPtb.ts
export function buildPublishPtb(input: BuildPublishPtbInput): Transaction {
  const tx = new Transaction();

  // Sui PTB cannot pass pre-BCS-serialized struct bytes as a struct-typed
  // argument; the Move VM type-checks each arg against the entry function's
  // parameter type. Construct LicenseTerms on-chain via new_license_terms
  // and chain the Result into publish_and_share.
  const license = tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::new_license_terms`,
    arguments: [
      tx.pure.u8(input.license.policy),
      tx.pure.u64(input.license.derivativeMintFee),
      tx.pure.u16(input.license.derivativeRoyaltyBps),
      tx.pure.bool(input.license.commercialUse),
      tx.pure.bool(input.license.requireAttribution),
    ],
  });

  tx.moveCall({
    target: `${MODEL3D_PACKAGE_ID}::model3d::publish_and_share`,
    arguments: [
      tx.object(input.blobObjectId),
      tx.pure.string(input.shapeType),
      tx.pure.string(input.paramsJson),
      tx.pure.string(input.name),
      tx.pure.vector('string', input.tags),
      tx.pure.string(input.lineageBlobId),
      tx.pure.u64(input.directAccessPrice),
      tx.pure.bool(input.isEncrypted),
      license,           // ✅ Result from prior moveCall — Sui resolves as LicenseTerms
      tx.object('0x6'),
    ],
  });
  return tx;
}
```

The `new_license_terms` function must already exist as `public fun` in the Move package — it does in `contracts/model3d/sources/model3d.move:93-107`. No Move-side change needed.

`encodeLicenseTerms` + the BCS snapshot test were kept as regression coverage on the Move struct field order. The test no longer reflects what `buildPublishPtb` does at runtime, but documents the canonical BCS layout for any future tool that needs to encode `LicenseTerms` outside a Sui PTB (e.g., a Rust client, a watch-only indexer).

## Why This Works

Sui's PTB (Programmable Transaction Block) supports two ways to produce a value:

1. **`tx.pure.<type>(value)`** — encodes a primitive (`u8`, `u64`, `bool`, `String`, `vector<T>` of primitives) into BCS bytes inline. Constrained to types the Sui Move VM recognizes as `pure` — primitives, addresses, and vectors of primitives. **Struct types are not eligible.**
2. **`tx.moveCall({...})`** — invokes a Move function; its return value is a `Result` handle that can be passed as an argument to subsequent calls in the same PTB. The Move VM resolves the Result against the consumer's expected type at execution time.

For struct-typed parameters, only option (2) is valid. Sui has no `tx.pure.struct(...)` because there's no on-chain mechanism to materialize a struct from BCS bytes without invoking its module's constructor (or other public `fun` that returns it). The Move type system intentionally forbids this — struct fields may have abilities (`store`, `copy`, `drop`, `key`) that pure bytes cannot guarantee.

The fix works because `new_license_terms` is a `public fun` that takes 5 primitive arguments and returns a `LicenseTerms` value with the correct abilities (`store, copy, drop` per spec §2.8). Chaining its Result into `publish_and_share`'s `license` slot satisfies the Move VM's type and ability checks.

## Prevention

1. **Never serialize a Move struct yourself to pass into a PTB.** If the entry function takes `T: SomeStruct`, you must either:
   - Construct it on-chain via `tx.moveCall` to a `public fun` that returns `T`, then chain the Result, **OR**
   - Refactor the entry function to take the struct's fields as individual primitive parameters and assemble the struct internally.

2. **Test PTBs with `client.dryRunTransactionBlock(tx)`** — not just `JSON.stringify(tx.getData())`. The dry-run round-trips through the Move VM's type checker and surfaces this class of bug immediately. A test that only inspects serialized JSON cannot detect struct-vs-bytes mismatches:

   ```ts
   // Strong test (catches BCS-vs-struct + ability + field-order bugs)
   it('publish_and_share PTB dry-runs against testnet package', async () => {
     const tx = buildPublishPtb({ ... });
     const client = new SuiJsonRpcClient({ ... });
     const result = await client.dryRunTransactionBlock({
       transactionBlock: await tx.build({ client }),
     });
     expect(result.effects.status.status).toBe('success');
   });
   ```

3. **In TypeScript: keep `encodeLicenseTerms` (or any BCS encoder for an on-chain struct) but document explicitly that its output is NOT for PTB arguments.** Suitable use cases: BCS-encoded payloads for hashing, off-chain signature inputs, or sending to a custom Rust client. Add a one-line comment on the function: `// NOTE: do not pass output to tx.pure.vector('u8', ...) — use tx.moveCall to construct on-chain.`

4. **When a Move entry function takes a struct, expose its `public fun new_<struct>` constructor alongside it** so PTB clients have a documented construction path. The pattern in this repo: `new_license_terms` mirrors the `LicenseTerms` field list 1:1 — a TS-side client can mechanically map an `interface LicenseTermsInput` to the constructor argument list.

5. **Defense in depth: ce-code-review with multiple personas catches this even when tests don't.** The bug surfaced in 4 personas independently before testnet deploy. A single-persona review or no-review path would have shipped it. PTB-heavy diffs warrant `ce-code-review` before merging to a branch with deploy automation.

## Related Issues

- `docs/decisions.md` D-015 (Model3D struct + `lineage_blob_id` field) — the field order LicenseTerms must respect
- `docs/decisions.md` D-018 (Move-level input bound assertions) — protocol-level invariants Move enforces independently of the PTB encoding
- `docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` U7 — the implementation unit where this bug was introduced (subagent built `publishPtb.ts` from inline code skeletons that did not exercise the BCS-vs-struct distinction)
- Commit `f377366` — the fix
- Mysten Labs Sui SDK reference for PTB construction: `@mysten/sui/transactions` — `Transaction`, `moveCall`, `pure`, `object`
