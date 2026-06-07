---
date: 2026-06-07
topic: landing-cinematic-scroll-spine
status: requirements
---

# Landing Cinematic Scroll Spine (Guided, Sleek Descent)

## Summary

The landing page already *moves* (auto-rotating hero tusk, animating lifecycle
panels, typewriter prompt) but it does not *guide*. Scrolling reads as a stack of
self-contained blocks the visitor must visually hunt through on their own. This
work adds a **full-page scroll spine** — smooth inertial scrolling, paced reveal
choreography, a stage indicator, and connective section-to-section transitions —
layered **on top of the existing sections** (Approach 丙). It does **not** rebuild
yesterday's live-3D wells and does **not** merge their separate Babylon canvases.

Tooling: **GSAP + ScrollTrigger + Lenis** (new dependencies — first animation
library in the project; requires an ADR).

---

## Problem Frame

The landing page is the single most evaluator-facing surface for the Sui Overflow
2026 submission. Its *content* already tells a story — carve → mint → riff, i.e.
PROMPT → MODEL → VARIANT → IN-GAME — but the *scroll experience* does nothing to
lead the eye through that story. Sections appear as disconnected wells; the visitor
supplies the narrative themselves. A judge skimming the page gets motion without
direction, and the descent feels segmented rather than sleek.

The cost is a weaker-than-necessary impression in Phase 4 (demo/pitch polish),
where the whole job is to make the working product *feel* finished and intentional.
The fix is choreography, not more features: guide the scroll so the carve→mint→riff
arc reads as one continuous, premium sequence.

---

## Requirements

**Scope framing (Approach 丙 — orchestration over existing sections)**
- R1. The change is a **scroll-orchestration layer** over the existing landing
  sections (`Masthead`, `TelemetryStrip`, `LedeHero`, `LifecycleStrip` panels,
  `ActorCards`, `KeycapRow`). The live-3D wells shipped 2026-06-06 keep their
  current contents and their separate per-well canvases — unchanged.

**Smooth scroll**
- R2. The full landing scrolls with **eased, inertial smooth-scroll** (Lenis).
  It feels sleek/weighted, not the browser's default step scroll.

**Reveal choreography**
- R3. Each major section **reveals on scroll-in** via a restrained, eased entrance
  (fade + small translate and/or caption typeset). The reveal fires **once per
  entry** — scrolling back up and down again must not jar-replay it. No bouncy /
  overshoot / spring "slop"; easing stays within the brutalist-restraint read.

**Stage indicator (the spine)**
- R4. A persistent, restrained **stage indicator** shows where the visitor is in
  the carve→mint→riff arc (which lifecycle stage). Form (side rail / top progress
  bar / section dots) is a design decision deferred to planning, but it must be
  D-044-restrained (mono, no extra accent spend).

**Connective transitions**
- R5. Leaving the hero, the tusk performs an **in-scene "farewell" camera move**
  (a Babylon camera animation tied to scroll position), and the next section
  **enters connectedly** (cross-fade / wipe). This is per-scene orchestration —
  **not** a single 3D object physically traveling across canvases.
- R6. The lifecycle stages (PROMPT → MODEL → VARIANT → IN-GAME) read as a **guided
  progression** as the visitor scrolls; the stage indicator (R4) tracks the
  current stage.

**Accessibility & fallback**
- R7. `prefers-reduced-motion` collapses **all** scrubbed/eased motion to plain,
  instant section visibility + native scroll. No content is gated behind motion.
  (Model: the existing `TypewriterPrompt` reduced-motion handling.)
- R8. Mobile / low-WebGL visitors (existing `useLedeRenderMode` gate, <768px or no
  WebGL) get a **clean plain vertical scroll** — heavy pin/scrub effects are
  desktop-only; the existing static-fallback wells are untouched.

