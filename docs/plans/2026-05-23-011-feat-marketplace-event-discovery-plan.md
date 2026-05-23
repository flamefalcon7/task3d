---
title: Marketplace discovery via kiosk::ItemListed events (Tier B, frontend-only)
type: feat
status: active
created: 2026-05-23
origin: conversation (D-043 ADR + verified testnet GraphQL probe, 2026-05-23)
related_adr: D-043 (Accepted); supersedes discovery sub-decision of D-041
---

# Marketplace event-based discovery (Tier B)

## Problem

`/market` discovery is demo-grade approach (a) per D-041: it tracks seller kiosk
ids in browser `localStorage` and queries only those. A buyer cannot find a
listing made from any wallet/browser the local client never recorded — the
marketplace is effectively single-browser. This is the last weak spot in the
"user buys" leg of the four-actor journey.

## Decision (D-043, accepted)

Replace `localStorage` tracking with **frontend event-based discovery** (Tier B,
no backend): query Sui GraphQL `kiosk::ItemListed<NftToken>` events to find the
set of kiosks that have listed our token, **unioned with the connected wallet's
own kiosks** (so a seller sees their just-made listing without waiting for event
indexing), then read each kiosk's current `Listing` dynamic fields
(`fetchListedRefs`) for the authoritative active set + price. Fold in the
previously-pending NftToken type filter.

**Verified this session (do not re-probe):**
- Working query: `events(filter: { type: "0x2::kiosk::ItemListed<<pkg>::model3d::NftToken>" })`
  returns only our token's listings network-wide; correct prices; cross-wallet.
- Live testnet GraphQL schema differs from docs: filter field is **`type`** (not
  `eventType`); event type/payload via `contents { type { repr } json }`; cannot
  combine `module` + `type` filters. Full findings + caveats in
  `docs/solutions/integration-issues/sui-graphql-events-type-indexed-discovery-2026-05-23.md`.
- **CRITICAL caveat:** `ItemListed` is append-only history (the same item id
  recurs across relists / kiosk moves). Events answer *which kiosks to look at*;
  current `Listing` dynamic fields answer *what is actually listed now*. Never
  render events directly as active listings.

## Scope boundaries (non-goals)

- **No backend indexer (Tier C).** Deferred to whenever the backend is deployed
  for U15; gives no visible UX gain at current volume (see D-043 alternatives).
- No Move changes; no new dependencies.
- No auctions/offers/sort/search/pagination (Tier C territory).
- `fetchOwnedKiosk` (single-kiosk lookup for the list flow) stays unchanged.

### Deferred to follow-up work
- Backend `ItemListed` listings indexer mirroring `backend/src/events/integrationIndexer.ts`
  (U7), exposed as `/api/market/listings` — when the backend is hosted for U15.
- Reconciliation purely from events (ItemListed − Purchased − Delisted) instead
  of the dynamic-field read — only worth it if the per-kiosk reads become a cost.

## Implementation Units

