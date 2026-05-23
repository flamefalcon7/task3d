---
date: 2026-05-23
topic: mesh-segmentation-per-part-coloring
---

# Mesh Segmentation + Per-Part Coloring for Variants

## Summary

Replace the current single-material recolor variant flow with a per-segment recolor flow backed by Tripo's `mesh_segmentation` API. L1 creators tag each segment with a semantic label at base publish time; L2 derivative creators then author variants by setting a color per label, which the swap pipeline resolves to a per-material `baseColorFactor` and tints the baked PBR texture.

---

## Problem Frame

Current variants change only one color: `gltf-material-swap.ts` mutates `materials[0].baseColorFactor` on a single-mesh GLB, so every variant of a base is "the same car, but red / blue / green." The L2 collection grid reads as a flat color swatch rack instead of meaningfully different cars. Creator expressivity is bottlenecked by the input model shape — not by the editor surface or the contract.

Tripo's `mesh_segmentation` task produces a multi-part GLB where each part is its own node, mesh, and material. The bottleneck moves from "how does the editor express more variation" to "how does the editor map a creator's color intent across N parts whose number and meaning aren't fixed in advance."

---

## Actors

- A1. **L1 creator**: publishes a base Model3D. Now also tags each segmented part with a semantic role at publish time.
- A2. **L2 derivative creator**: forks a base and authors variants. Sees an N-label palette editor, not N raw color slots.
- A3. **Buyer**: views and acquires variants. Sees per-segment colored models in the gallery, detail page, and race scene.
- A4. **Tripo API**: external dependency that performs `text_to_model` then `mesh_segmentation` (~60 credits, ~2 minutes total).

---

## Key Flows

- F1. **L1 base publish (changed)**
  - **Trigger:** L1 creator submits prompt on `/create`.
  - **Actors:** A1, A4.
  - **Steps:**
    1. Creator enters prompt + name + price.
    2. Backend calls Tripo `text_to_model` (Turbo, ~20cr, ~35s).
    3. Backend chains `mesh_segmentation` on the returned task_id (~40cr, ~85s) — total ~60cr, ~2min.
    4. Frontend receives the segmented GLB and renders it in a tagging viewer.
    5. Creator clicks each part, assigns a label (dropdown of `primary / secondary / accent / detail`, or custom free text).
    6. Creator may "skip remaining" — unlabeled parts default to `detail`.
    7. Creator publishes; base GLB + `partLabels` array stored.
  - **Outcome:** Model3D exists with a known label mapping; ready for L2 derivation.
  - **Covered by:** R1, R2, R3, R4, R5, R6.

- F2. **L2 variant authoring (changed)**
  - **Trigger:** L2 derivative creator picks a base on `/launch`.
  - **Actors:** A2.
  - **Steps:**
    1. Editor renders a palette with one row per unique label on the base (typically 3-5 rows).
    2. For each variant, creator sets a color per label.
    3. Backend resolves the per-label palette to a per-part color array using the base's `partLabels` and applies `baseColorFactor` on each material (PBR texture preserved).
    4. Variants stored with their resolved per-part color array.
  - **Outcome:** N variants exist, each with semantically meaningful color differentiation.
  - **Covered by:** R7, R8, R9, R10, R11.

---

## Requirements

**Base generation**

- R1. The system shall call Tripo `text_to_model` then `mesh_segmentation` in sequence when an L1 creator publishes a base, total cost ~60 credits per base.
- R2. The system shall handle the variable part count produced by `mesh_segmentation` (observed: 9 for the reference car, 12 for the spike car) — no hard-coded N.
- R3. The system shall preserve the per-part PBR textures emitted by Tripo (baked color, normal, metallic-roughness maps) in the published base GLB.

**Base publish tagging**

- R4. The system shall present a per-part tagging UI after `mesh_segmentation` returns and before publish, where the creator can select a part in a 3D viewer and assign it a label.
- R5. The label set shall offer four built-in presets (`primary`, `secondary`, `accent`, `detail`) plus a custom free-text option.
- R6. The system shall allow the creator to skip remaining parts and publish; unlabeled parts default to label `detail`.

**Variant authoring**

- R7. The variant editor shall display one color picker per unique label on the chosen base, not one per raw part index.
- R8. The system shall resolve each variant's per-label palette to a per-part color array using the base's label mapping at variant-build time.
- R9. The swap pipeline shall loop over all materials in the segmented GLB and set `baseColorFactor` per material, preserving each material's existing `baseColorTexture` (TINT mode).

**Lineage and on-chain**

- R10. The lineage record for each variant shall store the resolved per-part color array `[ColorHex × N]` as the canonical form, not the label-keyed palette.
- R11. The system shall preserve the base's label mapping when a derivative is created from it (label inheritance is implicit — the derivative reuses the same per-part color array shape).

---

## Acceptance Examples

- AE1. **Covers R5, R6.** Given a base has 12 segmented parts and the creator only labels 7 of them, when the creator presses "Publish", the system shall publish with the 7 labeled parts mapped as chosen and the 5 remaining parts mapped to `detail`.

- AE2. **Covers R7, R8.** Given a base has 12 parts mapped to 4 unique labels (`primary`, `secondary`, `accent`, `detail`), when the L2 creator opens the variant editor for that base, the editor shall show 4 color rows — not 12 — and selecting "red" for `primary` shall apply red to every part whose label is `primary` in the resulting variant.