**Performance & guardrails**
- R9. The orchestration must **not** break the existing render-loop guardrail:
  no two Babylon scenes run their render loops simultaneously (the prior
  brainstorm's R9). Lenis/GSAP rAF must coexist with Babylon's render loop
  without scroll jank or dropped frames on the demo laptop.
- R10. **Design fidelity:** the spine stays within D-044 — restrained easing,
  mono type, and the ≤5 `#FF4500` accents-per-page budget is **not** consumed by
  the spine. If any motion language or accent exceeds the tokens, capture it in a
  scoped ADR (modeled on D-091 / D-093), not silently.

---

## Acceptance Examples

- AE1. **Covers R2, R7.** A desktop visitor scrolls and motion is inertial/eased;
  a visitor with `prefers-reduced-motion` gets instant native scroll with every
  section and CTA still reachable.
- AE2. **Covers R3.** A section below the fold animates in **once** when first
  scrolled to; scrolling up past it and back down does not jar-replay the entrance.
- AE3. **Covers R5.** Scrolling past the hero, the tusk's camera performs a
  farewell move tied to scroll position, and the following section enters as a
  connected transition (not a hard cut).
- AE4. **Covers R4, R6.** At any scroll position the stage indicator reflects the
  current stage of the carve→mint→riff arc.
- AE5. **Covers R9.** With smooth-scroll + reveals + camera transitions all active,
  no two Babylon render loops run at once and the page holds frame rate on the
  demo laptop.
- AE6. **Covers R8.** On a <768px / no-WebGL visit, the page is a clean vertical
  scroll with the static-fallback wells; no broken pins, no empty canvases.

---

## Success Criteria

- A judge scrolling the landing is **led** through carve→mint→riff without hunting
  for each block; the descent reads as one guided, sleek sequence.
- The page still reads as the **deliberate brutalist Tusk3D identity**, not a
  generic animated marketing scroll-show — "sleek" came from easing/pacing/restraint,
  not from effect volume.
- Smooth (no visible jank/dropped frames) on a typical demo laptop; clean,
  complete static page on mobile and under `prefers-reduced-motion`.
- `ce-plan` can decompose this into GSAP/Lenis integration + per-section
  ScrollTrigger work without re-deciding *what* is guided or *whether* the wells
  are rebuilt.

---

## Scope Boundaries

- **Approach 乙 (merge canvases / single pinned cross-lifecycle scene)** — rejected:
  too large a rebuild of yesterday's just-shipped wells with real jank/perf risk
  14 days from submission.
- **Rebuilding or altering the live-3D wells' contents** — out; the 2026-06-06 work
  stays as-is. This layer only orchestrates around them.
- **Cross-canvas object flight** (one tusk physically moving between separate
  scenes) — out; "baton pass" is DOM orchestration + in-scene camera moves only.
- **New accent colors or a motion language beyond the design tokens** — out unless
  captured in a scoped D-044 ADR.
- **Backend / contract / Walrus changes** — none; pure frontend landing change.
- **Other routes** — `/track` (Rage Racing) and inner app routes are out of scope;
  this is landing (`/`) only.

---

## Key Decisions

- **Approach 丙 (orchestration layer), not 乙 (rebuild)**: gets the guided/sleek read
  while keeping the change shippable and low-risk in Phase 4; preserves the
  separate-canvas architecture and its render-loop guardrail.
- **GSAP + ScrollTrigger + Lenis**: user-chosen toolkit. ScrollTrigger for
  scrubbed reveals/transitions, Lenis for smooth inertial scroll. Accepted cost: the
  project's first animation dependencies — requires an ADR (the project is
  deliberately animation-lib-free; D-007 chose imperative Babylon to avoid
  abstraction, so a new dep is a real decision, not a default).
- **Baton-pass = per-scene camera move + DOM transition**, not cross-canvas flight:
  honest to the current separate-canvas, lazy-mounted architecture.
- **Restraint is a requirement, not a nicety**: the spine must not turn the
  deliberate brutalist page into a generic marketing scroll-show; easing and accent
  budget are bounded by D-044.

---

## Dependencies / Assumptions

- **New dependencies:** `gsap` (with the ScrollTrigger plugin) and `lenis`. ADR
  required before/with implementation.
- **ADR(s) required:**
  - One adopting GSAP + Lenis (first animation library in the project; weigh against
    D-007's minimal-abstraction ethos).
  - A scoped D-044 motion decision (modeled on D-091 / D-093): either confirm the
    spine fits "appearance-is-the-motion," or grant a bounded exception with the
    accent budget explicitly preserved.
- **Reuse, don't replace:** the existing `useLedeRenderMode` (≥768px + WebGL gate),
  `useInView` (IntersectionObserver), and `TypewriterPrompt`'s reduced-motion
  pattern are the foundations this layers on.
- **Demo environment:** Chrome on a laptop (so CSS scroll-driven features exist,
  but GSAP/Lenis are the chosen path for cross-state control).
- Vite SPA (no SSR), so Lenis init timing is client-only — confirm mount ordering.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R9][Technical] Lenis + Babylon rAF coordination: a single shared rAF
  driving both, vs. two independent loops — resolve against measured smoothness on
  the demo machine.
- [Affects R3, R5][Technical] Whether ScrollTrigger **pinning** is used at all, or
  only scrubbed reveals/transitions (pinning is the highest jank risk alongside a
  live WebGL canvas).
- [Affects R4][Design] Stage-indicator form: fixed side rail vs. top progress bar
  vs. section dots — pick in a design pass within D-044 restraint.
- [Affects R5][Technical] Exact farewell-camera choreography per section, and how
  scroll position maps to camera animation without fighting the hero's existing
  auto-rotate.
- [Affects R10][Decision] Whether the spine can be done with **zero** accent spend,
  or needs a bounded accent exception (drives whether the scoped ADR is "no change"
  or "exception").
