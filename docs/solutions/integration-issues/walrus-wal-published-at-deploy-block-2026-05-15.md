---
title: Sui CLI rejects model3d publish — Walrus + WAL deps have no `published-at`
date: 2026-05-15
category: integration-issues
module: model3d-contract
problem_type: integration_issue
component: tooling
symptoms:
  - "`sui client publish` aborts with `unpublished dependencies: WAL, Walrus` even though the addresses are known and pinned in Move.toml"
  - "`sui move build` succeeds with the same Move.toml — only `publish` rejects"
  - "All testnet integration tests blocked: no `MODEL3D_PACKAGE_ID` to write into frontend `.env`"
root_cause: config_error
resolution_type: documentation_update
severity: critical
tags:
  - sui-move
  - walrus
  - move-toml
  - deploy
  - testnet
  - dependencies
related_components:
  - contracts
---

# Sui CLI rejects model3d publish — Walrus + WAL deps have no `published-at`

## Problem

`sui client publish` for the model3d Move package refuses to deploy because its Walrus + WAL dependencies declare their own `walrus = "0x0"` / `wal = "0x0"` addresses in the upstream Move.toml files. Sui CLI 1.72.1 interprets `0x0` as "unpublished" regardless of what the consumer package supplies via `override-addresses`. The CLI exposes no flag, registry entry, or config knob to assert "these deps are already on-chain at these addresses" — so the consumer cannot unblock publish without modifying the upstream Move.toml files. Build passes (the Move source can reach the symbols), but publish refuses.

This blocks every Phase 2 unit that needs a deployed `MODEL3D_PACKAGE_ID` — frontend PTB integration smoke (U7), Browse marketplace e2e (U8), buyer-flow e2e (U9). The block was discovered 2026-05-14 and parked while Phase 2 code work continued (U4..U10 do not require deploy).

## Symptoms

- `sui client publish --gas-budget 500000000 .` → `Error: unpublished dependencies: WAL, Walrus`
- Same `Move.toml` builds fine: `sui move build` reports `BUILDING model3d` then `success` (the symbols resolve via `override-addresses`)
- `sui move build --print-bytecode-deps` shows the bytecode references `walrus::blob::Blob` etc., but the build does not validate that those addresses are "on-chain published" — that check happens only in `publish`
- The error names both addresses (`WAL, Walrus`) even though `wal` is pulled in transitively by Walrus (no explicit `WAL = { ... }` dep in our Move.toml)

## What Didn't Work

- **Declaring WAL as an explicit `[dependencies]` entry alongside Walrus**: produces `Address 'wal' defined more than once` — Walrus's own Move.toml already declares `wal`, and listing it again at the consumer level conflicts. The fix below (let Walrus pull WAL transitively, set both overrides on the Walrus dep) bypasses this but doesn't unblock publish.
- **Setting `override-addresses` inline on the Walrus git dep**: makes `sui move build` succeed (the symbol resolution sees the right addresses), but `sui client publish` still reads each transitive dep's own Move.toml first and sees `0x0` there. `override-addresses` operates on the consumer's address namespace, not the upstream packages' `[package] published-at` field.
- **Setting `[addresses]` at the consumer level** (e.g., `walrus = "0xd847..."`): also satisfies build but ignored by publish — same reason. The publish check walks each transitive dep, reads *its* `[package] published-at`, and rejects when it's missing or `0x0`.
- **Trying the MVR alias path** `@walrus/core` (planned in D-008 / OQ-005): not available on Sui Move Registry in CLI 1.72.1 for the Walrus testnet release. Would have been the clean answer if it had landed.

## Solution

**Not yet resolved.** This doc captures the diagnosis so the focused session can pick a resolution path without re-discovering it.

Three viable resolution paths, ranked by maintenance burden (lowest first):

### Path A — wait for / re-check MVR alias support

If `@walrus/core` works on a newer Sui CLI, the consumer Move.toml shrinks back to:

```toml
[dependencies]
Walrus = { mvr = "@walrus/core", override = true }
```

with no addresses, no git refs, no overrides. Mysten owns the published-at metadata in MVR. Check the Sui CLI changelog and MVR registry for any release after 1.72.1 that handles this. If it works, this is the long-term answer.

### Path B — fork Walrus, add `published-at` to the fork's Move.toml

