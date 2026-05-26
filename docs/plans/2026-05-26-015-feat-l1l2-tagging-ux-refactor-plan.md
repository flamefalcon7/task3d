---
title: L1 / L2 Tagging + Customization UX Refactor
type: feat
status: active
date: 2026-05-26
origin: docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md
---

# L1 / L2 Tagging + Customization UX Refactor

## Summary

Reframe the L1 tagging step from "label parts with presets" to "name what
buyers can customize" (framing B) by removing the `primary/secondary/accent/detail`
preset dropdown and replacing it with freeform text per segment. Add a
coordinated set of viewer-canvas tools shared across `/create` and `/launch`:
a 4-mode preview canvas (`PBR / PARTS / SOLO / WIREFRAME`) with a mode-toggle
pill mirroring the existing BG pill, a `MeshInfoPanel` with segment / size /
material counts, and a `PartListPanel` two-way wired with canvas picking.
On `/launch`, surface A1's labels as a "customization axes" strip below the
base picker, add a subhead to `VariantEditor` columns explaining their
provenance, wire column-hover to canvas SOLO highlighting, add idle
auto-rotate to full-page previews, and ship the Random Gen feature with
harmonic-from-seed color math, variant locking, and a variant strip.

Contract surface from plan-013 (`Model3D.part_labels: vector<String>`) is
**unchanged** — this is pure frontend work plus light copy updates.
(See origin: `docs/brainstorms/2026-05-26-l1l2-tagging-ux-requirements.md`.)

---

## Problem Frame

Plan-013 shipped end-to-end on testnet v8 (2026-05-26). UAT surfaced one
coherence gap with three failure surfaces, all rooted in the same root cause:
the L1 tagging step has no legible purpose. Creators take the preset escape
hatch (`primary` / `secondary` / `detail`), which makes the L2 `VariantEditor`
columns read as fixed system categories rather than authored customization
axes, and forkers cannot tell which mesh part a given column drives. The
fix is reframing-plus-tools: remove the preset shortcut to force authorship
intent, then reinforce that intent visually on both pages through shared
viewer infrastructure.

---

## Requirements

### Framing & copy

- **R1.** L1 tagging step eyebrow + heading rewritten to framing B
  (`— STEP 2/3: NAME WHAT BUYERS CAN CUSTOMIZE` + subhead).
- **R2.** Preset labels removed. Freeform text, min 1 / max 32 chars, no
  blocked-label list. Empty input keeps Continue disabled.
- **R12.** Help-icon `?` at concept positions only: L1 tagging step heading,
  L2 column-area heading, L2 palette heading.

### Shared infrastructure (used on both `/create` and `/launch`)

- **R3.** `MeshInfoPanel`: segment count, file size, material count, post-publish
  Walrus blob ID as mono pill.
- **R4.** `PreviewCanvas` / `TaggingCanvas` accept a `mode` prop cycling
  `PBR | PARTS | SOLO | WIREFRAME`. Top-left pill, `MODE: <VALUE>` format,
  context-aware default.
- **R5.** `PartListPanel`: one row per segment, two-way wired to canvas
  picking (click row → canvas SOLO-highlights; click canvas part → row
  scrolls into view + focuses).

### L2-specific

- **R6.** Base picker shows `customization axes` strip listing the base's
  `part_labels` in mono uppercase.
- **R7.** `VariantEditor` column headers use A1's strings + subhead
  reinforcing authorship.
- **R8.** Column header hover → canvas SOLO-highlights matching parts.
- **R9.** Live recolor: color picks update the preview immediately, no
  apply step.
- **R10.** Auto-rotate idle preview, `autoRotate?: boolean = false` (default
  off). Full-page mounts opt in per the table in R10.
- **R11.** Random Gen: N (1–20) + seed color + harmonic scheme picker (4
  swatches: `ANALOGOUS / COMPLEMENTARY / TRIADIC / TETRADIC`) + lock badges
  + state-aware button label.
- **R13.** Variant strip: bottom of main preview, N × 60×80 wells, no BG
  toggle, click switches main preview, active variant gets accent border,
  index shown as `001 / 010`.

**Origin actors:** A1 (L1 creator, framing-B target), A2 (L2 forker), A3
(L3 buyer, off-stage), A4 (judge/demo viewer).
**Origin flows:** F1 (L1 base publish refined), F2 (L2 variant authoring
refined), F3 (shared visual inspection).
**Origin acceptance examples:** AE1 (R1-R6, R12, F1), AE2 (R2), AE3 (R6,
R7), AE4 (R5, R8), AE5 (R11, R13), AE6 (R10), AE7 (cross-cutting demo
legibility).

---

## Scope Boundaries

### Deferred for later (post-6/21)

- Texture customization per part (color-only in v1; texture in v1.1) — D-057.
- User-uploaded textures or texture library.
- AI-generated label suggestions per mesh.
- Multi-base variant composition.
- Mode toggle on `/track` HUD.
- Variant strip thumbnails for N>20 (contract caps at 20).

### Outside this product's identity

- Procedural mesh generation (removed by D-033).
- L3 buyer customization UI.
- Real-time collaborative editing.

### Deferred to Follow-Up Work

- Camera zoom-to-part on PartListPanel row click — origin lists this as
  "optional, toggleable"; ship default-off in v1, add toggle if it tests
  well in UAT.
- Mode toggle persistence across mount (localStorage) — not in origin
  requirements; revisit if UAT shows creators flipping modes constantly.

---

## Context & Research

### Relevant Code and Patterns

- `frontend/src/babylon/bgPalette.ts` + `frontend/src/babylon/BgTogglePill.tsx`
  — direct template for `modePalette.ts` + `ModeTogglePill.tsx`. Hook shape
  (`useBgCycle` → `useModeCycle`), pill component shape, testId prop pattern
  all mirror 1:1.
- `frontend/src/babylon/TaggingCanvas.tsx` (existing) — `HighlightLayer`
  pattern (`hl.addMesh(mesh, Color3.FromHexString(...))`), `POINTERPICK`
  observable, and filtered-meshes index contract all reusable for SOLO
  mode in `PreviewCanvas`.
