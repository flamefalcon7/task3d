# S4 Lifecycle Strip (PROMPT → MODEL → VARIANT → IN-GAME) — Requirements

**Date**: 2026-05-29
**Status**: Approved (synthesis confirmed by user)
**Predecessor**: `docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md` §S4 ("PROMPT → MODEL → VARIANT → IN-GAME OBJ transformation strip", confidence 75%, complexity Medium, "mental model & workflow explainer" axis)
**Adjacent**: D-044 (brutalist editorial tokens), plan-019 (S1 LedeHero — shipped), plan-021 (S2 TelemetryStrip — shipped), plan-020 (S6 KeycapRow — shipped), plan-022 (S7 Masthead — shipped). Chosen over S3 (deferred — see `docs/phase-progress.md`).
**Architecture source of truth**: `docs/spec.md` §1.7/§2.8 ADR chain D-029 → D-031 → D-032 → D-035/036 → D-040, and `contracts/model3d/sources/model3d.move`. (The `README.md` architecture block is stale and is itself a compound-asset update target — see KD-5.)

---

## Summary

S4 is a **full-width 4-panel mid-page strip** mounted on `LandingPage.tsx` **between `<LedeHero />` (S1) and `<KeycapRow />` (S6)**. It teaches the product's lifecycle as a left-to-right visitor narrative — **PROMPT → MODEL → VARIANT → IN-GAME OBJ** — with the on-chain `L1/L2/L3` layer as a mono sub-caption per panel for crypto-literate readers. Below the strip, one Newsreader italic line: *"One prompt. One model. Sixteen forks. Every game."*

It hits two of the landing's stated user needs at once (explain how the product works + give visitors a mental model of the pipeline) and is chosen specifically because it is a **compound asset**: the same source visual is authored to also feed the README architecture diagram, a pitch-deck slide, and the demo-video opening shot (KD-5).

Visual register: D-044 brutalist editorial — black-on-`#F5F5F0` paper, 1.5px borders, 0 radius, JetBrains Mono headers + Newsreader italic tagline, **zero `#FF4500` accent** (site budget is 5/5 full; KD-6). Each panel = a mono header word + a black-well visualization + a mono layer sub-caption.

---

## Problem

The landing page shows what Tusk3D *is* (S1 live tusk), proves it's deployed (S2 telemetry), and routes visitors (S6 keycaps) — but nothing explains the **pipeline**: how a text prompt becomes a published model becomes ownable variants becomes a usable in-game asset. Tusk3D's mechanics are non-obvious (it's not an NFT collection — it's content + forks + integration), and the grounding pain "can't form a mental model of the pipeline" is real. The 4-stage strip replaces L1/L2/L3 jargon with a plain visitor narrative and demotes the contract layers to sub-captions.

Secondary, equal-weight driver: the user's stated priority is to finish the build early and leave runway for **pitch deck + demo video**. S4 is the one landing element whose deliverable is also those artifacts' source material.

---

## Goals

- A visitor grasps the full PROMPT → MODEL → VARIANT → IN-GAME pipeline in one horizontal read, without crypto vocabulary.
- Crypto-literate readers get an honest, **v1-shipped** L1 → L2 → L3 mapping in the sub-captions — nothing advertised that isn't live (KD-3).
- The strip's source visual is reusable verbatim (or near-verbatim) in the README architecture diagram, a deck slide, and the demo-video opening (KD-5).
- Zero motion, zero accent (D-044). Ships without dependency on the still-pending real mint (KD-7).

---

## Key Decisions

**KD-1 — Static pre-rendered, not live Babylon.**
The 4 panels are **pre-rendered static visuals** (SVG / inline art), not live Babylon renders. Rationale: (a) the compound-asset reuse goal *requires* a static source that exports to README/deck/demo — a live canvas isn't a reusable file; (b) avoids up to 4 additional WebGL contexts (D-003 context-cap concern); (c) ships today regardless of the pending real Walrus mint (panels are illustrative, not live data). Panel 2 reuses/derives the existing `frontend/public/lede/tusk-keyframe.svg` for visual rhyme with S1's static mode.

**KD-2 — 4 panels, corrected v1-shipped layer mapping.**

| # | Header | Black-well visual | Sub-caption |
|---|--------|-------------------|-------------|
| 1 | `PROMPT` | mono prompt text: `"a low-poly walrus tusk, ornate carve"` | `INPUT · Tripo` (off-chain) |
| 2 | `MODEL` | one base tusk with the model↔mesh gradient | `L1 · Model3D` — publish base to Walrus |
| 3 | `VARIANT` | a 4×N grid of recolored tusk variants | `L2 · NftToken` — fork → own your variants |
| 4 | `IN-GAME OBJ` | a tusk afloat in a neutral floor+horizon scene | `L3 · Integration` — use your owned asset in any engine |

