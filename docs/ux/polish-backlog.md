# UX Polish Backlog — Brutalist Editorial Application

**Status**: Active (target = 6/21 submission demo recording)
**Last updated**: 2026-05-23
**Source**: D-044, `docs/ux/design-tokens.md`

This is the concrete to-do list for applying the locked Brutalist editorial visual system to the live frontend. Items are grouped by screen and prioritized in three tiers.

## Priority tiers

- **MUST** — fix before 6/21 submission video recording. If left, the demo will read as "unfinished prototype" and Product/UX (20% of the score) takes a hit.
- **NICE** — improves polish but the demo survives without it. Bank against schedule, take if time permits.
- **POST** — defer to after submission. Don't touch until U15 ships.

## Top-of-funnel: order to execute

1. **Cross-cutting foundation** (1–2 hrs). Sets up everything else.
2. **Demo-critical screens** in demo-arc order: `/create` → `/launch` → `/market` → `/track`.
3. **Landing page** `/` (BrowsePage) — judge's first impression, do last because it's seen-but-not-clicked on the demo path.
4. **Auxiliary screens** if time remains.

---

## 0. Cross-cutting foundation

These touch every screen. Do these first.

### MUST

- **Create `frontend/src/ux/tokens.ts`** with the exported `tokens` object from `design-tokens.md` §9. Mirrors the existing inline-style pattern.
- **Add CSS variables to `frontend/src/index.css`** (or whatever the global stylesheet is — check `main.tsx` imports). Copy block from `design-tokens.md` §9.
- **Add Google Fonts link to `frontend/index.html`** — Inter + JetBrains Mono + Newsreader. One `<link>` tag, takes 30 seconds.
- **Verify body background and font reset** — `body { background: var(--paper); color: var(--ink); font-family: var(--font-body); }`. Without this, the off-white paper never paints.
- **Add a global `<TopNav>` component** at `frontend/src/ux/TopNav.tsx`. Brand mark left (italic serif `Model3D`), routes center (`Create / Market / Track / Forge`), wallet pill right (mono address + `TESTNET` mono badge). Render once in `App.tsx` above `<Routes>` — every page sees it automatically. Currently each page rolls its own chrome (or none) — this is the biggest source of demo inconsistency.
- **Babylon `PreviewCanvas.tsx` clearColor → `#000000`** (was likely a default gray or transparent). The 3D viewer well is pure black; the canvas inside must match. Otherwise there's a seam.

### NICE

- **`<PageHeader>` component** with display-italic h1, mono uppercase eyebrow label (`— LAYER 2 / OWNERSHIP`), optional subtitle. Reused on every screen — eliminates 5+ instances of inline header markup.
- **`<StatusBanner>` component** for the page-foot mono status line (`✓ CONFIRMED · …`). Drop-in replacement for MarketPage's current 3 status divs.
- **`<MonoPill>` component** for wallet addresses, IDs, network status. Wraps `truncate()` and applies mono + uppercase + letter-spacing automatically.

### POST

- Theme prefers-color-scheme awareness. Brutalist is intentionally one-mode; don't try to build a dark variant.
- Animations (page transitions, route-change fades). Brutalist is instant.

---

## 1. `/create` — Creator publishes Model3D

**File**: `frontend/src/creator/CreateModelPage.tsx`
**Sub-components**: `PromptInput.tsx`, `NameInput.tsx`, `MintButton.tsx`
**Demo-arc role**: Actor 1 generates or uploads a GLB, sets license/royalty, mints L1 Model3D. The first thing the judge sees the user *do*.

### MUST