- `frontend/src/babylon/PreviewCanvas.tsx` (existing) — read-only viewer
  consumed by `/launch` main preview, base picker cards, market tiles,
  `/model/:id`, `/collection/:id`, `/track`. Needs: `mode?: CanvasMode`,
  `highlightedParts?: number[]`, `onPartClick?: (index: number) => void`,
  `autoRotate?: boolean = false` props. Default `mode = 'pbr'` preserves
  all existing call sites.
- `frontend/src/creator/CreateModelPage.tsx` — current preset code at L63
  (`LABEL_PRESETS`, `DEFAULT_LABEL`); tagging step layout around the
  `confirmed === true` block. Test fixture at `CreateModelPage.test.tsx:304`
  uses preset values — needs full rewrite.
- `frontend/src/forge/VariantEditor.tsx` — column headers already render
  A1's labels (plan-013, R7 there). Needs: subhead row, `onColumnHover`
  callback, `onColumnLeave` callback.
- `frontend/src/collection/LaunchCollectionPage.tsx` — base picker, palette
  resolution, build dispatch. Hosts the new `MeshInfoPanel`, `PartListPanel`,
  customization-axes strip, `RandomGenControls`, `VariantStrip`, and wires
  column-hover → canvas highlight.
- `frontend/src/ux/tokens.ts` + `frontend/src/ux/viewerWell` — D-044
  brutalist tokens; `tokens.font.mono`, `tokens.color.accent`,
  `tokens.border.primary`, `viewerWell` style. All new components must
  conform.
- `frontend/src/ux/useElapsedSeconds.ts` (shipped commit `b80aab9`) — not
  needed for harmonic math (sub-ms), but available for any future async
  feedback in RandomGen.
- `frontend/src/babylon/normalizeMeshScale.ts` (shipped commit `6a9d30a`) —
  used by `/track`; unaffected here.

### Institutional Learnings

- D-007 — Babylon imperative; do **not** introduce `react-babylonjs`. All
  new components follow the existing engine/scene/observable lifecycle.
- D-044 — brutalist editorial design system. Mono pill conventions,
  `MODE: <VALUE>` matches `BG: BLACK` for visual symmetry.
- D-052 — `Model3D.part_labels: vector<String>` is the contract substrate;
  unchanged in this plan.
- D-053 — `SignConfirmation` pattern applies if RandomGen adds any wallet
  popups (it does not in v1; harmonic-from-seed is client-only).
- D-054 — preset labels removed (this plan implements).
- D-055 — preview canvas 4-mode standard (this plan implements).
- D-056 — random gen harmonic-from-seed (this plan implements).
- D-057 — texture customization deferred (out of scope).
- `docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`
  — any new `useRef + useEffect` in mode toggle, auto-rotate, or RandomGen
  must set BOTH setup and cleanup; tests wrap in `<StrictMode>`.
- `docs/solutions/integration-issues/babylon-gpu-particle-emission-control-and-getactivecount-misread-2026-05-18.md`
  — Babylon source-read discipline on first surprise. `HighlightLayer.addMesh`,
  `material.albedoColor`, and `mesh.material.wireframe` mutation contracts
  are all non-obvious.

### External References

- HSL hue-rotation harmonic schemes (well-established color theory):
  - **Analogous**: ±30° around seed → 3 hues. Generalize to K colors by
    spreading ±15°×K around seed.
  - **Complementary**: seed and seed+180° → 2 hues. K colors interpolated
    along that axis.
  - **Triadic**: seed, +120°, +240° → 3 hues evenly spaced.
  - **Tetradic** (square): seed, +90°, +180°, +270° → 4 hues evenly spaced.
- HSL/HSV math is sub-millisecond; no need for `chroma.js` or other deps.
  Inline utility in `frontend/src/forge/harmonics.ts`.

---

## Key Technical Decisions

- **Extend PreviewCanvas + TaggingCanvas with mode prop; do not create a
  third viewer component.** Default `mode = 'pbr'` preserves every existing
  call site; new mode-aware sites opt in explicitly. Mirrors the `defaultBg`
  prop pattern already shipped.
- **SOLO mode reuses Babylon `HighlightLayer`.** TaggingCanvas already
  demonstrates the pattern (`hl.addMesh(mesh, accent)` with selectedIndex
  guard). PreviewCanvas adds a parallel `HighlightLayer` reactively driven
  by `highlightedParts: number[]`. Non-highlighted meshes get
  `material.alpha = 0.2` (or equivalent) and original alpha restored on
  mode change.
- **PARTS palette is deterministic 12-hue HSL cycle** (hue = `index * 30°`,
  saturation 0.6, lightness 0.55), wrapping past 12. Index-stable so two
  loads of the same GLB produce identical part coloring. Implemented in
  `frontend/src/babylon/modePalette.ts` (sibling of `bgPalette.ts`).
- **WIREFRAME mode sets `material.wireframe = true` on all loaded meshes
  for the duration of the mode.** Original wireframe state cached on mode
  entry and restored on exit. No PBR material teardown.
- **Mode pill is a SIBLING of BgTogglePill** — top-left vs top-right of
  the viewer well. Both are positioned absolute inside the well's
  relative-positioned container.
- **Harmonic math is a pure-function utility module.** No state, no
  dependencies. `harmonics.ts` exports `generateVariantColors(seed: HSL,
  scheme, K, N): HSL[][]` — N variants × K labels = N×K colors, each
  variant internally coherent under `scheme`, each variant distinct via
  seed rotation around the scheme wheel.
- **Lock state lives in `LaunchCollectionPage` local component state.**
  Not persisted to localStorage in v1; not on-chain. Re-roll filters by
  lock mask.
- **Auto-rotate runs in Babylon's `scene.onBeforeRenderObservable` tick.**
  An idle-tracker observable on `scene.onPointerObservable` resets the
  3s timer; tick checks `Date.now() - lastPointerMs > 3000` to advance
  camera alpha.
