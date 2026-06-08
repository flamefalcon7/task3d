---
date: 2026-06-07
topic: launch-ask-model-finder
---

# Launch Page "Ask" — Natural-Language Base-Model Finder

## Summary

Add a natural-language search box to the "pick a base model to fork" step on `/launch`. As the forker types a description (debounced, live re-query), the existing forkable model grid reorders/highlights to surface semantically matching bases. It reuses the already-live MemWal semantic recall (D-080) over **personal + global** namespaces — no new backend infrastructure, no Gemini.

---

## Problem Frame

The `/launch` flow opens with *"1. Pick a base model to fork"* — a grid of forkable `Model3D` objects from `useModelIndex` (`frontend/src/collection/LaunchCollectionPage.tsx`). Today the only way to find the right base is to eyeball the grid. As the catalog grows (community publishes + the forker's own past creations), scanning by thumbnail/name gets slow, and the forker has no way to express intent like *"a low-poly animal I can recolor"*.

The product already ships the substrate to fix this: D-080 dual-writes every non-RESTRICTED publish into a shared `global` MemWal namespace (and every publish into the creator's personal namespace), and `/api/memory/recall` already turns a free-text query into semantically-ranked `modelId`s. The pain is purely that this capability isn't surfaced on the launch picker.

---

## Actors

- A1. **Forker** (signed-in): browsing `/launch` to find a base to fork into an L2 collection. Drives the ask box; wants their own past bases *and* community bases.
- A2. **Base creator**: published the `Model3D`; their original creation prompt is the text the search semantically matches against (via the global namespace record).

---

## Key Flows

- F1. **Ask-to-find a base**
  - **Trigger:** Forker types a description into the ask box on the "pick a base" step.
  - **Actors:** A1
  - **Steps:** (1) Debounced query fires single-shot recall against personal + global scopes. (2) Results (ranked `modelId`s) are merged, de-duped, filtered to the forkable set. (3) Matching base cards move to the front / are highlighted, each annotated with why it matched (creator prompt + relevance). (4) Forker refines text → results update live. (5) Forker picks a base and continues the existing fork flow unchanged.
  - **Outcome:** Forker reaches a relevant base faster; the rest of the launch flow is untouched.
  - **Covered by:** R1, R2, R3, R4, R6

- F2. **Empty / no-match / recall failure**
  - **Trigger:** Query returns nothing above the relevance gate, or recall errors/degrades.
  - **Actors:** A1
  - **Steps:** Show the full forkable grid in its default order with a quiet "showing all / no semantic matches" affordance; never block or error.
  - **Outcome:** The picker is always at least as usable as it is today.
  - **Covered by:** R5, R7

---

## Requirements

**Search behavior**
- R1. Add a natural-language ask/search box at the top of the "pick a base model to fork" step on `/launch`.
- R2. On input, run **single-shot** semantic recall (debounced live re-query) — no conversation state, no clarifying questions, no turn memory.
- R3. Query **both** the forker's personal namespace and the shared global namespace; merge results and de-dupe by model so the forker finds their own bases *and* community bases in one ranked list.
- R4. Rank merged matches by semantic relevance (recall distance, ascending).

**Result presentation & integrity**
- R5. The search **reorders/highlights** the existing forkable grid — it MUST NOT hide non-matching bases. The full forkable list stays reachable.
- R6. Each surfaced match shows *why it matched* — the base creator's original prompt plus a relevance signal — not an opaque ordering.
- R7. Restrict displayed matches to the **forkable** set (standalone GLB present, non-RESTRICTED); recall hits that aren't forkable are dropped. De-dupe across personal/global.

**Coverage honesty**
- R8. Only bases with a prompt-based memory record are semantically matchable. Bases without one (pure GLB upload with no prompt, or published before D-080's dual-write) still appear in the full grid but won't be reordered by the ask. This limitation is surfaced honestly, not hidden.

**Auth & cost**
- R9. Reuse the launch page's existing sign-in (recall requires a JWT session); no new auth surface.
- R10. No Gemini / generative-LLM dependency and no copilot quota consumption — the feature is embedding-recall only.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4.** Given a signed-in forker on `/launch` with both their own and community bases published, when they type "low-poly race car", then forkable bases whose creator prompts are semantically near "race car" move to the front, ranked by relevance, drawn from both their personal and the global namespace.
- AE2. **Covers R5, R7.** Given a query that matches one base, when results render, then that base is highlighted/front-ranked **and** all other forkable bases remain visible and selectable below.
- AE3. **Covers R5, R7 (failure path).** When recall errors or returns nothing above the relevance gate, then the full forkable grid renders in default order with a quiet "showing all" note and no error state.
- AE4. **Covers R8.** Given a forkable base that was published with no prompt (upload-only), when any query runs, then that base is never reordered to the front by the ask but still appears in the full grid and can be picked.

---

## Success Criteria

- A forker can reach an intended base by describing it in plain language, instead of scanning the whole grid — and finds both their own and community bases in one search.
- The picker is never *worse* than today: no query, a failed query, or an unmatchable catalog all degrade to the current full-grid experience.
- A downstream implementer can build this as a frontend integration of `/api/memory/recall` (personal + global) over the existing `useModelIndex` forkable list, with no backend or contract changes and no new external dependency.

---

## Scope Boundaries

- Conversational / multi-turn copilot, clarifying questions, query rewriting or generated match explanations (the Gemini-backed copilot path) — excluded.
- Any Gemini seam usage or copilot-quota consumption — excluded.
- A new merged server-side `scope:'both'` recall endpoint — out of scope for v1; the merge is done client-side via two recall calls. Revisit only if the extra round-trip proves costly.
- Building a semantic index over model `tags`/`name`/`partLabels` — out of scope; matching is against creators' prompts already in MemWal.
- Pure client-side fuzzy/keyword filtering — not the v1 mechanism (possible future fallback for unmatchable bases, not built now).
- Any change to D-080's dual-write, namespace-binding security model, or the relevance gate — out of scope.

---

## Key Decisions

- **Reuse `/api/memory/recall`, not new infra**: D-080 already populates personal + global namespaces on publish and exposes ranked semantic recall — the launch ask is a frontend reuse.
- **Personal + global merged scope**: a forker fork-shopping wants their own bases (personal namespace) and the community's (global namespace, which excludes self); merging covers both. Merge client-side.
- **#2 live re-query, not conversational**: debounced repeated single-shot recall (mirrors `/create`'s recall chips) reads as "interactive" without the copilot's turn-state/quota cost.
- **No Gemini**: the task is retrieval/ranking, handled by MemWal's embedding model (`text-embedding-3-small`), not text generation. Avoiding Gemini also frees the scarce demo quota and removes LLM latency.
- **Fail-soft reorder, never hide**: search only reranks the forkable grid; coverage gaps and recall failures degrade to today's behavior.

---

## Dependencies / Assumptions

- MemWal managed testnet relayer is reachable (same dependency as the existing `/create` recall; fail-soft if not).
- The forkable bases the forker cares about were published *through* the memory dual-write path (R8 coverage caveat) — older/upload-only bases are matchable only by the full grid.
- `recall`'s returned `modelId` joins cleanly to `Model3DSummary.objectId` in the forkable list.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3, R4][Technical] Are personal-namespace and global-namespace recall distances directly comparable for a single merged ranking, or does the merge need per-scope normalization? (Same embedding model/threshold suggests yes; verify during planning.)
- [Affects R6][Technical] Exact match-reason affordance on the base card (badge, reorder animation, prompt snippet) — UX detail for planning; mirror `/create` recall chips where sensible.
- [Affects R2][Technical] Debounce interval and whether to also fire on explicit submit — tune during implementation against the existing `/create` recall debounce.
- [Affects R3][Needs research] Whether to keep two client-side recall calls or add a server `scope:'both'` later, based on observed latency.
