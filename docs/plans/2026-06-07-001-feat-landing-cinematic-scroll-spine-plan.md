---
title: "feat: Landing cinematic scroll spine"
type: feat
status: completed
date: 2026-06-07
origin: docs/brainstorms/2026-06-07-landing-cinematic-scroll-spine-requirements.md
decisions: [D-098, D-099]
---

# feat: Landing Cinematic Scroll Spine

## Summary

Add a **scroll-orchestration layer** to the `/` landing route so the existing
carve→mint→riff content reads as one guided, sleek descent instead of a stack of
self-contained blocks the visitor must hunt through. The layer is four things,
layered **over** the sections that already exist: (1) eased inertial smooth-scroll
(Lenis), (2) once-per-entry reveal choreography per section (GSAP ScrollTrigger),
(3) a restrained stage indicator tracking the lifecycle stage, and (4) a
scroll-driven "farewell" camera move on the hero tusk as it leaves view.

It does **not** rebuild the 2026-06-06 live-3D wells, does **not** merge their
separate Babylon canvases, and does **not** take ownership of any render loop. It
orchestrates around the existing `LedeHero` (self-managed engine, pause policy) and
`LiveWell` panels (dispose policy), reusing `useLedeRenderMode` and `useInView` as
the single sources of live/static + visibility truth.

**Locked decisions (origin):** D-098 (adopt `gsap` + ScrollTrigger + `lenis`,
scoped to `/`) and D-099 (scoped D-044 motion exception — the spine spends **zero**
`#FF4500` accent).

---

## Problem Frame

The landing already *moves* (auto-rotating hero, animating lifecycle wells,
typewriter) but does not *guide*. Scrolling reads as disconnected wells; the
visitor supplies the narrative. As the single most evaluator-facing surface of the
Sui Overflow 2026 submission, in Phase 4 (demo/pitch polish) the job is to make the
working product *feel* finished — so the fix is choreography, not features: lead the
scroll so the carve→mint→riff arc reads as one continuous, premium sequence, while
preserving the deliberate brutalist identity (no marketing-slop, no accent creep).

See origin: `docs/brainstorms/2026-06-07-landing-cinematic-scroll-spine-requirements.md`.

---

## Scope Boundaries

**In scope**
- A landing-only (`/`) scroll-orchestration layer: smooth scroll, per-section
  reveals, stage indicator, hero farewell camera move.
- New dependencies `gsap` (+ ScrollTrigger plugin) and `lenis`, scoped to the
  landing entry (D-098).
- A `VITE_LANDING_SCROLL_SPINE` build-time flag so "smooth scroll off, static/live
  wells on" is a reachable, tree-shaken state.
- Graceful degradation: `prefers-reduced-motion`, mobile/no-WebGL
  (`useLedeRenderMode === 'static-fallback'`), and the existing
  `VITE_LANDING_LIVE_WELLS=0` kill-switch must all yield a clean plain-scroll page.

**Out of scope / non-goals**
- **Approach 乙** — merging the per-well canvases into one pinned cross-lifecycle
  scene (rejected in origin; too large a rebuild with real jank/perf risk 14 days
  from submission).
- **Rebuilding or altering the live-3D wells' contents** — the 2026-06-06 work
  stays as-is.
- **Cross-canvas object flight** — one tusk physically traveling between separate
  scenes.
- **Scroll-coupled camera moves on the lifecycle panels** — see Key Technical
  Decision KTD-2; panels get DOM-level connective transitions only, not camera
  scrubbing (would fight the dispose policy + MODEL ±30° clip-plane constraint).
- **New accent colors or non-token motion language** — the spine spends zero
  `#FF4500` (D-099); any future accent spend reopens that decision.
- **Backend / contract / Walrus changes**, and **all other routes** (`/track`,
  inner app routes).

### Deferred to Follow-Up Work
- A `docs/solutions/` entry capturing the ScrollTrigger/Lenis + Babylon-camera +
  StrictMode lifecycle integration (net-new for this repo) via `/ce-compound`
  after this lands.