- **Replace page background** with `var(--paper)`. Currently relies on `<body>` default.
- **Header treatment**: page-top should read `— L1 / PUBLISH` (mono eyebrow) then `Make a model.` (italic serif h1, `--text-display`). Sets the tone for the whole flow.
- **Source-mode toggle** (Tripo prompt / Upload GLB) — currently two radio-ish elements. Restyle as a two-cell toggle with heavy black border, active cell = accent fill, inactive = paper-pure. Same border on both sides shared between cells.
- **3D preview canvas** — wrap the `PreviewCanvas` in a `viewerWell` div (pure black). Today the canvas sits on the page background; reframing it as a black well immediately makes the model pop and signals "this is the thing."
- **License policy selector** — restyle as radio cards (two: Open / Restricted) with the active one bordered in accent. Move "royalty %" input to the right of the active card.
- **MintButton** — apply `buttonPrimary` style. Currently default button styling.
- **Form labels** — uppercase mono, `--text-xs`, letter-spacing 1.5px (`MODEL NAME`, `TAGS`, `LICENSE POLICY`, `DERIVATIVE ROYALTY`). Replaces lowercase sans labels which read as "form, generic."
- **Generation status** — replace any "Generating…" text with mono uppercase pill: `— GENERATING (35s)`. Update once per second with elapsed time.
- **Empty state** — before generation, the viewer well shows the same wireframe-cube placeholder used in mockups (SVG inline, stroke `var(--well-ink)` 30% opacity).
- **Error state** — failed generation / failed mint shows mono uppercase banner: `FAILED · <reason> · RETRY →`. Use `--err` for the label, mono for the reason.

### NICE

- **Drag-drop GLB target** — when in Upload mode, the viewer well doubles as a drop target. Border `1.5px dashed var(--ink)`, label `DROP A .GLB FILE OR CLICK TO BROWSE`.
- **GLB metadata strip** below the viewer once a model is loaded: filename, file size, triangle count, blob hash (mono row).
- **Fee preview** — show "SUI fee: 0.X SUI" mono row above MintButton, calculated from current input state.

### POST

- Tripo model-version selector (currently hardcoded to Turbo-v1.0).
- Saved prompts / prompt history.

---

## 2. `/launch` — Creator forks into a collection with token variants

**File**: `frontend/src/collection/LaunchCollectionPage.tsx`
**Demo-arc role**: Actor 1 picks a base Model3D, authors patch variants, fires `launch_collection_with_tokens` in a single signature. The L1→L2 fork story.

### MUST

- **Replace page background**, header treatment, form labels — same patterns as `/create`.
- **Base Model3D picker** — currently likely a dropdown or text input. Restyle as a thumbnail row of the user's eligible base models, each a card (`viewerWell` thumbnail + name + creator). Active selection has accent border 2px (the only place we use 2px border — see `design-tokens.md` rules).
- **Variant editor (`VariantEditor.tsx`)** — each variant row should be a horizontal bordered strip: name input, color picker (?), patch preview, delete button. All borders 1.5px ink. Patch preview goes in a mini `viewerWell`.
- **"+ ADD VARIANT" button** — `buttonOutline` style, full-width-of-variants-section, dashed border (1.5px dashed ink) to read as additive rather than destructive.
- **Launch button** — `buttonPrimary`, says `LAUNCH COLLECTION (N TOKENS) →`. Below it, mono row: `Signs once · pays gas · mints L2`.

### NICE

- **Live variant count badge** in the section header: `— VARIANTS (3 OF MAX 20)` mono.
- **Per-variant patch upload** — drag-drop into the variant strip (same dashed-border pattern as `/create` GLB target).

### POST

- Variant batch ops (duplicate, reorder).
- Variant preview rendering all 3 at once in a strip (good for visual sanity-check pre-launch).

---

## 3. `/market` — Seller lists, buyer purchases

**File**: `frontend/src/market/MarketPage.tsx`
**Demo-arc role**: Actor 3 (seller) lists an owned NftToken; Actor 4 (buyer) purchases it. Royalty hot-potato fires; buyer's `/track` immediately reflects ownership. The headline new feature.

### MUST (high-yield, currently the most prototype-looking screen)

- **Replace `pageStyle`** (currently `background: '#15171b'; color: '#ddd'; fontFamily: 'system-ui'`) with `{ background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-body)' }`. This single change reframes the page from "dark dApp" to "editorial catalog."
- **Replace `cardStyle`** (currently `background: '#1a1c20'; border: '1px solid #333'; borderRadius: 8`) with the locked `card` primitive — paper-pure bg, 1.5px ink border, 0 radius.
- **Listing card layout** — restructure each card to: viewer well (pure black with wireframe + L2 badge + numbered counter `001/004`), then card body with italic-serif name, mono `BY 0x…` row, top-bordered price + Buy row. See `design-tokens.md` §6 card spec.
- **Card grid** — replace `flexWrap: 'wrap', gap: 12` with a CSS grid where cards share borders between cells. The editorial grid look matters here — independent floating cards lose the "catalog" feeling.
- **Price formatting** — `0.10 SUI` (not `0.10 SUI (asking) · 0.105 SUI (you pay, incl. 5% royalty)` as a long parenthetical). Restyle as two-line: top line `0.10 SUI` (`--text-lg`, weight 500), bottom line `+ 0.005 ROYALTY (5%)` (`--text-xs`, mono, all caps).
- **Replace status emojis (⏳ ✅ ⚠️)** with mono labels:
  - `⏳ Reading…` → `— SYNCING (FULLNODE)`
  - `✅ Confirmed` → `✓ CONFIRMED · <token> → YOUR WALLET · /track`
  - `⚠️ Could not confirm` → `× CONFIRM FAILED · <reason> · [REFRESH]`