```bash
# 1. Fork MystenLabs/walrus on GitHub, branch from testnet
# 2. In contracts/walrus/Move.toml, add to [package]:
#      published-at = "0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66"
# 3. In contracts/wal/Move.toml (Walrus's transitive dep), add:
#      published-at = "0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a"
# 4. Commit, push fork branch
```

Then update model3d's Move.toml:

```toml
Walrus = { git = "https://github.com/<our-fork>/walrus.git", subdir = "contracts/walrus", rev = "testnet-with-pubat", override = true }
```

Clean from the deploy perspective — `sui client publish` reads each transitive Move.toml and sees real `published-at` values. Cost: maintain the fork as Mysten updates testnet. For hackathon scope (6/21 submission), one-time fork is acceptable.

### Path C — local clone + local path deps

```bash
git clone -b testnet https://github.com/MystenLabs/walrus.git ../walrus-vendor
# Edit ../walrus-vendor/contracts/walrus/Move.toml — add published-at
# Edit ../walrus-vendor/contracts/wal/Move.toml — add published-at
```

```toml
Walrus = { local = "../walrus-vendor/contracts/walrus", override = true }
```

Works for build + publish, but the local path leaks into `Move.lock` (non-portable — breaks CI, other teammates' checkouts). Not recommended unless time-pressured and a single operator is doing all deploys.

### Confirmed testnet addresses (verified 2026-05-14)

```
Walrus testnet pkg: 0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66
WAL    testnet pkg: 0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a
```

Confirmed by querying `sui client object <walrus-system-object-id>` and a WAL coin's `objectType` field. Walrus may upgrade these on future testnet drops — re-verify before the next deploy attempt.

## Why This Works (will, once chosen)

Sui CLI's `publish` does a transitive validation: for every dep, it reads `[package] published-at` from that dep's own Move.toml. If absent, it treats the dep as "unpublished" and aborts. The consumer-side `override-addresses` and `[addresses]` blocks operate on **symbol resolution** during build (mapping the named address `walrus` to a concrete hex address inside the bytecode), not on **publication status**. There is no consumer-side mechanism in 1.72.1 to declare "I assert this dep is on-chain at X" — the assertion must live in the dep's own Move.toml.

Paths B and C work by adding the `published-at` line directly to the dep's Move.toml (in a fork or local clone). Path A works by routing the dep through MVR, where Mysten supplies the published-at metadata server-side.

## Prevention

1. **When adopting a new Sui Move dep on testnet, before committing to the dep, check that its Move.toml declares `[package] published-at`.** If it doesn't, plan for fork/vendor friction before integration day. Most Mysten testnet packages omit this — mainnet ones include it.

2. **Treat `sui move build` success as necessary-but-not-sufficient** for deploy readiness. Add a `sui client publish --dry-run` smoke step into the deploy checklist (when Sui CLI supports it; check `sui client publish --help` for `--dry-run` in current version).

3. **Document the upstream-package-version assumption** for time-frozen deps. The testnet packages may upgrade and break the override-addresses pins. A pre-deploy verification step:
   ```bash
   # Confirm the pinned testnet addresses still resolve
   sui client object 0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66 \
     | jq -r '.objectId, .type'
   ```

4. **For the model3d project specifically**: track the resolution path in `docs/decisions.md` as a D-XXX ADR when the focused session picks one. Add a `published-at` line to `contracts/model3d/Move.toml` once `model3d` is first deployed, so future Move packages that depend on model3d don't hit this same wall.

5. **Re-check Sui CLI release notes quarterly** for new flags or MVR features that could collapse the workaround. Once available, this whole doc may become a historical curiosity — fold it into a single-line note then.

## Related Issues

- `docs/decisions.md` D-008 (`@walrus/core` MVR alias plan) — original intent that hit the registry-not-ready wall
- `docs/open-questions.md` OQ-005 (MVR availability) — still open pending Path A re-check
- `contracts/model3d/README.md` — points back here for the deploy walkthrough
- `contracts/model3d/Move.toml` lines 7-35 — the documentation embedded in the package itself
- Sui issue tracker: https://github.com/MystenLabs/sui/issues — search for `unpublished dependencies` for upstream fix candidates
- Walrus repo: https://github.com/MystenLabs/walrus — track whether Mysten adds `published-at` to its testnet Move.tomls
