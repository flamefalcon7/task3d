# S7 Versioned Masthead — Requirements

**Date**: 2026-05-29
**Status**: Approved (synthesis confirmed by user)
**Predecessor**: `docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md` §S7 ("Versioned issue №NNN masthead", confidence 90%, complexity Low)
**Adjacent**: D-044 (brutalist editorial tokens), D-068 (Tusk3D brand), plan-019 (LedeHero — shipped), plan-020 (KeycapRow — shipped), plan-021 (TelemetryStrip — shipped). Pairs structurally with future S3 (topology mark, also masthead).
**Implementation handoff**: consumed by `ce-plan` next (canonical flow). The build-time `№NNN` injection is a net-new pattern → ADR (D-072) belongs in the plan.

---

## Summary

S7 is the **page masthead** — a single horizontal bar mounted at the **very top** of `LandingPage.tsx`, above the shipped `<TelemetryStrip />` (S2). It frames Tusk3D as a continuously-published editorial product rather than a one-shot hackathon submission, by setting the wordmark with an auto-incrementing issue number.

Visual:

```
Tusk3D №042 · TESTNET EDITION
─────────────────────────────────────────────  (1.5px black rule)
```

`Tusk3D` in **Newsreader italic** (`var(--font-display)`); `№042` and `TESTNET EDITION` in **JetBrains Mono** uppercase. Pure black on `#F5F5F0` paper — **zero `#FF4500` accent** (site-wide budget is full at 5/5; S2's `●LIVE` dot owns the last slot). 1.5px black rule below, 0 radius, no glow/shadow/gradient.

`№042` is computed from `git rev-list --count main` at **build time** and injected as a constant — static per deploy, not live.

---

## Problem

The landing page currently opens straight into S2's telemetry strip. There is no identity anchor at the top — nothing that names the product in its own typographic voice or signals "this is an actively-developed system." A judge revisiting between 6/21 submission and 8/27 winners sees no visible sign of continued progress.

The issue-number framing solves both: it gives Tusk3D a typographic ritual (the wordmark is always set with an issue number, anchoring the name in editorial language) and a **free progress signal** — №NNN climbs with every commit, so each judge revisit shows the number has gone up.

---

## Goals

- A masthead at the top of `/` that names the product in D-044 editorial voice and reads as intentional, not boilerplate.
- `№NNN` reflects real commit count and **increases visibly** across the 6/21 → 7/8 → 8/27 judging windows.
- Structurally hosts the future S3 topology mark without rework (reserved slot, documented).
- Zero motion, zero accent (D-044). Static text only.
- Ships in **≤ 0.5 dev day**, blocking nothing downstream.

---

## Key Decisions

**KD-1 — Position: very top, above S2.**
Masthead mounts as the first child of `<main>` in `LandingPage.tsx`, above `<TelemetryStrip />`. This corrects the placeholder comment's current position (below `<LedeHero />`) to match the ideation page layout. Final order: `Masthead(S7) → TelemetryStrip(S2) → LedeHero(S1) → [S4/S5 future] → KeycapRow(S6)`.

**KD-2 — No datetime in the masthead.**
The ideation source string included `2026-06-15 14:22 PT`, but it is **dropped**. S2, mounted directly below, already shows a live `AS OF <timestamp> · ●LIVE`. Stacking a second timestamp is redundant, and S2's is real-time (stronger proof). The masthead carries **identity only** (wordmark + issue number + edition tag); "when / is-it-live" is entirely S2's job.

**KD-3 — `№NNN` source = `git rev-list --count main` at build time.**
Injected as a build-time constant (mechanism: ce-plan's call — likely a vite `define`). Static per deploy. Project commit count is already high, so the "№001 looks suspect" risk from the ideation downside does not apply.

**KD-4 — Build-time fallback when git is unavailable.**
If the count can't be resolved at build (CI without full history, non-git checkout), fall back to a sensible sentinel rather than crashing the build or rendering `№NaN`. Exact fallback value is a plan detail; requirement is: **the build never fails and the masthead never renders a broken number.**

**KD-5 — Zero accent.**
Pure black on paper. No `#FF4500` anywhere in the masthead. Verified against the site-wide 5/5 accent budget (S2 `●LIVE` dot holds the last slot).

**KD-6 — S3 slot reserved, not built.**
The masthead is laid out so the future S3 topology mark has a documented left-side slot, but **no S3 layout or fetch logic is built here**. S3 is its own survivor plan. The reserved slot is a comment + whatever minimal flex/grid structure makes adding S3 later non-breaking — nothing speculative.

**KD-7 — Edition tag is static text.**
`TESTNET EDITION` is a literal string for now. When the project moves to mainnet (per D-009, by 8/27), this flips to `MAINNET EDITION`. Not parameterized dynamically in v1 — a one-line edit at network-swap time is cheaper than build-time network detection.

---

## Non-Goals

- S3 topology mark (separate survivor plan).
- Live / dynamic issue number (build-time static is sufficient and matches ideation).
- Build-time network detection to auto-set the edition tag (KD-7).
- Any datetime / live counter in the masthead (that's S2, KD-2).
- README / pitch-deck / OG-image reuse of `№NNN` — high-compounding follow-up noted in ideation, but out of scope for the landing component itself.

---

## Acceptance Criteria

- **AC-1** Masthead renders as the **first** child of `LandingPage`'s `<main>`, above `<TelemetryStrip />`. (Extend the existing `LandingPage.test.tsx` doc-order assertion.)
- **AC-2** Wordmark `Tusk3D` renders in Newsreader italic; `№NNN` and `TESTNET EDITION` in JetBrains Mono uppercase.
- **AC-3** `№NNN` renders a real integer from the injected build-time constant (test asserts the constant is consumed and a numeric `№` shows, not the mechanism).
- **AC-4** When the build-time constant is the fallback sentinel, the masthead still renders a coherent masthead (no `№NaN`, no `№undefined`).
- **AC-5** No `#FF4500` anywhere in the masthead's computed styles.
- **AC-6** A 1.5px black rule sits below the masthead; 0 radius, no shadow/gradient/transition.
- **AC-7** Mobile 375px: masthead does not break layout (wraps or truncates gracefully).

---

## Dependencies / Assumptions

- Newsreader + JetBrains Mono already loaded (confirmed: `src/index.css`, `src/ux/tokens.ts`).
- `git rev-list --count main` is resolvable in the build environment (assumption; KD-4 fallback covers the negative case).
- D-044 token values (`pagePaper`, 1.5px border, 0 radius) reused from `src/ux/tokens.ts`.
- No backend / Move / shared-types changes.

---

## Open Questions

None blocking. KD-7's mainnet edition flip is a known future one-liner, not a question.