- **PreviewCanvas gains `onPartClick` only when the prop is provided.**
  Picking observable registered conditionally inside the mount effect to
  avoid the cost of pointer pickInfo computation on read-only mounts
  (market tiles, `/track`).

---

## Open Questions

### Resolved During Planning

All product-level OQs resolved in origin doc (OQ-1 through OQ-7 — see
origin §Open Questions). No new planning-time questions surfaced.

### Deferred to Implementation

- **Live recolor (R9) wiring depth.** Verify during U7 whether
  `VariantPreview.tsx` already updates the active variant's main preview
  on color picks. If yes, U7 is subhead + hover only. If not, U7 also
  wires the recolor path through the existing palette → per-part resolver.
- **Whitespace-only label treatment.** Origin says "min 1 character" with
  no trim mention. AE2 explicitly allows single-char (`a`, `1`). Default
  behavior: `label.length > 0 && label.length <= 32`, no `.trim()` applied
  to gate (UX trusts the user). If UAT shows whitespace abuse, add trim
  in v1.1.
- **PartListPanel camera zoom-to-part toggle.** Origin R5 marks zoom
  "optional, toggleable". Ship default-off, no UI for the toggle in v1.
- **Mode pill icon vs label-only.** D-044 BG pill is label-only
  (`BG: BLACK`). Mirror that — no icons.
- **HSL → sRGB conversion accuracy.** Use the standard HSL-to-RGB
  formula; if PARTS colors look muddy under the canvas lighting, switch
  saturation/lightness constants in `modePalette.ts`.

---

## High-Level Technical Design

*This section is directional guidance for review. Implementing agents
should treat it as context, not code to reproduce.*

### Mode toggle state machine

```
        click mode pill
PBR ────────────────► PARTS ────────────────► SOLO ────────────────► WIREFRAME
 ▲                                                                       │
 └───────────────────────────────────────────────────────────────────────┘

SOLO has a side-input: highlightedParts: number[] (driven externally,
e.g., by VariantEditor column hover). When SOLO is the active mode and
highlightedParts is empty, no parts highlight (all dimmed). When SOLO
is not the active mode, highlightedParts is ignored.
```

### Mode → Babylon render mapping

| Mode | Mesh material treatment | HighlightLayer | Notes |
|------|------------------------|----------------|-------|
| PBR | Original Tripo PBR materials, untouched | empty | Default; preserves all existing read-only callers |
| PARTS | Override `albedoColor` per filtered-index from `modePalette[i % 12]` | empty | Cache original material on mode entry, restore on exit |
| SOLO | Non-highlighted meshes get `material.alpha = 0.2`; highlighted untouched | `addMesh` per highlighted | Original alphas cached and restored on exit |
| WIREFRAME | `mesh.material.wireframe = true` on all loaded meshes | empty | Cache original wireframe state per material, restore on exit |

### Harmonic color math (per variant)

For a seed `H_seed` (hue 0–360°) and K labels:

| Scheme | Hue offsets for the K colors (rotated by variant index) |
|--------|--------------------------------------------------------|
| Analogous | `H_seed + (i - K/2) × 15°` for `i ∈ [0, K)` |
| Complementary | Alternate between `H_seed` and `H_seed + 180°` |
| Triadic | `H_seed + (i % 3) × 120°` |
| Tetradic | `H_seed + (i % 4) × 90°` |

Per variant v of N: rotate `H_seed` by `v × (360° / N)` to get distinct
sibling palettes. Saturation 0.7, lightness 0.5 fixed in v1.

### Component composition on `/launch` main preview area

```
LaunchCollectionPage
├── BasePicker (existing)
│   └── customization-axes strip [NEW: U6]
├── Preview area (NEW layout in U6)
│   ├── PreviewCanvas (extended: mode, highlightedParts, onPartClick, autoRotate)
│   │   ├── BgTogglePill (existing, top-right)
│   │   └── ModeTogglePill (NEW: U2, top-left)
│   ├── MeshInfoPanel (NEW: U3, side panel)
│   ├── PartListPanel (NEW: U4, side panel)
│   └── VariantStrip (NEW: U8, bottom)
├── RandomGenControls (NEW: U8)
└── VariantEditor (extended: subhead + onColumnHover)
```

---

## Implementation Units

### U1. Framing B — remove preset labels, rewrite L1 tagging copy, help icons

**Goal:** Replace the `LABEL_PRESETS` dropdown with freeform text input;
update step eyebrow/heading/subhead to framing B; add `?` help icon next
to step heading.

**Requirements:** R1, R2, R12 (L1 portion). Covers AE1, AE2.

**Dependencies:** none.

**Files:**
- Modify `frontend/src/creator/CreateModelPage.tsx` (remove `LABEL_PRESETS`
  + `DEFAULT_LABEL`, replace dropdown JSX with `<input type="text">`, update
  eyebrow + heading + subhead copy, add `HelpIcon` next to heading, gate
  Continue on `parts.every(p => p.label.length >= 1)`)
- Create `frontend/src/ux/HelpIcon.tsx` (mono `?` button → popover on
  hover; reusable across U5, U7 mounts of R12)
- Create `frontend/src/ux/HelpIcon.test.tsx`
- Modify `frontend/src/creator/CreateModelPage.test.tsx` (rewrite preset-based
  fixture at L304+L317 to use freeform labels like `["chassis", "wheels",
  "spoiler", "windshield", "headlights"]`; add empty-label gate test;
  add max-32 truncation test)

**Approach:** Strip the preset dropdown markup entirely; replace with a
single text input bound to `parts[i].label` state. Input uses `maxLength={32}`
attribute (browser-level cap, no custom truncation logic needed). Model-aware
placeholder hint computed once from prompt context (e.g., truncate prompt
to first noun for an example like `"e.g. chassis, wheels, spoiler"` — keep
the implementation simple: hard-code the example list in v1, defer
prompt-aware hint generation). Continue button `disabled={
parts.some(p => p.label.length === 0)}`. Help icon component takes `title`
and `body` props; renders a small `?` mono button with hover popover.

