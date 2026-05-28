---
date: 2026-05-28
topic: tusk3d-landing-lede
---

# Tusk3D Landing Lede (S1)

## Summary

A live Babylon canvas at the top of `/` renders a walrus-tusk model with a sweeping mesh-vs-shaded gradient that visualizes the "Carve" verb, fetched live from Walrus and resilient via a static-SVG fallback for mobile/WebGL-incapable clients and an embedded-GLB fallback for Walrus-fetch timeout. The same Babylon scene's pre-rendered key-frame SVG supplies the page identity mark (S3) and the lifecycle strip's MODEL panel (S4 panel 2), and also serves the OG card, Twitter card, pitch-deck opener, and README hero — one frame, six surfaces.

---

## Problem Frame

The current `/` route is `BrowsePage` — a catalog grid with editorial copy that explains the three-tier composable creator economy in prose. Two pains converge on this surface as the Sui Overflow 2026 submission approaches (deadline 2026-06-21, Walrus track):

**Judges screencap, judges don't watch.** Track judging guidance emphasizes working-product proof over pitch narrative. Static prose plus marketplace cards do not survive a thumbnail-sized screenshot; they read as "another Walrus submission, generic." 2025 Walrus-track winners all used Devfolio-style undifferentiated landing pages, leaving a visible competitive gap for visual differentiation.

**The product name "Tusk3D" (D-068) has no visual anchor.** Brand identity exists only in typography (Newsreader italic wordmark). No reusable visual mark exists for OG cards, social posts, pitch decks, or any artifact downstream of the landing. Naming the brand for a sharp distinctive 3D-content mark and then having no actual mark is a coherence gap.

The lede (S1) of the new landing — the surface above the fold, where the judge's eye and the screencap framing both land — is the highest-leverage place to address both pains together. It needs to be visually distinct in 2026 hackathon-submission visual space and provide a brand mark that survives compression to any size.

---

## Actors

- A1. **Visitor / judge.** Lands on `/`, dwells on the lede, may or may not interact. Primary screencap source. Skims rather than reads; first ~3 seconds determine continued attention.
- A2. **Asset producer (Rick).** One-time pre-flight: runs Tripo prompt-mode at `/create` to publish the canonical Tusk3D walrus tusk as L1 Collection #001, then forks 4 monochrome variants via `/launch`. The lede consumes the resulting Walrus blob CID + Sui chain artifacts.

---

## Key Flows

- F1. **Desktop visitor with WebGL — happy path**
  - **Trigger:** User opens `/` on a viewport ≥ 768px with WebGL support
  - **Actors:** A1
  - **Steps:** Babylon canvas mounts → tusk GLB fetched from Walrus → scene begins (tusk rotates ~6s loop, gradient sweep across surface) → caption renders below canvas with chain artifact metadata → 15s of no interaction triggers slide-up CTA "fork your own →" linking to `/launch`
  - **Outcome:** Visitor sees a frame-0-paint screencap-ready visual; can stop, screenshot, share, or click the CTA
  - **Covered by:** R1, R2, R3, R8, R9, R12

- F2. **Mobile or WebGL-unavailable visitor — fallback path**
  - **Trigger:** Viewport < 768px OR WebGL/EdgesRenderer not supported
  - **Actors:** A1
  - **Steps:** Static SVG (the key-frame export) renders in place of the canvas → caption still renders below → no rotation, no gradient sweep, no dwell CTA
  - **Outcome:** Visitor sees the canonical frozen frame; visual quality matches a screencap of the desktop frozen frame
  - **Covered by:** R10, R11

- F3. **Live Babylon scene with Walrus fetch timeout — degraded happy path**
  - **Trigger:** Babylon scene mounted on capable client, but Walrus blob fetch exceeds ~3s
  - **Actors:** A1
  - **Steps:** Timeout fires → embedded GLB asset (bundled with frontend) loads in place → Babylon scene continues with the embedded model → caption still shows the canonical Walrus CID (the bundled GLB is byte-identical to the blob)
  - **Outcome:** Visitor sees the live scene with no visible failure; "live from Walrus" credibility partial in this session but happy path remains the dominant case
  - **Covered by:** R10, R13

- F4. **Asset producer pre-flight — one-time setup**
  - **Trigger:** Before the landing ships, the canonical L1 Collection must exist on testnet
  - **Actors:** A2
  - **Steps:** Drive Tripo at `/create` with the locked prompt until output meets the asset spec → publish as L1 Collection #001 → drive `/launch` to fork 4 monochrome NftToken variants → record the blob CID and mint timestamp in the landing's static caption content
  - **Outcome:** Walrus blob exists, Sui Collection #001 + 4 NftTokens exist on testnet, landing's caption metadata is grounded in real chain artifacts
  - **Covered by:** R6, R7, R16

---

