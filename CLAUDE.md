# Project: Tusk3D

A web3 service that lets users generate simple 3D models through constrained inputs, preview them, and publish as Sui-native content with **composable creator economy** — backed by Walrus decentralized storage and Sui Move.

Submission: **Sui Overflow 2026, Walrus track.** Submission deadline **2026-06-21**.

> **This file holds principles + protocol only.** Volatile facts are sourced elsewhere: stack/versions → `docs/spec.md` §4; architecture & data model → `docs/spec.md` §1.7 / §2.8; decisions → `docs/decisions.md`; current state → `docs/phase-progress.md`. Need a version, a struct field, or "is X shipped?" — read those, don't trust a copy pasted here.

---

## 🧭 Session Start Protocol (READ FIRST, EVERY SESSION)

Before doing anything else in a new session, follow this protocol in order:

1. Read `docs/phase-progress.md` — current phase, last completed work, immediate next step, days-to-submission counter
2. Read `docs/decisions.md` — full ADR log; respect all `Accepted` decisions, do not reopen unless user asks
3. Skim `docs/spec.md` — full project specification; refer back when implementing
4. Check `docs/open-questions.md` — unresolved questions

After reading, briefly summarize to the user: current phase + day X of 38, last completed work, next concrete step you intend to take, any blocker / open question. Then ask the user to confirm direction before proceeding.

---

## ⏰ Hackathon Reality Check

This is a **38-day Sui Overflow 2026 sprint**. User-stated preference: **finish early, leave time for pitch deck + demo video polish**.

### Milestones (Pacific Time, verbatim from handbook)

- **June 21** — Submission deadline (testnet OR mainnet deployment is sufficient at this stage)
- **July 8** — Shortlisted teams announcement
- **July 20–21** — Demo Day — **virtual live present-back**; shortlisted teams pitch + Q&A (NOT just submitting the 6/21 recording — separate work item)
- **August 27** — Winners announcement; mainnet-deployed by this date = **100% prize upfront**, else 50% on announcement + 50% on mainnet deploy

### Decision discipline

| Change type | What to do |
|---|---|
| Bug fixes, copy edits, dependency bumps, anything reversible in 30 min | Skip ADR + plan-mode, just commit |
| Routine choice already covered in `docs/spec.md` | Light ADR (one-liner) referencing spec section |
| New dependency, public contract change (Move struct / API surface), new pattern | Full ADR + plan-mode |
| Anything you'd struggle to reconstruct 3 days later | Always capture |

**Submission deadline > docs perfection.** Phase 5 has dedicated time for documentation cleanup. Don't gold-plate during build phases.

---

## 🧭 Source of Truth Hierarchy

When sources conflict, prefer (more authoritative first):

1. **Live primary sources**: npm registry, GitHub releases, official Sui / Walrus / Mysten docs
2. **Sui Overflow 2026 handbook**: https://mystenlabs.notion.site/overflow-2026-handbook
3. **`docs/spec.md`** — project-specific synthesis
4. **`docs/decisions.md`** — explicit project decisions (ADR log)
5. **LLM training data** — lowest priority; always verify before acting

If primary sources contradict `docs/spec.md`, update `docs/spec.md` AND add an ADR capturing the correction.

---

## 📝 In-Session Protocol

### Decision Capture (ADR)

Before implementing any non-obvious architecture, tech, or design choice: (1) pause, (2) append a new ADR to `docs/decisions.md` using the template at the bottom of this file, (3) confirm the decision text with the user, (4) then implement.

**Triggers**: picking one library/tool/service over another; choosing an architectural pattern; defining a data model or contract interface; setting a constraint ("MVP only supports X"); resolving a tradeoff; reversing a previous decision.

**Skip capture for**: routine implementation (naming, file layout), trivial syntax, anything already covered in `docs/spec.md`.

### Open Questions

If you hit a question that needs user input but isn't blocking now, append it to `docs/open-questions.md`. Don't drop it into chat and forget.

### Completing a meaningful unit of work

After finishing any meaningful unit (a feature, a phase, a bug fix that took > 15 min): update `docs/phase-progress.md`, then suggest a commit if changes are unstaged.

---

## 🏁 End-of-Session Protocol

Before session ends (or before context approaches 60% utilization), update `docs/phase-progress.md` with a new `## Last Updated: <YYYY-MM-DD HH:MM>` block containing: **Hackathon Tracker** (days to 6/21, 7/20–21, 8/27), **Current Phase** (from spec.md §6), **Completed This Session**, **In Progress** (with file paths), **Next Concrete Step** (single specific action), **Blockers / Open Questions** (link open-questions.md), **Notes for Next Session** (anything subtle that would be lost otherwise).

**Do this without being asked.** If the user signals end of session ("stop", "done for today", "save and exit"), do it immediately. If context approaches 60% mid-session, proactively suggest updating phase-progress.md first.