**Patterns to follow:**
- D-044 mono pill conventions for input border / focus state.
- Existing eyebrow + heading pattern in `CreateModelPage.tsx` (mono caps,
  letter-spaced, accent dash prefix `—`).

**Test scenarios:**
- Covers AE1. Five-part tagging flow: render with 5 parts, type `chassis`
  into part 0 input, type `wheels` into part 1, … `headlights` into part 4,
  assert Continue button is enabled, click Continue, assert
  `submitMintTransaction` called with
  `partLabels: ["chassis", "wheels", "spoiler", "windshield", "headlights"]`.
- Covers AE2. Regression: render with 5 parts, type labels into 4 of them
  leaving 1 empty, assert Continue is disabled. Type single char `a` into
  the empty one, assert Continue enables.
- Edge: type 50-char string into a label, assert input value is
  truncated/capped at 32 chars (DOM-level via `maxLength`).
- Edge: type single char into a label after all others are filled, assert
  Continue enables (no min-length-N gate beyond `>= 1`).
- `HelpIcon.test.tsx`: renders `?` button, hover triggers popover, popover
  content matches `body` prop, popover dismisses on mouseleave.

**Verification:** Existing `CreateModelPage.test.tsx` suite passes after
fixture rewrite; new freeform tests pass; manual /create flow types
freeform labels, mints, on-chain `part_labels` matches typed strings.

---

### U2. Canvas mode infrastructure — `ModeTogglePill`, `modePalette`, PBR/PARTS/SOLO/WIREFRAME, auto-rotate

**Goal:** Add a 4-mode capability + auto-rotate to both `PreviewCanvas` and
`TaggingCanvas`. Ship the toggle pill, palette module, and mode-application
logic as reusable shared infrastructure.

**Requirements:** R4, R10. Cross-cutting prerequisite for U5, U6, U7.

**Dependencies:** none (parallel with U1, U3, U4).

**Execution note:** Test-first for `modePalette.ts` and `harmonics.ts`-style
pure utilities — palette indexing and HSL math are easy to verify with
small inline cases before touching Babylon.

**Files:**
- Create `frontend/src/babylon/modePalette.ts` (export `CanvasMode` type,
  `MODE_SEQUENCE` const, `useModeCycle(default)` hook, `PARTS_PALETTE`
  function `(index: number) => Color3`)
- Create `frontend/src/babylon/modePalette.test.tsx`
- Create `frontend/src/babylon/ModeTogglePill.tsx` (mono pill, label
  `MODE: PBR` / `MODE: PARTS` / `MODE: SOLO` / `MODE: WIREFRAME`, click
  cycles)
- Create `frontend/src/babylon/ModeTogglePill.test.tsx`
- Create `frontend/src/babylon/applyCanvasMode.ts` (pure function
  `applyCanvasMode(meshes, mode, highlightedParts, partsPalette)` that
  mutates Babylon state — separates mode logic from canvas component
  glue, testable in isolation)
- Modify `frontend/src/babylon/PreviewCanvas.tsx` (add `mode`,
  `highlightedParts`, `onPartClick`, `autoRotate` props; new `HighlightLayer`
  ref; new mode-application `useEffect`; conditional `POINTERPICK` observable
  when `onPartClick` set; new idle-rotate observable when `autoRotate`)
- Modify `frontend/src/babylon/PreviewCanvas.test.tsx`
- Modify `frontend/src/babylon/TaggingCanvas.tsx` (add `mode` prop; same
  mode-application path; `defaultBg = 'black'` plus `mode = 'parts'` for
  tagging step usage)
- Modify `frontend/src/babylon/TaggingCanvas.test.tsx`

**Approach:** Mirror `bgPalette.ts` / `BgTogglePill.tsx` shape exactly.
`useModeCycle(defaultMode)` returns `{ mode, cycle }` like `useBgCycle`.
`ModeTogglePill` placed top-left of the viewer-well container (absolute
positioning, sibling of `BgTogglePill`). Mode application: cache original
material state per mesh on entry into a non-PBR mode; restore on exit back
to PBR. SOLO mode uses an existing-pattern `HighlightLayer.addMesh` over
highlighted indices and `material.alpha = 0.2` on others. Auto-rotate
implementation: track `lastPointerMs` via `scene.onPointerObservable`,
advance `camera.alpha` by `0.2 * deltaSec` in `onBeforeRenderObservable`
when `Date.now() - lastPointerMs > 3000`.

**Patterns to follow:**
- `frontend/src/babylon/bgPalette.ts` for the hook shape and palette record
  pattern.
- `frontend/src/babylon/BgTogglePill.tsx` for the pill markup, mono caps
  styling, testId prop pattern.
- `frontend/src/babylon/TaggingCanvas.tsx` for `HighlightLayer` setup +
  `POINTERPICK` observable + StrictMode cleanup.

**Test scenarios:**
- `modePalette.test.tsx`: `useModeCycle('pbr')` cycles
  `pbr → parts → solo → wireframe → pbr`. `PARTS_PALETTE(0)`, `PARTS_PALETTE(1)`,
  `PARTS_PALETTE(12)` produce expected `Color3` values (assert hue == 0°,
  30°, 0° respectively).
- `ModeTogglePill.test.tsx`: renders `MODE: PBR` initially, click changes
  text to `MODE: PARTS`, accepts `testId` prop, accessibility label
  reflects current mode.
- `PreviewCanvas.test.tsx`: with `mode="parts"`, assert mock meshes had
  `material.albedoColor` set to palette values. With `mode="solo"` and
  `highlightedParts=[1, 3]`, assert HighlightLayer received meshes 1 and 3,
  meshes 0/2/4 received `material.alpha = 0.2`. With `mode="wireframe"`,
  assert all mesh `material.wireframe = true`.
- `PreviewCanvas.test.tsx`: with `onPartClick` provided, simulate
  POINTERPICK event with pickedMesh = mesh index 2, assert `onPartClick(2)`
  fired. With `onPartClick` undefined, picking observable not registered.
