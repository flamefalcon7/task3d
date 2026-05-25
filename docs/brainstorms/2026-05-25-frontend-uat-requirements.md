---
date: 2026-05-25
topic: frontend-uat
---

# Browser-Driven UAT + Frontend Pre-Commit Checklist

## Summary

Close the "Claude can't see the browser" gap that has produced ~15 user-discovered frontend bugs across plans 005–013. Install `agent-browser` and require Claude to drive the changed UI surface before declaring any frontend commit done. Codify the bug-pattern lessons in `docs/ux/frontend-checklist.md` so they fail review-time, not browser-time. Add `ce-julik-frontend-races-reviewer` to the default review-pass roster for frontend-touching plans. No wallet fixture in v1 — wallet popups remain a "Claude pauses, user clicks" handoff. No Playwright, no CI integration; manual local runs only.

---

## Problem Frame

Every plan since plan-005 has produced bugs that unit tests didn't catch but the user found within 2-3 minutes of opening the browser. The pattern is stable across categories — async state sync, loading affordance, real-data shape mismatches, source-of-truth drift, effect dep oversights — and every one is visible in the rendered DOM, often before a single transaction needs to be signed.

The root cause is uniform: Claude has no way to verify "does this work when a person uses it?" — only "does this typecheck and pass mocked tests?" Today's workflow papers over that with manual user-reported regressions, which adds a multi-minute round-trip per bug and delays demo polish.

This brainstorm targets the smallest-form fix: give Claude a way to **drive the dev server interactively** during a session, and codify the bug-pattern lessons so they fail at review time. The expensive moves (wallet fixture, Playwright CI smoke) are deferred until they become the bottleneck — none of this session's bug class required them.

---

## Actors