- AE3. **Covers R9.** Given a segmented GLB where each material has a baked `baseColorTexture` and `baseColorFactor` is undefined, when the swap pipeline applies a per-material color, the resulting variant shall multiply the chosen `baseColorFactor` against the baked texture (TINT mode), not strip the texture.

- AE4. **Covers R2.** Given two bases generated from similar prompts produce different part counts (9 vs 12), when the variant editor is opened on either, the editor shall show the same row count if and only if the label counts match — the raw part count is not visible to the L2 creator.

---

## Success Criteria

- Demo viewer for a single L2 collection shows 16 variants where each variant is visually differentiated by more than a single body color — accents, trim, and details read as distinct.
- L1 creator can publish a base end-to-end (prompt → tag → publish) in under 4 minutes on the demo arc.
- L2 creator can author a 4-variant collection in under 90 seconds once the base is selected.
- ce-plan inherits this doc and does not need to invent product behavior for the variant editor, tagging UI, or label vocabulary.

---

## Scope Boundaries

- Auto-grouping of similar parts (e.g., 4 wheels share one label automatically based on geometric similarity) is out of v1 — creator tags each part individually. Future polish.
- LLM/vision-based automatic part labeling is rejected for v1 — adds external dependency and latency to the L1 publish flow without proportional product gain at hackathon scope.
- Geometric heuristic auto-labeling (largest bbox = body, etc.) is rejected — the demo is not domain-limited to cars, and the heuristic fails on non-car objects.
- A painter UI that lets the creator override individual part colors (option `a` from earlier brainstorming) is out of v1 — the label-palette UI is the only variant editing surface.
- Encrypted (Seal-wrapped) variants are out of scope here — orthogonal feature.
- Migration of existing single-material Model3D records is out of scope — the new shape coexists; old bases remain valid as single-label (`primary`) entities.

---

## Key Decisions

- **Tripo segmentation is two-step, not one parameter**: `text_to_model` then `mesh_segmentation`, with `original_model_task_id` referencing the first task. The historical `generate_parts` rumor from third-party docs is wrong for the current Tripo API.
- **TINT over FLAT**: the `baseColorFactor × baked texture` look reads as "red car" with surface detail intact, while fully flat color reads as plastic. Confirmed against `frontend/public/dev-glbs/spike-seg-tint-red.glb` vs `spike-seg-flat-red.glb`.
- **Manual tagging over heuristic auto-labeling**: domain is not bounded to cars, so geometric heuristics (largest = body) fail on too many cases. Creator tagging is 0.5-1 day of work and produces robust labels across any domain.
- **Lineage stores resolved per-part color array, not label-keyed palette**: keeps on-chain shape invariant to UI label-vocabulary changes; makes the eventual upgrade to a painter UI a pure UI add-on.
- **Tripo does not expose semantic labels via API or GLB metadata**: all `extras` are `undefined`; segmentation cuts along visually-natural boundaries but the API never tells you "part 5 is the body." Tagging must originate from the creator.

---

## Dependencies / Assumptions

- Tripo `mesh_segmentation` API: 40 credits per call on top of upstream `text_to_model` (validated 2026-05-23, balance 440 → 380).
- Tripo `mesh_segmentation` requires `original_model_task_id` as the only required field; the upstream task must be `success` first (sequential, not parallel).
- Segmentation runtime: ~85s for a low-poly car. Assumed to scale roughly linearly with face count and not exceed 3 minutes for `face_limit: 5000` inputs.
- Tripo's per-part PBR textures sum to ~6 MB total per segmented GLB at `face_limit: 5000`. Walrus mainnet cost for this size class is unverified — see Outstanding Questions.
- The current `MAX_VARIANTS = 16` cap and per-variant `priceMist` from `frontend/src/forge/VariantEditor.tsx` continue to apply unchanged.

---

## Outstanding Questions

### Resolve Before Planning

- *(none)* — every decision needed to start planning is captured above.

### Deferred to Planning

- [Affects R3, R8][Technical] Should variants be stored as full ~6 MB GLBs per variant, or as `{ base_glb_uri, [factor × N] }` overrides that are reconstructed at render time? The TINT mode makes the override form viable; the storage-cost reduction is ~16× per collection. ce-plan should evaluate the trade-off against Walrus retrieval latency and the existing Sui Move struct shape.
- [Affects R1][Needs research] Walrus mainnet cost for 6 MB × 16 variant collections at the 2026-08-27 mainnet milestone. Influences whether the override-form storage architecture is mandatory or optional.
- [Affects R1, R2][Needs research] Tripo `mesh_segmentation` reliability across non-car domains (animals, furniture, weapons). One spike confirms it cuts cars along natural boundaries; cross-domain robustness is assumed but unverified. Single additional 60-credit spike per domain category covers it.
- [Affects R4][Technical] Babylon click-to-select-part interaction details — picking ray, highlight material, focus camera on selected part. Standard Babylon territory but worth scoping in plan-mode.
- [Affects R9][Technical] The current `gltf-material-swap.ts` mutates only `materials[0]`. ce-plan should specify the loop refactor and whether `swapMaterial` should accept either a single spec (existing single-mesh bases) or a per-part array (segmented bases) — bridge during the coexistence period in Scope Boundaries.
- [Affects R1][Technical] L1 publish-time SUI fee gate (D-034) currently anchors on Turbo's ~15-credit cost. The new ~60-credit flow is 4× more expensive; fee gate threshold may need adjustment. ce-plan should re-derive.