### U1. Event-based discovery in `useListings` + NftToken type guard
**Goal:** `useListings` self-discovers all live listings of our NftToken across
the network (∪ the connected wallet's own kiosks), with foreign NFTs excluded.
**Requirements:** D-043.
**Dependencies:** none.
**Files:**
- `frontend/src/market/useListings.ts` (modify)
- `frontend/src/market/useListings.test.ts` (modify)
**Approach:**
- New `fetchListedKioskIds()`: POST the events query to `SUI_GRAPHQL_ENDPOINT`
  with `filter: { type: "0x2::kiosk::ItemListed<${TESTNET.model3dPackageId}::model3d::NftToken>" }`,
  paginate via `pageInfo { hasNextPage endCursor }` + `after`, collect the
  distinct `contents.json.kiosk` ids. Read the kiosk id from `contents.json`, not
  from any non-existent `Event.type` field.
- Change the hook signature: `useListings(walletAddress?: string, reloadKey?)`.
  It no longer takes a `kioskIds` array from the caller. Internally: discover
  kiosks = `fetchListedKioskIds()` ∪ (`walletAddress` ? `fetchOwnedKioskIds(walletAddress)` : []),
  dedup, then the existing per-kiosk `fetchListedRefs` → `joinTokenDetails` flow
  (unchanged) over the full set, flattened.
- **Type guard:** extend `TOKEN_DETAIL_QUERY` to also fetch
  `asMoveObject { contents { type { repr } } }`; in `joinTokenDetails`, drop any
  token whose type repr does not end with `::model3d::NftToken`. This removes
  foreign NFTs that happen to share a discovered kiosk (the pending type-filter).
- Keep `fetchOwnedKiosk`, `fetchOwnedKioskIds`, `fetchListedRefs` exported.
- Empty discovery set → empty listings, `loading=false`, no detail queries.
**Patterns to follow:** existing `fetchListedRefs` / `KIOSK_LISTINGS_QUERY`
GraphQL POST shape in the same file; event query shape from the solution doc.
**Test scenarios:**
- Events query returns 2 kiosks → both kiosks' `fetchListedRefs` joined; listings
  flattened with correct `priceMist` from the dynamic field (not the event).
- A discovered kiosk also holds a non-NftToken listing → that token is dropped by
  the type guard; only NftToken listings remain.
- `walletAddress` given and owns a kiosk not present in events → its current
  listings still appear (own-kiosk union; covers the seller-sees-own-listing case).
- No events and no wallet kiosks → empty listings, no per-token detail query fired.
- GraphQL non-2xx (events or detail) → `error` set, listings empty.
- Same item id appears in two ItemListed events (history) → it is NOT rendered
  twice from events; the rendered set comes from current dynamic fields only.
**Verification:** `useListings.test.ts` green; live `/market` shows a listing made
from a different wallet that was never tracked in this browser.

### U2. Simplify `MarketPage` — remove localStorage tracking
**Goal:** `MarketPage` drops all kiosk-id persistence and feeds the new hook.
**Requirements:** D-043.
**Dependencies:** U1.
**Files:**
- `frontend/src/market/MarketPage.tsx` (modify)
- `frontend/src/market/MarketPage.test.tsx` (modify)
**Approach:**
- Delete `MARKET_KIOSKS_KEY`, `LEGACY_KIOSK_KEY`, `readStoredKiosks`,
  `addStoredKiosks`, the `kioskIds` state, and the kiosk-set resolve `useEffect`
  (the one calling `fetchOwnedKioskIds`).
- Call `useListings(account?.address, reloadKey)`. Drop the `addStoredKiosks`
  call in `onList`. `pollRefresh` / `reloadKey` bump-on-tx stays (still covers
  GraphQL index lag for the cross-wallet/non-own case).
- Remove the now-unused `fetchOwnedKioskIds` import (keep `fetchOwnedKiosk` for
  `onList`).
**Patterns to follow:** existing `MarketPage` structure; only the discovery
plumbing changes — list/buy/poll flows and JSX are untouched.
**Test scenarios:**
- Signed out → SignIn prompt (unchanged).
- Empty listings → `no-listings` empty state.
- Renders a listing and buys it via `buildPurchaseNftTokenPtb` (unchanged
  behavior, new hook signature).
- Lists an owned token via `buildListNftTokenForSalePtb`, reusing existing kiosk
  (unchanged).
- Already-listed owned token hidden from the sell section (unchanged).
- No `localStorage` read/write occurs (assert the keys are never touched, or
  simply that `fetchOwnedKioskIds` mock is no longer required by the page).
**Verification:** `MarketPage.test.tsx` green; no `localStorage` references remain
in `MarketPage.tsx`.

## Risks / unknowns
- **GraphQL index lag** for a brand-new kiosk's first listing made by *another*
  wallet: it appears once `ItemListed` is indexed (seconds); `pollRefresh` covers
  it. The seller's *own* new listing is covered immediately by the own-kiosk union
  (direct dynamic-field read, no event dependence).
- **Volume:** discovery is 1 events query + N kiosk dynamic-field reads + M token
  detail reads (parallelized). Fine at demo scale; linear growth → Tier C if it
  ever balloons (already deferred).
- **Type repr matching:** match on suffix `::model3d::NftToken` against the live
  package id, not a hardcoded full type, so it survives the v7 id already in
  `TESTNET.model3dPackageId`.

## Sequencing
U1 then U2 (U2 depends on U1's new hook signature). Frontend-only, no Move, no
deps. After landing: run `vitest`, `tsc -b`, `vite build` (use
`./node_modules/.bin/*` directly — RTK mangles `npm run` output). Update
`docs/phase-progress.md` and suggest a commit referencing D-043.