- `PreviewCanvas.test.tsx`: with `autoRotate={true}` and 0 pointer events,
  fake-advance time by 4s, assert camera.alpha changed. Simulate
  pointermove, assert rotation pauses; advance 4s more, assert rotation
  resumes.
- StrictMode cleanup: mount in `<StrictMode>`, unmount, assert no orphan
  observables / HighlightLayer instances leaked (mirrors existing
  PreviewCanvas test setup).

**Verification:** All existing PreviewCanvas + TaggingCanvas tests pass
unchanged (default `mode='pbr'`, default `autoRotate=false`, default
`highlightedParts=undefined`, default `onPartClick=undefined` preserve
prior behavior). New mode tests pass. Manual: open `/create`, observe
tagging step in PARTS mode (rainbow segments); open `/launch`, click
mode pill, observe PBR ↔ PARTS ↔ SOLO ↔ WIREFRAME cycling.

---

### U3. MeshInfoPanel component

**Goal:** Compact info panel showing segment count, file size, material
count, plus optional Walrus blob ID after publish.

**Requirements:** R3.

**Dependencies:** none (parallel with U1, U2, U4).

**Files:**
- Create `frontend/src/babylon/MeshInfoPanel.tsx` (props: `segmentCount:
  number`, `fileSizeBytes: number`, `materialCount: number`,
  `walrusBlobId?: string`)
- Create `frontend/src/babylon/MeshInfoPanel.test.tsx`

**Approach:** Static functional component. Render rows with mono labels
(`SEGMENTS`, `SIZE`, `MATERIALS`, `BLOB`) and right-aligned values. Format
`fileSizeBytes` using a small inline helper: `< 1024 → "B"`, `< 1024² → "KB"`,
else `"MB"`, one decimal. Walrus blob ID renders as a mono pill (uppercase,
truncated to first 8 + ellipsis + last 4 chars) only when prop is provided.
Hide row if value is `null`/`undefined`/`0` (e.g., no materials yet).

**Patterns to follow:**
- D-044 mono pill convention (`tokens.font.mono`, uppercase, letter-spaced).
- Existing `MintButton.tsx` or similar small UX component for layout
  scaffolding and `tokens` consumption.

**Test scenarios:**
- Happy: renders all 3 mandatory rows with formatted values
  (`segmentCount=5`, `fileSizeBytes=2097152`, `materialCount=5` →
  `5`, `2.0 MB`, `5`).
- Walrus blob ID: when `walrusBlobId="abcdef1234567890xyz"` provided,
  assert BLOB row renders as mono pill with truncated value.
- Walrus blob ID: when prop undefined, BLOB row not rendered.
- Edge: `fileSizeBytes=1024` → `1.0 KB`; `fileSizeBytes=512` → `512 B`;
  `fileSizeBytes=0` → SIZE row not rendered.
- Edge: `segmentCount=0` does not crash; renders `0`.

**Verification:** Tests pass; component renders cleanly in Storybook or
ad-hoc preview during U5/U6 integration.

---

### U4. PartListPanel component

**Goal:** Vertical list of parts (one row per segment) with two-way
interaction wired to canvas picking.

**Requirements:** R5.

**Dependencies:** none (parallel with U1, U2, U3).

**Files:**
- Create `frontend/src/babylon/PartListPanel.tsx` (props: `parts: Array<{
  index: number; label?: string; colorHex?: string }>`, `selectedIndex:
  number | null`, `onSelect: (index: number) => void`)
- Create `frontend/src/babylon/PartListPanel.test.tsx`

**Approach:** Render a vertical scrollable list (`overflow-y: auto`,
`max-height` from prop or default). Each row: part index (mono, zero-padded
e.g. `01`), label (or `—` placeholder when empty), small color swatch
(if `colorHex` provided — used in PARTS mode where the swatch matches the
canvas palette). Active row (matching `selectedIndex`) gets accent border
+ scroll-into-view via `ref.current?.scrollIntoView({ block: 'nearest' })`
in a `useEffect` keyed on `selectedIndex`. Click row → `onSelect(index)`.

**Patterns to follow:**
- D-044 brutalist row pattern: mono caps, dark border, accent on active.
- `frontend/src/babylon/TaggingCanvas.tsx` filtered-index contract for
  `parts[i].index` semantics.

**Test scenarios:**
- Happy: 5 parts render, each row shows index + label + swatch.
- Click row 2 → `onSelect(2)` fires.
- `selectedIndex=3` → row 3 has accent border; assert `scrollIntoView`
  was called on row 3's ref.
- Label `undefined` renders `—` placeholder.
- `colorHex` undefined → swatch not rendered (or rendered transparent).
- StrictMode: mount + unmount, no scroll-effect warning.

**Verification:** Tests pass; ad-hoc render in U5/U6 integration shows
expected layout.

---

### U5. `/create` tagging step integration

**Goal:** Wire U1–U4 into the L1 tagging step. After Tripo segmentation
returns, the tagging step renders: PARTS-mode TaggingCanvas (top-left mode
pill + top-right BG pill), MeshInfoPanel, PartListPanel, freeform label
input, help icon, two-way click wiring (canvas part click → list focus +
input focus; list row click → canvas SOLO highlight).

**Requirements:** R1, R3, R4 (L1 default), R5, R12 (L1 portion). Covers
AE1, AE3 (origination side).

**Dependencies:** U1, U2, U3, U4.

**Files:**
- Modify `frontend/src/creator/CreateModelPage.tsx` (after `confirmed`
  block, lay out: tagging step header w/ HelpIcon, three-column layout —
  TaggingCanvas left, MeshInfoPanel + PartListPanel right; pass
  `mode='parts'`, `highlightedParts` driven by current selected part index,
  `onPartClick` → setSelectedIndex; pass `colorHex` to PartListPanel rows
  matching `PARTS_PALETTE` colors)
- Modify `frontend/src/creator/CreateModelPage.test.tsx`

