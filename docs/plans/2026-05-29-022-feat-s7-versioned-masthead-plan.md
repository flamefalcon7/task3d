---
title: Tusk3D Landing S7 — Versioned Issue №NNN Masthead
type: feat
status: active
date: 2026-05-29
origin: docs/brainstorms/2026-05-29-s7-versioned-masthead-requirements.md
---

# Tusk3D Landing S7 — Versioned Issue №NNN Masthead

**Plan depth:** Lightweight (3 units, ≤0.5 dev day)
**Origin:** `docs/brainstorms/2026-05-29-s7-versioned-masthead-requirements.md` (Approved)
**Adjacent shipped work:** plan-019 (LedeHero), plan-020 (KeycapRow), plan-021 (TelemetryStrip). Mirrors their `frontend/src/landing/` component + CSS-module + colocated-test convention.

---

## Problem Frame

The landing page (`frontend/src/landing/LandingPage.tsx`) opens straight into the S2 telemetry strip with no identity anchor at the top. S7 adds a **page masthead** — a static text bar that names the product in D-044 editorial voice and carries an auto-incrementing issue number (`№NNN`) computed from the git commit count at build time. The issue number is a free progress signal: it climbs across the 6/21 → 7/8 → 8/27 judging windows, so each judge revisit shows visible advance.

This is purely additive, display-only, frontend-local. No backend / Move / shared-types changes.

---

## Scope Boundaries

**In scope:**
- New `Masthead` component + CSS module in `frontend/src/landing/`.
- Build-time injection of `git rev-list --count main` into a typed global constant (vite `define`).
- Graceful fallback when the git count is unresolvable (build never fails, no broken number renders).
- Mount as the **first** child of `<main>` in `LandingPage.tsx`, above `<TelemetryStrip />`; extend the doc-order test.

**Deferred for later** (carried from origin Non-Goals):
- S3 topology mark (separate survivor plan) — S7 only reserves a documented left-side slot.
- Live / dynamic issue number — build-time static is sufficient.
- Build-time network detection to auto-flip the edition tag — `TESTNET EDITION` → `MAINNET EDITION` is a one-line manual edit at network-swap time (KD-7).
- README / pitch-deck / OG-image reuse of `№NNN` — high-compounding follow-up, not part of the landing component.

---

## Key Technical Decisions

**KTD-1 — Build-time injection via vite `define` (ADR D-072).**
`frontend/vite.config.ts` currently has no `define` block. Add one that resolves `git rev-list --count main` once at config-eval time and injects it as a compile-time global constant (e.g. `__ISSUE_NUMBER__`). This is a net-new build pattern → capture as **ADR D-072** in `docs/decisions.md` (next free number after D-071). Rationale for build-time over runtime: the count is a deploy-stamp, not live data (KD-2/KD-3); resolving it at build keeps the component a pure render with zero runtime git/network dependency, and the constant is dead-simple to test by stubbing the global.

**KTD-2 — Fallback = drop the №, not a fake number (KD-4).**
Wrap the git resolution in try/catch. On failure (no git, no `main` ref, non-repo checkout, CI shallow-clone), inject a sentinel that the component reads as "no number" and renders `Tusk3D · TESTNET EDITION` (wordmark + edition only), never `№NaN` / `№undefined` / `№0`. Sentinel choice (e.g. `0` or `null` via `JSON.stringify`) is a small implementation detail; the contract is: **build succeeds and the masthead degrades to a coherent wordmark-only masthead.**

