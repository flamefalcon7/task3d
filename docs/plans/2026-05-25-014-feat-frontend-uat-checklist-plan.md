---
title: Browser-Driven UAT + Frontend Pre-Commit Checklist
type: feat
status: active
date: 2026-05-25
origin: docs/brainstorms/2026-05-25-frontend-uat-requirements.md
---

# Browser-Driven UAT + Frontend Pre-Commit Checklist

## Summary

Close the "Claude can't see the browser" gap that has produced ~15 user-discovered frontend bugs across plans 005–013. Install `agent-browser` so Claude can drive a real browser against the local Vite dev server, codify the bug-pattern lessons in `docs/ux/frontend-checklist.md` so they fail at pre-commit self-review, and edit `CLAUDE.md` to encode (a) the hard rule that frontend commits MUST be browser-verified before declaring done, (b) the wallet pause-and-resume protocol, and (c) `ce-julik-frontend-races-reviewer` as default in the review-pass roster. No `TestWalletAdapter` fixture, no Playwright, no CI integration in v1 — wallet popups remain a "Claude pauses, user clicks" handoff (see origin: `docs/brainstorms/2026-05-25-frontend-uat-requirements.md` §Scope Boundaries).

---

## Problem Frame

Every plan since plan-005 has produced bugs that unit tests didn't catch but the user found within 2-3 minutes of opening the browser. The bug class is stable — async state sync, loading affordance, real-data shape mismatches, source-of-truth drift, effect dep oversights — and every one is visible in the rendered DOM. The root cause is uniform: Claude has no way to verify "does this work when a person uses it?" — only "does this typecheck and pass mocked tests?"

This plan installs the cheapest available fix (`agent-browser` is already shipped by the compound-engineering plugin), codifies the lessons as a checklist, and edits `CLAUDE.md` so the workflow becomes the default rather than an opt-in. The expensive moves (`TestWalletAdapter` fixture for unattended automation, Playwright, CI smoke) are explicitly deferred — none of the historical bug class required them.

---

## Requirements Trace

Origin requirements mapped to implementation units (see origin: `docs/brainstorms/2026-05-25-frontend-uat-requirements.md`):

| Origin | Description | Unit |
|---|---|---|
| R1 | Install `agent-browser` via `/ce-setup` | U1 |
| R2 | CLAUDE.md hard rule — browser-verify before declaring done | U3 |
| R3 | Write `docs/ux/frontend-checklist.md` with 5 categories | U2 |
| R4 | Add `ce-julik-frontend-races-reviewer` to default review-pass | U3 |
| R5 | Wallet pause-and-resume protocol encoded in CLAUDE.md | U3 |
| R6 | Enforcement via Claude self-review (not lint/CI) | U2 + U3 |
| R7 | Full demo arc as verification surface | U3 (encoded as default heuristic) |
| AE1 | Copy edit → 30s browser-verify overhead | Validated by U4 |
| AE2 | `useSession` regression caught by browser-verify | Test scenario in U4 |
| AE3 | 5-reviewer parallel pattern includes julik | U3 |
| AE4 | `useRef + useEffect` cleanup-symmetric check fires | Test scenario in U2 |
| AE5 | Wallet-signed flow uses pause-and-resume | U3 |

---

## Scope Boundaries

### In scope (v1)
- `agent-browser` install via `/ce-setup` + first-time sanity check it drives Vite dev server
- `docs/ux/frontend-checklist.md` covering the 5 bug-pattern categories from origin §Key Decisions
- `CLAUDE.md` edits: Frontend Verification section (hard rule, wallet pause protocol, review-pass roster default)
- One real-world validation pass against the most recent unverified frontend surface (proof-of-concept, U4)

### Deferred to Follow-Up Work
- `TestWalletAdapter` fixture for `@mysten/dapp-kit` — build when unattended automation becomes the bottleneck (e.g., demo-day overnight regression sweep)
- Playwright smoke / CI integration
- Visual regression / screenshot diff
- Mobile viewport testing
- Static analysis to auto-detect "frontend-touching" commits — per-commit judgment for v1

### Outside this initiative's identity
- Babylon 3D canvas content correctness — the canvas is opaque to DOM-based tools; remains a solution-doc + manual-review surface
- Replacing the existing vitest suite — `agent-browser` complements unit tests, doesn't replace them

