---
date: 2026-06-08
topic: browse-semantic-search
---

# Browse Semantic Search

## Summary

Add the natural-language ("Ask") search field to `/browse`: a signed-in user describes what they want and matching collection cards promote to the front with a "why it matched" highlight — never hiding any card. A signed-out user sees the search field as a teaser that prompts them to log in. This reuses the `/launch` base-finder primitives verbatim with no backend change.

---

## Problem Frame

`/browse` is the catalog surface — the place a buyer or curious visitor (and the demo-day judge) lands to see what exists. Today the only way to narrow it is the tag-filter chips: coarse, predefined buckets that don't let someone express intent like "a fast race car" or "a low-poly sci-fi prop."

The just-shipped `/launch` base-finder (plan-002) already proved a better affordance: type a description, and semantic recall over creators' stored prompts surfaces relevant models. That capability sits one route away from the catalog where free-text discovery has the most narrative payoff, and the building blocks (`useMemoryRecall`, `rankForkableMatches`, the search-box + MatchReason highlight UI) are all shipped and tested. The cost of *not* surfacing it on `/browse` is a flat, filter-only catalog that under-sells the product's "describe it and find it" story precisely where evaluators look first.

---

## Actors

- A1. Signed-out visitor: lands on the public `/browse` catalog; can view cards and use tag filters, but has no JWT and cannot call recall.
- A2. Signed-in user (buyer or creator): has a valid JWT; can run semantic search and, because personal scope is included, sees their own published models highlighted alongside community matches.

---

## Requirements

**Search affordance & auth gating**
- R1. `/browse` renders a natural-language search field in the catalog header area (the default model-grid view).
- R2. When the user is signed in, the field is active and accepts free-text queries.
- R3. When the user is signed out, the field still renders but in a teaser state that prompts login and provides a path to sign in; no recall request is issued and no `Authorization` header is ever sent.

**Search behavior**
- R4. On a signed-in query, matching collection cards promote to the front of the grid, ordered best-match-first; all other cards remain visible in their existing order. Search never hides a card (reorder + highlight only).
- R5. Matched collection cards carry a "why it matched" highlight (the MatchReason treatment reused from `/launch`), including the stronger highlight for strong matches.
- R6. Recall draws on both personal and global scopes (same as `/launch`): a signed-in creator's own published models can match and highlight alongside community models.
- R7. A collection group's match is derived from its constituent variants — the group ranks by its closest-matching variant, and the displayed match reason comes from that variant.
- R8. Search composes with the existing tag filter: an active tag filter narrows the candidate set first, and search reorders within the narrowed set. Neither replaces the other.

**Honest state**
- R9. When a query produces no matches, the grid remains as-is (full catalog in default order) — the page does not present an empty or "no results" state, because semantic recall covers only models that have a stored prompt/caption and absence of a match is not absence of the model.
- R10. When recall is degraded (relayer unavailable), the page surfaces the degraded signal honestly (reusing the `useMemoryRecall` degraded flag) rather than rendering it as "zero matches."

---

## Acceptance Examples

- AE1. **Covers R2, R4, R5.** Given a signed-in user on `/browse`, when they type "a fast race car," then collection cards whose models semantically match promote to the front with a match highlight, and the rest of the catalog stays visible below.
- AE2. **Covers R3.** Given a signed-out visitor on `/browse`, when they look at the search field, then it shows a login prompt and typing/submitting does not trigger any recall network call.
- AE3. **Covers R6.** Given a signed-in creator whose own published model matches the query, when they search, then their model is highlighted alongside community matches (personal + global).
- AE4. **Covers R7.** Given a multi-variant collection where one variant matches the query, when the user searches, then that collection card promotes and its match reason reflects the matching variant.
- AE5. **Covers R8.** Given an active tag filter and a signed-in user, when they type a query, then results are reordered only within the tag-filtered subset.
- AE6. **Covers R9.** Given a signed-in user, when a query matches nothing, then the full catalog remains visible in its default order with no "no results" state.

---

## Success Criteria

- A signed-in user can describe what they want on `/browse` and see relevant collections rise to the top within roughly one debounce cycle, without losing sight of the rest of the catalog.
- A signed-out visitor understands that search exists and that logging in unlocks it, and never triggers an unauthorized recall call.
- The feature ships with no change to the backend or the `/api/memory/recall` contract — purely a frontend reuse of shipped primitives.
- A demo-day walkthrough can type a plain-language query on the catalog page and get a visibly relevant, honest result (matches promoted; nothing faked when coverage is thin).

---

## Scope Boundaries

- No backend or `/api/memory/recall` changes; the feature rides the existing JWT-gated proxy → MemWal relayer chain.
- No search inside the `?filter=integration` view (that is a separate collections list driven by a different hook; it stays as-is).
- No filter-style search (hiding non-matches) — explicitly rejected in favor of reorder + highlight.
- No backfill of the two existing caption-less uploads (nasty-guy, turbo-seg); they simply won't match until they have a stored description.
- Signed-out users cannot *execute* search — they only see the teaser + login prompt.

---

## Key Decisions

- Auth = "Option A, softened": search field always renders; recall is gated to signed-in users, and the signed-out state is a login teaser rather than a hidden element. Chosen so the affordance is discoverable (and demos the value) without weakening the JWT gate or touching the backend.
- Reorder + highlight, never hide (mirrors `/launch` R5): the most honest behavior given partial semantic coverage — a thin or missing match degrades to "catalog unchanged," not a misleading empty state.
- Personal + global scope (mirrors `/launch`): keeps behavior consistent with the already-shipped finder and lets a signed-in creator find their own work; accepted the small extra MemWal read cost.
- Reuse `useMemoryRecall`, `rankForkableMatches`, and the `/launch` search-box + MatchReason UI rather than building new search infrastructure.

---

## Dependencies / Assumptions

- Depends on the shipped `useMemoryRecall` hook, `rankForkableMatches` (baseSearchRanking), and the existing `/api/memory/recall` backend proxy + MemWal relayer.
- Assumes `RecallChip.modelId ↔ Model3DSummary.objectId` join holds for `/browse` models the same way it does for `/launch` forkable bases (verified: same `Model3DSummary` shape from the model index).
- Assumes the existing relevance gate (`MEMORY_MAX_DISTANCE` = 0.66) is acceptable for catalog discovery; no new tuning planned for v1.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3][Technical] Exact signed-out teaser interaction — disabled input with adjacent login CTA vs. clickable input that opens the wallet/login flow on focus. Pick the lower-friction option that fits the existing nav/login pattern.
- [Affects R7][Technical] Where the collection-group match aggregation lives — extend `rankForkableMatches` consumption at the `/browse` grouping layer vs. a thin adapter that maps per-objectId matches onto `groupByCollection` keys. Mechanical; resolve against the actual `BrowsePage` grouping code.
- [Affects R4, R8][Technical] Whether ranking runs over the full model list then re-groups, or over already-grouped collections; both yield the same UX — choose for clarity against existing `collectionGroups` memoization.