- Reactive mid-session `prefers-reduced-motion` toggling (the existing
  `TypewriterPrompt` reads it once at mount; the spine mirrors that — not reactive).

---

## Requirements Traceability

| Req (origin) | Summary | Units |
|---|---|---|
| R1 | Orchestration layer over existing sections; wells untouched | U6 |
| R2 | Eased inertial smooth-scroll (Lenis) | U2 |
| R3 | Once-per-entry reveal choreography, restrained easing | U3 |
| R4 | Persistent restrained stage indicator (zero accent) | U4 |
| R5 | Connective transitions: hero farewell camera + panel DOM transitions | U5, U3 |
| R6 | Lifecycle reads as a guided progression; indicator tracks stage | U4, U3 |
| R7 | `prefers-reduced-motion` collapses all motion to instant + native scroll | U2, U3, U4, U5, U6 |
| R8 | Mobile/no-WebGL → clean plain vertical scroll | U2, U6 |
| R9 | Never break the render-loop guardrail (≤2 co-visible heavy loops) | U5, U7 |
| R10 | Design fidelity: restrained, zero `#FF4500` spent by the spine | U3, U4 |

Acceptance Examples (origin): AE1→U2/U6, AE2→U3, AE3→U5, AE4→U4, AE5→U7, AE6→U6.

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not
implementation specification. The implementing agent should treat it as context,
not code to reproduce.*

**Three gates, evaluated once at mount, decide whether the spine engages:**

```
spineActive = VITE_LANDING_SCROLL_SPINE !== '0'      // build-time, tree-shaken
           && useLedeRenderMode() === 'live'          // ≥768px + WebGL (reactive)
           && !prefersReducedMotion()                 // matchMedia, read once

if !spineActive  → render the SAME LandingPage, plain native scroll, sections
                   visible immediately, no Lenis, no ScrollTrigger, no camera scrub.
if  spineActive  → Lenis drives scroll; ScrollTrigger reads Lenis position to fire
                   per-section reveals + advance the stage indicator; hero couples
                   camera.alpha/beta to its own ScrollTrigger as it exits view.
```

**Loop-ownership rule (non-negotiable):** the spine never calls
`runRenderLoop`/`stopRenderLoop` and never starts a rAF render loop. Lenis runs its
own rAF for *scroll*; ScrollTrigger updates off that tick. The hero camera move
mutates `camera.alpha/beta/radius` inside the **existing** `onBeforeRenderObservable`
(or via a `gsap.to` on the camera object that the existing render loop simply
renders) — no parallel render loop is introduced.

```mermaid
graph TD
  U1[U1 deps + flag + ScrollTrigger reg + spec.md pin] --> U2[U2 useSmoothScroll (Lenis)]
  U1 --> U3[U3 RevealSection wrapper]
  U1 --> U4[U4 ScrollSpineIndicator]
  U2 --> U6[U6 LandingPage integration]
  U3 --> U6
  U4 --> U6
  U1 --> U5[U5 Hero farewell camera move]
  U2 --> U5
  U5 --> U6
  U6 --> U7[U7 perf validation + browser-verify + docs]
```

---

## Key Technical Decisions

**KTD-1 — Three-gate engage check, mirroring existing conventions.** The spine
engages only when `VITE_LANDING_SCROLL_SPINE !== '0'` AND `useLedeRenderMode()
=== 'live'` AND `!prefersReducedMotion()`. Reuses the exact gates the wells already
use (`useLedeRenderMode` for the ≥768px+WebGL/static branch per
`frontend/src/landing/useLedeRenderMode.ts`; the `prefersReducedMotion()` helper
shape from `frontend/src/landing/TypewriterPrompt.tsx`). Read-once for
reduced-motion (not reactive), matching `TypewriterPrompt`.

**KTD-2 — Camera "farewell" is hero-only; panels get DOM transitions.** Only the
hero (pause policy, always-warm engine) gets a scroll-coupled camera move. The four
`LiveWell` panels dispose off-screen and the MODEL panel's `edgesGradientSweep`
clip plane breaks past ±30° (see `docs/plans/2026-06-06-001-feat-landing-live-3d-wells-plan.md`),
so panels receive R5's "connective" read via DOM reveal/cross-fade (U3), not camera
scrubbing. Keeps R5's guided descent without violating the dispose asymmetry or the
loop guardrail.