---

## Key Technical Decisions

### K-1: Checklist file uses YAML frontmatter (solution-doc shape, not flat markdown)

`docs/solutions/` already uses YAML frontmatter (`module`, `tags`, `problem_type`). The checklist is preventive rather than retrospective, but a `ce-learnings-researcher` agent already searches `docs/solutions/` by frontmatter — if the checklist lives alongside solutions with consistent shape, future research dispatches can surface it the same way.

Resolves origin OQ1.

### K-2: CLAUDE.md edits land in a new top-level section, not appended to Session Start Protocol

The Frontend Verification rule fires during work (after every frontend commit), not at session start. Folding it into Session Start Protocol would dilute that section's purpose. A new `## 🖥 Frontend Verification Protocol` section after the existing "End-of-Session Protocol" mirrors the doc's existing protocol-section convention.

Resolves origin OQ4.

### K-3: "Frontend-touching" is a per-commit judgment, not a file-path filter

CLAUDE.md text describes the heuristic in prose: "commits touching `frontend/src/**/*.tsx`, `frontend/src/**/*.ts` (excluding pure type/util/test), or `shared/src/types.ts` consumed by a component." Claude evaluates per-commit; trivial cases (pure styling, copy edit in a flow already verified this session) may skip. The default is to verify.

Resolves origin OQ2. A file-path filter is too brittle (a backend type change that breaks the frontend imports wouldn't trigger; a frontend-only color-token change would over-trigger).

### K-4: `agent-browser` is invoked via the `ce-test-browser` skill, not direct CLI from Bash

The compound-engineering plugin already wraps the CLI in a skill. Using the skill keeps the invocation pattern consistent with other ce-* tooling and gets future plugin updates for free.

Resolves origin OQ3.

### K-5: U-IDs map cleanly from origin R-IDs, not 1:1

R1 → U1, R3 → U2, R2+R4+R5 → U3 (they all live in `CLAUDE.md`), R6+R7 are encoded as text within U2/U3 rather than separate units. AE1-AE5 become test scenarios under the relevant unit.

Resolves origin OQ5.

---

## Output Structure

New files this plan creates:

```
docs/
├── ux/
│   └── frontend-checklist.md          # U2 — new
└── plans/
    └── 2026-05-25-014-feat-frontend-uat-checklist-plan.md   # this file
```

Edited files: `CLAUDE.md` (U3).

---

## Implementation Units

### U1. Install `agent-browser` + verify it drives Vite dev server

**Goal:** Get `agent-browser` installed via `/ce-setup` and confirm it can drive `pnpm dev` end-to-end against the project's Vite dev server. This is the v1 "does this tool actually work for us?" gate — every later unit assumes the install succeeded.

**Requirements:** R1 (install). Origin Dependency line: *"agent-browser can drive the local Vite dev server without certificate / proxy / WASM issues. Unverified assumption until installed."*

**Dependencies:** None.

**Files:**
- No code files modified. User runs `/ce-setup` interactively.

**Approach:**
1. User runs `/ce-setup` and selects `agent-browser` (or the relevant install option exposed by the compound-engineering plugin's setup skill).
2. Verify install: `command -v agent-browser` (or equivalent) returns a path.
3. Sanity check: start the Vite dev server (`pnpm --dir frontend dev`), open `agent-browser` at the dev server's URL (default `http://localhost:5173`), drive a single navigation against `/` (the brutalist landing page).
4. Confirm the page loads, the rendered DOM is readable, and `agent-browser` can return text content for assertions.
5. If it fails (certificate issues, WASM blocked, port conflict), capture the failure mode and either fix it now or escalate the dependency assumption upstream.

**Verification:**
- `agent-browser` is installed and reachable in the user's shell.
- A live drive against `/` returns the landing page's brand text (e.g., "MODEL3D" or similar token from the brutalist landing copy).
- No certificate / WASM / proxy errors on first invocation.

**Test scenarios:** *Test expectation: none — this is a tool install + smoke check, not a behavioral feature. The sanity drive in step 3 IS the verification.*

**Patterns to follow:** None — first install in this repo.

---

### U2. Write `docs/ux/frontend-checklist.md` with 5 bug-pattern categories

**Goal:** Codify the lessons from plans 005–013 into a checklist Claude consults at pre-commit self-review. Each category includes "when this applies", "what to check", and at least one observed-bug example (commit hash from origin §Key Decisions).

**Requirements:** R3 (write checklist), R6 (enforcement via self-review).

**Dependencies:** None (independent of U1; checklist is documentation that can land before the tool is installed).

**Files:**
- `docs/ux/frontend-checklist.md` — new file

**Approach:**

Use YAML frontmatter matching `docs/solutions/` shape (K-1):

```yaml
---
module: frontend
tags: [checklist, pre-commit, frontend-uat]
problem_type: prevention
---
```

Doc body structured as five level-2 sections, one per bug-pattern category from origin §Key Decisions. Each section follows the same shape:

```markdown
## N. <Category name>

**When this applies:** <one sentence — what kind of change triggers this check>

**What to check:**
- <specific verifiable question>
- <specific verifiable question>
- ...

**Observed-bug example:** <commit hash> — <one-line description>
```

The five categories (verbatim from origin §Key Decisions):

1. **Cross-component / cross-session state lifecycle**
   - Triggers: state sync gaps, stale localStorage, cleanup-only useEffect, cache key drift across republishes
   - Example: `69ef26a` (useSession not shared across components)
2. **Async UX feedback / loading affordance**
   - Triggers: > 1s user actions, post-tx UI auto-refresh, button disabled-while-pending
   - Example: `458037a` (no auto-refresh after list/buy)
3. **Real-data vs test fixture drift**
   - Triggers: extension/encoding/codec present in real data not in fixtures; SDK quirks at real RPC
   - Example: `a87f706` + `bb3555a` (GLB extension registration)
4. **Source-of-truth drift**
   - Triggers: same value pinned in 2+ places, package id stale in cache key, FE/BE constant divergence
   - Example: `e886dff` (env var vs TESTNET pin), `8706036` F1 (BE TRIPO_FEE_MIST default)
5. **Effect dependency completeness**
   - Triggers: missing dep produces stale-closure bug
   - Example: `8706036` F6 (`runBuildVariants` missing `base` in deps)

Verify each commit hash exists in `git log` before pasting — origin commit hashes are claims, not guarantees, especially across rebases.

Conclude the doc with a short "How to use" section that names the trigger: *Claude consults this checklist before declaring any frontend commit done, in conjunction with the `agent-browser` drive.*

**Verification:**
- `docs/ux/frontend-checklist.md` exists with frontmatter and 5 categories.
- Each category has a `When this applies` line, `What to check` bullets, and at least one observed-bug example with a real commit hash.
- AE4 acceptance example is testable: a future commit adding `useEffect` with `useRef` would land in category 1 ("cleanup symmetric") and trigger the check.

**Test scenarios:**
- Covers AE4. Doc inspection: the "useRef + useEffect" check appears under category 1 with explicit "setup AND cleanup symmetric" guidance.
- Doc inspection: each of the 5 commit-hash examples resolves via `git show <hash>` (sanity-check origin claims against actual history before pasting).
- *Test expectation for code: none — this unit produces a doc, not code.*

**Patterns to follow:** `docs/solutions/*/`. Use the same frontmatter shape and section structure (level-2 headings, prose + bullets).

---

### U3. Edit `CLAUDE.md` to add Frontend Verification Protocol section

**Goal:** Encode the hard rule (R2), wallet pause-and-resume protocol (R5), and `ce-julik-frontend-races-reviewer` as default review-pass member (R4) so future sessions don't need to re-derive any of these from chat history. The text fires whenever the session-start protocol reads `CLAUDE.md`.

**Requirements:** R2 (hard rule), R4 (julik default), R5 (wallet pause protocol), R6 (self-review enforcement), R7 (full demo arc scope).

**Dependencies:** U2 (the checklist must exist so CLAUDE.md can reference it without a broken link).

**Files:**
- `CLAUDE.md` — modify (add new top-level section)

**Approach:**

Add a new top-level section titled `## 🖥 Frontend Verification Protocol` positioned **after** the existing `## 🏁 End-of-Session Protocol` section and **before** `## 🗂 Project Structure` (K-2 placement).

Section contents (prose, mirroring CLAUDE.md's existing protocol-section voice):

1. **Hard rule (R2):** Any commit that changes user-visible frontend behavior MUST be `agent-browser`-driven before declaring done. State this in one assertive sentence, then the K-3 heuristic for what "frontend-touching" means.
2. **Workflow (R1+R7):** A 6-step loop mirroring origin F1 — finish the change, start `pnpm dev` if needed, open `agent-browser` at the relevant route, drive the changed surface, assert expected DOM state, pass → done + commit. The verification surface is the full demo arc (`/`, `/create`, `/launch`, `/market`, `/track`, `/model/:id`, `/collection/:id`), not L1-only.
3. **Checklist self-review (R3+R6):** Link to `docs/ux/frontend-checklist.md`. Claude runs through applicable categories before declaring done; items that don't apply are explicitly skipped (not silently ignored).
4. **Wallet pause-and-resume (R5):** When a wallet popup blocks (sign-in challenge, mint PTB, collection mint, kiosk purchase), Claude announces `"PAUSED — sign in the wallet, then say go"` and waits for the user signal. Same friction as today's manual testing; the wallet stays out of v1 fixture scope.
5. **Default review-pass roster (R4):** When dispatching a code-review pass on a frontend-touching plan, include `ce-julik-frontend-races-reviewer` alongside the existing 4-reviewer set (correctness, testing, api-contract, adversarial). State the file-path heuristic from K-3 so the trigger is unambiguous.
6. **Tool invocation (K-4):** `agent-browser` is invoked via the `ce-test-browser` skill, not directly from Bash.

Each subsection should be 2-4 lines max — `CLAUDE.md` is already at ~250 lines and this section adds the workflow without bloating the doc.

**Verification:**
- Re-reading `CLAUDE.md` from a fresh session in the next ce-work cycle: the Frontend Verification section is visible, the hard rule is unambiguous, and the wallet pause-and-resume protocol can be applied without referring back to this plan.
- `ce-julik-frontend-races-reviewer` appears in CLAUDE.md by name (so future review-pass dispatches don't have to remember it from chat).
- The link to `docs/ux/frontend-checklist.md` is live (file exists from U2).

**Test scenarios:**
- Covers AE3. CLAUDE.md grep for `ce-julik-frontend-races-reviewer` returns a hit in the new section.
- Covers AE5. CLAUDE.md contains the literal "PAUSED — sign" phrasing or equivalent pause-and-resume protocol text.
- Covers R7. CLAUDE.md names the full demo arc as the verification surface (route list visible).
- *Test expectation for code: none — this unit edits a single doc.*

**Patterns to follow:** Existing `## 📝 In-Session Protocol` and `## 🏁 End-of-Session Protocol` sections in `CLAUDE.md`. Same heading style, same emoji convention, same prose density.

---

### U4. Validate the workflow against one real frontend surface

**Goal:** Prove the v1 setup works end-to-end before declaring this plan done. Pick the most recently shipped unverified frontend surface (sign-in flow from commit `69ef26a` is the natural choice — it's the bug that motivated this plan, and AE2 explicitly cites it as the regression baseline). Drive `agent-browser` through it, run the checklist self-review, and confirm zero new bugs surface.

**Requirements:** Implicit — origin §Success Criteria first bullet *"no frontend commit ships without a Claude-driven browser verification step"*. This unit is the first such step, retroactively applied to the most-recently-landed surface.

**Dependencies:** U1, U2, U3.

**Files:**
- No code files modified (this is a verification pass, not a fix). If the validation surfaces a real bug, the fix goes in a separate commit, not this plan.

**Approach:**
1. With `agent-browser` installed (U1) and `pnpm --dir frontend dev` running, navigate to `/`.
2. Drive the sign-in flow: connect wallet (manual — user clicks), click Sign In, wait for "PAUSED" pause-and-resume signal, user signs, resume.
3. Assert the post-sign-in UI updates immediately without page refresh (the bug fixed by `69ef26a`'s broadcast pattern). This validates AE2.
4. Navigate to `/create`. Assert the metadata form is unlocked (gate logic depends on `useSession` correctly mirroring across components).
5. Run the U2 checklist against the recent frontend commits in this branch (the 9 unpushed commits visible from `git log` since the plan-013 baseline). For each, decide retroactively whether the change was "user-visible behavior" and whether the agent-browser drive would have surfaced anything new.
6. If everything passes: declare the workflow validated, commit this plan + checklist + CLAUDE.md edit + any plan tweaks.
7. If a real bug surfaces during validation: log it as a separate work item (don't conflate with this plan's deliverable).

**Verification:**
- Sign-in flow completes via the wallet pause-and-resume handoff with no surprises.
- Post-sign-in UI updates on the same tab without refresh (regression check on `69ef26a`'s fix).
- `/create` is reachable and the metadata form is unlocked.
- The U2 checklist run produces a report (verbal/chat is fine for v1 — no formal artifact required).

**Test scenarios:**
- Covers AE2. Manual e2e: sign-in → assert UI updates without refresh → navigate to /create → assert metadata form unlocked. If this fails, the `69ef26a` fix has regressed.
- Covers AE1 (size validation, not the bug regression): rough timing of the agent-browser overhead — confirm it's the "~30 seconds" claimed in origin AE1, not "5 minutes" (which would refute the cost model).
- *Test expectation for code: none — this is a real-world workflow drive, not code.*

**Patterns to follow:** None — first use of the new workflow.

---

## System-Wide Impact

| Surface | Impact |
|---|---|
| `CLAUDE.md` | Adds a new protocol section. Every future session reads it during the session-start protocol — directly shapes Claude's frontend workflow from then on |
| `docs/ux/frontend-checklist.md` | New file, referenced from CLAUDE.md. Future ce-learnings-researcher dispatches will surface it when relevant |
| Compound-engineering plugin install | One-time install of `agent-browser` via `/ce-setup` — affects local tool inventory only |
| Code review dispatches | `ce-julik-frontend-races-reviewer` becomes default for frontend-touching plans. Doesn't break existing review-pass invocations; expands the default roster |
| Hackathon timeline (28 days to submission) | This plan is < half a day of investment. Pays back as soon as one user-discovered frontend bug is prevented |

---

## Risks & Mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| `agent-browser` can't drive Vite dev server (cert, WASM, proxy issues) | Low — origin notes this as unverified | U1 sanity-checks this first. If it fails, escalate before investing in U2/U3 |
| Checklist drifts as new bug patterns emerge | Medium — patterns evolve as the codebase grows | Treat the checklist as living: add new categories as they're observed. Don't lock it down |
| Claude forgets to consult the checklist on a future commit | Medium — protocol discipline is the failure mode of every CLAUDE.md rule | The hard rule in U3 makes it a session-start protocol item, not an in-session reminder. If non-compliance becomes a pattern, surface it back into CLAUDE.md as a stricter rule |
| Wallet pause-and-resume slows down development meaningfully | Low — same friction as today's manual testing | If overhead becomes painful, that's the signal `TestWalletAdapter` should move out of "Deferred" |

---

## Deferred to Implementation

- Exact CLAUDE.md section wording — U3 has the structure; final phrasing is editorial.
- Whether the U2 checklist needs a sixth category for Babylon-canvas-only bugs — for v1 those are explicitly out-of-scope (origin §Scope Boundaries). If validation surfaces a canvas-specific bug pattern that's actually DOM-observable, expand then.
- The exact route list for the "full demo arc" in U3 step 2 — pull from the current router (`frontend/src/App.tsx`) at write-time rather than pasting a stale snapshot.

---

## Acceptance

Plan is done when:

1. `agent-browser` is installed and U1's sanity drive against `/` succeeds.
2. `docs/ux/frontend-checklist.md` exists, has frontmatter matching `docs/solutions/` shape, and covers the 5 categories with verified commit hashes.
3. `CLAUDE.md` has the new `## 🖥 Frontend Verification Protocol` section with R2 hard rule, R4 julik default, R5 wallet pause-and-resume, and a link to the checklist.
4. U4's real-world drive of the sign-in flow validates AE2 (no regression on `69ef26a`'s fix) and produces a workflow-validated thumbs-up.
5. Phase-progress doc is updated; plan can be committed.
