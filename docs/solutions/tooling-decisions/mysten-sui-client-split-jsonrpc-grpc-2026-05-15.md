---
title: "@mysten/sui@2.16+ removed the unified SuiClient — import SuiJsonRpcClient or SuiGrpcClient instead"
date: 2026-05-15
category: tooling-decisions
module: sui-client
problem_type: tooling_decision
component: tooling
severity: high
tags:
  - mysten-sui
  - sdk-upgrade
  - walrus
  - sui-client
  - grpc
  - json-rpc
applies_when:
  - "Adding `@mysten/walrus` (any version since 1.0) — it requires `@mysten/sui@^2.16` and forces the SDK split"
  - "Upgrading from a pre-2.16 `@mysten/sui` where `import { SuiClient } from '@mysten/sui/client'` was the canonical entry"
  - "Writing forward-compatible Sui client code that should survive the JSON-RPC deprecation (Mysten target: July 2026)"
related_components:
  - backend
  - frontend
  - contracts
---

# @mysten/sui@2.16+ removed the unified SuiClient — import SuiJsonRpcClient or SuiGrpcClient instead

## Context

The `@mysten/sui` SDK split its client surface in the 2.16 release train (2026-05). The old single-class entry — `import { SuiClient } from '@mysten/sui/client'` — was removed. The replacement is two purpose-built clients shipped from sibling subpath exports:

- `import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'` — drop-in for the old JSON-RPC behavior
- `import { SuiGrpcClient } from '@mysten/sui/grpc'` — new gRPC transport, the forward-compatible path

Mysten has publicly stated the JSON-RPC client will be **deprecated in July 2026** and removed in a later major. The split exists to give consumers a clean migration path: `SuiJsonRpcClient` is API-compatible with the old `SuiClient` for now, but new code should target `SuiGrpcClient` where possible.

For this project, the trigger was `@mysten/walrus@1.1.7`'s peer-dep on `@mysten/sui@^2.16.2`. Once Walrus was added (Phase 2 U3), pinning `@mysten/sui` to an older version was no longer an option — the whole repo had to move. The migration is mechanical but every import path changes.

Captured separately as ADR **D-019** (`docs/decisions.md`). This doc holds the technical detail; D-019 holds the binding decision.

## Guidance

**Use `SuiJsonRpcClient` for the 6/21 submission. Plan to migrate to `SuiGrpcClient` post-submission** (before the July 2026 deprecation), when there's time to verify Walrus + zkLogin + dapp-kit all behave under gRPC.

**Import path mapping:**

```ts
// ❌ Old (pre-2.16, no longer compiles)
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
const client = new SuiClient({ url: getFullnodeUrl('testnet') });

// ✅ New — JSON-RPC (drop-in for now, deprecates July 2026)
import { SuiJsonRpcClient, getFullnodeUrl } from '@mysten/sui/jsonRpc';
const client = new SuiJsonRpcClient({ url: getFullnodeUrl('testnet') });

// ✅ New — gRPC (forward-compatible target)
import { SuiGrpcClient } from '@mysten/sui/grpc';
const client = new SuiGrpcClient({ url: 'https://grpc.testnet.sui.io' });
```

**Why JSON-RPC for the submission, not gRPC:**

- Walrus SDK internals call into the Sui client; verify Walrus's own code path works under `SuiGrpcClient` before committing
- dapp-kit's `useSuiClient` provider currently expects JSON-RPC semantics; double-check the provider type before swapping
- zkLogin / Enoki helpers may have JSON-RPC-specific paths
- The migration risk against a 6/21 submission deadline outweighs the deprecation runway (Mysten gave roughly 2 months — plenty of post-submission window)

**Type imports stay on the package root:**

```ts
// Type imports are unaffected — both clients return the same response types
import type { SuiObjectResponse, SuiTransactionBlockResponse } from '@mysten/sui/client';
```

The `/client` subpath is *still exported* — it just no longer contains the `SuiClient` class. Type-only imports continue to work. Code that does `import * from '@mysten/sui/client'` and pulls in `SuiClient` is the failure mode.

**Test mocks must update too:**

