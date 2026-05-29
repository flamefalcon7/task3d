---
title: Tusk3D Landing S4 — Lifecycle Strip (PROMPT → MODEL → VARIANT → IN-GAME)
type: feat
status: completed
date: 2026-05-29
origin: docs/brainstorms/2026-05-29-s4-lifecycle-strip-requirements.md
---

# Tusk3D Landing S4 — Lifecycle Strip (PROMPT → MODEL → VARIANT → IN-GAME)

**Plan depth:** Standard (3 units, ~0.5–1 dev day)
**Origin:** `docs/brainstorms/2026-05-29-s4-lifecycle-strip-requirements.md` (Approved)
**Adjacent shipped work:** plan-019 (S1 LedeHero), plan-021 (S2 TelemetryStrip), plan-020 (S6 KeycapRow), plan-022 (S7 Masthead). Mirrors their `frontend/src/landing/` component + CSS-module + colocated-test convention.

---

## Problem Frame

The landing page (`frontend/src/landing/LandingPage.tsx`) shows *what* Tusk3D is (S1 live tusk), *that* it's deployed (S2 telemetry), and *where to go* (S6 keycaps) — but nothing explains the **pipeline**. S4 adds a full-width 4-panel static strip teaching the lifecycle as a left-to-right visitor narrative — **PROMPT → MODEL → VARIANT → IN-GAME OBJ** — with the on-chain layer as a mono sub-caption per panel. It is chosen specifically because it is a **compound asset**: the same source visuals are authored to also feed the README architecture diagram, a pitch-deck slide, and the demo-video opening (origin KD-5), serving the user's priority of leaving runway for deck + demo.

Display-only, frontend-local. No backend / Move / shared-types changes.

---

## Scope Boundaries

**In scope:**
- 4 static panel visuals (SVG assets) derived from the shared tusk silhouette in `frontend/public/lede/tusk-keyframe.svg`, zero-accent.
- A new `LifecycleStrip` component + CSS module rendering the 4 panels + the Newsreader-italic tagline.
- Mount between `<LedeHero />` and `<KeycapRow />` on `LandingPage`; extend the doc-order test.

**Deferred to Follow-Up Work** (origin KD-5 — consume the asset downstream; not S4):
- Replacing the stale README architecture ASCII block with the strip visual.
- A pitch-deck slide built from the same source.
- The demo-video opening shot.
- Refreshing panel art once a real minted tusk exists (origin KD-7 — panels are illustrative; not blocked on the pending mint).

**Non-goals** (origin):
- Live Babylon rendering of any panel (KD-1) — no `<canvas>`, no Babylon import, no Walrus fetch in the strip.
- Any Access / Seal / "Derivative" messaging (KD-3 — v1.1 / unshipped).
- Panel 4 depicting the `/track` racing demo — it's an explicitly neutral "any engine" scene.
- Any `#FF4500` accent (KD-6 — site budget 5/5 full).

---

## Key Technical Decisions

**KTD-1 — Panel art = standalone SVG asset files, not inline JSX.**
Author panels 2/3/4 as standalone `.svg` files under `frontend/public/lifecycle/`, referenced from the component via `<img src="/lifecycle/...">` (the same pattern S1 uses for `STATIC_KEYFRAME_URL = '/lede/tusk-keyframe.svg'`). Rationale: the compound-asset goal (KD-5) needs a reusable source-of-truth that exports to README/deck/demo — a standalone SVG opens, screenshots, and embeds anywhere; inline JSX SVG does not. Panel 1 (PROMPT) is just mono text in a black well → plain styled HTML in the component (no SVG needed), though it still reads as a panel.