---

## 🖥 Frontend Verification Protocol

Any commit that changes user-visible frontend behavior MUST be browser-verified before declaring done. "Frontend-touching" = modifying `frontend/src/**/*.tsx`, `frontend/src/**/*.ts` (excluding pure type/util/test files), or `shared/src/types.ts` consumed by a component. Per-commit judgement; trivial commits in an already-verified flow can skip — but the default is to verify.

### Verification loop

1. Ensure `pnpm --dir frontend dev` is running.
2. Invoke `agent-browser` via the `ce-test-browser` skill at the relevant route.
3. Drive the changed surface (click, fill, navigate).
4. If a wallet popup blocks: announce `"PAUSED — sign in the wallet, then say go"` and wait.
5. Assert expected DOM state (testids, text, conditional renders).
6. Pass → declare done + commit. Fail → diagnose, fix, repeat from step 3.

The verification surface is the **full demo arc** — `/`, `/create`, `/launch`, `/market`, `/track`, `/model/:id`, `/collection/:id` — not L1 only. Before declaring done, walk the relevant `docs/ux/frontend-checklist.md` items; skip non-applicable ones explicitly, not silently.

### Wallet pause-and-resume — and where it doesn't apply

`agent-browser` runs an isolated Chromium **without** the user's Sui wallet extension, so wallet-gated flows can't be driven end-to-end. Validation splits: **pre-wallet** — agent-browser drives up to and including the "Connect Wallet" / "Sign In" button (assert visible, enabled, clickable); **post-wallet** — the user runs the signed step in their own Chrome (Slush installed) and reports back, Claude asserts against the reported state. The `"PAUSED — <X>, then say go"` handoff applies only to **non-wallet** pauses (file picker, OAuth tab) where the user can actually click in agent-browser's window. End-to-end wallet automation is deferred to a `TestWalletAdapter` fixture (see `docs/brainstorms/2026-05-25-frontend-uat-requirements.md`).

### Default review-pass roster (frontend-touching plans)

When dispatching a code-review pass on a frontend-touching plan, include `ce-julik-frontend-races-reviewer` alongside the default roster (`ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`). The 5-reviewer parallel pattern is the default for any frontend-touching plan.

---

## 🗂 Project Structure

```
backend/    # TS Node + Hono — Tripo dispatch, Sui/Walrus read path, AI seam (D-012)
frontend/   # React + Vite + Babylon (imperative)
shared/     # types shared by browser + backend
contracts/  # Sui Move package model3d::model3d
cdn-worker/ # Cloudflare Worker for the Walrus read-path CDN (D-073)
samples/    # Sample game scene
pitch/      # Pitch deck, demo video script, screenshots
docs/       # spec.md, decisions.md, phase-progress.md, open-questions.md,
            # plans/, solutions/ (past fixes w/ YAML frontmatter), brainstorms/, audits/
```

---

## 🛠 Stack & Architecture (pointers — do not duplicate detail here)

**Versions / deps live in `docs/spec.md` §4** (pin all `@mysten/*` to the **2026-05-08 release train**) and in `docs/decisions.md`. Stable invariants worth stating as principle:

- **Frontend 3D**: `@babylonjs/core` imperative — **NOT `react-babylonjs`** (D-007).
- **Sui client**: `@mysten/sui/grpc` `SuiGrpcClient` (JSON-RPC client deprecated July 2026).
- **Contract**: Move 2024 edition (`module foo::bar;`).
- **Network**: **testnet for 6/21 submission, mainnet by 8/27** for 100% prize (D-009).
- The product has an **AI / memory seam** (Gemini at the prompt-authoring layer, MemWal memory, Seal content protection) — these are **shipped, not optional**; for what's in/out and at which seam, read spec.md + decisions.md, never assume from memory.

**Architecture — Composable Creator Economy, L1 content → L2 collection** (full detail in `docs/spec.md` §1.7 / §2.8; D-029, D-078): **L1 `Model3D` + `AccessEntitlement`** — one creator publishes base content to Walrus with `LicenseTerms` (policy + access_fee + derivative_mint_fee); N buyers pay the **access_fee once** for a permanent **soulbound `AccessEntitlement`** (consumer view + precondition to forking, gates Seal decryption; NOT a separate tier — the old "L3 Access" framing is retired). **L2 `NftCollection` + `NftToken`** — a forker holding the entitlement pays the per-launch **derive_fee**, holds a soulbound `NftCollectionCreatorCap`, mints tradeable `NftToken`s. 1-layer max; `base_royalty_bps` ≤ 30%.