**KTD-3 — Spine never owns a render loop.** Lenis owns a rAF for scroll only;
ScrollTrigger updates from it; the hero camera animates through the existing scene
render path. This preserves the "≤2 co-visible heavy loops" invariant (the honest
guardrail per the wells plan, not a literal "never two").

**KTD-4 — StrictMode-safe imperative lifecycle.** All GSAP/Lenis/ScrollTrigger
setup uses `gsap.context()` scoped to a container ref with `ctx.revert()` in
cleanup (kills ScrollTriggers + tweens), and the Lenis instance is created in the
effect body and destroyed in cleanup — **never** a cleanup-only effect. Re-assert
state in the setup body. Tests wrap in `<StrictMode>`. Grounded in
`docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`
and `.../react-hooks-after-early-return-oauth-mask-2026-05-28.md` — all new hooks
stay unconditional above any branch.

**KTD-5 — Own build flag + tree-shake proof.** `VITE_LANDING_SCROLL_SPINE` as a
module-scope compile-time constant (`import.meta.env.VITE_LANDING_SCROLL_SPINE !==
'0'`) so Rollup constant-folds and tree-shakes gsap/lenis out when off; verify with
a `grep` on `frontend/dist/` for `gsap`/`lenis` strings (zero hits when off). Pattern
from `docs/solutions/design-patterns/vite-build-time-flag-tree-shake-gate-2026-05-28.md`.

**KTD-6 — Zero-accent stage indicator (D-099).** The indicator uses
`tokens.color.subtle` (`#595959`) / `hint` greys and `tokens.font.mono`, weight ≤500,
radius 0 — never `tokens.color.accent` (`#FF4500`). A test asserts no `#FF4500` in the
indicator's computed styles, making D-099's "zero accent" boundary auditable.

---

## System-Wide Impact

- **Bundle:** first animation deps in the repo; weight lands only on the `/`
  entry, tree-shaken out when the flag is off. Acceptable (landing is the
  evaluator surface).
- **`frontend/src/landing/LandingPage.tsx`:** gains a scroll-container wrapper +
  the smooth-scroll hook + section wrappers + the indicator. Must preserve the
  six-child document order (asserted by `LandingPage.test.tsx`) and must not
  disturb `LedeHero`'s internally-`position:absolute` content column.
- **`frontend/src/landing/LedeHero.tsx`:** gains a scroll-coupled camera effect
  (additive; existing engine/scene/auto-rotate effects unchanged in ownership).
- **Docs:** `docs/spec.md §4` (pin gsap/lenis versions), `docs/ux/design-tokens.md`
  (note D-099 spine motion exception alongside D-091/D-094), `docs/phase-progress.md`.

---

## Implementation Units

### U1. Dependencies, build-flag gate, ScrollTrigger registration

**Goal** — Land gsap + lenis and the engage scaffolding so later units have a clean,
flag-gated, tree-shakeable foundation. No user-visible behavior yet.

**Requirements** — Enables D-098; sets up R8/R7 gating and KTD-5.

**Dependencies** — none.

**Files**
- `frontend/package.json` (add `gsap`, `lenis` to dependencies; pin latest stable)
- `frontend/src/landing/spineConfig.ts` (new — exports `SPINE_FLAG_ENABLED`
  module constant from `import.meta.env.VITE_LANDING_SCROLL_SPINE`, plus a single
  `registerScrollTrigger()` that calls `gsap.registerPlugin(ScrollTrigger)` once)
- `frontend/src/landing/spineConfig.test.ts` (new)
- `docs/spec.md` (§4 — record pinned gsap/lenis versions on the 2026 train)

