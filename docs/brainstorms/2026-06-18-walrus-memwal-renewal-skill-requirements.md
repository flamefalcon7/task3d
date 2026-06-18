---
title: "Walrus + MemWal blob renewal skill (demo-readiness tool)"
type: feat
date: 2026-06-18
status: ready-for-planning
scope: standard
origin: live session 2026-06-18 (manual extend of 8 demo blobs + MemWal expiry discovery)
related: project memory `project_walrus_testnet_blob_expiry`; D-080 (MemWal); D-108 (53-epoch default)
---

# Walrus + MemWal Blob Renewal Skill

## Problem / Context

Walrus **testnet** blobs expire (1 epoch = 1 day; GC'd the moment `end_epoch` passes, no grace). Tusk3D's demo content and its MemWal memory pool both live on testnet blobs, so they silently rot — this session, 4 of 7 demo models were already 404/503 (including both encrypted models), one more was hours from death, and the MemWal `global` namespace had collapsed to a single surviving record.

Keeping the demo alive currently means doing by hand what this session did: query `ModelPublished` events, convert blob-id encodings, probe the aggregator per blob for 404/503, switch wallets, and `walrus extend` each surviving blob one at a time — every few days, indefinitely, through 7/20–21 demo day. That manual archaeology is error-prone and easy to forget until something is already dead. We want it automated into one zero-config command.

## Goal / Outcome

One skill that, in a single run, shows the live expiry health of **all** Tusk3D Walrus data (content blobs + MemWal memory blobs) mapped to human-readable model context, then renews everything salvageable to a target epoch after the user confirms. Success = the user can keep all demo-critical content and the MemWal memory pool alive through any target date with one command and one confirmation, and instantly see what's already dead and must be re-published.

## Users

Solo operator of the Tusk3D demo (the repo owner), running it ad-hoc in the days around 6/21 submission and 7/20–21 demo day. Drives the user's own Sui keystore + wallets. Not a multi-tenant or end-user tool.

## Requirements

### Core operations

- **R1 — List blobs with expiry + model context.** Enumerate Walrus blobs owned by the demo wallets (deployer, and creator when its key is imported). Each row presents: blob id, owning wallet, **liveness** (alive / edge / dead), **expiry epoch + days-left**, and the **cross-referenced Model3D** it backs (model id, name, encrypted?, creator). Renders a human-readable status table.
- **R2 — Renew (extend) salvageable blobs.** For blobs that are readable AND expiring, extend them toward the target epoch. Default target = **max** (`current_epoch + 53`). `--until <DATE>` renews anything expiring before that date instead (serves "renew if before that").
- **R3 — MemWal expiry + renewal.** Detect MemWal memory blobs (deployer-owned, small, SEAL-encrypted envelope) from the blob listing, read their expiry, and renew every one that is expiring — same target logic as R2.

### Behavior / guardrails

- **R4 — Aggregator-200 guard (non-negotiable).** Before extending any blob, probe the aggregator read path. On-chain `end_epoch ≥ current` does **not** mean readable — storage nodes drop slivers as expiry nears, so a blob can be on-chain-valid but already 404/503. **Only extend blobs the aggregator still serves (200).** Never spend WAL extending dead slivers.
- **R5 — Status + plan, then confirm.** Every run prints the status table + a proposed renewal plan (which blobs, to which epoch, estimated WAL cost per wallet) and signs only after explicit confirmation or `--yes`. Renewal is the only state-changing action; everything else is read-only.
- **R6 — Dead-blob → re-publish worklist.** For blobs already 404/503 (unrenewable), name the Model3D that references them and surface "model X (name, encrypted?) is DEAD — re-publish." The skill does not re-publish; it produces the worklist.
- **R7 — MemWal index-health report.** Report how many records each known namespace's `recall` actually surfaces (e.g. `global`), flagging a starved index. Renewing blobs does not refill a collapsed search index, so this distinguishes "blobs alive but search pool empty → re-index needed" from "all good."
- **R8 — Doc currency.** Ship with a bundled reference of verified Walrus + MemWal rules (epoch math, extend semantics, 53-cap, aggregator guard, SEAL-envelope detection, MemWal ownership model). Normal runs use it offline. Fetch live official docs only on anomaly (CLI flag/version drift, unexpected error, `walrus` "client outdated" warning, an unconfirmable rule), then adapt and rewrite the bundled reference. Also support manual `--refresh-docs`.

### Baked-in defaults (not optional, low carrying cost)

- **R9** — WAL + SUI balance preflight per signing wallet; warn before proposing a plan the wallet can't fund.
- **R10** — Auto-switch `sui` active-address per blob owner, and **restore the original active-address on exit, including on failure**.
- **R11** — Never write keys or seed phrases to disk; operate only via the existing keystore. Warn if a seed/secret appears in args.
- **R12** — `--json` machine-readable output; idempotent + safely re-runnable.

## Scope Boundaries

### In scope
R1–R12 above: list + cross-reference, renew content + MemWal blobs to a target with the aggregator guard, confirm-gated signing, dead-blob worklist, MemWal index-health, bundled-reference-with-anomaly-refresh, and the baked defaults.

### Deferred (skill reports; user acts)
- Auto re-publish of dead content — worklist only.
- Auto re-`remember` / re-index of a starved MemWal namespace — health report only.
- Mainnet support — testnet-only now; mainnet `walrus` context is a later add.
- Scheduled / cron auto-renewal — manual invocation only.

### Outside this tool's identity
- Not a general-purpose multi-project Walrus tool — **zero-config Tusk3D is the deliberate choice**.
- Not a content uploader / minter.

## Success Criteria

1. One no-arg run lists every demo + MemWal blob with correct liveness, days-left, and model mapping.
2. With confirmation, all readable+expiring blobs (content + MemWal) reach the target epoch in one run; dead blobs are never charged for.
3. The dead-blob worklist correctly names the Model3D(s) needing re-publish.
4. The MemWal index-health report correctly flags a starved namespace.
5. No key/seed is ever written to disk; active-address is always restored after the run.

## Dependencies / Assumptions

- **Walrus CLI** (verified 1.48.1) + **sui CLI**, with the testnet context configured (`~/.config/walrus`, `default_context: testnet`).
- **Verified Walrus facts (2026-06-18, epoch 432):** 1 epoch = 1 day; 53-epoch max-ahead cap; `walrus list-blobs` lists owned non-expired blobs (blob id, size, certified, deletable, end_epoch, **Sui object id**); `walrus extend --blob-obj-id <Sui object id> --epochs-extended <N>` signs as the object owner; `walrus blob-status --blob-id <id>` gives expiry; aggregator read paths `/v1/blobs/<id>` and `/v1/blobs/by-quilt-patch-id/<patchId>` (200 alive / 404 / 503 dead).
- **Blob-id encoding:** Blob objects store blob_id as a **u256 little-endian** → base64url (43 chars); `ModelPublished` events store `lineage_blob_id` as base64 (encrypted models = quilt-patch id with a suffix). Cross-reference + conversion is required for R1/R6.
- **Model mapping source:** `<model3d_package_id>::model3d::ModelPublished` events → `{creator, is_encrypted, lineage_blob_id, model_id, preview_blob_ids, policy}`. Package id in `contracts/networks/testnet.json`.
- **MemWal:** memories are deployer-owned ~557–630 B SEAL-encrypted blobs (verified by fetching a `recall` blob_id); `recall` returns `{blob_id, text, ...}`; SDK `@mysten-incubation/memwal@0.0.6`; `GLOBAL_NAMESPACE = 'global'`; config in `backend/.env` (`MEMWAL_ACCOUNT_ID` / `MEMWAL_DELEGATE_KEY` / `MEMWAL_SERVER_URL`); deployer-owned per D-080. **Assumption to verify in planning:** whether the SDK exposes a clean memory-enumeration call, or detection stays purely on the `list-blobs` heuristic (chosen primary method).
- **Aggregator constant:** `frontend/src/walrus/aggregator.ts` (`https://aggregator.walrus-testnet.walrus.space`, overridable via `VITE_WALRUS_AGGREGATOR` / the `cdn.tusk3d.store` worker) — reuse, don't hardcode a guess.
- **Demo wallets:** deployer `0x3116881c…` (always the active keystore address) + creator `0xc731848b…` (renewed only when its key is imported, via the separate-terminal import flow). Wallet **addresses** are already public (in committed `testnet.json`); the seed phrase is not, and must never enter the skill.

## Decisions Captured (this brainstorm)

- **D-a — Design center: Tusk3D zero-config.** Bakes in the two demo wallets, `backend/.env` MemWal keys, `testnet.json`, and the aggregator constant; no-arg run "just works." Rejected: general-purpose/portable and hybrid auto-detect (more surface, less value with the submission deadline near).
- **D-b — Renewal autonomy: status + plan, confirm to sign** (`--yes` to skip). Rejected: silent auto-renew (spends WAL unattended across two wallets) and report-only (doesn't fulfill "renew").
- **D-c — MemWal coverage: all on-chain memory blobs** via the `list-blobs` SEAL-envelope heuristic, shown before signing. Rejected: recall-only (misses orphaned-but-unexpired memory blobs); both-cross-referenced kept as a possible enrichment, not required.
- **D-d — Doc currency: bundled reference + auto-fetch on anomaly + manual `--refresh-docs`.** Rejected: manual-only (currency is on the user) and validate-every-run (slow, network-fragile right before demo).
- **D-e — Default renewal target: max** (`current_epoch + 53`); `--until <DATE>` overrides.
- **D-f — Creator-wallet renewal is conditional on its key being imported;** deployer is always active.
- **D-g — Skill home: personal `~/.claude/skills`** (recommended) — lives with the keystore it drives, avoids the accident vector of committing a secret to the public GitHub repo. Trivially reversible to repo `.claude/skills` if versioning/shareability is later preferred.

## Outstanding Questions

- **Skill name** (e.g. `walrus-renew`, `blob-keepalive`, `demo-keepalive`) — TBD at planning.
- **MemWal enumeration method** — confirm in planning whether `@mysten-incubation/memwal@0.0.6` exposes a memory-list/expiry call, or detection stays purely the `list-blobs` heuristic (R3 assumption).
- **SEAL-envelope detection precision** — how to reliably distinguish memory blobs from other small blobs (size threshold + envelope-byte signature?) without misclassifying; the skill must show its classification before signing (R5) as the safety net.
