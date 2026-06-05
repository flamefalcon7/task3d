---
date: 2026-06-05
status: active
type: feat
origin: docs/brainstorms/2026-06-05-rage-racing-thirdparty-game-reskin.md
---

# feat: Reskin /track as "Rage Racing by Deksat Studio"

## Summary

Make `/track` read as a third-party indie game — **Rage Racing by Deksat Studio** — instead of a Tusk3D feature tab, via a frontend-only reskin: strip the shared masthead on `/track`, remove the "Track" nav item, give the page its own arcade brand identity (distinct from Tusk3D's brutalist style), reframe the carousel/copy from the *consuming game's* perspective, and surface an on-screen "imported from Sui + Walrus" provenance line. No route, contract, or data-path changes.

---

## Problem Frame

`/track` is the one surface that proves Tusk3D's composability thesis ("your Walrus-backed NFT is drivable in someone else's game"), but it's dressed as Tusk3D's own L3 feature — a top-nav "Track" tab beside Create/Launch/Market, the shared brutalist masthead, eyebrow "— L3 / DRIVE", headline "Tiny Racetrack.", and empty states that link back inward to `/launch` and `/market`. To a demo-video viewer it reads as an in-app add-on, not an outside developer integrating the collection. The fix is presentational only: the on-chain reads (Sui + Walrus, no Tusk3D backend) already make the game independent — it just doesn't *look* independent.

Origin requirements: `docs/brainstorms/2026-06-05-rage-racing-thirdparty-game-reskin.md` (Approach A confirmed; B/C deferred).

---

## Requirements Traceability

- R1 (distinct visual identity) → U2, U3
- R2 (suppress Tusk3D masthead on `/track`) → U1
- R3 (remove "Track" nav item) → U1
- R4 (Rage Racing voice; no Tusk3D-internal labels) → U3
- R5 (carousel framed as imported cars) → U4
- R6 (race-on-mint `?model=` + override modes still work) → U1, U3 (regression-guarded)
- R7 (on-screen Sui + Walrus provenance caption) → U3
- R8 (empty/error states in-voice, no inward CTAs) → U3
- AE1 → U1/U3 tests · AE2 → U3/U4 tests · AE3 → U3 tests · AE4 → U1/U3 tests

---

## Key Technical Decisions

- **Reuse the existing chrome-hide seam, don't invent one.** `NavGuard` already returns `null` for routes in `HIDDEN_ROUTES` (`frontend/src/ux/TopNav.tsx:83-89`). Add `/track` there rather than threading a prop — same pattern as `/dev/compare`.
- **A dedicated Rage Racing brand module, not edits to `tokens`.** Tusk3D's `tokens` (`frontend/src/ux/tokens.ts`) is the brutalist design system; mutating it would leak into every other page. Rage Racing gets its own small constants module so the two identities stay independent and visibly different. Its accent **must not** be `#FF4500` (Tusk3D's `tokens.color.accent`) — palette collision is exactly what makes a reskin read as "same team."
- **Provenance caption uses real on-chain data already in hand.** `OwnedToken` carries `blobId`, `collectionId`, `patchId` (`frontend/src/track/useOwnedTokens.ts`). The caption shows a truncated real Walrus blob id / collection id, so the "content layer vs game" boundary is literally true, not decorative.
- **Presentation-only.** Routing, override modes (`?model=` / `?blob=`), scene build, lap logic, and Sui/Walrus reads are untouched. This keeps the race-on-mint arc working and scopes risk to styling + copy.

---

## Implementation Units

### U1. Remove "Track" from nav + hide masthead on `/track`