**Approach** — Imports follow the repo's deep-path convention (mirror
`@babylonjs/materials/*` sub-path imports in `frontend/src/landing/LedeHero.tsx`):
`import gsap from 'gsap'`, `import { ScrollTrigger } from 'gsap/ScrollTrigger'`,
register once. `SPINE_FLAG_ENABLED = import.meta.env.VITE_LANDING_SCROLL_SPINE !==
'0'` (default ON; only `'0'` disables) so it constant-folds. Do not import gsap/lenis
anywhere that isn't behind the flag branch, so the tree-shake holds.

**Patterns to follow** — `docs/solutions/design-patterns/vite-build-time-flag-tree-shake-gate-2026-05-28.md`;
existing `VITE_LANDING_LIVE_WELLS` usage in `frontend/src/babylon/LiveWell.tsx`.

**Test scenarios**
- `SPINE_FLAG_ENABLED` is `true` when the env var is unset or any value ≠ `'0'`.
- `SPINE_FLAG_ENABLED` is `false` when the env var is exactly `'0'`.
- `registerScrollTrigger()` is idempotent — calling it twice registers the plugin
  once (mock `gsap.registerPlugin`, assert call de-dup or that double-call is safe).

**Verification** — `frontend` typechecks (`tsc -b`); a production build with
`VITE_LANDING_SCROLL_SPINE=0` contains no `gsap`/`lenis` strings in
`frontend/dist/` (deferred grep check folded into U7).

---

### U2. `useSmoothScroll` — Lenis integration (gated, StrictMode-safe)

**Goal** — Eased inertial smooth-scroll on the landing, engaged only when the three
gates pass, torn down cleanly otherwise.

**Requirements** — R2; R7 (reduced-motion → no Lenis); R8 (static/mobile → no Lenis).

**Dependencies** — U1.

**Files**
- `frontend/src/landing/useSmoothScroll.ts` (new)
- `frontend/src/landing/useSmoothScroll.test.tsx` (new)

**Approach** — Hook takes no args (or a `rootRef`), reads
`useLedeRenderMode()` + `prefersReducedMotion()` + `SPINE_FLAG_ENABLED`. When any
gate fails it is a no-op (native scroll untouched). When engaged: create one
`Lenis` instance in the effect body, run its `raf` loop, and bridge it to
ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)` and
`gsap.ticker.add` driving `lenis.raf`, or Lenis's own rAF — pick one ticker, not
two). Cleanup destroys the Lenis instance and removes the ticker/listener. All
hooks unconditional; reduced-motion/static is a branch **inside** the effect, not
an early return before hooks (per
`docs/solutions/integration-issues/react-hooks-after-early-return-oauth-mask-2026-05-28.md`).

**Execution note** — StrictMode-safe: symmetric create/destroy in one effect, never
a cleanup-only effect; re-assert refs in the setup body.

**Patterns to follow** — `prefersReducedMotion()` helper in
`frontend/src/landing/TypewriterPrompt.tsx`; engine create/dispose symmetry in
`frontend/src/babylon/LiveWell.tsx`;
`docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`.

**Test scenarios**
- Covers AE1. With `useLedeRenderMode → 'live'` and reduced-motion false, mounting
  creates exactly one Lenis instance (mock `lenis`); unmount destroys it.
- Covers AE1. With `matchMedia('(prefers-reduced-motion: reduce)') → matches:true`,
  no Lenis instance is created (native scroll).
- With `useLedeRenderMode → 'static-fallback'`, no Lenis instance is created.
- With `SPINE_FLAG_ENABLED=false`, no Lenis instance is created.
- Under `<StrictMode>` double-mount, the net result is exactly one live Lenis
  instance (no leaked instance from the throwaway mount).

---

### U3. `RevealSection` — per-section reveal choreography

**Goal** — Wrap each landing section so it eases in once when scrolled to;
restrained (fade + small translate), no replay, reduced-motion → instant visible.

**Requirements** — R3; R5 (the panel-side connective read); R6; R7; R10.

**Dependencies** — U1.

**Files**
- `frontend/src/landing/RevealSection.tsx` (new — a wrapper component)
- `frontend/src/landing/RevealSection.module.css` (new — base/visible classes +
  reduced-motion `@media` rule)
- `frontend/src/landing/RevealSection.test.tsx` (new)

**Approach** — `<RevealSection>{children}</RevealSection>` renders a container with
an initial hidden style; when engaged it creates a ScrollTrigger (inside a
`gsap.context` scoped to the container ref) that plays a one-shot fade+translate as
the section enters, `toggleActions` set so it does **not** replay on scroll-up/down
re-entry (the "once" semantics of `frontend/src/landing/useInView.ts` `{once:true}`).
When a gate fails, the container renders fully visible with no ScrollTrigger. Easing
is restrained (e.g. `power2.out`, ~0.5s, ≤24px translate) — no overshoot/spring per
R10. Reduced-motion path also handled via a CSS `@media (prefers-reduced-motion:
reduce)` fallback mirroring `frontend/src/index.css` so a no-JS hidden state can't
strand content.

**Patterns to follow** — once-latch semantics of `useInView` (`once:true`);
reduced-motion CSS gating in `frontend/src/landing/LifecycleStrip.module.css` and
`frontend/src/index.css`; CSS-module styling convention used by every non-hero
landing section.

**Test scenarios**
- Covers AE2. When engaged and the section's ScrollTrigger `onEnter` fires once,
  the reveal tween plays once; a simulated re-enter does not replay (assert
  `toggleActions`/play-count via mocked gsap).
- Covers AE2. Children are always present in the DOM (reveal animates style, never
  conditionally renders content) — so content is reachable even if the trigger
  never fires.
- With reduced-motion true (or `SPINE_FLAG_ENABLED=false`), the container is
  rendered visible with no ScrollTrigger created and no opacity:0 stranding.
- The wrapper adds no `#FF4500` (R10) — assert no accent token in its styles.

