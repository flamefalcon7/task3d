---
date: 2026-06-08
type: feat
status: completed
title: "feat: Surface model descriptions (prompt / AI caption)"
origin: docs/brainstorms/2026-06-08-model-description-surfacing-requirements.md
---

# feat: Surface model descriptions (prompt / AI caption)

## Summary

Show each model's description — the human **Prompt** (Tripo) or the **AI caption** (uploads) — on the detail page, model cards, and the detail + `/launch` 3D preview surfaces, via one shared `modelDescription()` resolver. Plus a publish-time styled confirm dialog that warns before an uncaptioned upload ships. Frontend-only; the caption write-path already exists (D-082).

---

## Problem Frame

The `/launch` base-finder (plan-002) ranks bases by semantic similarity to each model's description, but that description is nearly invisible: on the detail page it's buried in a collapsed "Params (json)" raw-JSON expander (`frontend/src/buy/ModelDetailPage.tsx:580-585`), and cards/previews don't show it at all. Nothing warns an uploader that skipping the caption makes their model undiscoverable in search.

The data already exists on-chain — Tripo models carry the prompt in `params_json.prompt`; captioned uploads carry `params_json.caption` (D-082, written at `frontend/src/creator/CreateModelPage.tsx:978-984`). So this is a display feature plus one publish-flow nudge — no backend, no contract.

Builds on the shipped `/launch` base-finder (see origin: `docs/brainstorms/2026-06-07-launch-ask-model-finder-requirements.md`).

---

## Requirements Traceability

| Origin | Covered by |
|---|---|
| R1 shared resolver (prompt/caption/none + kind) | U1 |
| R2 kind drives visible label (Prompt vs AI description) | U1, U2, U3 |
| R3 detail-page clean labeled block (replaces buried JSON) | U2 |
| R4 model cards (market + /launch picker) snippet | U3 |
| R5 3D preview surfaces — detail viewer + /launch picked-base; `/create` satisfied by the existing editable DESCRIPTION field (no new render) | U2, U3 |
| R6 no description → no block/placeholder | U1, U2, U3 |
| R7 publish-time no-caption Continue/Cancel warning | U4 |
| R8 warning always fires (incl. captioning unavailable), context-aware copy | U4 |
| AE1–AE3 (display) | U1, U2, U3 |
| AE4–AE6 (publish warning) | U4 |

---

## Key Technical Decisions

- **Resolver lives in `shared/src/`** (not a frontend util dir — none exists; format helpers are copy-pasted per file today). `modelDescription()` reads `Model3DSummary.paramsJson`, and that type is defined in `shared/src/types.ts`, so the pure resolver belongs beside it, mirroring `shared/src/memory.ts` + its co-located test. One resolver, all consumers — avoids the "silent drift" failure mode of three inline parsers (learning: `docs/solutions/design-patterns/param-ranges-single-source-of-truth-2026-05-15.md`).
- **Returns `null` for uncaptioned uploads** (`{source:'upload'}` with no `caption` key — D-082 guarantees no empty-string placeholder), so every surface renders nothing rather than a placeholder (R6).
- **Styled inline confirm panel** for the publish warning (user decision), token-aligned and testid-driven, matching the app's existing `SignConfirmation` two-step trigger/confirm pattern — NOT `window.confirm`. The warning is an exception state, so accent is permissible but counts toward the ≤5/page budget (D-044/D-099); description body text stays on neutral tokens.
- **`/launch` card dedupe**: the base-picker's existing `MatchReason ↳` badge already renders the base's prompt. When a search match is present for a card, show the match-reason and **suppress** the static description snippet (never both).
- **`/create` upload preview is out of scope** — it already shows the live caption in the editable "DESCRIPTION" textarea under the preview; no new display needed.
- **Pure synchronous read** — the description comes from the already-loaded `Model3DSummary`, not a new async fetch, so no new race surface. (If any preview caption is ever wired behind a post-load `aliveRef` effect, re-assert `true` in setup and wrap the test in `<StrictMode>` — learning: `docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`.)

---

## Implementation Units

### U1. Shared `modelDescription()` resolver

**Goal:** A pure resolver that maps a model to its display description + kind, used by every display surface.

**Requirements:** R1, R2, R6.

**Dependencies:** none.