**Hard constraints (principle-level guardrails):**
- Content sources: Tripo prompt-mode (SUI-fee-gated) + user GLB upload (validated for format + size). GLB only for v1 (no FBX/USDZ).
- Low poly, manifold, rigid-body friendly (best-effort for uploaded GLBs).
- Login required before mint (preview can be open).
- **1-layer derivation only** (D-002); royalty hard-capped at **30%** (D-004).

---

## 📐 Workflow Rules

### Planning before coding
- For work touching > 2 files or introducing new patterns: plan-mode first, confirm with user before implementing. Save approved substantial plans into `docs/plans/<feature-name>.md`.

### Testing
- Move unit tests for all contract entry functions (see `docs/spec.md` §2.8 scaffold); integration tests for backend API endpoints.
- E2E test on testnet before merging Walrus integration; sample game scene smoke test before Phase 5 submission.

### Code style & commits
- TypeScript: strict mode, no `any` without justification. Move: Sui Move 2024 conventions.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`); reference decision ID when relevant (`feat(contract): add Derivative struct (D-002)`). Don't auto-commit; suggest, let the user review.

### Don't
- Don't reopen `Accepted` decisions in `docs/decisions.md` unless the user explicitly asks.
- Don't make architectural changes without an ADR first.
- Don't skip the end-of-session update — it's the entire point of this protocol.
- Don't fabricate file paths, library APIs, or context to satisfy protocol — verify with `view` / web search, and if uncertain, STOP and ask the user.
- **Don't overwrite, truncate, or regenerate `.env*` files** (`backend/.env`, `frontend/.env.local`, any `.env*`). They hold gitignored secrets git can't restore. Append-only (`>> .env`) and tell the user; if one looks empty/wrong, STOP and report. See "Secrets & `.env` files" below.

### Secrets & `.env` files (never clobber)

`.env*` files hold **gitignored secrets git cannot restore** — a wipe is permanent **and silent** (fail-soft features keep "working", so loss goes unnoticed for days; this bit us once when a session clobbered `backend/.env` and lost the `MEMWAL_*` keys).

- **Never** overwrite, truncate, `cp .env.example .env` over, or "regenerate" an existing env file. Add keys by **appending** (`>> .env`) only, and say what you added.
- If an env file looks empty, short, or is missing expected keys, **STOP and report** — do not self-heal by regenerating it.
- Keep **non-secret** config (account ids, URLs, endpoints) in `.env.example` as commented templates, so recovery needs only the secret.
- The backend warns loudly at startup when MemWal is unconfigured (`backend/src/server.ts`) — don't ignore that banner.

**MemWal recovery** (if `backend/.env` loses `MEMWAL_*`): the delegate key regenerates against the **existing** account (owner = deployer `VITE_TEST_WALLET_KEY`; `accountId` in `docs/decisions.md` D-080):

```
OWNER_KEY="$(grep '^VITE_TEST_WALLET_KEY=' frontend/.env.local | cut -d= -f2-)" \
ACCOUNT_ID=<D-080 accountId> pnpm --dir backend exec tsx scripts/memwal-spike.ts
```

Then append the written `MEMWAL_ACCOUNT_ID` / `MEMWAL_DELEGATE_KEY` (+ `MEMWAL_SERVER_URL=https://relayer.dev.memwal.ai`) into `backend/.env`, delete the temp `backend/.env.memwal-delegate`, and restart the backend.

---

## 🔄 Decision Reversal Protocol

When superseding a prior decision: (1) create new `D-XXX` with status `Supersedes D-YYY`; (2) update `D-YYY` status to `Superseded by D-XXX`; (3) if the old decision is reflected in `docs/spec.md`, update spec.md too; (4) note all three changes in the commit message.

---

## 🚨 If Something Feels Off

If at session start the docs look stale or inconsistent (e.g. phase-progress.md says "Phase 3" but the codebase looks like Phase 5): **don't silently proceed.** Report the inconsistency, then ask whether to (a) re-sync docs to match codebase reality, or (b) treat docs as truth and revert/skip code. Wait for user direction. This protects against context drift between sessions.

---

## 📋 ADR Template (for `docs/decisions.md` entries)

Lightweight — only fill what's relevant; a 5-line entry is fine for trivial choices. Number sequentially from D-001; **never reuse numbers.** (For the canonical shape, copy the most recent entry in `docs/decisions.md`.)

```markdown
## D-XXX: <Short title>
**Status**: Accepted | Proposed | Superseded by D-YYY | Deprecated
**Date**: YYYY-MM-DD · **Phase**: <phase from spec.md §6>

### Context — <what problem / forces?>
### Decision — <the choice, as a complete sentence>
### Rationale — <why; bullets OK>
### Alternatives Considered — <Alt A — rejected because …>
### Consequences — ✅ <positive> · ⚠️ <tradeoff> · 🔮 <future implication>
### Related — spec.md §<link> · Related decisions: D-YYY
```
