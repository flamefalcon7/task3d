---
date: 2026-05-26
topic: l1l2-tagging-ux-refactor
status: ready-for-plan
---

# L1 / L2 Tagging + Customization UX Refactor

## Summary

Plan-013 shipped mesh segmentation + per-part coloring as an L1→L2 derivative
mechanic. UAT on testnet v8 (2026-05-26) surfaced a coherence gap: the
**L1 tagging step is not legible to creators**, so they take the path of
least resistance and use the preset labels (`primary`/`secondary`/`detail`).
When that base is then forked at `/launch`, the **L2 variant editor's
columns appear to be fixed system categories** rather than the creator's
own authored customization axes — the entire derivative-IP narrative
deflates into "pick three colors."

This refactor reframes L1 tagging as **"Name what buyers can customize"**
(framing B), removes the preset-label escape hatch, and adds a coordinated
set of visual tools on both `/create` and `/launch` that make the
mesh-parts-to-named-axes-to-variant-colors chain visible end-to-end.

The contract surface from plan-013 is **unchanged** — this is pure UX
work plus one piece of frontend infrastructure (4-mode preview canvas +
shared part-list panel).

---

## Problem Frame

Three observed failures during UAT, all rooted in the same coherence gap:

1. **Tagging step has no legible purpose.** The user (acting as A1 creator)
   said verbatim: "label 不為我無法理解要怎麼操作". The step appears to be
   "label some parts" with no in-app explanation of why labels matter or
   what happens downstream. Preset labels frame the task as taxonomy
   selection ("which standard category does this part belong to") instead
   of authorship ("what part of my model do I want forkers to customize").

2. **L2 columns read as fixed system categories.** When the same user later
   visited `/launch` and saw VariantEditor columns labeled
   `PRIMARY / SECONDARY / DETAIL`, they said: "DETAIL PRIMARY SECONDARY 為
   什麼只剩改這些部位的顏色 我不是說要動態修改嗎". The labels they themselves
   set at L1 had no visible authorship trace at L2.

3. **No visible link between L2 columns and the mesh they drive.** Even
   if labels were meaningful (e.g., `chassis` / `wheels` / `spoiler`),
   the column-to-mesh-part mapping is invisible. Forkers cannot tell which
   geometry will receive the color they're picking, so they pick blindly.

The fix is not isolated copy edits — the framing must change, and the
visual tools must reinforce the new framing at both pages.

---

## Actors

- **A1. L1 creator** — publishes a base Model3D. Tags each segmented part
  at publish time. The framing-B target audience: the doc's whole purpose
  is making A1 understand "I am defining customization axes for forkers."
- **A2. L2 forker** — picks a base, customizes color per label per variant.
  Sees A1's labels as column headers; uses the same mesh-inspection tools
  A1 used to verify the mapping. Optionally uses random-gen to bulk-fill.
- **A3. L3 buyer** — purchases a variant token. Off-stage in this doc; the
  framing-B "buyer" is a conceptual audience for A1's authoring intent,
  not a UI surface this refactor touches.
- **A4. Judge / demo viewer** — the 6/21 submission video and Demo Day
  presenter audience. Every UI choice must read clearly in a 2-minute
  recorded walkthrough.

---

## Key Flows

- **F1. L1 base publish (refined).**
  - **Trigger:** A1 finishes Tripo generation, segmented GLB returned.
  - **Actors:** A1.
  - **Steps:**
    1. A1 lands on the tagging step. **Eyebrow says `— STEP 2/3: NAME WHAT
       BUYERS CAN CUSTOMIZE`**; subhead "Each part you name becomes a
       customization axis for forks of this model."
    2. **Mesh info panel** shows segment count + file size + material
       count (no geek stats).
    3. **Preview canvas** in default `PARTS` mode (every segment a unique
       color from a deterministic palette) — visual proof that "your
       model has parts."
    4. **Part list panel** (right of canvas): one row per segment.
       Two-way interaction with the canvas.
    5. A1 clicks a part → row scrolls into view + focus moves to the
       label input. Placeholder shows model-aware hint
       (e.g. `"e.g. chassis, wheels, spoiler"`) — no presets.
    6. A1 types a label (free text, validated for min length).
    7. Repeat for all parts. **Continue** gates on all parts labeled.
    8. Hint icon `?` next to step eyebrow → mono uppercase popover
       explains why naming matters (with a 1-line example).
  - **Outcome:** Model3D published with semantically meaningful
    `part_labels`; ready for L2 forking.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R12.