---

### U4. `ScrollSpineIndicator` — stage tracker (zero accent)

**Goal** — A persistent, restrained indicator showing the visitor's position in the
carve→mint→riff arc, advancing with scroll.

**Requirements** — R4; R6; R7; R10 (zero accent — D-099, KTD-6).

**Dependencies** — U1.

**Files**
- `frontend/src/landing/ScrollSpineIndicator.tsx` (new)
- `frontend/src/landing/ScrollSpineIndicator.module.css` (new)
- `frontend/src/landing/ScrollSpineIndicator.test.tsx` (new)
- `docs/ux/design-tokens.md` (add the D-099 spine motion-exception note beside
  D-091/D-094 scoped exceptions)

**Approach** — A fixed-position rail (recommended: left edge, vertical) of mono
stage ticks (e.g. `CARVE / MINT / RIFF`, or the four lifecycle stages — final
labels a design call within this unit). When engaged, ScrollTrigger maps scroll
progress to the active tick (active = `tokens.color.ink`/`subtle`, inactive =
`tokens.color.hint`); reduced-motion/static → the rail still renders and reflects
the section in view via `useInView` (no scrubbed motion) so it remains informative
without animation. Zero `#FF4500`. Hidden on `static-fallback` mobile if it would
crowd a small viewport (judgment — keep it desktop-spine-only is acceptable).

**Patterns to follow** — `tokens` from `frontend/src/ux/tokens.ts`
(`color.subtle #595959`, `color.hint`, `font.mono`, `weight.medium`, `radius 0`);
mono editorial chrome in `frontend/src/landing/TelemetryStrip.tsx`.

**Test scenarios**
- Covers AE4. When engaged and ScrollTrigger reports progress in stage N's range,
  the Nth tick has the active style and others do not (mock gsap/ScrollTrigger
  progress).
- Covers AE4. With reduced-motion/static, the rail still renders all stage labels
  and marks the in-view stage active via `useInView` (no animation).
- The indicator's styles contain no `#FF4500` (KTD-6 / D-099 auditable boundary).
- Renders nothing harmful when `SPINE_FLAG_ENABLED=false` (either absent or a
  plain static rail — assert no crash, no ScrollTrigger).

---

### U5. Hero "farewell" camera move (LedeHero)

**Goal** — As the hero leaves the viewport, its tusk performs a scroll-coupled
parting camera move, layered on the existing auto-rotate, driven through the
existing scene — no new render loop.

