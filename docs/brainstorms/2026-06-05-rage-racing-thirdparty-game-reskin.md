---
date: 2026-06-05
topic: rage-racing-thirdparty-game-reskin
---

# Rage Racing — Reskin `/track` as a Third-Party Game

## Summary

Reskin the `/track` racetrack into **"Rage Racing by Deksat Studio"** — an in-app, frontend-only reskin that makes the scene read as a *separate indie studio's game* that imported a Tusk3D NFT collection, so a demo-video viewer believes an outside developer integrated the user's Walrus-backed assets. No separate deployment, no contract or data-layer changes.

---

## Problem Frame

Tusk3D's whole thesis is a **composable creator economy**: creators publish 3D content to Walrus, and *other people's games* consume it. The `/track` racetrack is the one surface in the product that is supposed to *prove* that — "look, your NFT is drivable in a real game." But today it is dressed as Tusk3D's own L3 feature: it's a top-nav tab labeled **"Track"** sitting beside Create / Launch / Market, it wears the same brutalist masthead and chrome, its eyebrow reads "— L3 / DRIVE", and its empty states point back inward to `/launch` and `/market`. To a judge it reads as *an add-on tab inside the Tusk3D app*, not as a third party integrating the collection. The proof of composability is undercut by the framing: the content layer and the consuming game look like the same product made by the same team, so "anyone can build on this" doesn't land.

The submission's primary demo channel is a **recorded video** where the user narrates as a game developer. The gap is purely presentational: the building blocks (on-chain `register_integration`, Sui + Walrus reads with no Tusk3D backend dependency) already exist; the racetrack just doesn't *look* like someone else's product.

---

## Actors

- A1. **Demo narrator-as-gamedev**: The user, presenting in the video as the indie studio "Deksat" that built "Rage Racing" and integrated a Tusk3D collection.
- A2. **Judge / video viewer**: The audience who must believe, within seconds, that Rage Racing is a *different* product from Tusk3D.
- A3. **Buyer / NFT owner**: The in-fiction player whose owned NftTokens (or the `?model=` target) become the drivable cars Rage Racing imports.

---

## Key Flows

- F1. **Reskinned drive (carousel path)**
  - **Trigger:** Viewer/owner lands on `/track` with a connected wallet that owns NftTokens.
  - **Actors:** A1, A3
  - **Steps:** Page presents as Rage Racing (no Tusk3D chrome) → cars shown as "imported from a Tusk3D collection" → owner selects a car → scene loads the GLB from Walrus → drives a lap.
  - **Outcome:** Viewer perceives a standalone indie game running assets sourced from Sui + Walrus.
  - **Covered by:** R1, R2, R3, R4, R5, R7

- F2. **Race-on-mint deep link**
  - **Trigger:** The existing race-on-mint demo arc auto-navigates to `/track?model=<id>`.
  - **Actors:** A1, A3
  - **Steps:** Route resolves the single token by id → Rage Racing skin renders → car drives.
  - **Outcome:** The mint-to-drive beat still works, now inside the Rage Racing frame.
  - **Covered by:** R6

---

## Requirements

**Identity & chrome**
- R1. `/track` renders as "Rage Racing by Deksat Studio" with a visual identity (name, logo/wordmark, color palette, typography, voice) that is clearly distinct from Tusk3D's brutalist editorial style — distinct enough that a viewer would not assume the same team made both.
- R2. The Tusk3D global navigation/masthead chrome is suppressed on `/track` (the page does not render the shared top-nav).
- R3. The "Track" item is removed from the Tusk3D main navigation, so within the Tusk3D app the racetrack no longer presents as a feature tab.