## Requirements

**Visual identity & rendering**

- R1. The lede renders a single 3D walrus tusk in a pure-black well centered above the fold.
- R2. The tusk rotates continuously on a ~6 second loop while the canvas is mounted.
- R3. A model-to-mesh gradient sweeps across the tusk surface as part of the same ~6s loop, transitioning visually between PBR-shaded representation on one side of a sweep line and edges-only line-drawing representation on the other side.
- R4. The gradient is implemented as the visual signature of the "Carve" verb (per D-068 tagline "Carve. Mint. Riff.") and recurs as the unifying motif across S1 lede, S3 identity mark, and S4 panel 2 of the lifecycle strip.
- R5. The visual style of the line-drawing side targets academic / scientific-illustration aesthetic (silhouette + crease edges only, not raw wireframe), aligned with D-044 brutalist editorial.

**Asset & data sources**

- R6. The canonical 3D asset is a Tripo-generated low-poly walrus tusk produced via the locked prompt: faceted geometry, clean topology, no surface texture, abstract specimen, geometric study. Poly target 5,000–15,000 triangles.
- R7. The asset is published through the production `/create` route as L1 Collection #001 on testnet, and forked via `/launch` into 4 monochrome NftToken variants (cream, ivory, pale grey, pure black tonal direction; specific hex values deferred to planning).
- R8. The Babylon scene fetches the tusk GLB live from Walrus at page load on capable clients, using the recorded Collection #001 blob CID.
- R9. A static caption renders directly below the canvas in JetBrains Mono, three lines, containing: L1 Collection identifier and the locked prompt text; "live from Walrus" anchor and the blob CID (truncated); mint date and "Tusk3D testnet" anchor. Caption content is static (no runtime Sui RPC query) because the underlying chain artifacts are immutable.

**Fallback & resilience**

- R10. The system distinguishes two fallback layers that compose orthogonally: a viewport/capability layer that decides whether to mount Babylon at all, and an asset-fetch layer that handles Walrus failures while Babylon is running.
- R11. **Viewport / capability fallback.** When the viewport is below 768px width OR WebGL is unavailable OR EdgesRenderer is unsupported, the canvas is not mounted. Instead, the page renders a static SVG export of the canonical key frame (3/4-angle tusk, gradient frozen at ~45% sweep position) in place of the canvas, with the same caption rendered below.
- R12. **Walrus timeout fallback.** When Babylon is mounted, the Walrus fetch has a ~3 second timeout. On timeout, the system loads an embedded GLB asset (bundled with the frontend) and continues the live scene with the bundled model. Caption content remains unchanged.
- R13. The embedded GLB is the canonical Tusk3D walrus tusk byte-identical to the Walrus blob; bundle size impact is accepted as a tradeoff for fallback continuity.

**Interaction & CTA**

- R14. After 15 seconds of no interaction with the page, a CTA strip slides up from below the canvas with a single accent-colored link "fork your own →" pointing to `/launch`.
- R15. The CTA does not appear on the viewport/capability fallback path (R11) — mobile visitors see only the canonical frozen frame.
- R16. The accent color (`#FF4500` per D-044) is rationed: this CTA consumes one of the ≤5 accent instances allowed per page. The remaining budget is shared with the S2 telemetry live indicator and the S6 dispatch row `[BROWSE]` keycap marker.

**Reuse architecture**

- R17. The Babylon scene configuration (camera framing, lighting, mesh-loading code, gradient sweep parameters) lives in a single shared component. The lede consumes it as the live runtime instance.
- R18. S3 identity mark and S4 panel 2 do NOT mount Babylon at runtime. They consume pre-rendered SVG snapshots exported from the same Babylon scene configuration at design time.
- R19. S3's "different variant per page-load" behavior is implemented by storing 4 pre-rendered SVGs (one per variant) and randomly selecting one at page load, not by re-rendering live.

**Key-frame design (canonical static export)**

- R20. The key frame freezes the tusk at a 3/4 viewing angle (asymmetric composition; both walrus tusks visible) with the gradient sweep at ~45% position (slightly past center, biased to "in progress" not "halfway").
- R21. The frame's vertical composition splits ~2/3 pure-black well and ~1/3 off-white surface for the caption; the hard horizontal edge between is the design-language statement (per D-044 "pure-black wells form contrast frames").
- R22. The same key-frame SVG asset is reused as: the viewport/capability fallback (R11), S4 panel 2 (R18), the OG card image, the Twitter card image, the pitch deck opening slide, and the README hero image. One asset, six surfaces.

---

## Acceptance Examples