**Goal:** `/track` no longer presents as a Tusk3D feature: no nav tab, no shared masthead.
**Requirements:** R2, R3, R6
**Dependencies:** none
**Files:**
- `frontend/src/ux/TopNav.tsx` — remove `{ label: 'Track', path: '/track' }` from `NAV_ITEMS`; add `'/track'` to `HIDDEN_ROUTES`.
- `frontend/src/ux/TopNav.test.tsx` — update/extend (verify file exists; if absent, add coverage in the nearest nav test or create it).
**Approach:** Two one-line edits in the existing seams. Confirm no other component links to `/track` via the nav array (programmatic `navigate('/track?model=...')` in the race-on-mint arc is unaffected — it doesn't go through `NAV_ITEMS`).
**Patterns to follow:** `/dev/compare` entry in `HIDDEN_ROUTES`.
**Test scenarios:**
- Covers AE1. `NavGuard` renders `null` when `location.pathname === '/track'` (no `top-nav` testid in the tree).
- Nav on a normal route (e.g. `/market`) renders Create/Launch/Market and does **not** render a `nav-track` link.
- Regression: visiting `/track?model=<id>` still mounts the page (route unchanged).
**Verification:** On `/track` the Tusk3D wordmark/nav is absent; on `/market` the nav shows three items, no Track.

### U2. Rage Racing brand constants

**Goal:** A single source of truth for the Rage Racing identity (palette, type, voice tokens) that is visibly distinct from Tusk3D.
**Requirements:** R1
**Dependencies:** none
**Files:**
- `frontend/src/track/rageRacing/brand.ts` (new) — exported constants: arcade palette (background, primary accent, secondary, ink), display/body font stacks, and the studio/game strings ("RAGE RACING", "by Deksat Studio").
- `frontend/src/track/rageRacing/brand.test.ts` (new) — collision guard.
**Approach:** Plain exported constants object, mirroring the `tokens` shape enough to be ergonomic but intentionally different in values. Default direction (adjust per Outstanding Questions): near-black track surface, **electric/high-energy accent that is not orangered**, a bold/condensed sans display face for the "RAGE RACING" wordmark — deliberately loud against Tusk3D's restrained serif.
**Patterns to follow:** top-of-file constants pattern (`frontend/src/track/skidMarks.ts`); token shape in `frontend/src/ux/tokens.ts`.
**Test scenarios:**
- Brand accent is **not equal to** `tokens.color.accent` (`#FF4500`) — guards the "looks like a different team" requirement against future drift.
- Display font stack differs from `tokens.font.display`.
**Verification:** Importing `brand` gives Rage Racing colors/strings; the collision test passes.

### U3. Reskin the TrackPage shell, copy, and provenance caption

**Goal:** The page masthead, states, and HUD speak as Rage Racing / Deksat Studio and show Sui + Walrus provenance; no Tusk3D-internal labels or inward links remain.
**Requirements:** R1, R4, R6, R7, R8
**Dependencies:** U2
**Files:**
- `frontend/src/track/TrackPage.tsx` — replace eyebrow ("— L3 / DRIVE") + headline ("Tiny Racetrack.") with the Rage Racing wordmark + "by Deksat Studio"; apply `brand` styles to page/header/empty/error/loading; reword loading ("— LOADING TRACK · BABYLON + HAVOK"), empty ("Nothing to drive yet" + `/launch` `/market` `/browse` links), error, and sign-in copy into Rage Racing voice with **no Tusk3D-internal route as the primary CTA**; add a persistent provenance caption near the canvas showing the selected token's truncated `blobId` (and/or `collectionId`) framed as "Imported from Sui · Walrus".
**Approach:** Pure JSX/style swap inside the existing component — keep all hooks, refs, effects, the `?blob=`/`?model=` logic, and `data-testid`s that tests/scene rely on. Introduce a small `truncate` for the blob id (mirror the one already in this file family). The provenance caption reads from `selected` (the active `OwnedToken`).
**Patterns to follow:** existing overlay/HUD style objects in `TrackPage.tsx`; truncation helper in `carCarousel.tsx`.
**Test scenarios:**
- Covers AE1. Page renders the "RAGE RACING" wordmark and does **not** render "Tiny Racetrack." or "L3 / DRIVE".
- Covers AE2. With a selected token, a provenance element is present and contains a truncated blob/collection id attributed to Sui/Walrus.
- Covers AE3. Empty state (no tokens) renders in Rage Racing voice and does **not** present `/launch` or `/market` as the primary CTA.
- Covers AE4. `?model=<id>` path resolves the single token and renders the canvas under the reskin (existing override logic intact).
- Edge: sign-in-required state (no wallet, non-override) renders the reskinned gate, not the old "— L3 / DRIVE" gate.
**Verification:** Browser-drive `/`→…→`/track` arc (per CLAUDE.md Frontend Verification Protocol): the page looks like a different studio's game, provenance line visible, drive still works.

### U4. Reskin the car carousel framing

**Goal:** Tiles read as cars imported from a Tusk3D collection, not "the NFTs you own," and use the Rage Racing accent.
**Requirements:** R5
**Dependencies:** U2
**Files:**
- `frontend/src/track/carCarousel.tsx` — swap the selected-tile border + `selectedLabel` color from `tokens.color.accent` to the `brand` accent; reframe label voice (e.g. tile fallback name and the "— SELECTED" affordance) toward the consuming-game framing; keep swatch logic and all `data-testid`s.
- `frontend/src/track/carCarousel.test.tsx` (new, or fold into `TrackPage.test.tsx`) — coverage below.
**Approach:** Style + copy only; preserve `carousel-tile-*` testids, `data-selected`, and `onSelect` behavior so scene/selection wiring is unchanged.
**Patterns to follow:** existing `tileStyle`/`selectedLabel` in `carCarousel.tsx`.
**Test scenarios:**
- Covers AE2. Selected tile's accent is the `brand` accent, not `tokens.color.accent`.
- Selecting a tile still fires `onSelect(idx)` and flips `data-selected`.
- Copy no longer frames tiles as owned Tusk3D NFTs.
**Verification:** Carousel matches the Rage Racing palette; selection still swaps the driven car.

---

## System-Wide Impact

- **Affected surface:** only `/track` and the shared `TopNav`. Removing the nav item also de-clutters the marketplace-style nav (no functional loss elsewhere).
- **Demo arc:** race-on-mint deep link and the full `/`→`/create`→`/launch`→`/market`→`/track` arc must still pass — U1/U3 carry explicit regression scenarios.
- **Other pages:** unaffected, because Rage Racing styling lives in its own module and the `tokens` system is untouched.

---

## Scope Boundaries

- Frontend reskin only — no Move contract, Walrus, or Sui read-path changes.
- No gameplay/physics/lap-logic changes to the racetrack scene.
- No new route, override mode, or `data-testid` removals that tests/scene depend on.

### Deferred to Follow-Up Work

- Approach B (separate domain/deployment) and Approach C (wire `/integrate` on-chain attestation into the demo narrative) — optional upgrades from origin.
- Real GLB thumbnails for carousel tiles (pre-existing Phase-5 polish note).

---

## Risks & Mitigations

- **Risk:** A reskin that's too tasteful still reads as Tusk3D. **Mitigation:** U2 collision-guard test + deliberately loud arcade direction; verify in-browser against a side-by-side with the Tusk3D landing.
- **Risk:** Editing `TrackPage.tsx` copy accidentally drops a `data-testid` the scene/tests rely on. **Mitigation:** U3 approach explicitly preserves testids; run the existing `TrackPage.test.tsx` suite.
- **Risk:** Removing the nav item breaks a nav test asserting Track's presence. **Mitigation:** U1 updates nav tests in the same unit.

---

## Verification & Review

- **Browser verification** across the demo arc per `CLAUDE.md` Frontend Verification Protocol (agent-browser, pre-wallet portion; user drives the wallet-signed portion).
- **Pre-commit:** walk relevant `docs/ux/frontend-checklist.md` items (cross-component state for the nav removal; real-data drift for the provenance caption).
- **Review roster (frontend-touching default):** `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`, **`ce-julik-frontend-races-reviewer`**.

---

## Outstanding Questions

### Resolve Before / During Planning

- [Affects U2/R1] [User decision] Confirm the Rage Racing palette + display typeface. Default proposed: near-black surface, electric (non-orangered) accent, bold condensed sans wordmark. A 5-minute design pass (`/design-shotgun` or a couple of swatches) could lock this before U3 starts.

### Deferred to Implementation

- [Affects U3/R7] Exact provenance-caption wording and how much chain detail to show (blob id only vs blob + collection id).
- [Affects U4] Whether the carousel copy reframe needs new strings or just relabeling the existing "— SELECTED" affordance.
- [Affects U1] Confirm whether a dedicated `TopNav.test.tsx` exists or coverage lives elsewhere; place the nav-removal assertions accordingly.
