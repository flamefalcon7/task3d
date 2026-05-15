# Project: 3D Model Generation Service

A web3 service that lets users generate simple 3D models through constrained inputs, preview them, and publish as Sui-native content with **composable creator economy** — backed by Walrus decentralized storage and Sui Move.

Submission: **Sui Overflow 2026, Walrus track.** Submission deadline **2026-06-21**.

---

## 🧭 Session Start Protocol (READ FIRST, EVERY SESSION)

Before doing anything else in a new session, follow this protocol in order:

1. Read `docs/phase-progress.md` — current phase, last completed work, immediate next step, days-to-submission counter
2. Read `docs/decisions.md` — full ADR log; respect all `Accepted` decisions, do not reopen unless user asks
3. Skim `docs/spec.md` — full project specification; refer back when implementing
4. Check `docs/open-questions.md` — unresolved questions

After reading, briefly summarize to the user:
- Current phase + day X of 38
- Last completed work
- Next concrete step you intend to take
- Any blocker / open question

Then ask the user to confirm direction before proceeding.

---

## ⏰ Hackathon Reality Check

This is a **38-day Sui Overflow 2026 sprint**. User-stated preference: **finish early, leave time for pitch deck + demo video polish**. Use these heuristics to balance protocol discipline with shipping speed:

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
3. **`docs/spec.md`** — project-specific synthesis (last verified 2026-05-14)
4. **`docs/decisions.md`** — explicit project decisions (ADR log)
5. **LLM training data** — lowest priority; always verify before acting

If primary sources contradict `docs/spec.md`, update `docs/spec.md` AND add an ADR capturing the correction.

---

## 📝 In-Session Protocol

### Decision Capture (ADR)

Before implementing any non-obvious architecture, tech, or design choice:

1. Pause implementation
2. Append a new ADR entry to `docs/decisions.md` using the template at the bottom of this file
3. Confirm the decision text with the user
4. Then implement

**Triggers for decision capture**:
- Picking one library/tool/service over another
- Choosing an architectural pattern
- Defining a data model or contract interface
- Setting a constraint (e.g. "MVP only supports X")
- Resolving a tradeoff between competing goals
- Reversing a previous decision

**Skip capture for**:
- Routine implementation (naming, file layout)
- Trivial syntax choices
- Anything already covered in `docs/spec.md`

### Open Questions

If you encounter a question that needs user input but isn't blocking right now, append it to `docs/open-questions.md`. Don't drop it into chat and forget.

### Completing a meaningful unit of work

After finishing any meaningful unit (a feature, a phase, a bug fix that took > 15 min):

1. Update `docs/phase-progress.md`
2. Suggest a commit if changes are unstaged

---

## 🏁 End-of-Session Protocol

Before session ends (or before context approaches 60% utilization), update `docs/phase-progress.md`. Template:

```markdown
## Last Updated: <YYYY-MM-DD HH:MM>

### Hackathon Tracker
- Days to submission (6/21): <X of 38>
- Days to demo day (7/20–21): <Y of 67>
- Days to winners (8/27): <Z of 105>

### Current Phase
<Phase number and name from spec.md §6>

### Completed This Session
- <bullet list of things finished>

### In Progress
- <what's started but not done, with file paths>

### Next Concrete Step
<single specific action the next session should take>

### Blockers / Open Questions
- <link to docs/open-questions.md entries if any>

### Notes for Next Session
<anything subtle that would be lost otherwise — e.g. "tried X, didn't work because Y, try Z next">
```

**Do this without being asked.** If user signals end of session ("stop", "done for today", "save and exit"), do this immediately.

If context utilization approaches 60% mid-session, proactively suggest: "Let me update phase-progress.md before we continue, so we don't lose context if I get compacted."

---

## 🗂 Project Structure

```
project-root/
├── CLAUDE.md                   # This file (session protocol)
├── README.md                   # Public-facing; submission artifact (install, run, demo, license)
├── docs/
│   ├── spec.md                 # Full project specification (the working source)
│   ├── decisions.md            # ADR log
│   ├── phase-progress.md       # Current progress / next step (updated every session)
│   ├── open-questions.md       # Unresolved questions
│   ├── plans/                  # plan-mode outputs for substantial features
│   └── solutions/              # documented solutions to past problems (bugs, patterns, decisions), organized by category with YAML frontmatter (module, tags, problem_type) — relevant when implementing or debugging in documented areas
├── backend/                    # TS Node + Hono (procedural generators + LLM router, D-012)
├── frontend/                   # React + Vite + Babylon (imperative)
├── shared/                     # types shared by browser + backend (Generator, GenerateParams, LineageRecord)
├── contracts/                  # Sui Move package model3d::model3d
├── samples/                    # Sample game scene (Phase 3 deliverable)
└── pitch/                      # Pitch deck, demo video script, screenshots (Phase 3+)
```

Implementation directories (`backend/`, `frontend/`, etc.) will be created in Phase 1.

---

## 🛠 Stack at a Glance

(Authoritative versions and gotchas in `docs/spec.md` §4. Pin all `@mysten/*` to **2026-05-08 release train**.)