**Requirements** — R5; R9 (must not break the loop guardrail); R7.

**Dependencies** — U1, U2.

**Files**
- `frontend/src/landing/LedeHero.tsx` (modify — add one scroll-coupled camera effect)
- `frontend/src/landing/LedeHero.test.tsx` (extend)

**Approach** — Add a new effect (unconditional hook, gated body) that, when the
three gates pass, attaches a ScrollTrigger on the hero section mapping scroll
progress (as the hero exits) to a parting camera move — e.g. ease `camera.beta`
up/`radius` out and/or fade canvas opacity — by writing target values the existing
`onBeforeRenderObservable` interpolates toward, OR a `gsap.to` on a small proxy that
the existing render loop renders. **Do not** call `runRenderLoop`/`stopRenderLoop`
and **do not** add a rAF (KTD-3). Respect the existing auto-rotate observer
(`AUTO_ROTATE_RAD_PER_SEC`) — the farewell move composes with `camera.alpha`
advancement, it doesn't replace the observer. Existing engine/scene/Walrus/dwell
effects are untouched in ownership. Gate body on `isLive && SPINE_FLAG_ENABLED &&
!prefersReducedMotion()`; otherwise no ScrollTrigger (hero behaves exactly as today).

**Execution note** — Extend the existing `LedeHero.test.tsx` Babylon mock rather
than inventing a new one; add a ScrollTrigger mock alongside it.

**Patterns to follow** — the existing auto-rotate `onBeforeRenderObservable` block
and the `[isLive, inView]` pause/resume effect in `frontend/src/landing/LedeHero.tsx`;
camera framing in `frontend/src/babylon/PreviewCanvas.tsx`.