**Approach:** Compose components. The selected-part state is local to
`CreateModelPage` (`useState<number | null>(null)`). Wire:
- Click canvas part → `setSelectedIndex(i)` → PartListPanel highlights
  row + scrolls; label input for part i focuses.
- Click PartListPanel row → `setSelectedIndex(i)` → TaggingCanvas
  selectedIndex updates (HighlightLayer marks the part); input for
  part i focuses.
- Hovering parts is **not** required (origin only specifies click); skip
  hover wiring to avoid complexity.

**Patterns to follow:**
- Existing CreateModelPage layout grid (mono caps eyebrows, section
  spacing tokens).
- TaggingCanvas's `selectedIndex` + `onPartSelect` props (already shipped).

**Test scenarios:**
- Covers AE1. Render with 5 segments, click canvas part 2 (via mocked
  POINTERPICK), assert PartListPanel row 2 is active, assert label input
  for part 2 has focus. Type `chassis`. Assert `parts[2].label === "chassis"`.
- Covers AE3 (origination). After all 5 labels typed, click Continue, assert
  `submitMintTransaction` called with `partLabels` matching typed values
  (preserved into chain via existing plan-013 PTB).
- Mode pill cycles through 4 modes without crashing.
- Help icon (`?`) renders next to step heading; hover shows popover with
  expected body text.
- Default mode on this page is `parts` (rainbow).

**Verification:** Manual /create flow: enter prompt → pay → Tripo returns →
land on tagging step → see rainbow segments + info panel + part list →
click + type all 5 → Continue → metadata form → mint. On-chain part_labels
matches.

---

### U6. `/launch` scaffold — customization-axes strip + info/list panels + mode toggle + auto-rotate

**Goal:** Wire the shared canvas + panels into LaunchCollectionPage. Add
the customization-axes strip below the picked base; mount PreviewCanvas
with `mode` cycle, `autoRotate=true`, `onPartClick`; mount MeshInfoPanel
and PartListPanel.

**Requirements:** R3 (mount), R4 (PreviewCanvas mode), R5 (mount), R6, R10
(L2 mount), R12 (L2 portion). Sets up surface for U7, U8.

**Dependencies:** U2, U3, U4.

**Files:**
- Modify `frontend/src/collection/LaunchCollectionPage.tsx` (insert
  customization-axes strip below picked base preview using base's
  `part_labels`; insert MeshInfoPanel + PartListPanel beside/around the
  main PreviewCanvas; pass `mode`, `highlightedParts`, `onPartClick`,
  `autoRotate={true}` to PreviewCanvas; local state for
  `previewMode`, `selectedPartIndex`, `hoveredColumnLabel`)
- Modify `frontend/src/collection/LaunchCollectionPage.test.tsx`

**Approach:** The customization-axes strip is a row below the BasePicker
output: `CUSTOMIZATION AXES: CHASSIS · WHEELS · SPOILER · ...` rendered
from `selectedBase.partLabels`. The two-way panel wiring uses the same
pattern as U5: `selectedPartIndex` state in LaunchCollectionPage drives
both PartListPanel highlight and PreviewCanvas `highlightedParts={
selectedPartIndex !== null && previewMode === 'solo' ? [selectedPartIndex]
: []}`. On user click in canvas, set `selectedPartIndex` and (optionally)
flip mode to `'solo'`. Auto-rotate on; user pointer cancels per U2.

**Patterns to follow:**
- Existing LaunchCollectionPage section layout.
- D-044 mono-pill axes strip styling.

**Test scenarios:**
- Covers AE3 (recognition side). Render LaunchCollectionPage with a base
  whose `partLabels = ["chassis", "wheels", "spoiler", "windshield",
  "headlights"]`. After base pick, assert customization-axes strip text
  contains all 5 labels in mono uppercase.
- MeshInfoPanel renders w/ correct segment count (== partLabels.length).
- PartListPanel renders 5 rows; click row 2 → main PreviewCanvas receives
  `highlightedParts=[2]` (if mode is SOLO).
- Mode pill cycles 4 modes; PARTS mode shows rainbow on main preview.
- Default `previewMode='pbr'` on /launch; mode pill present and clickable.
- Auto-rotate: after 3s of canvas idle, camera.alpha increases (verify via
  mock); pointer event resets idle timer.
- Empty `partLabels = []` (legacy base): customization-axes strip renders
  empty state copy or hides; PartListPanel hides; MeshInfoPanel shows
  `SEGMENTS: 0`.

**Verification:** Manual /launch flow: pick segmented base → see axes strip
+ info panel + part list + main preview with mode pill → cycle modes →
no regressions. Tests pass.

---

### U7. VariantEditor coherence — subhead + column-hover SOLO wiring + live recolor

**Goal:** Add the "columns reflect the labels this base's creator set when
publishing" subhead, wire column-header hover to canvas SOLO highlighting,
add the help icon next to the column-area heading, and verify (or wire)
that color picks recolor the preview live.

**Requirements:** R7, R8, R9, R12 (L2 portion). Covers AE4.

**Dependencies:** U2, U6.

**Files:**
- Modify `frontend/src/forge/VariantEditor.tsx` (add subhead row under
  column headers; add `onColumnHover?: (label: string | null) => void`
  prop; add HelpIcon next to column-area title)
- Modify `frontend/src/forge/VariantEditor.test.tsx`
- Modify `frontend/src/collection/LaunchCollectionPage.tsx` (wire
  `onColumnHover` → set `hoveredColumnLabel` → compute `highlightedParts`
  from the base's part-index ↔ label mapping → pass into PreviewCanvas;
  ensure mode flips to SOLO on hover and restores prior mode on mouseout)

**Approach:** `onColumnHover(label)` fires on `onMouseEnter` of each column
header; `onColumnHover(null)` fires on `onMouseLeave`. LaunchCollectionPage
computes `highlightedParts = baseLabels.reduce((acc, l, i) => l === label
? [...acc, i] : acc, [])`. The mode flip pattern: stash `previousMode` on
enter-SOLO-on-hover, restore on leave. Skip mode-stash if user is already
in SOLO mode manually.

