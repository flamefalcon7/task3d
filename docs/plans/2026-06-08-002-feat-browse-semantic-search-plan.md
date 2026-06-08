---
date: 2026-06-08
type: feat
status: completed
origin: docs/brainstorms/2026-06-08-browse-semantic-search-requirements.md
---

# feat: Browse semantic search (reuse /launch base-finder on /browse)

## Summary

Add the natural-language ("Ask") semantic search field to `/browse`. A signed-in user describes what they want; matching **collection cards** promote to the front of the grid with a non-accent "why it matched" highlight, and nothing is ever hidden. A signed-out user sees the field as a login teaser. Frontend-only — rides the existing JWT-gated `/api/memory/recall` proxy; the only new logic is collapsing per-model recall matches up to per-collection cards.

---

## Problem Frame

`/browse` is the catalog surface (and the demo-day landing surface). Today the only narrowing affordance is the coarse tag-filter chips. The just-shipped `/launch` base-finder (plan `2026-06-07-002`) already proved a better affordance one route away — type a description, semantic recall over creators' stored prompts promotes relevant models. Its primitives (`useMemoryRecall`, `rankForkableMatches`, the search-box + `MatchReason` highlight UI) are shipped and tested. This plan re-wires those primitives onto the `/browse` collection grid.

The reuse is near-total. `rankForkableMatches` operates per-`objectId` over a flat model list, but `/browse` renders per-`collectionId` groups (`groupByCollection`). The single genuinely new piece is a pure aggregation step: rank a collection card by its closest-matching constituent variant. Everything downstream (ring/reason rendering, honest-state sub-labels, session gating) is a direct mirror of `/launch`.

---

## Requirements (origin trace)

Carried from `docs/brainstorms/2026-06-08-browse-semantic-search-requirements.md`:

- R1–R3 (search affordance & auth gating): field renders in the catalog header; active when signed in; login teaser when signed out (no recall call, no `Authorization` header).
- R4–R8 (behavior): reorder + highlight, never hide; `MatchReason` highlight (strong variant included); personal + global scope; collection-group match derived from closest-matching variant; composes with the existing tag filter.
- R9–R10 (honest state): zero matches → full catalog stays in default order (no "no results" state); degraded relayer → honest degraded note, not "zero matches".
- AE1–AE6 carried as test scenarios in the units below.

**Supersession note (not a reopen):** `docs/phase-progress.md` carries two stale notes from before this session — an "Auth = Option A: signed-out sees plain grid (no field)" lock and a "leaning global-only" scope note. Both were superseded in-session by the user: signed-out sees a **login teaser** (R3), scope is **personal + global** (R6). Plan to the requirements doc. A docs sync to phase-progress.md is captured in U4.

---

## Key Technical Decisions

- **Reuse `rankForkableMatches` for its join/dedupe/NaN-guard/strong-match logic; ignore its `ordered` output on `/browse`.** The new aggregation util calls `rankForkableMatches(personal, global, allBrowseModels)` and consumes only the returned `matches: Map<objectId, BaseMatch>`, then collapses those per-model matches to per-collection cards. This avoids re-deriving the battle-tested merge logic while producing a *collection-grouped* reorder rather than a flat one.
- **Collection-group match = closest-matching variant.** A card's `BaseMatch` is the minimum-distance match among its group's variants; `strong` follows from that closest distance; the reason text is that variant's prompt. Matched groups sort ascending by their best distance; unmatched groups keep their original `groupByCollection` insertion order behind the matched ones. (Resolves origin "Deferred to Planning" R7/R4/R8 questions.)
- **Match highlight stays non-accent (D-044).** Mirror `/launch`'s `matchRing` (ink / subtle / hint, never `#FF4500`) and `MatchReason` (ink for strong, hint otherwise). On a full grid many cards can be ringed at once; because the ring is non-accent it does not consume the ≤5-accent-per-page budget. No new accent spend, no scoped-exception ADR needed.
- **Duplicate the ~15-line `matchRing`/`MatchReason`/`truncateReason` into the browse card rather than extracting a shared helper.** Extraction would touch the shipped `/launch` page (`LaunchCollectionPage.tsx`) for marginal DRY benefit days before submission. The browse card's container differs (collection `<Link>` card vs base-option button), so the local copy also adapts cleanly. Consolidating `/launch` + `/browse` onto one shared `matchHighlight` helper is captured under Deferred to Follow-Up.
- **All recall hooks called unconditionally; gate only JSX.** The signed-out teaser must not be implemented as an early `return` before the new hooks — that reintroduces the documented hooks-after-early-return crash (`docs/solutions/integration-issues/react-hooks-after-early-return-oauth-mask-2026-05-28.md`) on in-page sign-in. `useMemoryRecall` internally no-ops without a token, so calling it while signed out is safe and returns empty lanes.