- **F2. L2 variant authoring (refined).**
  - **Trigger:** A2 picks a base on `/launch` after F1 completed.
  - **Actors:** A2.
  - **Steps:**
    1. Base picker shows base preview + its labels listed as a mono
       "customization axes" strip (visible affordance — "these are what
       you can change").
    2. After pick, VariantEditor renders with **columns labeled with
       A1's strings** (e.g. `CHASSIS / WHEELS / SPOILER`) — not abstract
       categories. Subhead under column row reinforces:
       `— COLUMNS REFLECT THE LABELS THIS BASE'S CREATOR SET WHEN PUBLISHING.`
    3. **Mesh info panel** same as F1.
    4. **Preview canvas** with **mode toggle** (PBR / PARTS / SOLO /
       WIREFRAME) — same 4 modes as F1 for consistency.
    5. **Part list panel** same component as F1. Two-way wired:
       hovering a column header in VariantEditor → matching parts
       highlight in canvas (SOLO mode); clicking a part in canvas →
       scrolls the matching column header into view.
    6. **Live recolor** — every color pick applies to the preview
       immediately, no apply step.
    7. **Random Gen button** — A2 picks N (1–20), picks a seed color
       and harmonic scheme (analogous / complementary / triadic). All
       N variants populate with derived per-part colors. A2 may
       re-roll, lock individual variants, or hand-edit any cell after.
    8. **Variant strip** below preview: N thumbnails, click switches
       main preview.
    9. **Auto-rotate** — main preview gently rotates if idle >3s.
    10. **Launch** publishes the collection on-chain (existing PTB).
  - **Outcome:** N variants minted; the chain of authorship from A1's
    `chassis` label → A2's `chassis: red` choice → on-chain `Token N`
    is visible at every step.
  - **Covered by:** R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13.

- **F3. Visual inspection (shared across F1 + F2).**
  - **Trigger:** Any time A1 or A2 wants to understand the mesh.
  - **Actors:** A1, A2.
  - **Steps:**
    1. Hover the mode toggle pill (top-left of canvas well) → cycle
       through PBR / PARTS / SOLO / WIREFRAME.
    2. BG toggle pill (top-right, already shipped) cycles
       BLACK / PAPER / GRAY for contrast.
    3. Part list panel scrolls + highlights as user clicks parts.
    4. Optional `?` icons explain conceptual pieces.
  - **Outcome:** User confidently knows what each part is and what
    customization it'll receive.
  - **Covered by:** R4, R5, R12, R13.

---

## Acceptance Examples

- **AE1. L1 creator tags a car coherently (happy path).**
  A1 enters prompt "sports car", pays the Tripo fee, waits ~120s. The
  segmented GLB returns with 5 parts. A1 lands on the tagging step.
  Eyebrow reads `— STEP 2/3: NAME WHAT BUYERS CAN CUSTOMIZE`. Preview
  shows the car in PARTS mode (each segment a distinct color). A1 reads
  the subhead, hovers `?` for clarification. Clicks part 1 in canvas →
  list row highlights, input focuses. Types `chassis`. Clicks part 2,
  types `wheels`. Repeats for `spoiler`, `windshield`, `headlights`.
  Continue enables once all 5 are named. Proceeds to metadata + mint.
  On-chain `part_labels = ["chassis", "wheels", "spoiler",
  "windshield", "headlights"]`.

- **AE2. L1 creator can't bypass tagging with empty labels (regression guard).**
  A1 leaves a part blank. Continue stays disabled — the gate
  requires every part to have at least 1 character. No preset
  dropdown exists. A1 types a >32-char string; input is truncated
  at the cap. Single-character labels (`a`, `1`) are technically
  allowed — UX trusts the user not to ship garbage.

- **AE3. L2 forker recognizes A1's labels as authored axes (the win).**
  A2 navigates to `/launch`, picks the car A1 published in AE1. Sees
  a strip below the picker reading `CUSTOMIZATION AXES: CHASSIS · WHEELS
  · SPOILER · WINDSHIELD · HEADLIGHTS`. VariantEditor renders columns
  headed by the same labels. A2 immediately understands they are
  customizing the parts A1 named.

- **AE4. L2 forker uses canvas-to-column hover mapping.**
  A2 hovers `SPOILER` column header. Preview canvas SOLO-highlights
  the spoiler part (bright accent color, others dimmed). A2 clicks
  the highlighted part directly in canvas. The `SPOILER` column row
  scrolls into the editor's viewport, focus moves to the SPOILER
  cell of the active variant.

- **AE5. L2 forker uses random gen to bulk-author 10 variants.**
  A2 picks the car. Wants 10 variants. Picks a seed color (warm red)
  and `ANALOGOUS` harmonic scheme. Clicks RANDOM GEN. All 10 variants
  populate with derived 5-color palettes — coherent but distinct
  (chassis, wheels, spoiler, etc. each get a different harmonic
  partner per variant). Variant strip at bottom shows all 10
  thumbnails. A2 clicks variant 3 → main preview switches. Locks
  variant 3, re-rolls the rest. Launches.

- **AE6. Auto-rotate behavior.**
  A2 lands on `/launch`, picks a base, doesn't interact for 3 seconds.
  Preview begins gentle rotation around the model. A2 hovers the
  canvas → rotation stops. A2 moves away → after 3s, rotation
  resumes.

- **AE7. Demo recording legibility.**
  Judge watches the 6/21 video. Within the L1 publish segment, the
  PARTS-mode rainbow preview + tagging step subhead make clear that
  the creator is "designing customization." Within the L2 segment,
  the column-to-canvas hover + variant strip make clear that "one
  creator authored N variants from one base, each meaningfully
  different." No copy needed in voiceover to explain it.

---

## Requirements

### Framing & copy

- **R1.** L1 tagging step eyebrow + heading rewritten to framing B:
  `— STEP 2/3: NAME WHAT BUYERS CAN CUSTOMIZE` + subhead "Each part
  you name becomes a customization axis for forks of this model."

- **R2.** Preset labels removed. Label input is freeform text, with
  model-aware placeholder hints. Validation: **min 1 character, max
  32 characters** (resolved OQ-2, 2026-05-26). No blocked-label list
  — trust the user. Empty input keeps the Continue gate disabled.

- **R12.** Help-icon `?` placed at concept positions only (not every
  input): L1 tagging step heading, L2 column-area heading, L2 palette
  heading. Hover → mono uppercase popover with 2-3 lines + 1 example.

### Shared infrastructure (used on both `/create` and `/launch`)

- **R3.** `MeshInfoPanel` component: shows segment count, file size
  in KB/MB, material count. After publish/launch, also shows Walrus
  blob ID as mono pill. No triangle / vertex / bounding-box stats.

- **R4.** `PreviewCanvas` and `TaggingCanvas` accept a `mode` prop
  cycling `PBR | PARTS | SOLO | WIREFRAME`. Mode toggle pill rendered
  **top-left of canvas well** (mirror of BG toggle which is top-right).
  Label format **`MODE: PBR`** / `MODE: PARTS` / `MODE: SOLO` /
  `MODE: WIREFRAME` (resolved OQ-3, 2026-05-26 — matches the existing
  BG pill's `BG: BLACK` format for visual symmetry). Default mode
  depends on context:
  - L1 tagging step → `PARTS` (visual proof of segments)
  - L1 preview pre-tagging → `PBR`
  - L2 base picker thumbnails → `PBR`
  - L2 variant preview → `PBR`
  - Anywhere else → `PBR`
  Mode 1 (`PBR`) is the existing textured render. Mode 2 (`PARTS`)
  assigns a unique color per segment index from a deterministic
  palette (12 distinct hues, cycled if N>12). Mode 3 (`SOLO`)
  highlights the part(s) in a `highlightedParts: number[]` prop
  (others dimmed to ~20% opacity). Mode 4 (`WIREFRAME`) toggles
  Babylon's native `material.wireframe = true`.

- **R5.** `PartListPanel` component: renders a list of segments,
  one row per part. Each row shows part index + current label (if
  any) + small color swatch (in PARTS mode, the swatch matches the
  canvas color). Two-way interaction:
  - Click row → canvas SOLO-highlights that part; camera optionally
    zooms (toggleable).
  - Click part in canvas → matching row scrolls into view + receives
    focus.

### L2-specific

- **R6.** L2 base picker shows a `customization axes` strip below
  the picked base's preview: mono uppercase list of the base's
  `part_labels`. Reinforces what A1 published.

- **R7.** VariantEditor columns labeled with A1's strings (not
  abstract categories). Subhead reinforces authorship origin.

- **R8.** Column header hover → canvas SOLO-highlights matching
  parts (driven via `highlightedParts` prop). Mouseout → return
  to current mode.

- **R9.** Live recolor: VariantEditor color picks update the
  preview canvas immediately. No "apply" or "render" button.

- **R10.** Auto-rotate idle preview: if no pointer event on the
  canvas for >3s, begin a gentle Y-axis rotation (~0.2 rad/sec).
  Any pointer event cancels; after 3s of inactivity again, resume.
  Exposed via prop `autoRotate?: boolean = false` — **default off**
  (resolved OQ-4, 2026-05-26 — a grid of auto-rotating thumbnails
  reads as chaotic). Full-page mounts opt in explicitly:
  - L1 preview-after-tagging → `autoRotate`
  - L2 variant preview → `autoRotate`
  - `/market` listing cards → **off** (thumbnails stay static)
  - `/model/:id` detail page → `autoRotate`
  - `/collection/:id` detail page → `autoRotate`
  - `/track` driving scene → off (own camera)
  - During active generation / upload → off (competes with status
    pills)

- **R11.** Random Gen feature on L2:
  - **Inputs:** variant count N (1–20, slider or stepper), seed
    color (HSL picker), harmonic scheme.
  - **Harmonic scheme picker** (resolved OQ-6, 2026-05-26): rendered
    as **4 preview swatches**, one per scheme
    (`ANALOGOUS / COMPLEMENTARY / TRIADIC / TETRADIC`). Each swatch
    is a horizontal mini-row showing 5 derived colors from the
    current seed under that scheme. User clicks a swatch to pick
    the scheme; active swatch gets a 2px accent border. Visual
    decision beats dropdown.
  - **On click `RANDOM GEN`:** generate N variants where each
    variant's K labels receive K colors drawn from the harmonic
    palette. Each variant is internally coherent (palette-consistent
    across its K labels) but distinct from sibling variants
    (different seed rotation around the harmonic wheel).
  - **Lock mechanism** (resolved OQ-5, 2026-05-26): each variant
    strip thumbnail has a small `[L]` toggle in its top-right
    corner (mono badge, accent fill when locked). Click to toggle
    lock state. Locked thumbnails get a 2px accent border around
    the entire well. Re-roll skips locked indices.
  - Random Gen button label reflects state:
    `RANDOM GEN (N VARIANTS)` when nothing locked,
    `RANDOM GEN (M OF N, K LOCKED)` when K locked.
  - User can re-roll repeatedly without losing manual edits to
    locked variants.

### Visual coordination

- **R13.** Variant strip at L2: bottom of main preview area, N
  small thumbnails (60×80 viewer wells, no BG toggle). Click → main
  preview switches to that variant. Active variant has accent
  border. Horizontal scroll when N>visible. Variant index shown
  in mono `001 / 010`.

---

## Decisions

These need ADR capture in `docs/decisions.md` before implementation:

- **D-XXX (new): Preset labels removed from L1 tagging.** Replaces
  the preset `primary/secondary/detail` dropdown with freeform
  input. Rationale in this doc (framing B / coherence gap UAT
  evidence). May force users to think longer at the tagging step;
  acceptable cost given downstream legibility win.

- **D-XXX (new): Preview canvas 4-mode standard.**
  PBR / PARTS / SOLO / WIREFRAME modes are the system standard
  across every viewer well. Mode pill is a sibling of the BG
  pill (added in commit `8ff1d4a`). Default mode is context-aware
  per R4.

- **D-XXX (new): Random Gen uses harmonic-from-seed.** Pure RGB
  random gen produces noise. Creator-defined palette adds an
  extra setup step. Harmonic schemes (analogous / complementary /
  triadic / tetradic) derived from a single seed color give
  visually coherent results without extra UI overhead.

- **D-XXX (new): Texture customization deferred from v1.**
  Color-only customization remains the L2 mechanic for the 6/21
  submission. Texture (per-part material swap) deferred to
  post-submission polish.

- **D-044 (referenced):** All UI surfaces in this refactor must
  use the brutalist editorial design system.

- **D-052 (referenced):** Plan-013 architecture — `part_labels:
  vector<String>` on Model3D + per-label palette resolution — is
  the contract substrate for this refactor.

- **D-053 (referenced):** SignConfirmation pattern extends to any
  new wallet-popup site this refactor introduces.

---

## Scope Boundaries

### Deferred for later (post-6/21)

- Texture customization per part (color-only in v1; texture in v1.1).
- User-uploaded textures or texture library.
- AI-generated label suggestions per mesh.
- Multi-base variant composition (variants drawn from N different
  base models).
- Mode toggle on `/track` HUD (driving scene has its own visual
  language; preview modes don't apply to in-game cars).
- Variant strip thumbnails for N>20 (the contract caps at 20 per
  collection; this doc respects that).

### Outside this product's identity

- Procedural mesh generation (removed by D-033).
- L3 buyer customization UI (L3 buys among A2's pre-set variants;
  does not re-customize).
- Real-time collaborative editing (this is a single-creator app).

---

## Dependencies / Assumptions

- **Contract surface from plan-013 is unchanged.** `Model3D.part_labels`,
  `ModelPublished` event, and per-label palette resolution shipped
  on testnet v8 (package `0x9e673aa7…`) and are sufficient.
- **D-044 brutalist tokens shipped:** `tokens.ts`, `viewerWell`,
  `BgTogglePill`, `useBgCycle` all in production.
- **`useElapsedSeconds` hook shipped** (commit `b80aab9`) — random-gen
  may consume it for "generating..." feedback if the harmonic
  computation is non-trivial (unlikely; harmonic math is sub-ms).
- **`normalizeMeshScale` helper shipped** (commit `6a9d30a`) — preview
  canvas already auto-fits arbitrary GLBs.
- **TaggingCanvas's HighlightLayer pattern is reusable** for the new
  SOLO mode in PreviewCanvas.
- **Plan-013 UAT verified end-to-end on testnet v8** (`/create` →
  `/launch` → `/market` → `/track`); this refactor's added surface
  area does not need re-verification of the underlying mint flow.

---

## Open Questions

All resolved 2026-05-26. Captured here for the audit trail.

- **OQ-1. Plan split.** RESOLVED — single plan-015 (no split). The
  shared canvas + panel infrastructure (R4 + R5) and the L2-specific
  features (R6-R11, R13) ship together. Sequencing within plan-015
  is `/ce-plan`'s job.

- **OQ-2. Min character / blocked-label validation.** RESOLVED —
  min 1 char, max 32 chars, no blocked-label list. See R2.

- **OQ-3. Mode toggle pill aesthetic.** RESOLVED — top-left
  placement, `MODE: <VALUE>` label format. See R4.

- **OQ-4. Auto-rotate per-mount opt-out.** RESOLVED — `autoRotate`
  prop defaults `false`; full-page mounts opt in explicitly;
  `/market` listing cards stay off. See R10 for the per-mount
  table.

- **OQ-5. Random Gen variant locking UX.** RESOLVED — `[L]` mono
  badge top-right of each thumbnail, click to toggle, locked
  thumbnails get a 2px accent border. See R11.

- **OQ-6. Harmonic scheme selector affordance.** RESOLVED — 4
  preview swatches, one per scheme, click to pick. See R11.

- **OQ-7. Demo video script alignment.** RESOLVED — flagged for
  U15; out of scope for this refactor. The AHA-moment AEs
  (AE3 / AE4 / AE7) must be isolated and emphasized in the
  recording script. Not actionable here.

---

## Related

- **Plan-013** (mesh segmentation per-part coloring) — completed
  2026-05-26. Provides the contract + L2 palette resolution that
  this refactor sits on top of.
- **`docs/ux/polish-backlog.md`** §1 (tagging step UX), §2
  (column-to-mesh mapping) — items #2 and #3 in the discussed
  set. Mark both as superseded by this requirements doc.
- **`docs/decisions.md`** D-044, D-052, D-053 — referenced; this
  refactor adds 3-4 new decisions (see Decisions section above).
- **`docs/spec.md`** §1.7, §2.8 — light updates likely needed
  after this brainstorm to reflect framing B and the preset-label
  removal. To be scoped during `/ce-plan`.
- **`docs/ux/design-tokens.md`** §9 — the visual system every
  new component in this refactor must conform to.
- **Origin discussion:** prose PM session 2026-05-26, captured in
  conversation history (framing A/B/C tradeoff, preset
  keep/remove/repurpose tradeoff, texture v1 yes/no, random gen
  palette tradeoff).