For live recolor (R9): inspect `VariantPreview.tsx` during execution. If
its color comes from a memoized `palette[label]` resolution that updates
on every `VariantRow` change, no work needed. If not, wire the active
variant's palette into PreviewCanvas as a `partColors: string[]` prop and
apply via `mesh.material.albedoColor` per index (similar to PARTS mode
but with user-picked colors).

**Patterns to follow:**
- D-044 mono subhead pattern.
- Existing `VariantEditor` column header markup + state.
- `applyCanvasMode.ts` from U2 for the SOLO-on-hover path.

**Test scenarios:**
- Covers AE4. Render LaunchCollectionPage with 5-part base. Hover
  `SPOILER` column header. Assert PreviewCanvas received
  `mode='solo'` and `highlightedParts=[<spoiler index>]`. Mouseout →
  mode restored.
- Subhead text matches `— COLUMNS REFLECT THE LABELS THIS BASE'S CREATOR
  SET WHEN PUBLISHING.` (mono uppercase).
- Help icon (`?`) next to column-area heading renders, popover hover works.
- Live recolor: change color of column `CHASSIS` in active variant via
  fireEvent → assert PreviewCanvas re-rendered with chassis-index color
  matching the pick (use mocked canvas to capture `applyVariantColors`
  call). If already live, this test confirms baseline.
- Hover during user-active SOLO mode: hover should not stash/restore;
  hover updates `highlightedParts` directly.

**Verification:** Manual /launch flow: hover any column header → matching
mesh part lights up in canvas SOLO; mouseout → returns to prior mode;
pick a color in any cell → main preview updates within frame.

---

### U8. Random Gen + harmonic + variant strip + lock

**Goal:** Ship the RandomGen UX: N picker, seed color picker, 4 harmonic
swatches, RANDOM GEN button with state-aware label, variant strip with
[L] lock badges, and one-click-to-bulk-fill variant authoring.

**Requirements:** R11, R13. Covers AE5.

**Dependencies:** U6.

**Execution note:** Test-first for `harmonics.ts` — pure math, simple to
verify with small inline cases before touching React.

**Files:**
- Create `frontend/src/forge/harmonics.ts` (pure utility module:
  `type HSL = { h: number; s: number; l: number }`; export
  `generateVariantColors(seed: HSL, scheme: HarmonicScheme, K: number,
  N: number): string[][]` returning hex strings)
- Create `frontend/src/forge/harmonics.test.ts`
- Create `frontend/src/forge/RandomGenControls.tsx` (N stepper 1-20, seed
  color picker — reuse existing HSL/HEX picker if any, else simple HTML5
  `<input type="color">` plus an HSL parse; 4 scheme swatches mini-rows
  showing 5 derived colors each; RANDOM GEN button with state-aware label)
- Create `frontend/src/forge/RandomGenControls.test.tsx`
- Create `frontend/src/forge/VariantStrip.tsx` (60×80 wells, [L] lock
  badge top-right of each, accent border on active + locked, click to
  switch, horizontal scroll when N>visible, `001/010` mono index)
- Create `frontend/src/forge/VariantStrip.test.tsx`
- Modify `frontend/src/collection/LaunchCollectionPage.tsx` (mount
  RandomGenControls + VariantStrip; local state for `lockedIndices: Set<
  number>`, `seedColor: HSL`, `scheme: HarmonicScheme`, `variantCount: N`;
  on RANDOM GEN click → call `generateVariantColors(seed, scheme, K, N)`
  → distribute K colors per variant to the base's K labels → update
  variants[i].palette for all i not in `lockedIndices`; VariantStrip
  click → switch active variant; [L] toggle → mutate `lockedIndices`)

**Approach:** The harmonic math is per the High-Level Technical Design
table above. `generateVariantColors` returns `colors[variant][label]` —
N × K hex strings. Distribute: `variants[v].palette = Object.fromEntries(
baseLabels.map((label, k) => [label, colors[v][k]]))`. Lock UX: clicking
the `[L]` badge toggles membership in `lockedIndices: Set<number>`; the
RANDOM GEN handler filters out locked indices before reassigning. Button
label: `RANDOM GEN (${N} VARIANTS)` when `lockedIndices.size === 0`,
else `RANDOM GEN (${N - lockedIndices.size} OF ${N}, ${lockedIndices.size}
LOCKED)`. Scheme picker swatches: each renders a 5-color horizontal mini-row
generated using the current seed under that scheme; clicked swatch gets
accent border. VariantStrip renders compact 60×80 PreviewCanvas mounts
(or static rendered tile — to be decided during U8 implementation based
on perf — defer to execution).

**Patterns to follow:**
- D-044 brutalist UI tokens for buttons, stepper, swatches, strip wells.
- `frontend/src/babylon/BgTogglePill.tsx` for badge mono pill aesthetic
  ([L] badge).
- `frontend/src/forge/VariantEditor.tsx` palette state shape for color
  distribution into variants.

**Test scenarios:**
- `harmonics.test.ts`: `generateVariantColors({h:0,s:0.7,l:0.5}, 'analogous',
  3, 1)` returns 1 variant × 3 colors with hues at ~-15°, 0°, 15° (modulo
  360). Triadic with K=3 returns hues at 0°, 120°, 240°. Complementary
  with K=2 returns 0°, 180°. Tetradic with K=4 returns 0°, 90°, 180°, 270°.
- `harmonics.test.ts`: N variants produce distinct seed-rotated palettes
  — variant 0 hue base = seed, variant 1 hue base = seed + 360/N, etc.
- `harmonics.test.ts`: K > scheme native count (e.g., triadic with K=5)
  wraps via modulo without crashing.
- Covers AE5. RandomGenControls.test: pick N=10, pick seed red
  (`#FF0000`), click ANALOGOUS swatch, click RANDOM GEN → assert
  `onGenerate` callback fires with `{ N: 10, seed: <parsed>, scheme:
  'analogous' }`. Button label transitions from `RANDOM GEN (10 VARIANTS)`
  to `RANDOM GEN (8 OF 10, 2 LOCKED)` after locking 2 variants.