**Test scenarios**
- Covers AE3. When engaged, scrolling the hero out (simulated ScrollTrigger
  progress) drives the camera toward the parting target values (assert on the
  mocked camera's mutated props).
- Covers R9. The unit creates **no** new `runRenderLoop`/`stopRenderLoop` calls and
  no new rAF (assert the existing engine mock's loop-control spies are not called
  by this effect).
- With reduced-motion/static/flag-off, no ScrollTrigger is created and the hero
  renders identically to current behavior (regression guard).
- Under `<StrictMode>`, the camera ScrollTrigger is created once net and reverted
  on unmount (no leaked trigger).

---

### U6. LandingPage integration

**Goal** — Compose the smooth-scroll hook, section reveals, and stage indicator into
`LandingPage`, preserving document order and degrading cleanly on every gate-off
path.

**Requirements** — R1; R5; R6; R7; R8.

**Dependencies** — U2, U3, U4 (and U5 is already wired inside LedeHero).

**Files**
- `frontend/src/landing/LandingPage.tsx` (modify)
- `frontend/src/landing/LandingPage.test.tsx` (extend)

**Approach** — Wrap `<main>` content in a spine root ref, call `useSmoothScroll()`,
mount `<ScrollSpineIndicator/>`, and wrap each of the six sections (or the
appropriate subset) in `<RevealSection>`. Keep the six children in their current
document order. Do **not** introduce a CSS transform/overflow context on an ancestor
of `LedeHero` that would break its internal `position:absolute` content column —
verify the hero still frames correctly. All gate-off paths (reduced-motion, static,
flag-off, `VITE_LANDING_LIVE_WELLS=0`) must render the same page with plain native
scroll, sections visible, indicator static-or-absent.

**Patterns to follow** — child-mock + document-order assertion style in the existing
`frontend/src/landing/LandingPage.test.tsx`.

**Test scenarios**
- Covers AE6. With `useLedeRenderMode → 'static-fallback'`, the page renders all
  sections in order, visible, with no Lenis/ScrollTrigger engaged (mock the spine
  hook/components, assert no-op).
- Covers R1. The six sections remain in the existing document order with the spine
  wrappers present (extend the existing `compareDocumentPosition` assertion).
- Covers AE1/R7. With reduced-motion, the page is plain-scroll and every section is
  immediately visible.
- With `SPINE_FLAG_ENABLED=false`, the page renders identically to pre-spine
  behavior (regression guard).

---

### U7. Performance validation, browser-verify, and docs

**Goal** — Prove the spine holds the loop guardrail and frame health on the demo
machine, that the flag tree-shakes, and close out docs.

**Requirements** — R9; verifies R2/R3/R4/R5/R8 end-to-end; closes D-098/D-099 docs.

**Dependencies** — U6.

**Files**
- `docs/phase-progress.md` (end-of-session update)
- `docs/spec.md` (confirm §4 version pin landed in U1)
- (verification only — no new source)

**Approach** — Per the Frontend Verification Protocol: run `pnpm --dir frontend dev`,
drive `/` with `agent-browser` (headed if Babylon capture is needed), and walk the
full demo arc. Re-validate the **"≤2 co-visible heavy loops"** bound on the
**tallest** demo viewport during an inertial fling (the transient-overshoot risk
called out in the wells plan). Confirm: smooth scroll feels eased; reveals fire
once; the indicator tracks stages; the hero farewell move plays; reduced-motion and
a <768px viewport both yield clean plain scroll. Build with
`VITE_LANDING_SCROLL_SPINE=0` and grep `frontend/dist/` for `gsap`/`lenis` (zero
hits). Pre-wallet only — landing has no signed actions.

**Execution note** — Frontend-touching; dispatch the default 5-reviewer roster
incl. `ce-julik-frontend-races-reviewer` (scroll/rAF/observer race surface) before
declaring done.

**Test scenarios** — `Test expectation: none — verification + docs unit` (behavioral
coverage lives in U2–U6).

**Verification** — Full demo arc smooth on the demo laptop with no dropped-frame
stutter; guardrail holds on the tallest viewport; tree-shake grep clean;
`docs/ux/frontend-checklist.md` items walked (skips noted explicitly).

---

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Inertial fling transiently renders >2 heavy loops → jank | Med | High | KTD-3 (no new loop); U7 re-validates on tallest viewport; panels keep dispose policy |
| GSAP/Lenis StrictMode double-mount leaves dead/leaked instances | Med | Med | KTD-4: `gsap.context`+`revert`, symmetric Lenis create/destroy, tests under `<StrictMode>` (3 prior solution docs) |
| Spine wrapper introduces a transform/overflow ancestor that breaks LedeHero's absolute content column | Med | Med | U6 explicitly avoids transformed ancestors; browser-verify hero framing |
| Accent creep into the indicator violates D-099 | Low | Med | KTD-6 zero-accent test asserts no `#FF4500` |
| gsap/lenis ship in bundle when flag off | Low | Low | KTD-5 tree-shake gate + U7 dist grep |
| Hooks-after-early-return crash when `renderMode` flips at runtime | Low | High | All new hooks unconditional above branches (prior solution doc) |

---

## Dependencies / Prerequisites

- New npm deps: `gsap` (with `gsap/ScrollTrigger`), `lenis`. Pin latest stable at
  install, record exact versions in `docs/spec.md §4` (do not fabricate versions in
  this plan).
- Decisions D-098 (Accepted) and D-099 (Accepted) already in `docs/decisions.md`.
- The 2026-06-06 live-3D wells (`LiveWell`, `useInView`, `useLedeRenderMode`,
  `LedeHero`, the three panels) are shipped and are the substrate — treated as a
  hard contract, not modified except U5's additive hero camera effect.

---

## Deferred Implementation Notes

- Exact Lenis config (duration, easing curve, `lerp`) and the precise hero camera
  target deltas are tuning values — settle against feel on the demo machine, not in
  the plan.
- Whether ScrollTrigger drives `lenis.raf` via `gsap.ticker` or Lenis runs its own
  rAF: pick one ticker at implementation; both are valid, the constraint is "exactly
  one scroll ticker."
- Final stage-indicator labels/orientation (left rail vs top bar) — a design call
  inside U4; default is a left vertical mono rail.
- Whether any reveal should be skipped for the above-the-fold hero (it's already
  visible on load) — decide during U6 wiring.