---

## System-Wide Impact

- **Surfaces touched:** `/browse` (BrowsePage + CollectionCard). No backend, contract, or shared-type change. `/api/memory/recall` contract unchanged.
- **Review roster (frontend-touching):** the 5-reviewer parallel pass — `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`, **plus `ce-julik-frontend-races-reviewer`** (debounced two-scope recall with per-keystroke stale handling is its exact probe surface).
- **Browser verification:** `/browse` is a public read surface, so the search reorder/highlight + "showing all" / degraded fallbacks are agent-browser-drivable **pre-wallet** for the signed-in-active path only insofar as `VITE_TEST_WALLET` supplies a baked session. To verify the **signed-out teaser**, set `VITE_TEST_WALLET=0` and **restart** the dev server (Vite bakes env at start; a refresh is insufficient) — otherwise identity is pinned to the deployer and the signed-out path can't reproduce (`project_vite_test_wallet_gotcha`).

---

## Implementation Units

### U1. Collection-level match aggregation utility

**Goal:** A pure function that turns recall chips + collection groups into a collection-grouped reorder plus per-card match metadata. This is the only genuinely new logic in the feature.

**Requirements:** R4, R7, R8, R9 (no-hide), AE4.

**Dependencies:** none.

**Files:**
- `frontend/src/browse/browseSearchRanking.ts` (create)
- `frontend/src/browse/browseSearchRanking.test.ts` (create)

**Approach:**
- Export `rankCollectionMatches(personal: RecallChip[], global: RecallChip[], groups: Map<string, Model3DSummary[]>, opts?): { orderedKeys: string[]; cardMatches: Map<string, BaseMatch> }`.
- Flatten `groups` to a model array, call `rankForkableMatches(personal, global, flat, opts)` and consume **only** its `matches` map (reusing the join `RecallChip.modelId ↔ Model3DSummary.objectId`, the drop-non-candidate / drop-null-modelId rule, the NaN/negative-distance guard, and the `STRONG_MATCH_DISTANCE` strong flag).
- For each group key, select the minimum-distance matched variant; if at least one variant matched, set `cardMatches[key]` to that `BaseMatch`.
- `orderedKeys` = matched group keys ascending by best distance, followed by unmatched group keys in original `Map` insertion order. No key is ever dropped (R9 no-hide at the collection level). **Keys are preserved verbatim — including the synthetic `_orphan:<objectId>` keys `groupByCollection` emits for collection-less models — so the grid render in U3 can iterate `orderedKeys` as its single source of order without any card vanishing.**
- Empty/whitespace query path is handled upstream by `useMemoryRecall` (returns empty chips) → `cardMatches` empty, `orderedKeys` = original order.

**Patterns to follow:** `frontend/src/collection/baseSearchRanking.ts` (`rankForkableMatches`, `BaseMatch`, `STRONG_MATCH_DISTANCE`). Import `BaseMatch` and `rankForkableMatches` from there; import `RecallChip`/`Model3DSummary` from `@overflow2026/shared`.