**Files:**
- `shared/src/modelDescription.ts` (new)
- `shared/src/modelDescription.test.ts` (new)
- `shared/src/index.ts` (modify — re-export, mirroring the `memory.ts` export)

**Approach:**
- Signature (directional): `modelDescription(summary: Model3DSummary): { text: string; kind: 'prompt' | 'caption' } | null`.
- Parse `summary.paramsJson` (wrap `JSON.parse` in try/catch → `null` on malformed). Tripo (`prompt` present, non-empty) → `{ text: prompt, kind: 'prompt' }`; captioned upload (`caption` present, non-empty) → `{ text: caption, kind: 'caption' }`; otherwise `null`.
- Do not branch on `shapeType` to decide presence — branch on the parsed fields (a Tripo model always has `prompt`; an upload has `caption` only when captioned). `shapeType` is not the discriminator.

**Patterns to follow:** `shared/src/memory.ts` (pure module + co-located test, re-exported via `shared/src/index.ts`).

**Test scenarios (`shared/src/modelDescription.test.ts`):**
- Covers AE1. Tripo `params_json {"prompt":"..."}` → `{ text, kind:'prompt' }`.
- Covers AE2. Captioned upload `{"source":"upload","caption":"..."}` → `{ text, kind:'caption' }`.
- Covers AE3/R6. Uncaptioned upload `{"source":"upload"}` → `null`.
- Empty/whitespace prompt or caption → `null` (no blank block).
- Malformed JSON (`paramsJson = "{not json"`) → `null`, no throw.
- `params_json = "{}"` → `null`.

### U2. Detail page — labeled description block + 3D viewer caption

**Goal:** Replace the buried raw-JSON expander with a clean labeled description block, and caption the detail-page 3D viewer.

**Requirements:** R2, R3, R5, R6.

**Dependencies:** U1.

**Files:**
- `frontend/src/buy/ModelDetailPage.tsx` (modify)
- `frontend/src/buy/ModelDetailPage.test.tsx` (modify)