- AE1. **Covers R11.** Given a mobile viewport (width < 768px), when the page loads, then no Babylon canvas mounts and the static key-frame SVG renders in the lede region with the caption below.
- AE2. **Covers R11.** Given a desktop viewport with WebGL disabled in the browser, when the page loads, then no Babylon canvas mounts and the static key-frame SVG renders in the lede region.
- AE3. **Covers R12.** Given a Babylon canvas successfully mounted on a capable client, when the Walrus fetch for the canonical blob does not return within ~3 seconds, then the system loads the embedded GLB asset and the scene begins playing without visible interruption.
- AE4. **Covers R14, R15.** Given a desktop visitor on the live Babylon path, when 15 seconds elapse with no user interaction, then the CTA strip slides up below the canvas. On the viewport/capability fallback path, the CTA strip does not appear regardless of dwell time.
- AE5. **Covers R3, R20.** Given the live Babylon scene is rotating and the gradient is sweeping, when a screenshot is taken at any moment, then the captured frame shows the tusk visible in 3D space with the gradient at some position along its surface; the canonical pre-export key frame chooses the 45% sweep position as the strongest single instant.
- AE6. **Covers R19.** Given a returning visitor reloads the page repeatedly, when each reload completes, then the S3 identity mark may show any of the 4 monochrome variant SVGs (random selection), but the lede S1 always uses the same live scene driving from Collection #001.

---

## Success Criteria

- A judge taking a single screenshot at any moment during the lede's animation captures a frame that visibly demonstrates: a recognizable tusk form, the gradient mid-transition (the "Carve" visualization), and the chain-grounded caption — without requiring play, hover, or scroll.
- The lede measurably differentiates from 2025 Walrus-track winning submissions on visual identity (target: visible difference within 1 second of first paint; verifiable by side-by-side comparison).
- On any non-WebGL or sub-768px viewport, the lede renders without visible failure; the static SVG fallback is interchangeable with the live frozen-frame screencap from a desktop session.
- On Walrus testnet outages or slow fetches, the live scene continues with the embedded fallback; no visitor encounters a "broken canvas" state.
- The key-frame SVG asset functions, without modification, as OG card image, Twitter card image, pitch-deck opening visual, and README hero — verified by checking each surface's rendering of the file at its target resolution.
- The Tripo-generated tusk model, viewed in line-drawing mode (EdgesRenderer), shows recognizable tusk silhouette + structural creases at the canonical key-frame camera angle (verified visually by the asset producer during pre-flight).

---

## Scope Boundaries

- The car / racing-scene content of `/track` is not represented in the lede. `/track` remains available as a per-asset "demo this" secondary CTA inside `/browse` or `/collection/:slug`, but is not part of the landing's narrative.
- The lede does not display L2 variants — the 4 monochrome forks exist on chain and surface in S4 panel 3 (the VARIANT panel of the lifecycle strip), not in the lede.
- The lede caption does not run live Sui RPC queries — all displayed metadata is for immutable chain artifacts and is committed as static frontend content.
- No automated SVG export pipeline. Variant snapshots and the canonical key frame are exported manually during implementation.
- The lede does not implement responsive layouts for tablet-sized viewports beyond the 768px breakpoint. Below 768px = static fallback; at or above 768px = live Babylon. iPad portrait (~768px) is on the live side intentionally.
- No new ADR for the walrus-tusk-over-mammoth choice. The decision and its framing tradeoff are captured here in Key Decisions; this brainstorm doc is the authoritative record.
- Tagline revision from "Sixteen forks" to "Many forks" is in scope for the landing's lifecycle strip caption (S4) but not part of this lede document — propagated as a follow-up to whichever survivor implements S4.
- The CTA destination `/launch` is assumed to exist and be functional from prior phases. Landing redesign is not responsible for fixing or extending `/launch` itself.
- Mobile-specific UI affordances (touch interactions, mobile-only CTAs, different layouts) are out of scope. Mobile sees only the static fallback frame.

---

## Key Decisions