**Test scenarios** (`browseSearchRanking.test.ts`):
- Happy: a global hit on one variant promotes that variant's collection to the front of `orderedKeys` and records its `BaseMatch` in `cardMatches`.
- Covers AE4: a multi-variant group where only one variant matches → the group promotes and the card match reason/distance reflect the matching variant.
- Closest-variant wins: two variants in the same group match at different distances → the group's `cardMatches` entry carries the minimum distance and `strong` derived from it.
- Personal + global merge: same model matched in both scopes → min distance kept (dedupe), reason from the closest (delegated to `rankForkableMatches`, assert the aggregated result).
- No-hide: groups with zero matched variants still appear in `orderedKeys`, after all matched groups, in original insertion order.
- Empty inputs: empty chip arrays → `orderedKeys` equals the groups' original key order and `cardMatches` is empty.
- Junk/edge: a chip whose `modelId` is null/`''` or not present in any group is dropped (no phantom key); a NaN/negative distance chip is ignored.
- Strong boundary: a hit exactly at / just under `STRONG_MATCH_DISTANCE` flags `strong` consistently with `rankForkableMatches`.

**Verification:** Unit tests green; the util never returns a key absent from the input groups and never omits an input key.

---

### U2. CollectionCard match highlight + reason

**Goal:** Let a collection card render a non-accent match ring and a "why it matched" reason, reusing the `/launch` visual language and suppressing the static description snippet when a match reason is shown.

**Requirements:** R4, R5, R9 (dedupe), AE1.

**Dependencies:** U1 (consumes `BaseMatch`).

**Files:**
- `frontend/src/browse/CollectionCard.tsx` (modify)
- `frontend/src/browse/CollectionCard.test.tsx` (modify)

**Approach:**
- Add an optional prop `match?: BaseMatch` to `Props`.
- Spread a `matchRing(match)`-style `boxShadow` into `linkStyle` (the card root `<Link>`); colors ink (strong) / subtle (weak) — there is no "locked" concept on `/browse`, so the launchable-tri-state collapses to strong-vs-weak. No ring when `match` is undefined. **Decision: the 2px ring coexists with the existing 1.5px ink border (`linkStyle.border`) as a composite frame — do NOT remove or recolor the ink border. The `boxShadow` sits flush outside it; the slightly thicker framed edge is the intended promotion signal.**
- Render a `MatchReason`-style `<span data-testid="collection-card-match-reason">↳ {truncated reason}</span>` inside `bodyStyle`, ink for strong / hint otherwise, `truncateReason` at 48 chars.
- Apply the `/launch` dedupe: when `match` is present, suppress the existing `collection-card-description` snippet (the match reason already shows the prompt) — i.e. render the static description only when `!match`.
- Keep `matchRing`/`MatchReason`/`truncateReason` as small module-local helpers in `CollectionCard.tsx` (decision: do not extract a shared helper / do not touch `/launch`).

**Patterns to follow:** `frontend/src/collection/LaunchCollectionPage.tsx` lines ~244–277 (`matchRing`, `MatchReason`, `truncateReason`) and the `!match && description` dedupe at ~1456–1466. Token usage per `frontend/src/ux/tokens.ts`; non-accent only (D-044).