- VariantStrip.test: render 10 thumbnails, click thumbnail 3 →
  `onSwitch(3)` fires; active thumbnail (matching prop) has accent border;
  thumbnail with `lockedIndices` includes its index renders [L] badge in
  accent fill.
- VariantStrip.test: click [L] badge → `onToggleLock(index)` fires.
- LaunchCollectionPage integration: with 5-label base, click RANDOM GEN
  N=10 analogous → assert all 10 variants' palettes have 5 keys matching
  base labels; lock variant 3, change seed, re-roll → variant 3's palette
  unchanged, others updated.
- Edge: N=1 (smallest) renders 1 thumbnail, RANDOM GEN works.
- Edge: N=20 (max) renders 20 thumbnails with horizontal scroll.

**Verification:** Manual /launch flow: pick segmented base → adjust N=10
→ pick seed color → click ANALOGOUS swatch (visible color preview) →
click RANDOM GEN → variant strip populates with 10 distinct palettes →
click variant 5 → main preview switches → lock variant 5 → re-roll →
variant 5 unchanged, others update → Launch → on-chain palette matches.

---

## System-Wide Impact

- **`/create`** — tagging step UX changes (U1, U5); rest of `/create` flow
  unchanged.
- **`/launch`** — major UI additions (U6, U7, U8); existing VariantEditor
  + LaunchCollectionPage core logic preserved; build PTB unchanged.
- **`/market`, `/model/:id`, `/collection/:id`** — PreviewCanvas API
  extended but defaults preserve current behavior; `autoRotate` opt-in
  per origin R10.
- **`/track`** — unaffected. Driving scene uses its own camera; auto-rotate
  defaults off; mode toggle does not apply.
- **Contract surface** — unchanged. `Model3D.part_labels` from plan-013 is
  the substrate.
- **Backend** — unchanged. No new endpoints, no schema changes.
- **Walrus** — unchanged. Full-GLB-per-variant pipeline preserved.

---

## Risks & Dependencies

- **StrictMode cleanup:** Mode toggle, auto-rotate, picking observable
  all add new `useEffect`s. Every effect must set BOTH setup and cleanup;
  tests wrap in `<StrictMode>` per existing solutions/learning.
- **HighlightLayer disposal:** SOLO mode adds/removes HighlightLayer
  meshes on every prop change. Confirm `removeAllMeshes()` is called
  before re-adding on mode/highlight transitions (TaggingCanvas already
  shows this pattern).
- **Material state restoration:** PARTS / WIREFRAME modes mutate
  `material.albedoColor` and `material.wireframe`. Mode exit must restore
  original state; failure means PBR mode looks different after a PARTS
  trip. Cache original state in a ref keyed by mesh.
- **Auto-rotate vs orbit camera:** Babylon's `ArcRotateCamera` uses
  `alpha` for orbit angle. Rotating `camera.alpha` while the user is
  dragging the camera would fight the user input — guard with the idle
  check (`now - lastPointerMs > 3000`).
- **Live recolor wiring (R9, U7):** Uncertain whether already live. If
  not, U7 grows in scope. Verify in first day of U7 execution; defer to
  follow-up plan if rewiring is non-trivial.
- **VariantStrip thumbnail cost:** 20 simultaneous PreviewCanvas mounts
  may exceed WebGL context limits (D-003 single-canvas cap was for an
  earlier reason). U8 must benchmark; fallback is static rendered tile
  (CSS color or pre-rendered PNG). Decide during U8 execution.
- **Hackathon scope (6/21):** 8 units is significant. U5/U6 are the
  highest-priority demo-arc surfaces; U7's column-hover is the AE4 win;
  U8 is the most visually impressive demo moment. If time pressure
  surfaces, U8's variant strip can fallback to a simpler grid; full
  4-mode infrastructure (U2) is non-negotiable because U5/U6/U7 depend
  on it.

---

## Documentation / Operational Notes

- **`docs/spec.md` §1.7 / §2.8:** §2.8 contract section unchanged (still
  `part_labels: vector<String>`). §1.7 (Three-tier Composable Creator
  Economy narrative) should be touched only if the preset-label
  paragraph is referenced there — verify during U1 commit. Origin's
  framing-B language (`name what buyers can customize`) is worth
  threading into the spec narrative if it improves clarity; defer to a
  Phase 5 docs-cleanup pass.
- **`docs/ux/polish-backlog.md`:** mark §2 and §3 as superseded by this
  plan + the origin doc.
- **`docs/decisions.md`:** D-054 / D-055 / D-056 / D-057 already captured
  (committed `4fbced6`). No new ADRs required by this plan unless an
  execution-time decision crosses the ADR trigger threshold.
- **`docs/ux/design-tokens.md` §9 (mono pill conventions):** the new
  ModeTogglePill, HelpIcon, RandomGen scheme swatches, and [L] lock
  badge all conform to existing token usage; no new design-tokens entries
  needed unless a new pattern emerges during U8 (e.g., a 60×80 well
  variant smaller than `viewerWell`).
- **Phase progress / commit cadence:** suggest committing per unit
  (8 commits) so reviewers can cherry-pick if U8 hits a perf wall.
  Conventional commit prefix `feat(ux): plan-015 U<N> — <unit title>`.

---

## Pre-commit verification (CLAUDE.md frontend-checklist)

Frontend-touching plan; the 5-reviewer parallel pattern applies. Run
`ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`,
`ce-adversarial-reviewer`, and `ce-julik-frontend-races-reviewer` against
each unit's diff before declaring it done — or once at the end of all 8
units before merge to feat branch.

Per CLAUDE.md "Frontend Verification Protocol": every commit that changes
user-visible behavior must be browser-verified via `agent-browser` /
`ce-test-browser` before declaring done. Wallet-gated steps (only U8's
Launch flow at the end) use the pause-and-resume handoff: assert pre-wallet
UI in agent-browser, defer signing to user's real Chrome.
