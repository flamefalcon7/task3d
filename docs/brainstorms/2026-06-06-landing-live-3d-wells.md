---
date: 2026-06-06
topic: landing-live-3d-wells
---

# Landing Live-3D Wells (Hero + Lifecycle Strip)

## Summary

Upgrade the five visual "wells" on the landing page from a mix of static render + static SVGs into live Babylon scenes, while keeping the existing D-044 brutalist-editorial frame (mono headers, layer captions, tagline) unchanged. The hero becomes an auto-rotating Blender-style viewport of the tusk; the four lifecycle panels (PROMPT / MODEL / VARIANT / IN-GAME) animate to *show* the pipeline instead of describing it.

---

## Problem Frame

The landing page is the single most evaluator-facing surface for the Sui Overflow 2026 submission. It currently *tells* the visitor that Tusk3D is a 3D-model generation product — the hero is a framed, non-interactive render and the four-stage lifecycle strip below it is deliberately static SVG art (plan-023 KD-1/AC-6 made it pure-presentational on purpose). A judge skimming the page has to *read* the captions to understand that this is a live 3D creation-and-remix tool; nothing on screen moves or behaves like one.

The cost is a weak first impression in the exact place where "this is real, working 3D" needs to land in two seconds. The product's whole pitch — generate a model, fork it into variants, drop it into a game — is inherently visual and motion-friendly, yet the page renders it as a still life.

---

## Requirements

**Scope framing (direction B)**
- R1. The change is confined to the *contents inside* the wells. The surrounding editorial chrome — mono section headers, `layer` sub-captions (INPUT / L1 / L2 / L3), the closing tagline, page layout — stays as-is. No page-wide redesign toward a 3D-IDE aesthetic.
- R2. All five wells reuse a single tusk model: `Downloads/tusk.glb` is copied into `frontend/public/` and replaces the current `walrus-tusk.glb` as the hero/panel source.

**Hero well**
- R3. The hero renders the tusk in a Blender-style viewport *look*: grey background (replacing the current black), a ground grid mesh, an XYZ axis indicator, and a camera/orientation gizmo — all rendered inside the canvas.
- R4. The tusk auto-rotates slowly and continuously. It is **not** user-draggable (no orbit controls); the framed composition is preserved.

**Lifecycle panels (PROMPT / MODEL / VARIANT / IN-GAME)**
- R5. **PROMPT** panel types out `"a low-poly walrus tusk"` character-by-character with a blinking cursor, pauses on completion, then loops. Text-only — no Babylon scene.
- R6. **MODEL** panel renders the live tusk split vertically: one half shaded solid, the other half wireframe overlay, slowly rotating with the split held (the half-and-half reads continuously as the camera turns).
- R7. **VARIANT** panel shows exactly **three** tusks in different colors (a triptych), conveying "same model, three forks." Instances share geometry.
- R8. **IN-GAME** panel places the tusk in a neutral, minimal game scene (ground tile + soft shadow). The tusk *spawns in* with a visual effect (particles / glow build-up) and holds an emissive glow, then loops the entrance. Not tied to Rage Racing or any /track asset.

**Performance & fallback**
- R9. The three Babylon panels (MODEL, VARIANT, IN-GAME) plus the hero must never all run their render loops simultaneously. Each panel scene mounts/starts only when scrolled into view and pauses (or tears down) its render loop when off-screen.
- R10. On devices that fail the existing live-render gate (viewport < 768px or no WebGL), the panels fall back to the current static SVGs (`model.svg`, `variant.svg`, `in-game.svg`) and PROMPT stays as static text — reusing the established `static-fallback` path, not a new mechanism.

---

## Acceptance Examples

- AE1. **Covers R5, R9.** Given the PROMPT panel is below the fold, when the user scrolls it into view, the typing animation starts from an empty string (not mid-word or pre-completed).
- AE2. **Covers R9.** Given the MODEL panel has been scrolled past and is now off-screen, when it leaves the viewport, its render loop stops (verifiable: no continuous rAF/GPU work for that canvas while off-screen).
- AE3. **Covers R6.** Given the MODEL tusk is rotating, at any rotation angle the panel still presents a solid region and a wireframe region (the split is a stable visual property, not a one-frame pose).
- AE4. **Covers R8.** Given the IN-GAME panel enters view, when the spawn VFX completes, the tusk remains visibly glowing and the entrance effect loops rather than playing once and going inert.
- AE5. **Covers R3, R4, R10.** Given a desktop visitor with WebGL, the hero shows a grey gridded viewport with an auto-rotating tusk and a visible axis/gizmo; given a mobile visitor, the hero shows the static keyframe image instead.