**KTD-2 — All panels derive from the one tusk silhouette.**
`frontend/public/lede/tusk-keyframe.svg` already contains a reusable tusk path (`M 360 540 Q 480 200 760 220 …`) on a black well. The 4 panels are framings of that single shape — one drawing, four contexts — which is what makes the strip a coherent compound asset:
- Panel 2 MODEL: the silhouette with a model↔mesh suggestion (e.g. solid-fill left half → wireframe-stroke right half). **No orange sweep line** (the keyframe's `#FF4500` marker is dropped — KD-6).
- Panel 3 VARIANT: a small grid (e.g. 4×2 or 4×4) of the silhouette repeated with different *ink/paper* stroke treatments (recolor implied via line weight / fill, still zero-accent).
- Panel 4 IN-GAME: the silhouette floating above a neutral floor line + horizon (generic engine scene).

**KTD-3 — Layer sub-captions are fixed strings; no drift.**
Exactly per origin KD-2 / AC-3: `INPUT · Tripo`, `L1 · Model3D`, `L2 · NftToken`, `L3 · Integration`. The strings `Access`, `Seal`, `Derivative` must appear nowhere in the component or assets (AC-3). A test asserts these four captions verbatim and asserts the forbidden strings are absent.

**KTD-4 — Reuse D-044 tokens + the KeycapRow CSS-module pattern.**
Pull `paper` / `ink` / `border.primary` (1.5px solid #000) / `font.mono` / `font.display` from `frontend/src/ux/tokens.ts`. Headers in JetBrains Mono uppercase; tagline in Newsreader italic. 1.5px black dividers between panels, 0 radius, no transition — mirror `frontend/src/landing/KeycapRow.module.css` (which already does a 4-column grid with 1.5px borders + a 767px mobile breakpoint).

**KTD-5 — Mobile: 4 panels stack at ≤767px.**
Desktop = 4-column row; mobile (≤767px, matching KeycapRow's breakpoint) = stack vertically (or 2×2), no horizontal overflow of the strip (AC-7).

No ADR required — conventional static UI, no new build pattern or dependency (contrast S7's build-time injection / D-072).

---

## Implementation Units

### U1. Author the 4 panel SVG assets

**Goal:** Produce the static panel art — the reusable compound-asset source — derived from the shared tusk silhouette, zero-accent.

**Requirements:** KD-1, KD-2, KD-5, KD-6, KD-7 (origin); KTD-1, KTD-2.

**Dependencies:** none.

**Files:**
- `frontend/public/lifecycle/model.svg` — panel 2 (silhouette + model↔mesh suggestion, no orange).
- `frontend/public/lifecycle/variant.svg` — panel 3 (grid of recolored silhouettes).
- `frontend/public/lifecycle/in-game.svg` — panel 4 (silhouette + neutral floor/horizon).
- (Panel 1 PROMPT is HTML in the component — no asset file; see U2.)

**Approach:** Derive each from the tusk path in `frontend/public/lede/tusk-keyframe.svg`. Black well (`#000`) background, `#F5F5F0` strokes, JetBrains-Mono captions inside the art kept minimal (the panel's mono header + layer caption live in the component, not baked into the SVG, so captions stay editable and testable — KTD-3). Square viewBox-ish per panel so they tile evenly. Author for standalone reuse (each opens cleanly as its own file for README/deck). **Zero `#FF4500`.**

**Patterns to follow:** `frontend/public/lede/tusk-keyframe.svg` (existing brutalist SVG: black rect + `#F5F5F0` stroke paths, mono caption, `role="img"` + `aria-label`).

**Test scenarios:** `Test expectation: none — static asset files (SVG markup), no behavioral logic.` Coverage of their *rendering* (correct `<img>` wiring, alt text) lives in U2's component test.

**Verification:** the 3 SVGs render as recognizable tusk line-art on a black well at panel size; none contains `#FF4500` / `#ff4500` (grep); each has a descriptive `aria-label`.

---

### U2. LifecycleStrip component + CSS module + test

**Goal:** Render the 4-panel strip — mono header + black-well visual + layer sub-caption per panel, plus the Newsreader-italic tagline.

**Requirements:** AC-2, AC-3, AC-4, AC-5, AC-6, AC-8 (origin); KTD-1, KTD-3, KTD-4, KTD-5.

**Dependencies:** U1 (consumes the SVG assets).

**Files:**
- `frontend/src/landing/LifecycleStrip.tsx` — new component, `data-testid="lifecycle-strip"`.
- `frontend/src/landing/LifecycleStrip.module.css` — new CSS module mirroring `KeycapRow.module.css` (4-col grid, 1.5px borders, mobile stack).
- `frontend/src/landing/LifecycleStrip.test.tsx` — new colocated test.

**Approach:** A static, presentational component — no props, no state, no effects, no imports from `@babylonjs/*`, no Walrus fetch (AC-6). A `PANELS` constant array of `{ header, layerCaption, visual }` where panel 1's visual is styled mono text (`"a low-poly walrus tusk, ornate carve"`) in a black well and panels 2–4 are `<img>` to the U1 assets with alt text. Panel headers via `tokens.font.mono` uppercase; layer captions via `tokens.font.mono`; tagline `"One prompt. One model. Sixteen forks. Every game."` via `tokens.font.display` italic below the grid. Use `import { type JSX } from 'react'` (the S7 fix — avoids the baseline `JSX` namespace error).

**Technical design** (directional, not implementation spec):
```
<section data-testid="lifecycle-strip">
  <div class="grid">
    {PANELS.map(p =>
      <article data-testid={`lifecycle-panel-${p.key}`}>
        <span class="header">{p.header}</span>        // mono, e.g. PROMPT
        <div class="well">{p.visual}</div>             // text (panel 1) | <img> (2–4)
        <span class="layer">{p.layerCaption}</span>    // mono, e.g. L1 · Model3D
      </article>
    )}
  </div>
  <p class="tagline">One prompt. One model. Sixteen forks. Every game.</p>
</section>
```

**Patterns to follow:** `frontend/src/landing/KeycapRow.tsx` (array-driven panels, `data-testid` convention, no-transition CSS) and `KeycapRow.module.css` (grid + 1.5px borders + 767px breakpoint). `frontend/src/landing/Masthead.tsx` for the `import { type JSX }` idiom.

**Test scenarios:**
- Covers AC-2. Renders 4 panels with headers PROMPT, MODEL, VARIANT, IN-GAME OBJ in that document order.
- Covers AC-3. The four layer captions render verbatim: `INPUT · Tripo`, `L1 · Model3D`, `L2 · NftToken`, `L3 · Integration`.
- Covers AC-3 (forbidden strings). The rendered output contains none of `Access`, `Seal`, `Derivative` (case-insensitive).
- Covers AC-4. The tagline `One prompt. One model. Sixteen forks. Every game.` renders.
- Covers AC-6 (static guarantee). The component renders no `<canvas>` element; panels 2–4 are `<img>` with non-empty `alt`. (Babylon-import / Walrus-fetch absence is structurally guaranteed by the component having no such imports — assert no `<canvas>` as the observable proxy.)
- Covers AC-5. No element in the rendered tree carries `#FF4500` / `#ff4500` in an inline style; no accent-dot testid present.
- Edge: panel 1's prompt text renders inside the strip (not truncated to empty).

**Verification:** `LifecycleStrip.test.tsx` passes; manual/browser check shows 4 panels, correct captions, italic tagline, black-on-paper, zero accent.

---

### U3. Mount in LandingPage + extend doc-order test

**Goal:** Place `<LifecycleStrip />` between `<LedeHero />` and `<KeycapRow />`, and update the composition test.

**Requirements:** AC-1 (origin); KTD (mount position).

**Dependencies:** U2.

**Files:**
- `frontend/src/landing/LandingPage.tsx` — import + mount `<LifecycleStrip />` between `<LedeHero />` and `<KeycapRow />`; update the `{/* S4 lifecycle strip — future survivor plan */}` placeholder comment.
- `frontend/src/landing/LandingPage.test.tsx` — extend the doc-order assertion to `Masthead → TelemetryStrip → LedeHero → LifecycleStrip → KeycapRow`. Add a `vi.mock('./LifecycleStrip', …)` stub mirroring the existing LedeHero/TelemetryStrip/Masthead stubs (keeps the order test free of the SVG `<img>` loads).

**Approach:** Minimal composition-root edit. Stub `LifecycleStrip` at the module boundary in the test, consistent with the other landing-child stubs.

**Patterns to follow:** existing `vi.mock` stubs + `compareDocumentPosition` chain in `frontend/src/landing/LandingPage.test.tsx` (extended once already in plan-022 for Masthead).

**Test scenarios:**
- Covers AC-1. `lifecycle-strip` testid present inside `landing-page`.
- Covers AC-1. Document order is `Masthead → TelemetryStrip → LedeHero → LifecycleStrip → KeycapRow` (extend the existing `compareDocumentPosition` chain).

**Verification:** `LandingPage.test.tsx` passes; full `pnpm --dir frontend test` green; `tsc -b` clean net of the known pre-existing baseline (32 errors).

---

## Verification Strategy

- All three units land with passing colocated tests; full frontend vitest suite green (current baseline ~710 + new LifecycleStrip cases).
- `tsc -b` introduces no new errors beyond the documented pre-existing baseline (32).
- Browser-verify at `/` per CLAUDE.md Frontend Verification Protocol: the strip renders between the lede and the keycap row with 4 panels, correct headers + layer captions, italic tagline, black-on-paper, **zero accent**, and the 3 tusk SVGs visible. Mobile 375px: panels stack, no strip overflow. (Strip is structurally contained to LandingPage → full demo-arc check scoped to `/`, noted not silently skipped.)
- Grep gate: no `#FF4500` and none of `Access`/`Seal`/`Derivative` in the new component + assets.

---

## Review Roster

Frontend-touching plan → default 5-reviewer parallel roster per CLAUDE.md: `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`, `ce-julik-frontend-races-reviewer`. (As with S7, the component has no async/effects/state, so julik-races will likely find little — included for roster completeness. The adversarial lens is most useful here on the layer-caption accuracy / unshipped-mechanic risk, AC-3.)

---

## Deferred to Follow-Up Work

- Consume the strip SVGs in the README architecture diagram (replacing the stale ASCII block + outdated `/forge` routes), a pitch-deck slide, and the demo-video opening (origin KD-5).
- Refresh panel art from a real minted tusk once Rick's Tripo mint lands (origin KD-7).
- Optional composite full-strip SVG export if the README/deck wants the whole strip as one embeddable file.