- **Backend** (D-012): Node 22 LTS (or Bun 1.2.x) + Hono + `@gltf-transform/core` + `@anthropic-ai/sdk` + `@mysten/sui` + `zod`
- **Frontend**: React + Vite + TypeScript, `@babylonjs/core` (imperative — **NOT `react-babylonjs`**, drop per D-007)
- **Wallet / Auth**: `@mysten/dapp-kit` + `@mysten/enoki` (zkLogin) + `@mysten/slush-wallet`
- **Storage**: `@mysten/walrus` + `@mysten/walrus-wasm`, **upload relay required for browser**
- **Sui client**: `@mysten/sui/grpc` `SuiGrpcClient` (JSON-RPC client deprecated July 2026)
- **Contract**: Sui Move package `model3d::model3d` (Move 2024 edition, `edition = "2024.beta"`)
- **Network**: **Testnet for 6/21 submission; mainnet by 8/27** for 100% prize (per D-009)
- **Optional v1.1**: `@mysten/seal` (Walrus encryption), Sui Kiosk (TransferPolicy royalty), forensic watermark

---

## 🎯 Core Architecture

**Three-tier Composable Creator Economy** (see `docs/spec.md` §1.7, §2.8):

```
L1  Model3D       — Creator publishes base content to Walrus, sets LicenseTerms
                    policy: restricted / allow_list / permissionless
L2  Derivative    — Other creators fork base into series (1-layer max),
                    base_royalty_bps snapshot at mint, ≤ 30% cap
L3  Access        — Soulbound receipt of paid access (`key` only, no `store`)
                    Used in seal_approve to gate Seal-encrypted content
```

**Not** an NFT collection. `Model3D` is content — one creator publishes, N buyers pay access. `Access` is a soulbound receipt. `Derivative` is composable IP.

---

## 🎯 Core Constraints

- Input restricted to predefined shape categories (no free-form NL)
- Procedural generation in Go (zero per-call AI API cost)
- Low poly, manifold mesh, rigid-body friendly
- Preview < 2s end-to-end
- Login required before mint (preview can be open)
- **1-layer derivation only** (D-002); royalty hard-capped at 30% (D-004)
- **GLB only for v1** (no FBX/USDZ per D-006)

---

## 📐 Workflow Rules

### Planning before coding

- For work touching > 2 files or introducing new patterns: plan-mode first
- Confirm plan with user before implementation
- Save approved plans into `docs/plans/<feature-name>.md` if substantial

### Testing

- Move unit tests for all contract entry functions (see `docs/spec.md` §2.8 Move scaffold)
- Integration tests for backend API endpoints
- E2E test on testnet before merging Walrus integration
- Sample game scene smoke test before Phase 5 submission

### Code style

- Go: standard `gofmt`, idiomatic error handling, no panics in handlers
- TypeScript: strict mode, no `any` without justification
- Move: follow Sui Move 2024 conventions (`module foo::bar;` syntax)

### Commits

- Conventional: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- Reference decision ID when relevant: `feat(contract): add Derivative struct (D-002)`
- Don't auto-commit; suggest, let user review

### Don't

- Don't reopen `Accepted` decisions in `docs/decisions.md` unless user explicitly asks
- Don't make architectural changes without ADR first
- Don't skip end-of-session update — it's the entire point of this protocol
- Don't fabricate file paths or library APIs — verify with `view` or web search
- Don't fabricate context to satisfy protocol — if uncertain, STOP and ask user

---

## 🔄 Decision Reversal Protocol

When superseding a prior decision:

1. Create new D-XXX with status `Supersedes D-YYY`
2. Update D-YYY status to `Superseded by D-XXX`
3. If the old decision is reflected in `docs/spec.md`, update spec.md too
4. Note all three changes in the commit message

---

## 🚨 If Something Feels Off

If at session start the docs look stale or inconsistent (e.g. phase-progress.md says "Phase 3" but the codebase looks like Phase 5):

1. **Don't silently proceed**
2. Report the inconsistency to the user
3. Ask whether to:
   - Re-sync docs to match codebase reality, OR
   - Treat docs as truth and revert/skip code
4. Wait for user direction

This protects against context drift between sessions.

---

## 📋 ADR Template (for `docs/decisions.md` entries)

Lightweight variant for small decisions — only fill what's relevant; 5-line entry is fine for trivial choices:

```markdown
## D-XXX: <Short title>

**Status**: Accepted | Proposed | Superseded by D-YYY | Deprecated
**Date**: YYYY-MM-DD
**Phase**: <phase from spec.md §6>

### Context
<What problem / forces?>

### Decision
<The choice, stated as a complete sentence.>

### Rationale
<Why this choice? Bullets OK.>

### Alternatives Considered
- **Alt A**: <description> — rejected because <reason>

### Consequences
- ✅ <positive>
- ⚠️ <tradeoff>
- 🔮 <future implication>

### Related
- spec.md section: <link>
- Related decisions: D-YYY
```

Number decisions sequentially starting D-001. **Never reuse numbers.**