---

## Success Criteria

- A first-time visitor on desktop understands "this is a live 3D generate-and-remix tool" from motion alone, before reading any caption.
- The landing page stays smooth (no visible stutter / dropped frames) on a typical demo laptop — the live wells read as polished, not janky. Jank here would be worse than the current static state.
- Mobile and low-end visitors still get a clean, complete page via the existing static fallback — no broken canvases or empty wells.
- `ce-plan` can decompose this into Babylon component work without having to re-decide *what* each well shows or *whether* it's live.

---

## Scope Boundaries

- **Page-wide redesign (Approach A)** — turning the whole landing into a 3D-IDE visual language is rejected; only well contents change.
- **Draggable / orbitable hero** — explicitly out; hero is auto-rotate only.
- **Rage Racing / dev-glbs diorama for IN-GAME** — the tusk is *not* placed into the /track game world or a multi-prop scene (truck/character) for v1. Possible later enhancement.
- **A true "sixteen forks" grid** — VARIANT is three, not a 4×4 grid of live instances.
- **Backend / contract / Walrus changes** — none; this is a pure frontend landing-visual change. (Note: hero currently attempts a Walrus blob fetch before falling back to the embedded GLB — see Outstanding Questions for whether that path is kept.)

---

## Key Decisions

- **Direction B (well-contents only), not A (page-wide pivot)**: keeps the change shippable 15 days from submission and avoids destabilizing the established D-044 editorial identity across the whole page.
- **Hero auto-rotates but is not draggable**: gets the "live 3D tool" signal without reopening input edge cases or the per-frame cost of an always-interactive scene, and preserves the framed composition.
- **VARIANT = 3 tusks, not a grid**: cleaner triptych read and lighter than the original "sixteen forks" concept; instancing keeps it to one geometry load.
- **IN-GAME is a neutral scene, not Rage Racing**: avoids coupling the landing panel to /track's assets and look while still conveying "usable game object"; the spawn VFX + glow carries the "alive in a game" feeling.
- **Lazy-mount via viewport visibility**: prevents 4 concurrent WebGL contexts/render loops on the most important page; reuses the spirit of the hero's existing live/static gating.
- **Reuse the established static-fallback path**: low-end/mobile keeps working with the SVGs already in `frontend/public/lifecycle/` rather than introducing a second fallback system.

---

## Dependencies / Assumptions

- `Downloads/tusk.glb` (≈345KB) is the intended canonical model and is clean enough (manifold, low-poly) to render as wireframe and as multiple instances without artifacts.
- The existing `useLedeRenderMode` gate (≥768px + WebGL) is the right gate to reuse for the panels, not just the hero.
- Two ADRs are required before/with implementation:
  - One reversing **plan-023 KD-1/AC-6** (LifecycleStrip was deliberately static "no state, no effects, no Babylon" → now live).
  - One granting a **scoped D-044 exception** for the landing live-3D wells (grey viewport, continuous motion, emissive glow all deviate from brutalist black-well / zero-accent / "appearance-is-the-motion" rules), modeled on **D-091**'s scoped exemption for /track Rage Racing.
- Existing landing tests assert the strip is static / Babylon-free and assert zero #FF4500 accent; these will need updating alongside the change.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R9][Technical] Per-panel teardown strategy: pause the render loop while keeping the WebGL context warm, vs. fully dispose on exit and re-init on re-entry. Trade-off is re-init latency vs. held GPU memory; resolve against measured smoothness on the demo machine.
- [Affects R3][Technical] Whether the grid/axis/gizmo use Babylon's built-in helpers (e.g. axis/grid utilities, `AxesViewer`) or custom meshes to match the desired Blender look within D-044 restraint.
- [Affects R8][Technical] VFX implementation for the spawn/glow (particle system vs. shader/emissive pulse vs. fade+scale-in) and its perf cost on a looping panel.
- [Affects R2][Needs research] Whether the hero keeps its current Walrus-blob-fetch-then-embedded-fallback flow with the new tusk, or simplifies to the embedded GLB only for the landing (the Walrus-live caption is part of the current data-layer story).
- [Affects R6][Technical] How to render the solid/wireframe split on a single mesh (two-material split, clip plane, or duplicated mesh with opposing wireframe flags).