**KD-3 — No Access / Seal on the strip.** L1 access-sale (Seal-gated `Access` receipt) is **v1.1, not shipped** (D-031; `Access` struct deleted in v3). The strip must not advertise it. The buy-and-own story is carried entirely by panel 3 (L2 ownership).

**KD-4 — Panel 2 = publish only.** Panel 2's caption is "publish base to Walrus" — it does **not** mention selling access. L1's v1 reality is publish + downstream royalty; the ownership narrative belongs to L2 (panel 3).

**KD-5 — Compound asset is a first-class requirement.** The source visual is authored so it exports to three downstream surfaces: (a) the README architecture diagram (which is currently a stale ASCII block + outdated routes — replacing it is part of the win), (b) a pitch-deck slide, (c) the demo-video opening shot. This favors a clean vector (SVG) source. *Wiring the asset into the README/deck/demo is follow-up work; S4 ships the reusable source + the landing strip and authors the source for reuse.*

**KD-6 — Zero accent.** Site-wide `#FF4500` budget is full (5/5; S2's ●LIVE dot holds the last slot). The strip is pure black-on-paper. Revisit only if the accent budget is deliberately rebalanced.

**KD-7 — Ships independent of the real mint.** Panels are illustrative static art, so S4 has **no dependency** on the pending real Walrus CID (S1 runs on a placeholder + embedded GLB). When a real mint lands, panel visuals *may* be refreshed but are not blocked.

**KD-8 — `L3 · Integration` is faithful, not invented.** The project's original three-tier framing always had L3 = Game Integration. Post-`Access`-deletion the mechanism is `register_integration` / `NftCollection.integration_policy` (gameDev pays), which **is shipped in v1** (D-029; `/integrate` route exists). So the L1→L2→L3 progression on panels 2/3/4 is all real, all demoable.

---

## Non-Goals

- Live Babylon rendering of any panel (KD-1).
- Any Access / Seal / L1-access-sale messaging (KD-3 — it's v1.1).
- Panel 4 depicting the `/track` car-racing demo — panel 4 is an explicitly *neutral* "any Babylon/Unity/Godot scene" (a tusk, floor, horizon), not the existing racing surface.
- Actually editing the README diagram / building the deck slide / cutting the demo shot — those consume the asset later; S4 authors it for reuse but doesn't wire it in.
- Live/dynamic data of any kind (no counters, no fetch).

---

## Acceptance Criteria

- **AC-1** A 4-panel strip renders on `LandingPage`, in document order **after `LedeHero` and before `KeycapRow`**. (Extend the `LandingPage.test.tsx` doc-order assertion.)
- **AC-2** Panels appear left-to-right in order PROMPT, MODEL, VARIANT, IN-GAME OBJ, each with its mono header word.
- **AC-3** Each panel shows its layer sub-caption per KD-2 exactly: `INPUT · Tripo`, `L1 · Model3D`, `L2 · NftToken`, `L3 · Integration`. No panel shows "Access", "Seal", or "Derivative".
- **AC-4** The Newsreader italic tagline `"One prompt. One model. Sixteen forks. Every game."` renders below the strip.
- **AC-5** No `#FF4500` anywhere in the strip's rendered output.
- **AC-6** Panel visuals are static (no `<canvas>`, no Babylon import in the strip component, no Walrus fetch).
- **AC-7** Mobile 375px: the 4 panels stack vertically (or scroll) without horizontal overflow of the strip.
- **AC-8** Panel borders/typography follow D-044 tokens (1.5px solid #000, 0 radius, `tokens.font.mono` headers, `tokens.font.display` italic tagline).

---

## Dependencies / Assumptions

- D-044 tokens from `frontend/src/ux/tokens.ts`; mirrors the shipped `KeycapRow` / `Masthead` component+CSS-module pattern in `frontend/src/landing/`.
- `frontend/public/lede/tusk-keyframe.svg` exists and is the basis for panel 2's tusk (reuse/derive).
- The 4 panel illustrations are static assets to be produced during planning/implementation (SVG). Producing the tusk line-art variants is part of the work, not a pre-existing asset (beyond the keyframe).
- No backend / Move / shared-types changes. Frontend-local, display-only.
- Network framing: testnet (matches the rest of the landing).

---

## Open Questions

None blocking. Follow-up (not S4 scope): wiring the authored asset into the README diagram, deck slide, and demo opening (KD-5) — tracked as downstream compound-asset reuse.