- **Walrus tusk over mammoth tusk.** Chosen for sponsor-track visual rhyme (Walrus track) despite D-068's documented concern that the bare-tusk framing carries an unintended "killed-the-mascot-for-its-tusk" reading. Risk accepted via abstraction mitigations: academic line-drawing style, no surface texture, black-well framing, and explicit "Tusk3D Collection #001" content framing (not "an animal's tusk"). This is a partial walkback of D-068's framing rationale; the brand-name disambiguation provided by the "3D" suffix continues to apply, but the lede visual reintroduces the framing D-068 wanted to avoid in pictorial form. Team-level decision accepting the tradeoff.
- **Academic line drawing via EdgesRenderer, not raw wireframe (D-055).** The existing PreviewCanvas WIREFRAME mode draws every triangle edge; the academic / scientific-illustration aesthetic needs silhouette + crease edges only. EdgesRenderer is a separate Babylon primitive and is the correct tool. D-055's WIREFRAME mode remains valid for its existing dev/preview surfaces.
- **PBR ↔ EdgesRenderer dual-mesh + clipPlane sweep, not custom shader.** Babylon clipPlane is a standard, well-supported primitive; a hard sweep edge aligns with brutalist editorial's "no gradients/shadows/glow" rule and is cheaper to ship than a custom fragment shader.
- **4 variants, not 16; "Many forks" tagline, not "Sixteen forks".** Academic line drawing suppresses color, so 16 monochrome variants in S4 panel 3 read as 16 identical line drawings. 4 variants in a 2×2 panel preserves visual breathing and editorial restraint; the tagline absorbs the change.
- **Live Babylon only for the lede; pre-rendered SVG for S3 and S4 panel 2.** Mounting Babylon for non-live surfaces would triple the engine count, bundle pressure, and mobile-failure surface for no credibility gain. Pre-rendered exports are cheaper, more reliable, and visually indistinguishable in their surfaces.
- **Static SVG fallback over MP4 fallback for mobile/no-WebGL.** Judges screencap, judges don't watch video. The dynamic-vs-static gap in a screencap is zero; the bundle savings of SVG over MP4 are meaningful; the failure surface of MP4 (encoding, codec support, autoplay policies) is non-trivial. Static SVG dominates on every axis except "motion preserved" which is the irrelevant axis.
- **Static caption, not live RPC query.** L1 Collection #001 is an immutable chain artifact. Its blob CID, prompt text, and mint timestamp do not change. Live RPC adds a failure mode for no informational gain.
- **Embedded GLB fallback for Walrus timeout, accepting bundle size cost.** A bundled byte-identical copy of the canonical tusk GLB preserves the live Babylon scene even when Walrus fetches slow. The bundle cost (~200–500 KB additional) is accepted as the price of an invisible-failure path on the credibility-critical lede.
- **Keep both tusk rotation and 15s dwell CTA in v1.** Both are self-contained, ~5-minute-to-remove behaviors. Reversal cost is low; ship and observe.

---

## Dependencies / Assumptions

- Babylon engine version in the existing frontend supports `EdgesRenderer` and `clipPlane` primitives. Verified at planning time against the locked `@babylonjs/core` version per D-022 / D-007.
- D-055 PreviewCanvas 4-mode standard (PBR / PARTS / SOLO / WIREFRAME) remains intact — this work does not regress those modes.
- Tripo Turbo v1.0 (D-024) can produce a walrus-tusk output meeting the asset spec via the locked prompt. Iteration on the asset producer side is expected; the asset spec is the target, not the first-attempt result.
- The `/create` and `/launch` production routes are functional end-to-end for the asset producer's pre-flight (R7, F4). This brainstorm assumes these routes work without modification.
- The walrus-tusk Walrus blob, once published, remains available on Walrus testnet through 2026-06-21 submission and the 6/21 → 8/27 winners-announcement window. If testnet operations evict the blob, the embedded GLB fallback (R12) prevents visitor-visible breakage but the "live from Walrus" credibility degrades.
- `/launch` is assumed to support forking 4 NftToken variants from one L1 Collection with the existing variant-color customization mechanism. If the variant system requires extension to support pure-monochrome palettes within D-044's constraints, that work is out of this brainstorm's scope.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R7][Out of S1 scope] Specific hex values for the 4 monochrome variants are not load-bearing for S1 (the lede renders line drawing which suppresses color). Variant colors surface only in S4 panel 3 and belong to that survivor's planning, not this one. The asset producer decides during pre-flight; values land wherever S4 implementation needs them.
- [Affects R9][Operational placeholder] Mint date in caption — concrete date determined when the asset producer runs `/create` during pre-flight (F4). Not a planning question — caption template carries a `2026-05-NN` placeholder until then; final string substitution is a one-line content edit at ship time.

- [Affects R3][Technical] Sweep timing curve — linear vs eased. Linear is simpler and may read more brutalist; eased may read more cinematic. Visual taste decision deferred to implementation iteration.
- [Affects R1][Technical] Exact camera framing (distance, FOV, vertical offset) for the canonical 3/4 angle. Iterated during implementation against the asset producer's tusk output.
- [Affects R12][Needs research] Tunable timeout value for Walrus fetch (~3 seconds is a starting estimate). Refine during implementation based on observed Walrus testnet latency distribution.
- [Affects R22][Technical] OG card and Twitter card target resolutions and how the canonical SVG crops at each aspect ratio. Cropping rules deferred to whichever planning unit handles social metadata.
- [Affects R17][Technical] Component API surface for the shared Babylon scene configuration — how lede consumes it as live vs how the pre-render export script consumes it as design-time. Defer to implementation; the constraint is "one source of scene config, three consumption modes."
- [Affects R13][Needs research] Exact embedded GLB size after optimization — depends on Tripo output. Bundle-budget tradeoff deferred to planning measurement.
