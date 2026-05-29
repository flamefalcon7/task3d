---
title: "feat: S3 topology identity mark in the masthead"
type: feat
status: completed
date: 2026-05-29
plan_number: 025
origin: docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md §S3
depth: lightweight
---

# feat: S3 Topology Identity Mark (plan-025)

The **last** of the 7 landing survivors. Form was decided in a prior brainstorm (see `docs/phase-progress.md` — the 12:35pm / S4-session entries); visual treatment confirmed with the user this session.

## Problem Frame

The masthead wordmark (`Tusk3D`) has no visual mark. S3 adds a small black-on-paper **tusk topology line-mark** in the masthead's already-reserved leading slot — the brand's "make the geometry visible" (Carve) metaphor rendered as a Joy-Division *Unknown Pleasures*-style stacked-ridgeline tusk silhouette.

## Decided (do not re-litigate)

- **Static baked SVG, NOT a live Walrus fetch.** Rationale (documented): S1 LedeHero already carries the live-Walrus proof + prints the CID, so a 2nd masthead fetch is redundant proof, would put two tusks on the first screen, add a 2nd Babylon WebGL context (D-003 cap), and couple masthead↔S1. The ridgeline look is also better pre-rendered. No real minted CID exists yet anyway.
- **Visual = Joy-Division ridgeline** (user-confirmed): stacked horizontal contour lines bulging into the tusk profile. ~7–9 lines (controlled, so it reads at small size — not noise). Reuse the established tusk silhouette path from `frontend/public/lifecycle/model.svg` / `tusk-keyframe.svg` as the bounding profile.
- **Palette: INVERTED from the lifecycle SVGs.** The masthead is paper (`#F5F5F0`); the mark is **`#000` ink strokes on transparent** (no black well). Zero `#FF4500` accent (D-044, budget full).
- **Placement:** the existing reserved slot in `Masthead.tsx` (the comment before the `.wordmark` span). The flex row (`align-items: baseline`) already accommodates a leading mark.
- **Decorative:** the wordmark carries the name; the mark is decorative → empty `alt` (`alt=""`) so screen readers don't double-announce. Still `data-testid`-addressable for tests.

## Scope Boundaries

In scope: one new SVG asset + mounting it in the masthead slot + masthead CSS + test updates. **Non-goals:** no live fetch, no Babylon, no accent, no masthead layout restructure, no change to the wordmark/issue/edition elements.

---

## Implementation Units

### U1. Author the ridgeline tusk SVG mark

**Goal:** A static, zero-accent, black-ink-on-transparent ridgeline tusk mark that reads at ~28px height.

**Files:**
- `frontend/public/mark/tusk-ridge.svg` (create)

**Approach:** `viewBox` roughly matching the tusk aspect (e.g. `0 0 120 90`). Tusk profile derived from the established silhouette (`model.svg`'s `#tusk` path, rescaled). Inside the profile, ~7–9 horizontal contour lines that bulge/peak following the tusk's curved spine (the *Unknown Pleasures* ridgeline language), drawn with `stroke="#000"`, `fill="none"`, `stroke-width` ~1.5, `stroke-linecap="square"`. No `<rect>` background (transparent). **Zero `#FF4500`** anywhere (including comments — S4 lesson: a literal `#FF4500` in a comment trips the grep-gate).

**Test expectation: none** — pure static asset; covered by U2's file-content + render assertions.

### U2. Mount the mark in the masthead slot + tests

**Goal:** Render the mark in the reserved slot; cover it with tests.

**Files:**
- `frontend/src/landing/Masthead.tsx` (modify — replace the reserved-slot comment with the mark `<img>`)
- `frontend/src/landing/Masthead.module.css` (modify — add `.mark`)
- `frontend/src/landing/Masthead.test.tsx` (modify — assert mark renders, zero accent, decorative)

**Approach:**
- Insert `<img className={styles.mark} src="/mark/tusk-ridge.svg" alt="" data-testid="masthead-mark" />` in the slot. Add an `onError` hide fallback (mirror S4 LifecycleStrip — graceful on a sub-path deploy). `alt=""` (decorative; wordmark carries the name).
- `.mark`: `height: 28px` (a touch smaller at 767px), `width: auto`, `display: block`, `flex: none`, `align-self: center` (the row is baseline-aligned; the mark should center against the wordmark cap-height — verify in browser).
- Tests: (a) mark `<img>` renders with the `/mark/tusk-ridge.svg` src and is decorative (`alt === ''`); (b) it precedes the wordmark in DOM order; (c) **zero `#FF4500`**: assert `container.innerHTML` has no `ff4500` AND an `it`-level file-content check reads `frontend/public/mark/tusk-ridge.svg` and asserts no `ff4500` (the DOM check is vacuous for an `<img>` src — the S4 lesson); (d) no `<canvas>` (still static).

**Patterns to follow:** `frontend/src/landing/LifecycleStrip.tsx` (`<img>` + `onError` + file-content zero-accent `it.each`), existing `Masthead.test.tsx` (issue/edition/wordmark assertions).

**Test scenarios:**
- Mark `<img>` present, `src="/mark/tusk-ridge.svg"`, `alt=""` (decorative).
- DOM order: mark precedes `masthead-wordmark`.
- `container.innerHTML.toLowerCase()` has no `ff4500`; file-content read of the SVG has no `ff4500`.
- No `<canvas>` in the masthead.
- Existing masthead tests (wordmark, issue `№`, edition, sentinel-0 branch) still pass.

**Verification:** `node_modules/.bin/vitest` green; `tsc -b` no new errors (baseline 32); browser-verify at `/` — mark renders left of the wordmark, vertically aligned, crisp at desktop + 375px, no masthead overflow (S7 had a 375px overflow history). Screenshot for taste check.

---

## Review

Frontend-touching → default 5-reviewer roster (ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races), report-only. No ADR warranted (conventional static asset, no new pattern — D-073 stays unallocated).
