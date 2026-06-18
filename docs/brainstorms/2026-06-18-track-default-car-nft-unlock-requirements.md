# Requirements — /track default car + NFT unlock

**Date**: 2026-06-18 · **Status**: Ready for planning · **Scope**: Standard (frontend-only)
**Surface**: `frontend/src/track/` (Rage Racing) · **Submission**: Sui Overflow 2026, Walrus track

---

## Problem

`/track` (Rage Racing) is currently **own-or-die**: it hard-requires a connected
wallet (`frontend/src/track/TrackPage.tsx:439`), queries the player's owned
`NftToken`s, and shows a dead-end **"Your garage is empty"** screen when they own
none. A first-time visitor — including a hackathon judge — cannot play at all
without first acquiring an NFT. The pitch wedge ("your Tusk3D asset, driven in
someone else's game") is invisible to anyone who hasn't already bought in.

## Goal

Flip the page to **free-to-play + NFT unlock**: anyone can drive a default car
immediately (no wallet), and owning a token from a specific Tusk3D collection
unlocks driving that NFT car in-game. Players without the NFT see a clear
**"buy this collection to drive it here"** prompt.

## What we're building

A car-selection menu on `/track` that always offers a **procedurally-built
default car** (Babylon primitives, no GLB/Walrus dependency). When the player
connects a wallet and holds an `NftToken` from the bound collection
(`0xa1945554a7cb572ff9fdf48469bbaebcbf367e4a70c66fd5034550c1a4dd1242`), the menu
gains their NFT car(s) as additional, switchable options. Non-owners see a CTA
linking to that collection. The default car keeps the page playable end-to-end
even with no wallet, a failed owned-tokens query, or a slow chain read.

---

## Requirements

### R1 — Default car (primitive, always playable)
- The default car is assembled from Babylon primitives (e.g. box body + cylinder
  wheels), built inside the scene — **no GLB fetch, no Walrus blob** (avoids
  testnet blob-expiry 404s).
- It is selectable and drivable with **no wallet connected**.
- Visual style: spartan/blocky "starter car", with a single Rage Racing accent
  color so it reads intentional, not broken.
- `frontend/src/track/racetrackScene.ts` (`createRacetrackScene`, today takes
  `carGlbBytes`) gains a path to build the primitive car instead of loading GLB
  bytes. Physics/handling identical to GLB cars.

### R2 — Car-selection menu
- Extend the existing `CarCarousel` (`frontend/src/track/carCarousel.tsx`) to list
  **[default car] + [owned NFT cars from the bound collection]**.
- The default car is **always present and pre-selected** on load. Owners switch
  to their NFT car manually (no auto-select of the NFT).
- The menu renders for everyone, including no-wallet visitors (who see only the
  default car).

### R3 — Collection binding
- Gating is bound to a **single collection id**, stored as a config constant
  (value = `0xa1945554a7cb572ff9fdf48469bbaebcbf367e4a70c66fd5034550c1a4dd1242`).
- Owned-token results from `frontend/src/track/useOwnedTokens.ts` are filtered to
  `collectionId === <bound id>` before they enter the menu.

### R4 — Remove the hard gate, never block on the default car
- Remove the wallet-required early return (`TrackPage.tsx:439`) and the
  "garage empty" dead-end as blocking states.
- A failed or in-flight owned-tokens query **must not** block default-car play
  (today `tokensError` renders a full-page error). Degrade: still play the
  default car; just omit / quietly note the NFT options.

### R5 — Non-owner conversion prompt
- A connected player who owns no token from the bound collection — **and** the
  no-wallet visitor — sees a prompt that buying the collection unlocks driving it
  in-game, linking to the collection page
  (`/collection/0xa194…`).
- Placement is secondary to the gameplay (does not cover the canvas); the page is
  playable while it shows.

### R6 — Provenance caption
- NFT car: keep the existing on-chain provenance proof line (collection id +
  Walrus blob/patch id) — this is the pitch's proof.
- Default car: show a distinct caption (e.g. "Default car · not an NFT —
  connect to drive yours") instead of fabricated on-chain ids.

### R7 — Personal-best key
- PB storage (`frontend/src/track/personalBest.ts`) is keyed by `tokenId`. The
  default car has no `tokenId`; give it a stable synthetic key (e.g.
  `default-car`) so its PB persists without colliding with real tokens.

---

## Scope boundaries

**In**: everything in R1–R7 (frontend only).

**Deferred / minor**:
- Multiple default-car skins or a "garage" of free cars — one default car for now.

**Out (explicitly not this work)**:
- No contract / Move changes; no change to mint or launch flows.
- **No gameplay/stat difference** between default and NFT cars — same physics.
  The NFT car's value is identity ("it's *your* unique model"), not performance.
- `?model=` / `?blob=` demo override modes keep current behavior.
- Multi-collection support — intentionally bound to one collection.

---

## Dependencies / assumptions

- The bound collection (`0xa194…`) is already launched on testnet and its tokens
  carry `collection_id` matching the bound id (assumed from the launch URL the
  user provided; verify the field value during planning).
- Knowing ownership requires a connected wallet + chain read; the default car
  experience is fully independent of that read.
- Frontend-touching change → browser-verify per CLAUDE.md, and run the default
  5-reviewer roster incl. `ce-julik-frontend-races-reviewer` (the scene
  rebuild/owned-tokens fetch is async + race-prone).

## Success criteria

- A visitor with **no wallet** lands on `/track` and can drive the default car
  within seconds, with a visible "buy the collection to drive it here" prompt.
- A wallet holding a bound-collection NFT sees their car as a selectable option
  and can drive it, with the on-chain provenance caption.
- A failed owned-tokens query degrades to "default car still playable", never a
  full-page error.
- No Walrus dependency in the default-car path (no 404 risk from expired blobs).

## Key references

- `frontend/src/track/TrackPage.tsx` — entry gate, scene build, carousel wiring
- `frontend/src/track/useOwnedTokens.ts` — owned `NftToken` query (filter by collection here)
- `frontend/src/track/carCarousel.tsx` — selection menu to extend
- `frontend/src/track/racetrackScene.ts` — `createRacetrackScene`; add primitive-car path
- `frontend/src/track/personalBest.ts` — PB store (synthetic key for default car)
- `frontend/src/walrus/aggregator.ts` — `glbUrlForToken` (NFT cars only)