**Framing & copy**
- R4. All on-page copy adopts the Rage Racing / Deksat Studio voice; no Tusk3D-internal labels (e.g. "L3 / DRIVE", "Tiny Racetrack.") remain visible.
- R5. The car carousel is framed from the *consuming game's* perspective — the cars read as assets imported from a Tusk3D collection, not as "the NFTs you own in Tusk3D."
- R7. A small persistent on-screen caption signals provenance — that the drivable content is imported from Sui + Walrus — making the "Tusk3D = content layer, Rage Racing = independent game" boundary visible on screen.
- R8. Empty / no-cars and error states use Rage Racing voice and do **not** link back to Tusk3D-internal routes (`/launch`, `/market`, `/browse`) as the primary call to action.

**Continuity**
- R6. The race-on-mint deep link (`/track?model=<id>`) and both override modes continue to function under the reskin; routing and the Sui/Walrus read path are unchanged.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3.** Given a viewer watching the demo, when the racetrack appears, then there is no Tusk3D masthead, no "Track" nav tab, and the visual identity reads as a different studio's product.
- AE2. **Covers R5, R7.** Given the carousel and HUD are visible, when the viewer reads the screen, then the cars are framed as imported assets and a provenance caption attributes the content to Sui + Walrus.
- AE3. **Covers R8.** Given the owner has no drivable cars, when the empty state renders, then it speaks in Rage Racing voice and does not present a Tusk3D-internal route as the main CTA.
- AE4. **Covers R6.** Given the race-on-mint arc auto-navigates to `/track?model=<id>`, when the page loads, then the targeted car resolves and drives inside the Rage Racing skin.

---

## Success Criteria

- A judge watching the demo video, without narration, would describe `/track` as "a different developer's racing game that uses the NFT," not "another tab in the Tusk3D app."
- The composability claim is *shown*, not just asserted: the on-screen provenance makes clear the game consumes Sui + Walrus content rather than a Tusk3D-proprietary backend.
- Planning can implement entirely within the frontend `/track` surface and shared nav, with no contract, Walrus, or Sui read-path changes, and the existing race-on-mint arc still passes.

---

## Scope Boundaries

- No separate deployment, subdomain, or standalone codebase (Approach B) — deferred as an optional upgrade.
- No wiring of the on-chain `register_integration` / `/integrate` attestation into the demo narrative (Approach C) — deferred as an optional upgrade.
- The address-bar tell (`…/track`) is not solved in this round; it is handled by camera framing in the recorded video.
- No changes to Move contracts, Walrus storage, or the Sui token-read path.
- No gameplay/mechanics changes to the racetrack scene itself (physics, lap logic, controls unchanged).

---

## Key Decisions

- Approach A (in-app reskin) over B (separate deployment) / C (attestation loop): primary demo channel is a recorded video the user controls, so a frontend reskin delivers the perceived separation at the lowest carrying cost; B/C kept as future upgrades.
- `/track` is *taken over* by the reskin and the "Track" nav tab is removed, rather than adding a parallel route: within Tusk3D's own experience the racetrack should stop existing as a feature tab.
- Keep the existing route, override modes, and Sui/Walrus read path intact: the reskin is purely presentational so the race-on-mint arc and `?model=` / `?blob=` hatches keep working.

---

## Dependencies / Assumptions

- Touch points are frontend-only: the `/track` page (`frontend/src/track/TrackPage.tsx`), the shared nav (`frontend/src/ux/TopNav.tsx`, which already supports hiding chrome on some routes via `NavGuard`), and any new Rage Racing brand assets. (Confirm exact mechanism during planning.)
- Assumes the reskin can suppress the masthead on `/track` the same way chrome is already hidden on `/dev/compare`.
- Brand assets (Rage Racing wordmark/logo, palette, font choices) need to be produced or sourced; none exist yet.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1] [User decision] Exact Rage Racing visual identity — palette, typography, and whether a logo/wordmark is hand-made, generated, or a simple type lockup.
- [Affects R7] [User decision] Exact provenance-caption wording and how much chain detail to show (e.g. collection id / Walrus blob id vs. a plain "Imported from Sui · Walrus").
- [Affects R2, R3] [Technical] Cleanest mechanism to suppress the masthead and remove the nav item without disturbing other routes (mirror the `/dev/compare` chrome-hide pattern).
