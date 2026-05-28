---
title: Tusk3D Landing S6 — Keycap Dispatch Row + Route Migration
status: ready-to-plan
date: 2026-05-28
upstream:
  - docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md (#6 + page layout)
related:
  - docs/brainstorms/2026-05-28-tusk3d-landing-lede-requirements.md (S1 lede)
  - docs/plans/2026-05-28-019-feat-tusk3d-landing-lede-plan.md (S1 plan, shipped)
actors:
  - A1: visitor / judge (primary)
  - A2: asset producer (Rick — secondary; touches /create /launch but not S6 itself)
flows:
  - F1: visitor lands → clicks BROWSE → catalog
  - F2: visitor lands → clicks CARVE → /create (wallet-gated)
  - F3: visitor lands → clicks RIFF → /launch (wallet-gated)
  - F4: visitor lands → clicks INTEGRATE → /integrate
  - F5: legacy `/` link arriving from elsewhere → now lands on lede, not browse (intentional break)
acceptance_examples: AE1-AE6
---

## Summary

The closing footer of the new Tusk3D landing page (`/`): a 4-keycap row labelled **CARVE / RIFF / BROWSE / INTEGRATE**, each dispatching to the corresponding creator-economy route (`/create`, `/launch`, `/browse`, `/integrate`). BROWSE carries a single `#FF4500` accent dot — the always-on directional hint that BROWSE is the easiest entry for a first-time visitor.

This survivor also owns the **landing redesign's required route migration**: BrowsePage moves from `/` to `/browse`, and the newly-shipped `LedeHero` (plan-019) takes over `/`. Tying the keycap row and the route swap to a single plan makes "the lede is actually visible on the homepage" an atomic milestone — neither piece is useful without the other.

---

## Problem Frame

After plan-019 shipped, `LedeHero` exists as a React component but isn't reachable: `/` still mounts `BrowsePage` (the catalog grid for ALL collections). A first-time visitor or judge landing on `/` today sees an internal-tool catalog with no orientation, no brand explanation, and no clear next action.

S6 closes that gap two ways:

1. **Route swap** — move BrowsePage to `/browse` (where it belongs as a destination) and put the lede at `/` (where it serves orientation).
2. **Dispatch row** — give the visitor four concrete actions corresponding to the four actor lanes of the composable creator economy, so the "what is Tusk3D?" mental model is communicated by the verb vocabulary itself rather than requiring prose explanation.

The keycap row's actor-lane mapping (CARVE=modelCreator, RIFF=nftCreator, BROWSE=buyer, INTEGRATE=gameDev) also echoes S5's planned actor cards — when both surfaces ship, the row reinforces the cards' mental model rather than competing with them.

---

## Actors

- **A1 — Visitor / Judge** (primary). First-time arrival at `/`. Wants to know what Tusk3D is and what they can do here. May or may not have a wallet. Likely to click BROWSE first because of the accent dot; may explore CARVE/RIFF if curious; INTEGRATE only relevant to gamedev evaluators.
- **A2 — Asset producer (Rick)** (secondary). Already knows what `/create` and `/launch` do; uses those routes for pre-flight minting. Sees the keycap row on `/` as a sanity check that the landing redesign shipped correctly; doesn't navigate via the keycaps day-to-day.

---

## Key Flows

### F1 — Browse-first visit (the default)
A1 lands on `/` → sees `LedeHero` (live Babylon or static fallback) + the 4-keycap row at the foot → clicks `BROWSE ●` → router moves to `/browse` → `BrowsePage` (the existing catalog grid component, unchanged) renders the Collection cards.

### F2 — Creator path: CARVE
A1 lands on `/` → clicks `CARVE` → router moves to `/create` → existing `CreateModelPage` renders (wallet-gated; sign-in flow handled by the page itself, out of scope for S6).

### F3 — Creator path: RIFF
A1 lands on `/` → clicks `RIFF` → router moves to `/launch` → existing `LaunchCollectionPage` renders (wallet-gated; same as F2).

### F4 — Game-dev path: INTEGRATE
A1 lands on `/` → clicks `INTEGRATE` → router moves to `/integrate` → existing `RegisterIntegrationPage` renders (no wallet gate; reachable read-only).

### F5 — Legacy `/` link from elsewhere
A1 follows a bookmark, social link, or in-product back-arrow to `/` that previously rendered `BrowsePage` → now renders the lede. **No redirect to `/browse`**: clean break. Any existing in-app callers that need the catalog must explicitly route to `/browse`.

---

## Requirements

### Keycap row (the component itself)

- **R1.** The component is a single React surface — `KeycapRow` — rendered as the last child of the landing-page tree below `LedeHero`. No props required; consumes its own constants for keycap labels + routes.
- **R2.** Four keycaps, in this order: **CARVE → `/create`**, **RIFF → `/launch`**, **BROWSE → `/browse`**, **INTEGRATE → `/integrate`**. Order is load-bearing — it mirrors S5 actor-card order so the two surfaces echo when S5 ships.
- **R3.** Each keycap renders two lines: the verb in JetBrains Mono caps (large), the route path in JetBrains Mono caps (small, muted color). E.g. `CARVE` over `/CREATE`.
- **R4.** The BROWSE keycap renders a single `#FF4500` accent dot adjacent to its label (right of "BROWSE", before "/BROWSE"). Always-on — not driven by current-page state, not animated.
- **R5.** Hover state: 1.5px border thickens to 3px instantly (no CSS transition; D-044 §7 instant rule). No color change, no shadow, no scale.
- **R6.** Clicking a keycap uses React Router `Link` (SPA navigation, no full reload). Matches the plan-019 lede CTA convention.

### Layout

- **R7.** Desktop (≥768px viewport): the four keycaps render as an equal-width horizontal row, full content-area width (max-width matches the page-paper container the lede already uses).
- **R8.** Mobile (<768px viewport): the four keycaps render as a **2×2 grid** — top row CARVE/RIFF, bottom row BROWSE/INTEGRATE. Matches the actor-pair grouping (creator/nft creator on top, buyer/gamedev on bottom). The breakpoint matches `useLedeRenderMode`'s 768px gate so the lede and keycap row flip layouts together.
- **R9.** No data badges, no telemetry, no per-route count strings on the keycaps. The keycap row is brand identity, not dashboard.

### Scope of presence

- **R10.** The KeycapRow renders **only on `/`**. It is NOT present on `/browse`, `/create`, `/launch`, `/integrate`, `/market`, `/track`, `/model/:id`, `/collection/:id`, or `/dev/compare`. The existing `TopNav` handles navigation on all non-landing pages and stays unchanged.

### Route migration

- **R11.** `frontend/src/App.tsx` route table change: `<Route path="/" element={<BrowsePage />} />` → `<Route path="/" element={<TheNewLandingPage />} />`, and a new `<Route path="/browse" element={<BrowsePage />} />` is added.
- **R12.** "TheNewLandingPage" is a thin wrapper component (call it `LandingPage` or similar) that composes `LedeHero` (above the fold) + `KeycapRow` (footer). S2/S3/S4/S5/S7 are inserted into this same wrapper by their respective survivor plans; S6's plan creates the wrapper with just S1 + S6 wired up.
- **R13.** **No redirect** from `/` to `/browse` for legacy bookmarks. Clean break. Any in-app callers that needed the catalog at `/` must be updated to `/browse` as part of this plan.
- **R14.** Existing test fixtures that visited `/` for the catalog (e.g. BrowsePage tests using `MemoryRouter initialEntries={['/']}`) update their entry to `/browse`. Tests that should now hit the landing visit `/`.

### Verification

- **R15.** `agent-browser` drives both routes per CLAUDE.md frontend verification protocol:
  - `/` → asserts the keycap row renders with 4 testid-tagged keycaps + the BROWSE accent dot is present + LedeHero renders (static-fallback path, since agent-browser's Chromium lacks WebGL in v1 — the live Babylon path is verified separately by the user in real Chrome).
  - `/browse` → asserts `BrowsePage` renders its filter row + CollectionCard grid as it did at `/` before the migration. No keycap row on `/browse` (R10).
- **R16.** Test wallet impact: zero. Neither `LedeHero` nor `BrowsePage` requires sign-in to render. The keycap row dispatches to wallet-gated routes (`/create`, `/launch`) but the gate lives in those pages, not in S6.

### Accent budget

- **R17.** S6 consumes **1 of the 5 accent slots/page** (D-044). Combined with S1 lede CTA (1, post-15s dwell) + S2 telemetry `●live` (1, future), the landing page reaches 3/5 used. The remaining 2 slots are available for S3/S4/S5/S7 to claim.

---

## Acceptance Examples

| ID | Scenario | Expected |
|----|----------|----------|
| **AE1** | First-time visitor opens `/` on desktop | LedeHero renders (live or static fallback per `useLedeRenderMode`), KeycapRow renders below with 4 keycaps in CARVE/RIFF/BROWSE/INTEGRATE order, BROWSE shows accent dot, hover on any keycap thickens its border instantly |
| **AE2** | Same visitor on mobile (<768px) | KeycapRow renders as 2×2 grid (CARVE \| RIFF / BROWSE \| INTEGRATE), still SPA-clickable |
| **AE3** | Visitor clicks BROWSE keycap | URL → `/browse`, BrowsePage renders the existing CollectionCard grid, no full page reload, no keycap row visible on browse |
| **AE4** | Visitor follows a legacy bookmark to `/` (used to be BrowsePage) | Lands on the new landing (LedeHero + KeycapRow), NOT on BrowsePage. Must click BROWSE to reach the catalog |
| **AE5** | Visitor clicks CARVE without a wallet connected | URL → `/create`, the page's own wallet sign-in gate fires (existing behavior; S6 doesn't add a gate) |
| **AE6** | agent-browser smoke test runs the full demo arc | `/`, `/browse`, `/create`, `/launch`, `/integrate`, `/track` all reachable; KeycapRow only present on `/`; LedeHero only present on `/` |

---

## Success Criteria

The brainstorm is complete and planning can start when:

1. ✅ A first-time visitor landing on `/` can articulate Tusk3D's product space ("there are four things I can do here") from the keycap row alone, without reading prose.
2. ✅ The BROWSE accent dot draws the eye as the default first action on visual scan.
3. ✅ The route migration ships cleanly — `/browse` is reachable, `/` shows the lede, no broken in-app navigation, no 404s on previously-good internal links.
4. ✅ `agent-browser` smoke test passes on the new `/` and `/browse` routes per CLAUDE.md verification protocol.
5. ✅ Accent count on landing stays ≤5 (5-slot rule of D-044).

---

## Scope Boundaries

### In scope
- New `KeycapRow` React component (no props, self-contained).
- New `LandingPage` wrapper composing `LedeHero` + `KeycapRow` (with hooks for surrounding survivors to insert their pieces later).
- `frontend/src/App.tsx` route table changes (R11).
- Updates to existing tests that hit `/` for catalog content (R14).
- agent-browser verification of `/` + `/browse` (R15).

### Deferred to follow-up work
- **S2 telemetry strip** — separate survivor plan; reserves 1 accent slot.
- **S3 topology identity mark** — separate survivor; reuses U2 `edgesGradientSweep` primitive from plan-019.
- **S4 lifecycle strip** (PROMPT/MODEL/VARIANT/IN-GAME OBJ) — separate survivor.
- **S5 actor cards** (MTG-style) — separate survivor; will echo S6's verb order.
- **S7 issue masthead** — separate survivor.
- The `LandingPage` wrapper has clear insertion points for S2/S3/S4/S5/S7, but their content is owned by their plans.
- **Replacing the current TopNav** with the keycap row's verb language on non-landing pages — out of scope; TopNav remains for non-landing nav.
- **Mobile lede behavior** — already settled in plan-019 (static SVG below 768px).

### Outside this product's identity
- A "Get Started" / "Sign Up" / "Join the Waitlist" single-CTA layout. Tusk3D's first surface is the brand mental model (4 actor verbs), not conversion funnelling.
- Data-decorated keycaps ("BROWSE 47 collections") — telemetry belongs in S2, not in the keycaps.
- Keycap-row "you are here" state on non-landing pages — S6 is landing-only by design.

---

## Key Decisions

1. **4 keycaps over single CTA.** The brand thesis ("composable creator economy with 4 actor lanes") needs 4 verbs visible; a single primary CTA wins clicks but loses the mental model that the rest of the landing depends on.
2. **Always-on accent dot, not state-aware.** BROWSE's dot is a designed directional hint, not a "you are here" indicator. S6 is landing-only, so a "you are here" interpretation would be coherent on `/` only (the dot is already at the right place) and meaningless everywhere else.
3. **2×2 grid on mobile, not vertical stack.** Editorial brutalism wants block structure; a vertical stack feels more SaaS than print. The 2×2 also naturally groups creator-side (CARVE/RIFF) above buyer/gamedev (BROWSE/INTEGRATE).
4. **Single brainstorm covering keycap row + route migration.** The route migration is ~10 lines of App.tsx + a handful of test updates; tying it to S6 makes "lede is visible at `/`" a single atomic milestone rather than fragmenting into "ship S6 keycap visuals" + "ship route migration" plans.
5. **No `/` → `/browse` redirect.** Clean break is cheap (the in-app callers are countable on one hand) and avoids confusing the "what is `/`?" mental model with a "bypass" rule.
6. **`KeycapRow` takes no props.** Routes and labels are module-level constants. Surrounding survivors that compose into `LandingPage` don't need to configure S6 — its only job is the 4-verb dispatch.

---

## Dependencies / Assumptions

- **D-044 brutalist editorial tokens** (locked) — `tokens.color.accent`, `tokens.font.mono`, `tokens.border.primary`, etc. are stable from plan-012 and earlier.
- **plan-019 LedeHero** is shipped and merged to main. It will be composed by the new `LandingPage` wrapper without modification (no new props, no API change required).
- **`/create`, `/launch`, `/integrate` routes exist and render** their current pages — verified during S6 brainstorm scan (App.tsx lines 28, 30, 32).
- **TopNav** stays unchanged. If a future plan unifies the landing keycap row with the global TopNav, that's a separate brainstorm.
- **Mobile breakpoint = 768px** — matches the existing `useLedeRenderMode` gate. Any future change to the breakpoint must be coordinated across both surfaces.
- **agent-browser cannot drive the live Babylon path** in v1 (no WebGL in its Chromium per current setup). Verification relies on `useLedeRenderMode` returning `static-fallback` in headless contexts, which it does by design. The live path is verified by the user in real Chrome.
- **In-app callers of `/`** — the brainstorm assumes there are very few (and the few there are can be updated as part of this plan). If a later scan reveals many `<Link to="/">` call sites that semantically meant "go to the catalog", the plan should call those out as a separate fix.
