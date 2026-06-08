---
date: 2026-06-07
type: feat
status: completed
title: "feat: Launch-page natural-language base-model finder"
origin: docs/brainstorms/2026-06-07-launch-ask-model-finder-requirements.md
---

# feat: Launch-page natural-language base-model finder

## Summary

Add a debounced natural-language search box to the "1. Pick a base model to fork" step on `/launch`. As the forker types, it runs single-shot MemWal semantic recall over **personal + global** namespaces (reusing the live `/api/memory/recall`), merges + de-dupes the hits, joins them to the forkable model grid, and reorders/highlights matching bases — never hiding non-matches. The recall machinery is extracted from `/create`'s `useCreatorMemory` into a neutral shared hook. No backend, contract, or Gemini changes.

---

## Problem Frame

`/launch` opens with a grid of forkable `Model3D` objects (`frontend/src/collection/LaunchCollectionPage.tsx`, `forkable` at ~line 437, grid at ~1319–1411). Today the only way to find the right base is to eyeball thumbnails/names; the forker can't express intent like *"a low-poly animal I can recolor"*, and the grid grows with community publishes plus the forker's own creations.

The substrate to fix this already ships: D-080 dual-writes every non-RESTRICTED publish into a shared `global` MemWal namespace (and every publish into the creator's personal namespace), and `/api/memory/recall` already turns free text into semantically-ranked `modelId`s — the same machinery `/create`'s Riff Copilot uses (`frontend/src/creator/useCreatorMemory.ts`). The gap is purely that this capability isn't surfaced on the launch picker.

This plan builds on the origin requirements doc (see origin: `docs/brainstorms/2026-06-07-launch-ask-model-finder-requirements.md`), carrying forward R1–R10, flows F1/F2, and acceptance examples AE1–AE4.

---

## Requirements Traceability

| Origin | Covered by |
|---|---|
| R1 search box on launch picker | U3 |
| R2 single-shot debounced live re-query, not conversational | U1, U3 |
| R3 query personal + global, merge + de-dupe | U1, U2 |
| R4 rank by recall distance ascending | U2 |
| R5 reorder/highlight, never hide full forkable list | U2, U3 |
| R6 show "why it matched" (creator prompt + relevance) | U2, U3 |
| R7 restrict to forkable set; drop non-forkable; de-dupe | U2 |
| R8 only prompt-having bases matchable; surfaced honestly | U2, U3 |
| R9 reuse existing sign-in (JWT); no new auth surface | U1, U3 |
| R10 no Gemini / copilot-quota dependency | U1 (recall-only) |
| F1 ask-to-find a base | U3 |
| F2 empty / no-match / recall failure → full default grid | U2, U3 |
| AE1–AE4 | U2, U3 test scenarios |

---

## Key Technical Decisions

- **Extract a neutral `useMemoryRecall` hook** (user decision, this session): lift the recall core out of `useCreatorMemory` into a shared hook both `/create` and `/launch` consume. `useCreatorMemory` becomes a thin wrapper that adds `rememberCreation`. Rationale: `/launch` needs the recall surface but not creation capture; a creator-named hook on the launch page is a semantic mismatch. **Cost acknowledged**: this touches `/create`'s battle-tested race-handling code → behavior-preserving refactor posture, existing tests are the regression net.
- **Reuse the live `/api/memory/recall` as-is** (see origin: Key Decisions): D-080 already populates both namespaces on publish and exposes ranked semantic recall. No backend or `scope:'both'` endpoint in v1 — the merge is client-side via two recall calls.
- **Merge by ascending distance, de-dupe by `modelId` keeping the min distance.** Same embedding model + same server `RECALL_MAX_DISTANCE` make personal vs global distances nominally comparable for one sort; verify empirically during U2 implementation before trusting a naive merged sort (origin deferred Q).
- **Join `RecallChip.modelId` ↔ `Model3DSummary.objectId`; drop hits absent from `forkable`** (handles index/MemWal lag and non-forkable hits — R7). Never render a phantom card for a recall hit with no matching forkable object.
- **Strong-match highlight at `distance < 0.45`**, mirroring `/create`'s `STRONG_MATCH_THRESHOLD` in `PromptMemoryChips.tsx`. Do not add a second client-side distance ceiling — the server already gates at `RECALL_MAX_DISTANCE`.
- **`creator` is optional** — present only on global hits, absent on personal. Never key the merge or the match-reason badge on `creator` being defined.
- **Fail-soft, reorder-only** (R5/F2): no query, expired/missing session, recall error, or zero matches all degrade to the full forkable grid in default order with a quiet "showing all" affordance — never an error state, never a hidden card.

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
forker types ──► useMemoryRecall (debounced, MIN_QUERY_LEN=3)
                   ├─ recallPersonal(q)  → personal chips  (distance, no creator)
                   └─ recallGlobal(q)    → global  chips  (distance, creator)
                                   │
                   rankForkableMatches(personal, global, forkable):   [U2, pure]
                     merge → de-dupe by modelId (min distance)
                     → intersect with forkable[].objectId  (drop non-forkable)
                     → sort ascending by distance
                     → annotate { matched, strong: d<0.45, reason: prompt, distance }
                                   │
                   LaunchCollectionPage grid:                          [U3]
                     query active & matches  → matched bases first (highlighted) + rest below
                     query active & 0 matches → full grid, "showing all" note
                     no query / error        → full grid, default order
```

---

## Implementation Units

### U1. Extract neutral `useMemoryRecall` hook from `useCreatorMemory`

**Goal:** Move the recall core (debounced two-scope fetch, monotonic-seq stale-response rejection, account-switch clearing, fail-soft non-throwing fetch, `MIN_QUERY_LEN`/`RECALL_DEBOUNCE_MS` constants) into a neutral shared hook. Refactor `useCreatorMemory` to consume it and retain only `rememberCreation` plus a re-export of the recall surface.

**Requirements:** R2, R3, R9, R10 (recall-only, no Gemini).

**Dependencies:** none.

**Files:**
- `frontend/src/memory/useMemoryRecall.ts` (new — neutral recall hook)
- `frontend/src/memory/useMemoryRecall.test.ts` (new — recall race/debounce/auth tests)
- `frontend/src/creator/useCreatorMemory.ts` (modify — consume the new hook; keep `rememberCreation`, keep `recallSimilar`/`recallCommunity`/`chips`/`community`/status names as a thin pass-through so `/create` call sites are untouched)
- `frontend/src/creator/useCreatorMemory.test.ts` (verify still green; adjust only mock wiring if internal structure moved)

**Approach:**
- **One hook instance manages both scopes** (shared `mounted`/`tokenRef`, per-scope `seq` refs) — NOT two single-scope `useMemoryRecall` instances. This is the structural property the existing per-scope race tests rely on; modelling it as two instances would change the shape they assert (feasibility review).
- Neutral hook exposes recall for both scopes: a personal call (scope omitted → backend derives namespace from JWT `sub`) and a global call (`scope: 'global'`). Limits are caller-overridable but **default to the `/create` baseline** (personal `limit: 5`, global `limit: 3`); keep the global limit at 3 unless reviewed — effective MemWal reads ≈ `limit × GLOBAL_OVERFETCH(4)` per keystroke per scope.
- **A single `authToken` derivation** (`session && !isJwtExpired(session.jwt)`) gates BOTH the personal and global fetch — do not split into per-scope token checks. No token → neither call fires, no `Authorization` header ever sent (security review).
- Keep the **per-scope monotonic `seq` ref** stale-rejection and the `tokenRef.current === token` re-check exactly as today — each scope guards its own race so a fast global response can't clobber an in-flight personal one. Extend the `tokenRef` re-check to the non-OK and catch branches too, so no post-account-switch response of any kind can commit under a stale token (adversarial review).
- **Distinguish degraded from empty**: the recall route returns HTTP 200 + `results: []` with an `x-memwal-degraded: 1` header when the relayer fails (it does NOT 4xx/5xx). Read that header and expose a per-scope `degraded` signal — a degraded scope must NOT be silently treated as "zero matches" (drives the U3 honest-coverage note; adversarial review).
- Keep the `authToken`-keyed `useEffect` that clears all results on account switch.
- Keep the StrictMode-safe lifecycle effect form (`ref.current = true; return () => { ref.current = false }`) — never the cleanup-only form (see learning: `docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`).
- `useCreatorMemory` keeps its public signature so no `/create` component changes.

**Execution note:** Behavior-preserving refactor. The existing `useCreatorMemory.test.ts` and `/create` recall behavior are the characterization net — keep them green throughout; no behavior change to `/create`.

**Patterns to follow:** `frontend/src/creator/useCreatorMemory.ts` (the source of the logic being lifted); its test `frontend/src/creator/useCreatorMemory.test.ts` (fake-timers + `vi.stubGlobal('fetch')` + hoisted `useSession` mock recipe).

**Test scenarios (`frontend/src/memory/useMemoryRecall.test.ts`):**
- Happy path: a ≥3-char query, after 300ms debounce, fires one POST to `/api/memory/recall` with `Authorization: Bearer <jwt>`; personal request body omits `scope`, global request body includes `scope: 'global'`; returned `results` populate the respective list with `status: 'ready'`.
- Edge: query shorter than `MIN_QUERY_LEN` (e.g. 2 chars) → no fetch, status `idle`, results cleared.
- Edge: no session / expired JWT (`isJwtExpired` true) → no fetch for **either** scope (assert in one test), no Authorization header ever sent, status `idle`.
- Edge (debounce): rapid keystrokes within 300ms fire only the trailing query (assert single fetch call).
- Race: two in-flight queries return out of order → only the latest `seq` commits (stale earlier response dropped). Assert per scope independently.
- Account switch: `authToken` changes mid-session → all prior chips/community cleared; a late response (success OR non-OK) captured under the old token does not commit.
- Failure: non-OK recall response → prior results retained, status settles `ready`/`empty`, never throws.
- Degraded: 200 response carrying `x-memwal-degraded: 1` with `results: []` → scope marked `degraded` (distinct from a clean `empty`), so the caller can tell "relayer down" from "no matches".
- StrictMode: wrap the `renderHook` in `<StrictMode>` and confirm async recall still commits (guards against the cleanup-only-effect false-green).

### U2. Pure base-search ranking util (merge + de-dupe + join + sort)

**Goal:** A pure function that takes personal hits, global hits, and the `forkable` list and returns the forkable bases ordered for display with match metadata.

**Requirements:** R3, R4, R5, R6, R7, R8, F2.

**Dependencies:** none (pure; consumes `RecallChip` + `Model3DSummary` types only).

**Files:**
- `frontend/src/collection/baseSearchRanking.ts` (new — pure util)
- `frontend/src/collection/baseSearchRanking.test.ts` (new)

**Approach:**
- Signature (directional): `rankForkableMatches(personal: RecallChip[], global: RecallChip[], forkable: Model3DSummary[]): { ordered: Model3DSummary[]; matches: Map<objectId, { distance; strong; reason }> }`.
- Merge personal + global; **de-dupe by `modelId` keeping the minimum distance**; drop hits whose `modelId` is null or not in the `forkable` objectId set; sort survivors ascending by distance.
- `ordered` = matched forkable bases (ranked) followed by the remaining forkable bases in their original order — so the full list is always present (R5).
- `matches` carries per-base highlight + reason: `strong = distance < 0.45`; `reason` = the recall `prompt` (the base creator's original description — always present; `creator` is optional and not required for the reason).
- When personal + global are both empty (no query) or yield zero forkable matches, return `ordered` = `forkable` unchanged and an empty `matches` map — the caller renders the default grid (F2).

**Patterns to follow:** distance/strong-match convention from `frontend/src/creator/PromptMemoryChips.tsx` (`STRONG_MATCH_THRESHOLD = 0.45`); type sources `shared/src/memory.ts` (`RecallChip`) and `frontend/src/browse/useModelIndex.ts` (`Model3DSummary`).

**Test scenarios (`frontend/src/collection/baseSearchRanking.test.ts`):**
- Covers AE1. Personal + global hits for distinct forkable bases → both appear, ordered ascending by distance, drawn from both scopes.
- De-dupe: same `modelId` in both personal and global with different distances → appears once, keeping the min distance.
- Covers AE2 / R7. A recall hit whose `modelId` is not in `forkable` → dropped, never in `ordered`; all forkable bases still present.
- Null `modelId` (personal recall returns `modelId: null` for a trailer-less record) → dropped before the join and never used as a lookup key (no `null`-keyed Map/Set coercion); `ordered` unaffected.
- Covers R5. With one match, `ordered` = [matched base, ...all other forkable bases in original order]; nothing removed.
- Strong vs weak: distance `0.40` → `strong: true`; `0.60` → `strong: false`.
- Covers AE3 / F2. Empty personal + empty global → `ordered === forkable` order, empty `matches`.
- Covers AE4 / R8. A forkable base with no recall hit (no prompt record) is never promoted but always remains in `ordered`.
- `creator`-absent personal hit still produces a valid `reason` (no crash on `undefined` creator).

### U3. Launch search box UI + grid reorder/highlight + fail-soft states

**Goal:** Add the search input to the base-picker step, wire `useMemoryRecall` (both scopes) on debounced input, feed results through `rankForkableMatches`, and render the reordered/highlighted grid with honest empty/coverage states.

**Requirements:** R1, R5, R6, R8, R9, F1, F2.

**Dependencies:** U1, U2.

**Files:**
- `frontend/src/collection/LaunchCollectionPage.tsx` (modify — insert search box between the section heading ~line 1272 and the grid ~line 1320; reorder `forkable` via the ranking util before `.map`; apply highlight + match-reason on matched cards; render fail-soft notes)
- `frontend/src/collection/LaunchCollectionPage.test.tsx` (modify — add search-reorder, highlight, and fail-soft tests)

**Approach:**
- **Placement / lifecycle**: the controlled search input (`data-testid` e.g. `base-search-input`) renders ONLY inside the expanded-picker branch (the `else` of `base && !basePickerExpanded`), above the grid — never in the collapsed summary view. It is the **first focusable element** in the expanded picker section. Query state is discarded on collapse (a base was already chosen). Its value drives `useMemoryRecall` personal + global recall.
- Compute `{ ordered, matches }` from the current `forkable` + recall results; render `ordered` instead of raw `forkable` in the existing `.map` (a real **DOM reorder**, so keyboard tab-order matches visual rank). Keep the existing card components, `onPickBase` handler, `base-option-<objectId>` testids, locked-card logic, and `aria-pressed` unchanged — only the iteration order + an added highlight/badge change.
- **Match-reason + highlight**: launchable matched cards get a strong-match highlight (`distance < 0.45`) + the match-reason (creator prompt snippet + relevance), mirroring `PromptMemoryChips` tokens, zero-accent discipline. **Locked (non-launchable) matched cards** get the match-reason badge (so the forker knows why it ranked) but a **muted/dimmed highlight variant**, not the full accent — reinforcing it isn't pickable.
- **Interaction states** (name each explicitly so they aren't invented inconsistently):
  - *typing / in-flight (SWR)*: keep the current grid order, show a low-prominence inline "searching…" indicator near the search box (not over the cards); a brief top-N skeleton is acceptable only on the first query from idle. Mirror `PromptMemoryChips`' stale-while-revalidate posture.
  - *cleared* (input drops below `MIN_QUERY_LEN=3`): reset to the full default grid **immediately, no debounce** (snappy on clear); native input clearing suffices, no custom X button required for v1.
  - *coverage hint (R8)*: a **static sub-label always shown beneath the input** — e.g. "Matches bases published with a creation prompt." — setting expectation before typing, never disappearing on error paths.
- **Fail-soft (F2)**: query active but zero (clean) matches → full grid + quiet "showing all — no semantic matches" note; no session / non-OK recall → full default grid, no error surfaced. **Degraded scope** (`x-memwal-degraded`, from U1): when a scope is degraded rather than empty, surface an honest "some matches unavailable — showing all" note instead of presenting a one-sided merge (e.g. personal-only) as a complete answer.
- Selecting a base still flows into the unchanged fork pipeline (`onPickBase` collapses the picker, etc.).

**Patterns to follow:** existing base-picker render block in `LaunchCollectionPage.tsx` (~1271–1411); recall-chips presentation in `frontend/src/creator/PromptMemoryChips.tsx` / `CommunityRecall.tsx`; `LaunchCollectionPage.test.tsx` mock setup (`useModelIndex` + `useSession` mocks, `summary()` fixture factory, `base-option-*` assertions).

**Test scenarios (`frontend/src/collection/LaunchCollectionPage.test.tsx`):**
- Covers AE1 / F1. Typing a query (with mocked recall returning hits for two of three forkable bases) reorders those two to the front after debounce; assert order via the rendered `base-option-*` sequence.
- Covers AE2 / R5. With a single match, the matched card is highlighted **and** all other `base-option-*` cards remain present and clickable below.
- Covers R6. A matched card shows its match-reason affordance (creator prompt text / strong-match styling for `distance < 0.45`).
- Covers AE3 / F2. Recall returns empty (or fetch errors) → full grid renders in default order with the "showing all" note and no error state.
- Degraded: one scope returns degraded (personal has hits, global degraded) → the honest "some matches unavailable" note shows; the grid is NOT presented as a complete reorder.
- Locked card match: a matched ALLOW_LIST card without entitlement gets the match-reason badge + muted highlight variant, stays non-clickable.
- Cleared input: backspacing below `MIN_QUERY_LEN` resets to default order immediately (no debounce wait).
- Coverage hint (R8): the static "published with a creation prompt" sub-label is present whenever the search box is.
- Covers AE4 / R8. A forkable base with no recall hit is never promoted but remains selectable.
- Auth: no/expired session → search box present but recall no-ops; grid stays full/default (mirror `useMemoryRecall` guard).
- Selecting a reordered card still calls the existing pick handler (fork flow unchanged).
- Wrap the recall-bearing render in `<StrictMode>` for at least one test to guard the cleanup-effect false-green.

**Verification:** Per the CLAUDE.md Frontend Verification Protocol, browser-verify the `/launch` base-picker arc: pre-wallet, `agent-browser` drives the search box (type → assert reorder/highlight DOM + "showing all" fallback) up to the connect-wallet gate; the wallet-gated fork step is reported by the user in their own Chrome. Walk the relevant `docs/ux/frontend-checklist.md` items; the full demo arc remains green.

---

## System-Wide Impact

- **`/create` regression surface (U1):** the recall core is shared after extraction. Mitigation: behavior-preserving refactor, `useCreatorMemory` public signature unchanged, existing `/create` recall tests kept green, browser-verify `/create` recall chips still work alongside `/launch`.
- **No backend / contract / shared-type changes**: `/api/memory/recall`, `RecallChip`, namespace-binding, and the server distance gate are untouched (R10, origin scope boundary).
- **Cache/lag interaction:** `useModelIndex` is a cached GraphQL list; a just-published base may exist in MemWal but not yet the index (or vice-versa). The join-and-drop rule (U2) handles both directions without phantom cards.
- **Review roster (default for frontend-touching plans):** `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`, **plus `ce-julik-frontend-races-reviewer`** — the per-scope debounced-recall race handling is exactly its probe surface.

---

## Scope Boundaries

Carried from origin (`docs/brainstorms/2026-06-07-launch-ask-model-finder-requirements.md`):

- Conversational / multi-turn copilot, clarifying questions, query rewriting, or generated match explanations — excluded.
- Any Gemini seam usage or copilot-quota consumption — excluded.
- Semantic index over model `tags`/`name`/`partLabels` — excluded; matching is against creators' prompts already in MemWal.
- Pure client-side fuzzy/keyword filtering as the v1 mechanism — excluded (possible future fallback for unmatchable bases).
- Changes to D-080 dual-write, namespace-binding security, or the relevance gate — excluded.

### Deferred to Follow-Up Work

- Server-side merged `scope:'both'` recall endpoint to collapse the two client calls into one round-trip — revisit only if the extra call proves costly in practice.
- Capturing the personal-vs-global distance-comparability finding via `/ce-compound` after this lands (novel to this surface).

---

## Deferred to Implementation

- **Distance comparability across scopes**: confirm empirically that personal and global distances merge correctly under a single ascending sort before trusting it; if they diverge, apply per-scope normalization in `rankForkableMatches` (U2). Cheap forward-compat: give `rankForkableMatches` an optional per-scope distance transform (identity by default) so a normalization fix is a one-line wiring change, not a signature change late in U3.
- **Match-reason affordance exact form** (badge vs inline prompt snippet vs reorder animation) — settle during U3 against the `PromptMemoryChips` precedent.
- **Recall depth/limits for `/launch`** (personal/global `limit` values) — tune during U1/U3; default to the existing `/create` values unless the picker needs more.
- **Debounce interval / submit-on-enter** — inherit `RECALL_DEBOUNCE_MS = 300`; revisit only if the picker feels laggy in browser verification.

---

## Open Questions

### Deferred to Planning → Resolved

- *Reuse vs extract the recall hook* → **Resolved**: extract neutral `useMemoryRecall` (user decision this session).

### Deferred to Implementation

- [Affects U2][Technical] Are personal vs global distances directly comparable for one merged ranking, or is per-scope normalization needed? (Verify empirically.)
- [Affects U3][Technical] Final match-reason UI affordance.
- [Affects U1/U3][Technical] Recall `limit` depth for the launch picker.