- **Status banner placement** — render statuses as a page-foot `statusBanner` (pure black bg, white text, accent label) instead of inline `<div>`s.
- **"Your cars" section** — same card grid treatment. The price input becomes a `1.5px ink border` field with a `LIST FOR SALE` mono uppercase button.
- **"Nothing for sale yet"** and **"You don't own any unlisted cars"** empty states — restyle as centered mono uppercase paragraphs with optional dashed-border container. The current sans-grey hint reads as "form helper text"; should read as "intentional editorial pause."
- **"Drive it on the track →" link color** — currently `#7aa2ff`. Replace with `var(--ink)` underlined, accent on hover. The accent should only appear after the CONFIRMED banner — having two accent uses in the same paragraph dilutes.

### NICE

- **`YOURS` badge** on owned listings — top-right of the viewer well, mono uppercase, accent color.
- **Kiosk grouping** — visually group listings by source kiosk with a divider row: `— KIOSK 0x7480…ce` mono uppercase. Strengthens the "this is on-chain" feeling.
- **Hover state on listing card** — invert: ink fill, paper-pure text. Instant (no transition).

### POST

- Sort / filter chrome — only matters at >20 listings (D-043's Tier C consideration).
- Listing pagination — same.

---

## 4. `/track` — Buyer drives their bought car

**File**: `frontend/src/track/TrackPage.tsx`
**Sub-components**: `Countdown.tsx`, `ResultOverlay.tsx`, `carCarousel.tsx`
**Demo-arc role**: Actor 4 sees their bought NftToken instantly drivable on a Babylon + Havok racetrack. Proves the on-chain → in-game pipeline closes. Visually the most striking page.

### MUST

- **Page treatment** — `/track` is mostly a 3D canvas, so the chrome should *recede*. Use the global TopNav, then go full-bleed black for the canvas area. The canvas itself is the well — no border, no card.
- **Car carousel (`carCarousel.tsx`)** — the row of owned cars at the bottom. Each car thumbnail in a small `viewerWell` (60×80px), italic-serif name below in white, mono `— SELECTED` label on the active one. Background black to blend with the canvas.
- **Countdown overlay** — gigantic italic-serif numerals (`--text-display` × 3 = 120px), centered, white on transparent. `3.` `2.` `1.` `GO.` (with the period — editorial detail).
- **Result overlay** — italic-serif headline (`Lap 1 · 38.5s`), mono uppercase subtitle (`PERSONAL BEST` or `+ 2.1s VS LAST`). Accent on the time delta only if positive.
- **HUD (speedometer / lap time)** — top corners, mono uppercase, white-on-black. No borders, no boxes — just text. Restraint.
- **"Loading scene…" state** — full black canvas with centered mono text `— LOADING TRACK · BABYLON + HAVOK · 12 MODULES`. The technical details are content.
- **Empty state** (no owned cars) — full-bleed black with centered editorial paragraph: italic-serif `Nothing to drive yet.` then mono `MINT A COLLECTION ON /LAUNCH OR BUY ONE ON /MARKET`. Both link to those routes.

### NICE

- **Race time HUD bar** — top edge, full-width, 32px tall black strip with mono `LAP · 00:38.5 · BEST 00:36.2 · BOOST READY`.
- **Track lineage badge** — bottom-left, mono uppercase: `KIOSK · 0x7480… → YOU · MINTED 2026-05-21`. Reinforces the on-chain provenance during the most-watched moment of the demo.

### POST

- Track variants (multiple maps).
- Multiplayer (way out of scope, but it's a natural next-step demo).

---

## 5. `/` — Landing / Browse

**File**: `frontend/src/browse/BrowsePage.tsx`
**Sub-components**: `ModelCard.tsx`, `CollectionCard.tsx`
**Demo-arc role**: The default route. Judge lands here from a `model3d.xyz` URL. First impression. Decides whether they keep watching.

### MUST

- **Hero section above the catalog** — italic-serif headline (`A model marketplace. On Sui. With composable IP.`), mono eyebrow (`— SUI OVERFLOW 2026 / WALRUS TRACK`), and a short paragraph that names the three layers (L1 publish · L2 mint · L3 access). This is the *only* place on the whole site that explains the product without the user clicking — make it count.
- **Catalog grid** — same editorial-grid treatment as `/market`, with shared borders.
- **Model card vs Collection card** — visually distinct so the judge can read the L1/L2 distinction. Models = single viewer well + creator + license badge. Collections = two stacked thumbnails (showing variant patches) + collection name + size (`12 OF 50 MINTED`).
- **Tag filter chips** — mono uppercase, 1.5px border, active = accent fill. Small row above the grid.
- **"FOR CREATORS / FOR BUYERS / FOR DRIVERS" CTA row** — three editorial cards near the page foot pointing to `/create`, `/market`, `/track` respectively. Each one a black-well thumbnail + mono uppercase label + italic-serif tagline.

### NICE

- **Footer** — italic-serif wordmark + GitHub link + small mono `MODEL3D · 2026 · OVERFLOW SUBMISSION`. Anchor of editorial confidence.
- **In-page hash anchors** for the three CTAs (`#create`, `#market`, `#track`) so direct links work mid-demo.

### POST

- Search bar.
- Sort options.
- Pagination beyond 20 items.

---

## 6. Auxiliary screens (take if time permits)

### `/model/:objectId` — `buy/ModelDetailPage.tsx`
- MUST: page bg + nav + header consistency. Avoid demo-path; if not polished, ensure no link from `/market` or `/` lands here during the recording.
- NICE: full-fidelity treatment (hero viewer well, license panel, mint-derivative CTA).

### `/collection/:slug` — `collection/CollectionDetailPage.tsx`
- MUST: same.
- NICE: grid of all 50 variant tokens with own/listed/free state coloring.

### `/integrate` — `integration/RegisterIntegrationPage.tsx`
- Out of demo scope. POST only.

### `/dev/compare` — `dev/CompareGlbsPage.tsx`
- **Hide from the demo build.** Add a check that this route 404s in production. Currently it's a dev tool that judges should never see.

---

## 7. Components used across screens

### `auth/SignInButton.tsx`
- MUST: apply `buttonPrimary` style. Label: `SIGN IN WITH GOOGLE` or `CONNECT WALLET` depending on flow state.

### `babylon/PreviewCanvas.tsx`
- MUST: clearColor `#000000` (matches well). Camera limits to keep the model centered. Light setup that flatters wireframe + textured models.
- NICE: subtle auto-rotation (0.2 rad/sec) when idle for >3s — this is the demo-video motion mitigation called out in D-044.

### Form components (`PromptInput.tsx`, `NameInput.tsx`)
- MUST: apply the `input` primitive. Labels uppercase mono. Error text in `--err`, mono, with `× ` prefix.

### `track/Countdown.tsx`, `track/ResultOverlay.tsx`
- See /track MUST section.

---

## 8. Definition of done (per screen)

Before marking a screen MUST-complete, check:

1. Page background is `--paper` (or `--well` for `/track`).
2. No emoji anywhere. Replaced by mono uppercase labels.
3. No `border-radius > 0` anywhere on the page.
4. Accent color appears ≤5 times. Count instances.
5. Only fonts in use are Newsreader (italic display), Inter (body), JetBrains Mono.
6. Loading state, empty state, error state all exist and use the system.
7. Page renders identically in Chrome and Safari (Babylon canvas excepted).
8. Screen-record a 10-second clip. Watch it muted. Can you tell what's happening?

---

## 9. What's NOT on this backlog

- Backend API changes — out of scope for UX polish.
- Move contract changes — D-040/041/042/043/044 set the on-chain surface; UX changes don't touch contracts.
- Logo / wordmark design — separate item (OQ-016 §2, Phase 5 plan unit).
- Pitch deck / demo video script — separate item (U15).
- README — separate item (U15).
- Mainnet deploy — gated by D-028, separate workstream.

---

## 10. Related

- D-044 (decision lock)
- `docs/ux/design-tokens.md` (the system itself)
- `docs/phase-progress.md` (this work happens inside U15 window)