```ts
// Test setup
vi.mock('@mysten/sui/jsonRpc', () => ({
  SuiJsonRpcClient: vi.fn().mockImplementation(() => ({
    getObject: vi.fn(),
    dryRunTransactionBlock: vi.fn(),
    // ...
  })),
  getFullnodeUrl: () => 'http://mock-fullnode',
}));
```

## Why This Matters

1. **The error doesn't say "renamed".** `import { SuiClient } from '@mysten/sui/client'` after the upgrade compiles fine in many setups (the import path still exists), then errors at runtime with `TypeError: SuiClient is not a constructor`. Sometimes it's caught at type-check (`Module '"@mysten/sui/client"' has no exported member 'SuiClient'`). Either way, the fix is the import path, not a constructor argument.

2. **Walrus forces the upgrade.** `@mysten/walrus`'s peer-dep cascade means any project adopting Walrus storage must take 2.16+ — so any team that adopts decentralized storage simultaneously inherits the client split. Easy to misdiagnose as a Walrus problem when it's really a Sui SDK problem.

3. **Mocks break invisibly.** A `vi.mock('@mysten/sui/client', ...)` that worked pre-upgrade silently stops mocking the right thing after — the SUT now imports from `/jsonRpc`, so the test gets the real (un-stubbed) module. Tests that exercise client behavior need both the mock path and the import path updated together.

4. **Forward-compat planning is real.** July 2026 is the Mysten-stated deprecation; assume real removal in late-2026 or early-2027. Projects with a longer shelf life than this hackathon should bias toward gRPC from the start, not as a follow-up.

## When to Apply

- Setting up a new `@mysten/sui` consumer at version 2.16 or later
- Adding `@mysten/walrus` to an existing project still on pre-2.16 (the install will trigger the same change)
- Reviewing legacy code from before 2026-05 — the unified `SuiClient` import is a sign the code hasn't been updated
- Writing test mocks against either client — pin the mock subpath to the actual import subpath
- Auditing a Sui project for the JSON-RPC deprecation — every `SuiJsonRpcClient` instantiation is a future migration site

## Examples

### Migration in this project

The full diff across the repo (Phase 2 work):

- `backend/src/sui/client.ts` — instantiation site: `SuiClient` → `SuiJsonRpcClient`, import path `/client` → `/jsonRpc`
- `backend/src/agent/router.ts` — type-only imports unchanged
- `frontend/src/walrus/walrusClient.ts` — uses Walrus SDK which internally uses the Sui client; explicit instantiation here is `SuiJsonRpcClient`
- `frontend/src/test/setup.ts` — mock path updated; module factory keeps the same shape since `SuiJsonRpcClient` is API-compatible
- `frontend/src/sui/publishPtb.test.ts` — mock updated similarly
- `shared/src/types.ts` — type imports from `@mysten/sui/transactions` and `@mysten/sui/client` (for `SuiObjectResponse` etc.) unchanged

The mechanical pattern: search for `import.*SuiClient.*from.*@mysten/sui/client` across the workspace, then for each hit:
1. Change the named import to `SuiJsonRpcClient`
2. Change the path to `/jsonRpc`
3. Update the constructor call `new SuiClient(` → `new SuiJsonRpcClient(`
4. Update any test mock targeting that path

### What NOT to do

```ts
// ❌ Don't try to alias your way out of it — types diverge later
import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
```

The alias hides the migration in code review and makes the eventual gRPC swap harder. Just use the real name.

```ts
// ❌ Don't import the class type from /client — it's gone
import type { SuiClient } from '@mysten/sui/client';
```

If you need a "Sui client" type bound, use the new class name as the type:

```ts
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
function callSui(client: SuiJsonRpcClient) { /* ... */ }
```

## Related Issues

- `docs/decisions.md` D-019 — the binding ADR for this project's choice (JSON-RPC for 6/21 submission)
- `docs/spec.md` §4 (Stack) — pins `@mysten/sui` to the 2026-05-08 release train
- `docs/open-questions.md` — track gRPC migration as a post-submission item
- Mysten release notes: https://github.com/MystenLabs/sui/releases — search for `2.16` and `SuiClient` for the official changelog entries
- `@mysten/sui` package on npm: https://www.npmjs.com/package/@mysten/sui — current README documents both clients