**Approach:**
- Call `modelDescription(model)`. When non-null, render a clean labeled block in the metadata column (between the Tags block ~`:549` and the fee blocks ~`:551`): label *"Prompt"* (kind `prompt`) or *"AI description"* (kind `caption`), with the text below. Neutral tokens.
- Caption the 3D viewer: render the same description as an adjacent block (or absolute overlay) on the viewer well wrapping `renderViewerPane()` (~`:269-321`) — `PreviewCanvas`/`TurntablePreview` have no caption slot, so it's a sibling at the call site, keyed off the in-scope `model`.
- Demote the raw "Params (json)" `<details>` expander below the clean block (keep it for devs; it's no longer the primary affordance). The clean block is the R3 description surface.
- Null description → neither the block nor the viewer caption renders (R6). Layout **reflow** when the block toggles present/absent is acceptable — no reserved spacer.

**Patterns to follow:** existing metadata rows (`<strong>Creator:</strong>` etc., `:525-531`); `ModelDetailPage.test.tsx` `makeModel` factory (`:66`, `paramsJson` `:74`) + `useModelByIdMock` (`:18-21`).

**Test scenarios (`frontend/src/buy/ModelDetailPage.test.tsx`):**
- Covers AE1. Tripo model → a *"Prompt"*-labeled block shows the prompt text (assert via testid/textContent).
- Covers AE2/R2. Captioned upload → an *"AI description"*-labeled block shows the caption.
- Covers AE3/R6. Uncaptioned upload → no description block and no viewer caption rendered.
- The viewer caption renders the same text alongside the canvas for a described model.
- The raw "Params (json)" expander still exists (demoted), not removed.

### U3. Model cards + /launch surfaces (market card, picker card, picked-base preview)

**Goal:** Show a description snippet on the market grid card and the `/launch` base-picker card, and caption the `/launch` picked-base preview — deduped against the existing match-reason.

**Requirements:** R2, R4, R5, R6.

**Dependencies:** U1.

**Files:**
- `frontend/src/browse/ModelCard.tsx` (modify)
- `frontend/src/collection/LaunchCollectionPage.tsx` (modify — base-picker cards + picked-base preview)
- `frontend/src/browse/BrowsePage.test.tsx` (modify — exercises ModelCard)
- `frontend/src/collection/LaunchCollectionPage.test.tsx` (modify)

**Approach:**
- **Market card** (`ModelCard.tsx`): render a one-line truncated snippet from `modelDescription(model)` in the card body (between the creator line ~`:70` and the shape/price row ~`:71`), mirroring the name's single-line ellipsis style (`:60-64`). Null → nothing.
- **/launch base-picker card** (`LaunchCollectionPage.tsx`, both the locked `<div>` and launchable `<button>` variants, inside `orderedForkable.map` ~`:1412`): render the snippet inside `baseOptionBody` (under `baseOptionName`). **Dedupe (per-card boolean, no global query state):** if this card's match metadata (`baseMatches.get(m.objectId)`) is non-null in the current render, suppress the static snippet (the `MatchReason` already shows the prompt); otherwise show the snippet. Null description → nothing.
- **/launch picked-base preview** (`LaunchCollectionPage.tsx` ~`:1633-1649`): render the picked base's description **below** `<VariantPreview>` in `previewLayout`, sourced from `modelDescription(base)`. Caption at the call site (VariantPreview has no caption prop).
- Truncation: CSS single-line ellipsis on cards (no documented prior convention — keep it token-aligned). Card-height **reflow** between described and undescribed cards is acceptable (the auto-fill grid tolerates it) — no min-height spacer.

**Patterns to follow:** `ModelCard.tsx` name ellipsis style; the existing `MatchReason` component + `metaLine` in `LaunchCollectionPage.tsx` (`:247-265`, `:1439-1443`); `BrowsePage.test.tsx` `makeModel` (`:35`), `LaunchCollectionPage.test.tsx` `summary` (`:242`) + `base-option-*` testids.

**Test scenarios:**
- Covers AE1/R4 (`BrowsePage.test.tsx`). A Tripo model card shows its prompt snippet; an uncaptioned upload card shows none (AE3/R6).
- Covers AE2 (`BrowsePage.test.tsx`). A captioned upload card shows the caption snippet.
- `LaunchCollectionPage.test.tsx`: a forkable base with a description shows the snippet on its base-option card (both launchable and locked variants).
- **Dedupe**: with an active search match on a base, the card shows the `MatchReason` and NOT a duplicate static snippet; with no active query, it shows the static snippet.
- Picked-base preview shows the base's description; picking an uncaptioned-upload base shows no preview caption (R6).

### U4. Publish-time no-caption confirm dialog

**Goal:** Warn before publishing an uncaptioned upload via a styled Continue / Cancel inline panel; Cancel returns to editing.

**Requirements:** R7, R8.

**Dependencies:** none (uses live publish state, not the resolver).

**Files:**
- `frontend/src/creator/CreateModelPage.tsx` (modify — intercept `onMint`)
- `frontend/src/ux/` confirm panel (new small component **or** inline confirm state in `CreateModelPage.tsx` — implementer's call; see Approach)
- `frontend/src/creator/CreateModelPage.test.tsx` (modify)

**Approach:**
- Intercept the publish handler `onMint` (`CreateModelPage.tsx:904-1061`, wired to `<MintButton onClick={onMint}>` ~`:1506`) **after** required-field validation passes and **before** `setMintStatus('uploading')` (~`:922`): if `sourceMode === 'upload' && !caption.trim()`, open the confirm panel instead of proceeding.
- The panel is a styled, token-aligned Continue / Cancel inline panel (testid-driven, two-step trigger/confirm), modeled on the `SignConfirmation` pattern (`frontend/src/ux/SignConfirmation.tsx`) but purpose-built for the nudge (SignConfirmation is hard-coupled to wallet-signing copy). **Continue** runs the original publish body; **Cancel** closes the panel and returns to editing (no publish). **While the panel is open the MintButton is disabled/replaced** (as in SignConfirmation's two-step) so a second publish can't be triggered. It is an exception-state surface, so accent is permitted (count toward ≤5/page; D-044/D-099).
- **Context-aware copy (R8):** the warning always fires for an uncaptioned upload (Tripo models and captioned uploads never trigger it). Branch on the `captionOn` flag (`CreateModelPage.tsx:700`; it gates the "Describe with AI" button rendered ~`:1291`). Pin the copy *shape* now so AE5 is testable (final polish deferred):
  - heading (both variants): "Publish without a description?"
  - body when `captionOn` is true: "No caption means this model won't show up in search. Add one with 'Describe with AI' first?"
  - body when `captionOn` is false: "No caption means this model won't show up in search (captioning is unavailable right now)."
  - buttons (both): **Continue** = "Publish anyway", **Cancel** = "Go back".

**Execution note:** Start with a failing test asserting that publishing an uncaptioned upload opens the panel and does NOT call the publish PTB builder until Continue.

**Patterns to follow:** `SignConfirmation.tsx` two-step `${prefix}-trigger`/`${prefix}-cancel`/`${prefix}-confirm` testid convention; `CreateModelPage.test.tsx` publish assertions via `buildPublishPtbMock` call args (`:118`/`:125`) + `captionState` toggles (`:96-111`) + `mint-button` (`:529`).

**Test scenarios (`frontend/src/creator/CreateModelPage.test.tsx`):**
- Covers AE4. Upload mode, empty caption, click mint → the confirm panel appears and `buildPublishPtbMock` is NOT called.
- Covers AE4. Cancel → panel closes, no publish, still in edit state (`buildPublishPtbMock` not called).
- Covers AE4. Continue → publish proceeds (`buildPublishPtbMock` called).
- Covers AE5/R8. Captioning unavailable (`captionState.available = false`) + uncaptioned upload → panel still appears (informational copy variant).
- Covers AE6. Tripo model → no panel, publishes directly.
- Covers AE6. Captioned upload (non-empty caption) → no panel, publishes directly.

---

## System-Wide Impact

- **Surfaces touched:** `shared` (new resolver), detail page, market card, `/launch` page (cards + preview), `/create` publish flow. All consume the single resolver (U1), so labeling/empty-state behavior stays consistent by construction.
- **`/launch` plan-002 interaction:** the base-picker already renders the prompt via `MatchReason`; U3's dedupe rule is the one real cross-feature seam — the static snippet must yield to the match-reason.
- **No backend / contract / write-path change** — the caption is already written on mint (D-082); the existing 2 uncaptioned uploads simply show no description (out of scope, no backfill).
- **Design-token review:** description body text on neutral tokens; only the U4 warning may spend accent (exception state). The default frontend review roster applies (this is frontend-touching): `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`, plus `ce-julik-frontend-races-reviewer`.

---

## Scope Boundaries

Carried from origin (`docs/brainstorms/2026-06-08-model-description-surfacing-requirements.md`):

- Backfilling / re-publishing the 2 existing uncaptioned uploads (`nasty-guy`, `turbo-seg`) — excluded; they show no description.
- Any caption-generation, mint write-path, or contract change — excluded (already shipped, D-082).
- Collection detail + NFT-token detail pages — excluded this pass.
- On-demand caption generation at view time — excluded.
- Any MemWal retrieval / get-by-modelId — excluded (mooted; caption is on-chain).
- Making the no-caption warning a hard block — excluded; it's a dismissible Continue/Cancel nudge.
- `/create` upload preview read-only caption — excluded; the editable "DESCRIPTION" textarea already shows the live caption there.

### Deferred to Follow-Up Work

- Capturing a card-snippet truncation convention via `/ce-compound` once settled (no documented prior art; will recur on text-bearing cards).

---

## Deferred to Implementation

- Exact placement of the detail-page viewer caption (adjacent block vs absolute overlay) and the `/launch` preview caption layout — settle against the live viewer wells.
- Card snippet max length / line-clamp specifics.
- Final warning-dialog copy strings (both the captioning-available and unavailable variants).
- Whether the demoted raw "Params (json)" expander stays or is removed once the clean block lands (lean: keep, demoted).

---

## Open Questions

### Resolved (this planning session)

- Resolver home → `shared/src/` (beside `Model3DSummary`).
- Confirm-dialog mechanism → styled inline panel (not `window.confirm`).
- `/create` upload preview → already satisfied (editable caption field) → out of scope.
- `/launch` card double-render → dedupe (match-reason wins over static snippet).

### Deferred to Implementation

- [Affects U2][Technical] Viewer-caption rendering (overlay vs adjacent).
- [Affects U3][Technical] Snippet truncation length.
- [Affects U4][Technical] Exact copy strings.