**KTD-3 — Reuse D-044 tokens, zero accent (KD-5).**
Pull `paper` / `ink` / `border.primary` (1.5px solid #000) / `font.display` from `frontend/src/ux/tokens.ts`, mirroring `KeycapRow.module.css`. Wordmark `Tusk3D` in Newsreader italic (`var(--font-display)`); `№NNN` + `TESTNET EDITION` in JetBrains Mono uppercase. **No `#FF4500` anywhere** — site accent budget is full (S2 `●LIVE` dot holds the last slot).

**KTD-4 — S3 slot reserved structurally, not built (KD-6).**
Lay the masthead out as a horizontal flex bar with a documented left-side comment placeholder for the future S3 topology mark, such that adding S3 later does not require restructuring. No S3 layout/fetch logic here.

---

## Implementation Units

### U1. Build-time issue-number injection + typed global

**Goal:** Make a compile-time integer constant available to the frontend reflecting `git rev-list --count main`, with a safe fallback, and capture the pattern as ADR D-072.

**Requirements:** KD-3, KD-4 (origin); KTD-1, KTD-2.

**Dependencies:** none.

**Files:**
- `frontend/vite.config.ts` — add `define` block resolving the git count at config eval, wrapped in try/catch with sentinel fallback.
- `frontend/src/vite-env.d.ts` (create if absent, else extend) — declare the injected global's type so TS consumers compile under strict mode.
- `docs/decisions.md` — append ADR **D-072** (build-time git-count injection pattern; rationale; fallback contract; relation to D-044/D-071).

**Approach:** Resolve the count synchronously during vite config evaluation (Node context — `child_process` is available there, never shipped to the browser). Inject as `__ISSUE_NUMBER__`. The try/catch makes a missing `main` ref or non-repo build fall to the sentinel. Declare `declare const __ISSUE_NUMBER__: number;` (or the chosen sentinel-inclusive type) in the env d.ts.

**Patterns to follow:** vite config style already in `frontend/vite.config.ts` (commented "why" notes); D-071 (build-time baked snapshot) as the sibling ADR precedent for build-time-constant rationale.

**Test scenarios:**
- `Test expectation: none` for `vite.config.ts` itself (build config, not unit-testable without an integration harness) — the consuming component (U2) is tested against a stubbed global instead, which is the verifiable seam.
- Verification that the global is typed: `tsc -b` passes with the d.ts declaration and no `any`.

**Verification:** `pnpm --dir frontend build` succeeds; the injected global appears as a literal integer in built output; deleting `.git` (or simulating via a thrown stub) still builds and yields the sentinel.

---

### U2. Masthead component + CSS module

**Goal:** Render the masthead bar — Newsreader-italic `Tusk3D`, `№NNN` (or omitted on sentinel), `TESTNET EDITION`, 1.5px black rule below — consuming `__ISSUE_NUMBER__`.

**Requirements:** AC-2, AC-3, AC-4, AC-5, AC-6, AC-7 (origin); KTD-2, KTD-3, KTD-4.

**Dependencies:** U1 (consumes `__ISSUE_NUMBER__`).

**Files:**
- `frontend/src/landing/Masthead.tsx` — new component, `data-testid="masthead"`.
- `frontend/src/landing/Masthead.module.css` — new CSS module mirroring `KeycapRow.module.css` token usage.
- `frontend/src/landing/Masthead.test.tsx` — new colocated test.

**Approach:** Pure presentational component, no props (reads the injected global directly), no state, no effects. Compute a display issue token from the global: integer → `№{n}`; sentinel → render nothing for that span. Wordmark span uses `var(--font-display)` italic; number + edition spans use the mono stack from `KeycapRow.module.css`. Bottom 1.5px rule via `border-bottom: 1.5px solid #000` (token `border.primary`). Reserve the S3 slot as a leading element/comment in the flex row. Mobile: ensure the row wraps or stays single-line without overflow at 375px.

**Technical design** (directional, not implementation spec):
```
<header data-testid="masthead">
  {/* S3 topology mark slot — future survivor plan; intentionally empty */}
  <span class="wordmark">Tusk3D</span>        // Newsreader italic
  {issue && <span class="issue">№{issue}</span>} // JetBrains Mono
  <span class="edition">TESTNET EDITION</span>   // JetBrains Mono
</header>                                          // border-bottom 1.5px #000
```

**Patterns to follow:** `frontend/src/landing/KeycapRow.tsx` (component shape, `data-testid` convention) and `KeycapRow.module.css` (token usage, 1.5px borders, no transition, mobile media query).

**Test scenarios:**
- Covers AC-2. Renders `Tusk3D` wordmark and `TESTNET EDITION` text; wordmark element carries the display-font class, number/edition carry the mono class.
- Covers AC-3. With the global stubbed to a positive integer (e.g. mock `__ISSUE_NUMBER__ = 142`), renders `№142`.
- Covers AC-4. With the global stubbed to the sentinel, renders a coherent masthead with **no** `№` token and no `NaN`/`undefined`/`№0` text.
- Covers AC-5. No element in the rendered tree has `#FF4500` / `#ff4500` in its inline style or class-applied color (assert against the accent-dot pattern's absence).
- Edge: very large number (e.g. 9999) still renders on one logical line (no thrown error; smoke that the string composes).

**Verification:** `Masthead.test.tsx` passes; manual/browser check shows wordmark italic + mono number + rule, black-on-paper.

---

### U3. Mount in LandingPage + extend doc-order test

**Goal:** Place `<Masthead />` as the first child of `LandingPage`'s `<main>`, above `<TelemetryStrip />`, and update the composition test.

**Requirements:** AC-1, KD-1 (origin); KTD-4.

**Dependencies:** U2.

**Files:**
- `frontend/src/landing/LandingPage.tsx` — import + mount `<Masthead />` as first child; remove the stale `{/* S7 issue masthead — future survivor plan */}` placeholder comment (and reposition/keep the S3/S4/S5 placeholders as appropriate).
- `frontend/src/landing/LandingPage.test.tsx` — extend the existing doc-order assertion from 3 children to include masthead first: `Masthead → TelemetryStrip → LedeHero → KeycapRow`. Add a `vi.mock('./Masthead', …)` stub mirroring the existing TelemetryStrip/LedeHero stubs (Masthead consumes the build-time global, which is undefined in the test harness unless mocked).

**Approach:** Minimal edit to the composition root. Stub `Masthead` at the module boundary in the test (consistent with how `LedeHero` and `TelemetryStrip` are already stubbed) so the order test stays free of the build-time global.

**Patterns to follow:** existing `vi.mock` stubs and `compareDocumentPosition` order assertions already in `LandingPage.test.tsx`.

**Test scenarios:**
- Covers AC-1. `masthead` testid present inside `landing-page` root.
- Covers AC-1. Document order is `Masthead → TelemetryStrip → LedeHero → KeycapRow` (extend the existing `compareDocumentPosition` chain).

**Verification:** `LandingPage.test.tsx` passes; full `pnpm --dir frontend test` green; `tsc -b` clean net of the known pre-existing baseline.

---

## Verification Strategy

- All three units land with passing colocated tests; full frontend vitest suite green (current baseline ~702 + new Masthead/LandingPage cases).
- `tsc -b` introduces no new errors beyond the documented pre-existing main baseline.
- `pnpm --dir frontend build` succeeds and produces a literal issue integer in output; a git-less build still succeeds (sentinel path).
- Browser-verify at `/` per CLAUDE.md Frontend Verification Protocol: masthead renders at the top (wordmark italic, mono `№NNN`, `TESTNET EDITION`, 1.5px rule), black-on-paper with zero accent, and is structurally above the S2 strip. Mobile 375px: no overflow. (Masthead is structurally contained to LandingPage, so full demo-arc check may be scoped to `/` — note explicitly, don't silently skip.)

---

## Review Roster

Frontend-touching plan → default 5-reviewer parallel roster per CLAUDE.md: `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`, `ce-julik-frontend-races-reviewer`. (Note: this component has no async/effects/state, so the julik races reviewer will likely find little — included for roster completeness.)

---

## Deferred to Follow-Up Work

- ADR D-072 wording may want a cross-link from D-044 once written.
- If a later survivor wants the issue number outside the landing (README header, OG image), promote `__ISSUE_NUMBER__` resolution into a shared build util — not needed for a single consumer now.