- A1. **Claude (dev-time)**: drives `agent-browser` against `pnpm dev` after every frontend commit, verifying the changed UI surface before declaring done.
- A2. **Human (pre-demo)**: runs ad-hoc browser smoke before demo-day recording. Click-through demo arc to confirm no regressions.
- A3. **Wallet (out of scope)**: Sui wallet extension popups cannot be driven by `agent-browser` in v1 — its isolated Chromium ships without the user's installed wallet extension, so "pause and ask the user to click" doesn't work for wallet flows (nothing to click in `agent-browser`'s window). Validation splits: agent-browser drives the pre-wallet UI (Connect / Sign In button visible + clickable); the user separately runs the wallet-signed step in their real Chrome and reports state back. **Discovered during plan-014 U4 install — see Dependencies / Assumptions below for the original misframing.**

---

## Key Flows

**F1. Dev-time UI verification (the primary loop)**
1. Claude finishes a frontend code change touching user-visible behavior
2. Claude runs `pnpm dev` (if not already running) + opens `agent-browser` at the relevant route
3. Claude drives the changed surface (click buttons, fill inputs, navigate)
4. If a wallet popup blocks: Claude pauses, tells user "click sign", resumes once signed
5. Claude asserts expected DOM state (testids, text, classes, conditional renders)
6. Pass → declare done + commit. Fail → diagnose, fix, repeat from step 3

**F2. Pre-commit checklist self-review**
1. Before declaring done, Claude runs through `docs/ux/frontend-checklist.md` items relevant to the change
2. Each item maps to a known bug pattern (cross-component state, useRef+StrictMode, async load token, loading affordance, single-source pin)
3. Items that don't apply are explicitly skipped (not silently ignored)

**F3. Frontend review-pass roster**
1. When dispatching a code-review pass on a frontend-touching plan, `ce-julik-frontend-races-reviewer` is included by default alongside the existing roster (correctness, testing, api-contract, adversarial)
2. CLAUDE.md encodes this so it's not a per-plan judgement call

---

## Requirements

- **R1.** Install `agent-browser` CLI (via `/ce-setup`) so Claude can drive a real browser against the local Vite dev server.
- **R2.** Hard rule in CLAUDE.md: any commit that changes user-visible frontend behavior MUST be browser-driven by Claude before declaring done. Wallet-blocking moments handle via "Claude pauses, user clicks".
- **R3.** Write `docs/ux/frontend-checklist.md` codifying the 5 bug-pattern categories observed in plans 005–013 (see Key Decisions below). Each category includes "when this applies" + "what to check" + at least one observed-bug example.
- **R4.** Add `ce-julik-frontend-races-reviewer` to the default review-pass roster for frontend-touching plans. CLAUDE.md call-out alongside the existing review-pass guidance.
- **R5.** The `agent-browser` workflow handles two pause kinds: (a) **non-wallet OS-level prompts inside agent-browser's Chromium** (file picker, OAuth redirect tab) — Claude announces "PAUSED — <X>, then say `go`", the user clicks in agent-browser's window, Claude resumes; (b) **wallet-gated flows** — agent-browser cannot validate these in v1 because its Chromium has no wallet extension. Claude drives the pre-wallet portion, then either escalates to user-driven real-Chrome side-channel for the signed step or documents the post-wallet state as untested. The "PAUSED — sign in the wallet" handoff originally drafted here does NOT apply to wallet flows in v1.
- **R6.** The checklist is enforced via Claude's pre-commit self-review (F2), not lint or CI. Failure mode is human-readable, not automated.
- **R7.** Scope is the full demo arc (`/`, `/create`, `/launch`, `/market`, `/track`, `/model/:id`, `/collection/:id`), not L1-only. Without a fixture trade-off, the natural scope is "anywhere I touch frontend."

---

## Acceptance Examples

- **AE1.** I make a one-line copy edit to `frontend/src/creator/CreateModelPage.tsx`. I run `agent-browser` against `/create`, verify the new copy renders, declare done. Total overhead: ~30 seconds.
- **AE2.** I refactor `useSession` to a shared store. I drive `agent-browser` through: sign-in → assert UI updates without reload → navigate to `/create` → assert metadata form is unlocked. Without the agent-browser step, the bug shipped in `69ef26a` (sign-in required refresh) reappears unnoticed.
- **AE3.** Frontend code review pass on a multi-file UI change automatically dispatches `ce-julik-frontend-races-reviewer` alongside `ce-correctness-reviewer` / `ce-testing-reviewer` / `ce-api-contract-reviewer`. The 5-reviewer parallel pattern from plan-013 becomes the default for any frontend-touching plan.
- **AE4.** I add a new `useEffect` with a ref. The checklist's "useRef + useEffect = setup-and-cleanup symmetric" item fires; I confirm the pattern is correct OR fix it. Without the checklist, the bug shipped in `react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md` reappears.
- **AE5.** A signed-tx flow (mint / launch) is validated in two parts: (1) `agent-browser` drives the pre-wallet UI on the demo arc and asserts the Sign / Mint button is visible and clickable; (2) the user separately runs the wallet-signed step in their real Chrome (with Slush installed) and reports the post-sign state, which Claude then asserts against. The original "PAUSED — sign in your wallet" single-browser handoff is not feasible in v1 — agent-browser's Chromium has no wallet extension.

---

## Success Criteria

- After this lands, no frontend commit ships without a Claude-driven browser verification step on the changed surface.
- The next plan that touches frontend produces zero user-discovered "this didn't work when I opened it" bugs of the categories covered in the checklist (cross-component state, loading affordance, useRef+StrictMode, source-of-truth drift, effect deps). Babylon-canvas-only bugs remain out-of-scope and may still slip.
- Pre-demo regression sweep (human-run) takes < 10 minutes of clicking. No automated smoke needed in v1.

---

## Scope Boundaries

### In scope (v1)
- `agent-browser` install + workflow integration
- `docs/ux/frontend-checklist.md` covering 5 bug-pattern categories
- `ce-julik-frontend-races-reviewer` as default for frontend-touching plans
- CLAUDE.md edits encoding R2 + R4
- Full demo arc as the verification surface

### Deferred for later
- `TestWalletAdapter` fixture for `@mysten/dapp-kit` (only build when unattended automation becomes the bottleneck — e.g., demo-day regression sweep at 3am)
- Playwright smoke / CI integration
- Visual regression / screenshot diff
- Mobile viewport testing

### Outside this initiative's identity
- Babylon 3D canvas content correctness (canvas is opaque to DOM-based tools; remains a solution-doc + manual-review surface)
- Static analysis to detect "frontend-touching" (per-commit judgement, no automation)
- Replacing the existing unit-test suite — agent-browser complements vitest, doesn't replace it

---

## Key Decisions

### Bug-pattern categories (drives R3 checklist content)

Five categories grounded in the ~15 user-discovered bugs across plans 005–013:

1. **Cross-component / cross-session state lifecycle**
   - Symptoms: state sync gaps, stale localStorage, cleanup-only useEffect, cache key drift across republishes
   - Example bugs: `69ef26a` (useSession not shared), `cc8dcdd` (stale JWT), `react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`
   - Check: "How many readers does this state have? Lifecycle event has cleanup symmetry? localStorage read has invalidate conditions?"

2. **Async UX feedback / loading affordance**
   - Symptoms: > 1s user actions with no loading signal, post-tx UI doesn't auto-refresh, button not disabled while pending
   - Example bugs: `458037a` (no auto-refresh after list/buy), `16998ae` (3 UX gaps in plan-013)
   - Check: "From click to result, is there a visible 'I'm working' signal? Is post-tx state a push or does user have to pull?"

3. **Real-data vs test fixture drift**
   - Symptoms: extension/encoding/codec present in real data not in fixtures; SDK quirks at real RPC
   - Example bugs: `a87f706` + `bb3555a` (GLB extension registration), `b2d2c42` (kiosk SDK garbage u64)
   - Check: "Where did the fixture come from? What real-world variants does the mock hide?"

4. **Source-of-truth drift**
   - Symptoms: same value pinned in 2+ places, package id stale in cache key, FE/BE constant divergence
   - Example bugs: `e886dff` (env var vs TESTNET pin), `8706036` F1 (BE TRIPO_FEE_MIST default), `8706036` F2 (cache key)
   - Check: "How many places hold this value? Single source or written-twice-by-hand?"

5. **Effect dependency completeness**
   - Symptoms: missing dep produces stale-closure bug; today's "safe by coincidence" becomes tomorrow's break
   - Example bugs: `8706036` F6 (`runBuildVariants` missing `base` in deps)
   - Check: "`react-hooks/exhaustive-deps` rule is error, not warn"

### Workflow integration

- **Trigger**: after any frontend commit, before declaring done. Hard rule, not opt-in.
- **Wallet-blocking moments**: Claude announces a pause + waits for user signal. Same friction as today's manual testing.
- **Per-commit judgement**: Claude decides per-commit whether "user-visible behavior changed". Trivial commits (pure styling, single-line copy in a flow already verified this session) can skip — but the default is to verify.

### What "frontend-touching" means for the review-pass rule

Any commit modifying files under `frontend/src/**/*.tsx`, `frontend/src/**/*.ts` (excluding pure type/util/test files), or `shared/src/types.ts` when consumed by a component. Pure backend / contracts / config commits don't trigger.

---

## Dependencies / Assumptions

- `agent-browser` CLI is installable via `/ce-setup`. The compound-engineering plugin already exposes the skill (`ce-test-browser`); no code we own is gating this.
- `agent-browser` can drive the local Vite dev server without certificate / proxy / WASM issues. **Unverified assumption** until installed — first task in the plan is sanity-check.
- ~~The user is present during dev iteration (sufficient frequency to click wallet popups). True today; if the workflow shifts to autonomous overnight runs, the fixture moves back into scope.~~ **Assumption that broke during plan-014 U4 install:** the wallet pause-and-resume protocol was drafted assuming `agent-browser` would drive the user's real browser (where Slush is installed). `agent-browser` actually uses its own isolated Chromium — the wallet extension isn't there. This narrows v1 wallet-flow validation to the pre-wallet UI surface only. The `TestWalletAdapter` fixture stays deferred per the cost/benefit framing, but the v1 scope is narrower than originally implied. AE2 (sign-in broadcast regression) and AE5 (signed-tx flow) both require either user-driven real-Chrome validation or the fixture.
- `ce-julik-frontend-races-reviewer` is callable in parallel with the existing 4-reviewer set. Verified in plan-013's review pass.
- The Babylon canvas (3D content correctness) remains an unsolved verification surface. Acceptable for v1.
- 28 days to submission (2026-06-21). Any investment > half a day must be justified against demo-day risk; this plan is < half a day.

---

## Outstanding Questions

These are implementation-time concerns for ce-plan, not product blockers:

- **OQ1.** Should the checklist file structure mirror an existing doc (e.g., `docs/solutions/` solution-doc shape with frontmatter)? Or a flat markdown?
- **OQ2.** How does Claude detect "user-visible behavior changed"? Heuristic in CLAUDE.md text vs. an explicit file-path filter? Plan should pin a single answer.
- **OQ3.** What's the agent-browser invocation pattern? Direct CLI from Bash tool, or via `ce-test-browser` skill? Probably the skill since it already wraps the CLI.
- **OQ4.** Does the CLAUDE.md edit go in the existing Session Start Protocol section, or as a new "Frontend Verification" section? Plan-time choice based on protocol-doc shape.
- **OQ5.** Should the F-IDs / R-IDs from this requirements doc map cleanly to plan-time U-IDs, or is the plan free to restructure? Default: plan restructures; this doc anchors product intent.