**Test scenarios** (`CollectionCard.test.tsx`):
- Covers AE1: given a `match` prop, the card renders `collection-card-match-reason` with the (truncated) reason text and a ring style on the root link.
- Strong vs weak: a strong match renders the reason in ink; a weak match renders it in hint (assert via style, mirroring the Launch test's approach).
- Dedupe: when `match` is present, `collection-card-description` is NOT rendered; when `match` is absent but a description exists, `collection-card-description` IS rendered.
- No match: no ring style and no `collection-card-match-reason` when `match` is undefined (regression guard for existing cards).
- Reason truncation: a >48-char reason is ellipsis-truncated.

**Verification:** Existing CollectionCard tests still pass; new match-prop tests green; no accent token used by the ring or reason.

---

### U3. BrowsePage search field, gating, and grouped reorder

**Goal:** Wire the search input (active when signed in, login teaser when signed out), drive `useMemoryRecall`, apply U1's aggregation to reorder the grid and feed U2's match props, and render the honest-state sub-labels.

**Requirements:** R1, R2, R3, R4, R6, R8, R9, R10; AE1, AE2, AE3, AE5, AE6.

**Dependencies:** U1, U2.

**Files:**
- `frontend/src/browse/BrowsePage.tsx` (modify)
- `frontend/src/browse/BrowsePage.test.tsx` (modify)

**Approach:**
- Read `const { session } = useSession()`. Call `useMemoryRecall()` and the `baseQuery` state + recall `useEffect` **unconditionally** (mirror `LaunchCollectionPage.tsx` lines 491–508). Never early-return before these hooks.
- Compute `const { orderedKeys, cardMatches } = useMemo(() => rankCollectionMatches(personal.chips, global.chips, collectionGroups), [...])`.
- **Placement (decision):** render the search field as a **full-width row directly above the existing `filterRow`**, separated by the same `borderBottom` hairline (`tokens.border.primary`). This makes "Ask" a primary affordance sitting above "narrow by tag" rather than competing inline with the chip row on narrow viewports.
  - **Signed in:** active `<input data-testid="browse-search-input">` using the shared `input` token, `aria-label`, placeholder; plus a `data-testid="browse-search-hint"` sub-label carrying the static coverage line ("searches models published with a description") and the three conditional micro-statuses — `browse-search-loading` (` · searching…`), `browse-search-showing-all` (` · showing all — no semantic matches`), `browse-search-degraded` (` · some matches unavailable — showing all`). Derive these exactly as `/launch` does (`baseQueryActive` ≥3 chars, loading from either scope's status, degraded gated on `!loading`, showing-all gated on no matches).
    - **Tag-aware copy (decision):** when a tag filter is ALSO active, the showing-all status drops the "showing all" lead → ` · no semantic matches` (the active chip already signals the tag-narrowed set; "showing all" would falsely imply the full catalog). The other two statuses are unchanged.
    - **Keyboard (decision):** the input is NOT wrapped in a `<form>` (avoids a default-submit page reload on Enter); Enter is a no-op. `Escape` clears the query (`setBaseQuery('')`) and blurs — one `onKeyDown` handler, the browser-native search convention.
    - **Focus + a11y:** the `input` token sets `outline: 'none'`; confirm the search input matches the global `:focus-visible` ring selector in `frontend/src/index.css` (add the class it targets if the selector is class-scoped — a keyboard-focus regression won't surface in unit tests). Add `aria-live="polite"` + `aria-atomic="true"` to the `browse-search-hint` container so the micro-status changes are announced to screen readers when the grid reorders.
  - **Signed out (decision — convergent design + security):** render a **non-interactive prompt block**, NOT a disabled `<input>`: a `<div>`/`<button data-testid="browse-search-signin">` with one line of copy ("Sign in to search by description") that mounts `<SignInButton />` (the established in-page gate affordance). There is **no `<input>` and no `onChange` on the signed-out path**, so recall cannot be triggered by autofill or a stray form-submit — the `useMemoryRecall` token guard is the backstop, not the only line of defense. (A disabled input would also misleadingly imply "temporarily unavailable" rather than "gated".)
- **Grid render — single path (decision):** always iterate `orderedKeys` (`const variants = collectionGroups.get(key)!`), in both query-active and idle states (idle = U1 returns original insertion order). `orderedKeys` carries every group key verbatim (incl. `_orphan:` keys), so the existing `collection-card-<cid>` testids and orphan cards are unaffected (R9). Pass `match={cardMatches.get(key)}` into `CollectionCard`. **Reorder is instantaneous — no position/layout transition** (consistent with the brutalist static grid; the ring + reason line is the only promotion signal). Do not add layout animations.
- Tag filter composition (R8): unchanged — `useModelIndex({ tagFilter })` narrows `models`, `collectionGroups` derives from the narrowed set, and `rankCollectionMatches` runs over those groups. No extra wiring; assert in tests.
- Honest state (R9): no "no results" branch — a zero-match active query just leaves `orderedKeys` in original order; the `browse-search-showing-all` micro-status communicates it. (R10): degraded surfaced via the `browse-search-degraded` micro-status from `useMemoryRecall`'s `degraded` flag.
- The search field belongs to the default model-grid view only — do **not** render it in the `?filter=integration` view (mirror the existing `disabled={integrationFilter}` treatment on the tag chips: hide or disable the search field in that mode).
- **Loading / empty interplay:** the search field renders alongside the existing `loading-state` / `empty-state` branches. Before `models` resolve (or when a tag filter yields zero models), `collectionGroups` is empty → a typed query simply produces no matches (`cardMatches` empty, `orderedKeys` empty) and the existing empty/loading state shows; no crash, no contradictory double message — when the grid is empty the `showing-all` status is suppressed (it only fires when there are groups but no semantic match).

**Execution note:** Include one test that renders BrowsePage inside `<StrictMode>` to guard the recall hook's mounted-ref against the documented StrictMode cleanup-only-effect false-green (`docs/solutions/integration-issues/react-strictmode-cleanup-only-effect-with-useref-2026-05-23.md`).

**Patterns to follow:** `LaunchCollectionPage.tsx` (search wiring 488–508, hint JSX 1399–1422, signed-out `SignInButton` gate ~1316–1328). Test mocks mirror `LaunchCollectionPage.test.tsx` (the `memoryRecallState` / `lane` / `hit` mock at lines 63–80, and the `useSessionMock` pattern). `BrowsePage.test.tsx` already mocks `useModelIndex` and `useCollections`; add `useMemoryRecall` and `useSession` mocks. **Reset caveat:** this file resets via `vi.restoreAllMocks()`, which does NOT reset hoisted `vi.mock` module factories — back the new `useMemoryRecall`/`useSession` factories with mutable module-scope state (`memoryRecallState`, `useSessionMock`) and reset that state explicitly in `beforeEach`, or lanes leak across tests.

**Test scenarios** (`BrowsePage.test.tsx`):
- Covers AE2 (signed out): with `useSession` → `{ session: null }`, the search field renders as a teaser (`browse-search-signin` / `SignInButton` testids present), the active input is absent/disabled, and `memoryRecallState.*.recall` is never called after typing is attempted.
- Covers AE1 (signed in, match): signed-in session + `memoryRecallState.global = lane([hit('0xv1', 0.3, 'a fast race car')])`; type into `browse-search-input`; assert the matching collection card promotes to the front of `model-grid` and renders `collection-card-match-reason`, while other cards remain present.
- Covers AE3 (personal + global): a personal-scope hit on the signed-in creator's own model surfaces a match (assert the card highlights); confirm both lanes' `recall` are invoked with the query.
- Covers AE5 (tag + search compose): with an active tag filter, a query reorders only within the tag-filtered subset (cards excluded by the tag never appear, matched-within-subset promotes).
- Covers AE6 / R9 (no-hide, no empty state): signed-in query that matches nothing → full grid still rendered in default order, no "no results" element, `browse-search-showing-all` shown.
- R10 (degraded): a lane with `degraded: true` (and non-loading) → `browse-search-degraded` shown; results not collapsed to empty.
- Loading: a lane with `status: 'loading'` → `browse-search-loading` shown.
- Hooks order regression: render signed-out then re-render signed-in (session transition) without a hooks-count error (guards the all-hooks-before-early-return rule).
- StrictMode: BrowsePage rendered in `<StrictMode>` drives a query and still commits results (mounted-ref guard).
- Min-query: typing 1–2 chars does not promote/highlight (MIN_QUERY_LEN=3 handled by the hook; assert no reorder).
- Signed-out no-input: the signed-out render exposes no `browse-search-input` element at all (not merely a disabled one), so there is no `onChange`/autofill path to recall.
- Tag-aware showing-all copy: with an active tag filter + a zero-match query, the status reads ` · no semantic matches` (no "showing all" lead).

**Verification:** All BrowsePage tests green; signed-out shows teaser with no recall call; signed-in query reorders + highlights without hiding; tag filter still narrows; honest-state micro-statuses render on the right conditions.

---

### U4. Docs sync

**Goal:** Realign stale docs with the shipped feature and the in-session decisions.

**Requirements:** none (housekeeping); resolves the supersession note above.

**Dependencies:** U3 (do last).

**Files:**
- `docs/phase-progress.md` (modify — replace the stale "Auth = Option A: signed-out sees plain grid" lock and "leaning global-only" note with the shipped reality: signed-out teaser + personal+global; record the feature as complete)
- `docs/decisions.md` (modify — optional light ADR only if the reviewer/user judges the collection-group aggregation or the non-extraction decision worth a one-liner; otherwise skip per CLAUDE.md decision discipline — this is reversible frontend reuse)

**Approach:** Update phase-progress.md's latest block; keep `.env*` untouched. The ADR is optional and light — do not gold-plate.

**Test expectation:** none — docs only.

**Verification:** phase-progress.md no longer contradicts the shipped behavior; no stale "global-only / no field when signed out" claims remain.

---

## Scope Boundaries

- No backend / `/api/memory/recall` / contract / shared-type changes.
- No search in the `?filter=integration` view.
- No filter-style search (hiding non-matches) — reorder + highlight only.
- No backfill of caption-less uploads (nasty-guy, turbo-seg); they simply won't match.
- Signed-out users cannot execute search (teaser + login only).

### Deferred to Follow-Up Work

- Consolidate `/launch` and `/browse` match-highlight helpers (`matchRing` / `MatchReason` / `truncateReason`) into one shared frontend module, migrating `LaunchCollectionPage.tsx` to it. Deferred to avoid touching the shipped `/launch` page near submission.
- WebGL-context pressure on a large matched grid (each `CollectionCard` mounts a Babylon canvas; the existing Phase-5 lazy-mount follow-up already tracks this and is unchanged by search).

---

## Dependencies / Assumptions

- Depends on shipped `useMemoryRecall` (`frontend/src/memory/useMemoryRecall.ts`), `rankForkableMatches` + `BaseMatch` (`frontend/src/collection/baseSearchRanking.ts`), `useSession` + `SignInButton` (`frontend/src/auth/`), and the existing `/api/memory/recall` proxy → MemWal relayer.
- Assumes the `RecallChip.modelId ↔ Model3DSummary.objectId` join holds for `/browse` models (same `Model3DSummary` shape from `useModelIndex`; verified).
- Assumes the server-side relevance gate (`MEMORY_MAX_DISTANCE` = 0.66) is acceptable for catalog discovery; do **not** add a second client-side distance ceiling (the server already gates). Short single-word queries will miss — the static coverage sub-label sets expectations.
- **Candidate set:** U1 passes the **full** browse model set (including orphan/encrypted/empty-`glbBlobId` models) into `rankForkableMatches`. Do **not** copy `/launch`'s `forkable = models.filter(m => m.glbBlobId !== '')` filter — `/browse` wants every catalog model rankable, and the join harmlessly drops any chip whose `modelId` isn't in the set.
- **Accepted data exposure (documented, not a gap):** global recall returns verbatim creator prompt text (`RecallChip.prompt`) to any signed-in user, rendered as the match reason. Accepted because only non-RESTRICTED published models are mirrored to the global namespace and their prompts are already public on-chain — the same disclosure `/launch` already makes. No new exposure introduced.

---

## Deferred to Implementation

- Precise copy strings (placeholder, the static coverage sub-label, the signed-out prompt line) — small wording, tune against the live page. The structural decisions (placement above `filterRow`, non-input signed-out block, keyboard/a11y) are settled in U3.
- Exact `index.css` `:focus-visible` selector confirmation — verify the search input matches it at implementation time (U3 names this check).
