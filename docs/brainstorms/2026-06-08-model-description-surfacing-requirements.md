---
date: 2026-06-08
topic: model-description-surfacing
---

# Surface Model Descriptions (Prompt / AI Caption)

## Summary

Show each model's description — the human **Prompt** (Tripo) or the **AI caption** (uploads) — across the detail page, model cards, and the three preview surfaces via one shared resolver, and add a publish-time nudge that warns before an uncaptioned upload ships. The caption is already stored on-chain (D-082), so this is frontend-only display plus one publish-flow gate.

---

## Problem Frame

The `/launch` base-finder (plan-002) ranks bases by semantic similarity to each model's stored description. But that description is nearly invisible in the product:

- On the detail page (`/model/:id`) it's buried inside a collapsed **"Params (json)"** expander as raw JSON (`frontend/src/buy/ModelDetailPage.tsx`), so users never read it.
- Model cards (market grid, `/launch` base-picker) and the 3D preview surfaces don't show it at all.
- Nothing tells an uploader that skipping the caption makes their model **undiscoverable** in search — they publish an uncaptioned upload with no signal that they've hurt their own reach.

The data already exists: Tripo models carry the prompt in `params_json` on-chain; captioned uploads carry the caption in `params_json` (D-082). The gap is purely surfacing it (and nudging uploaders to provide one).

This builds on the shipped `/launch` base-finder (see origin: `docs/brainstorms/2026-06-07-launch-ask-model-finder-requirements.md`), which ranks on these same descriptions.

---

## Requirements

**Description resolution**
- R1. A shared resolver maps a model to its display description and kind: Tripo → the prompt (kind = *Prompt*); a captioned upload → the caption (kind = *AI description*); a model with neither → no description.
- R2. The kind drives a visible label so an AI caption is never presented as a human-written prompt.

**Display surfaces**
- R3. Detail page (`/model/:id`): show the description as a clean, readable labeled block near the model's name/metadata, replacing the buried raw-JSON expander as the primary description affordance.
- R4. Model cards: show a truncated description snippet on the market grid card and the `/launch` base-picker card.
- R5. 3D preview surfaces: show the description on the detail-page 3D viewer, the `/launch` picked-base preview, and the `/create` upload preview.
- R6. A model with no description (uncaptioned upload) shows **no** description block on any surface — no placeholder text.

**Publish-time no-caption nudge**
- R7. On `/create`, attempting to publish an **upload with no caption** opens a Continue / Cancel confirm dialog warning that the model will be hard to find in search. Cancel returns to editing (so the user can add a caption); Continue publishes anyway.
- R8. The warning fires for **any** uncaptioned upload, including when captioning is unavailable (flag off / no key) — informational in that case. Tripo models and captioned uploads never warn.

---

## Acceptance Examples

- AE1. **Covers R1, R3.** Given a Tripo model whose `params_json` has a prompt, when its detail page renders, then a labeled *"Prompt"* block shows the prompt text (not raw JSON).
- AE2. **Covers R1, R2, R3.** Given a captioned upload, when its detail page renders, then a labeled *"AI description"* block shows the caption.
- AE3. **Covers R6.** Given an uncaptioned upload, when any surface renders it, then no description block/snippet appears (no placeholder).
- AE4. **Covers R7.** Given `/create` upload mode with no caption entered, when the user clicks publish, then a Continue / Cancel warning appears; Cancel aborts the publish and returns to editing; Continue proceeds to publish.
- AE5. **Covers R8.** Given captioning is unavailable (button hidden), when the user publishes an uncaptioned upload, then the warning still appears (informational copy) with Continue / Cancel.
- AE6. **Covers R7.** Given a Tripo model or a captioned upload, when the user publishes, then no no-caption warning appears.

---

## Success Criteria

- A user evaluating a model (detail, card, or preview) can read what it is in plain language, instead of raw JSON or nothing.
- An uploader cannot silently publish an undiscoverable model — they get one clear, dismissible chance to add a caption first.
- The description shown everywhere is sourced from one resolver, so the label/kind and truncation behave consistently across surfaces.

---

## Scope Boundaries

- Backfilling or re-publishing the 2 existing uncaptioned uploads (`nasty-guy`, `turbo-seg`) — out of scope; they simply show no description.
- Any change to the caption generation, the mint write-path, or the contract — out of scope (already shipped, D-082).
- Collection detail and NFT-token detail pages — out of scope for this pass.
- Generating a caption on-demand at view time for models that lack one — out of scope.
- Any MemWal retrieval / get-by-modelId path — out of scope (mooted; the caption is on-chain).
- Making the no-caption warning a hard block — out of scope; it's a dismissible Continue/Cancel nudge, not a gate.

---

## Key Decisions

- **Display-only + one publish nudge** (no backend/contract): the caption write-path already exists (D-082), so the work is surfacing existing on-chain data plus a frontend confirm dialog.
- **Reuse the existing on-chain `caption`** rather than building any caption-retrieval infrastructure — MemWal recall is semantic (no get-by-id), and the caption is already in `params_json`, so retrieval is a non-problem.
- **Distinct `caption` field, labeled distinctly** ("Prompt" vs "AI description") rather than overloading "prompt", so consumers and users can tell a human prompt from an AI caption.
- **Always warn on uncaptioned upload** (even when captioning is unavailable) — the user chose transparency over only-actionable-nudge, so the trade-off is always visible before publish.

---

## Dependencies / Assumptions

- Captioned uploads already store `{ source: 'upload', caption }` in `params_json` on mint (verified at `frontend/src/buy`/`creator/CreateModelPage.tsx`); Tripo models store the prompt. The resolver reads these.
- The `/create` publish handler can intercept the publish action to show a confirm dialog before signing.
- `Model3DSummary.paramsJson` (already in the frontend index) is the description source on every surface — no extra fetch.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Which viewer component(s) host the caption (the shared `PreviewCanvas` vs `TurntablePreview`) on each of the three preview surfaces, and whether it's an overlay vs an adjacent caption.
- [Affects R4][Technical] Card snippet truncation length / behavior.
- [Affects R7, R8][Technical] Exact warning copy (and whether it adapts to captioning-available vs unavailable) and the confirm-dialog mechanism to reuse.
- [Affects R3][Technical] Whether to keep the raw "Params (json)" dev expander on the detail page alongside the new clean block, or drop it.
