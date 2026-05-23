---
status: completed
completed: 2026-05-23
plan_id: 2026-05-23-012-feat-brutalist-ux-polish
created: 2026-05-23
type: feat
origin:
  - docs/ux/design-tokens.md
  - docs/ux/polish-backlog.md
  - docs/decisions.md (D-044)
---

# feat: Brutalist editorial UX polish — apply D-044 across the demo-arc frontend

## Summary

Apply the locked Brutalist editorial design system (D-044) to all demo-arc screens before the 6/21 submission recording. Six commits, ~14 hrs total: foundation first (tokens + global nav + Babylon clearColor seam), then demo-arc order — `/create` → `/launch` → `/market` → `/track` → `/`. Auxiliary routes are deferred.

---

## Problem Frame

The frontend is prototype-grade: inline `React.CSSProperties` with no shared system, ad-hoc dark theme in MarketPage (`#15171b` / `#1a1c20` / status emojis), `system-ui` font everywhere, no global navigation. Each page rolls its own chrome — there is nothing cross-cutting that signals "one product, one identity."

Submission is 6/21 (29 days out). Judges score Product/UX at 20% (4× the presentation weight) via a screencap recording of the four-actor demo arc. D-044 (Accepted 2026-05-23) locked Brutalist editorial as the v1 visual identity; this plan is the rollout choreography.

The visual system itself, the per-screen polish item lists, and the definition-of-done checklist all live in `docs/ux/`. This plan adds: unit cuts with file ownership, test impact, verification steps, commit boundaries, and a risk register.

---

## Origin Documents

These three documents are the source of truth — this plan does not restate their content, only references their sections.

- `docs/ux/design-tokens.md` — full token spec (12 colors, 3 fonts, 6 sizes, 6 spacing values, component primitives, anti-patterns) + drop-in `tokens.ts` / `index.css` / Google Fonts `<link>` code blocks
- `docs/ux/polish-backlog.md` — per-screen MUST/NICE/POST items in demo-arc execute order + §8 per-screen "definition of done" checklist
- `docs/decisions.md` D-044 — decision lock, alternatives considered, tradeoffs

---

## Scope

### In Scope

- `polish-backlog.md` §0 cross-cutting foundation MUST items
- `polish-backlog.md` §1–§5 per-screen MUST items, in demo-arc order
- `polish-backlog.md` §7 cross-screen components touched as needed (SignInButton, PreviewCanvas, form inputs)
- NICE items bundled into the relevant per-screen unit *when the unit's hour budget allows* — overrun → cut NICE

### Deferred to Follow-Up Work

These are known and planned but live outside this plan's commit chain. They land separately or post-submission.

- `polish-backlog.md` §6 auxiliary screens (`/model/:id`, `/collection/:slug`, `/integrate`) — not on the demo path; only polish if U6 finishes early
- `polish-backlog.md` §3 NICE Kiosk grouping divider on `/market`
- `polish-backlog.md` §4 NICE race-time HUD bar + lineage badge on `/track`
- `polish-backlog.md` §7 NICE PreviewCanvas auto-rotation (D-044 motion mitigation) — punt unless screencap reads as still
- `<PageHeader>`, `<MonoPill>` helper extraction — see KD3; extract only when duplication ≥3 sites
- Re-rendering the 4-vibe + hybrid mockups into `pitch/` for the pitch deck (mentioned in phase-progress 2026-05-23 "Other notes")
- `/dev/compare` production 404 — *if* it's non-trivial, defer; otherwise handle inside U1

### Out of Scope

- Move contract changes, backend API changes, shared types
- Logo / wordmark design (OQ-016 §2 — separate Phase 5 task)
- Pitch deck content / demo video script / README polish (all U15 items)
- Mainnet deploy (D-009, separate workstream)
- Tailwind / CSS-modules migration — D-044 explicitly keeps inline-style
- Light/dark mode parity — D-044 §8 anti-patterns excludes it intentionally

---

## Key Technical Decisions

### KD1. Inline-style pattern continues (no library migration)

`tokens.ts` exports a `const tokens = {...} as const` object plus pre-built `React.CSSProperties` primitives (`buttonPrimary`, `card`, `viewerWell`, etc.). CSS variables live in `index.css` for the body-level reset and for the few places React inline styles can't reach (e.g. focus rings via `:focus-visible`). Matches the existing `MarketPage.tsx` convention.

### KD2. TopNav mounted globally via `useLocation()` conditional hide

A single `<TopNav />` renders above `<Routes>` in `App.tsx`. A `useLocation()` check hides it on `/dev/compare` (per `polish-backlog.md` §6). No layout-wrapper component, no per-route registration — one mount, one conditional.

### KD3. Helper components extracted lazily, not upfront

`<PageHeader>`, `<StatusBanner>`, `<MonoPill>` are listed as NICE in `polish-backlog.md` §0. Each per-screen unit inlines its own header / status pattern until *three* screens want the same shape — then extract. Avoids designing helper APIs before usage proves the right cuts.

### KD4. Each unit owns its own test updates inline

No separate "fix tests" unit. The unit that changes copy / styling updates the affected test assertions in the same commit. Reviewers see code + tests in lockstep; bisect is clean.

### KD5. PreviewCanvas clearColor change lives in U1 — confirmed test-safe

`frontend/src/babylon/PreviewCanvas.test.tsx:10` mocks `clearColor = { set: () => {} }` — no assertion against the actual value. Single-line change in `PreviewCanvas.tsx:58` ships safely with the foundation commit.

### KD6. One commit per unit; conventional commits, reference D-044

Per CLAUDE.md commit style. Each unit ships as `feat(ux): <scope> brutalist polish (D-044)` (or similar). No batching.

### KD7. Screen order = demo-arc order, not file-tree order

`/create` first (Actor 1 publishes), then `/launch` (Actor 1 forks L2), `/market` (Actor 3 sells, Actor 4 buys), `/track` (Actor 4 drives), `/` (landing). `/market` is highest-yield per polish-backlog (currently most prototype-looking + headline feature); `/` is last because it's seen-but-not-clicked on the critical demo path. Matches `polish-backlog.md` §10 / `design-tokens.md` §10.

---

## Implementation Units

### U1. Cross-cutting foundation

**Goal:** Stand up the design-token module, replace the dark global stylesheet with brutalist defaults, load the three typefaces, mount the global navigation, and seam the Babylon viewer into a pure-black well. After this unit lands, every subsequent screen polish only edits the screen — the foundation is in place.

**Requirements:** `polish-backlog.md` §0 MUST (all six items), D-044 token spec.

**Dependencies:** none.

**Files:**
- `frontend/src/ux/tokens.ts` (new) — exported `tokens` object + inline-style primitives per `design-tokens.md` §9
- `frontend/src/ux/TopNav.tsx` (new) — brand mark, route links, wallet pill + TESTNET badge
- `frontend/src/ux/TopNav.test.tsx` (new)
- `frontend/src/index.css` — replace current dark `:root` block with brutalist CSS variables + body reset + global typography defaults
- `frontend/index.html` — add Google Fonts `<link>` for Newsreader (italic 400/500) + Inter (400/500) + JetBrains Mono (400)
- `frontend/src/App.tsx` — mount `<TopNav />` above `<Routes>`, conditional hide on `/dev/compare`
- `frontend/src/babylon/PreviewCanvas.tsx` — change `scene.clearColor.set(0.08, 0.09, 0.11, 1)` (line 58) to `(0, 0, 0, 1)`

**Approach:**
- `tokens.ts`: copy the object from `design-tokens.md` §9 verbatim. Add inline-style primitives for `buttonPrimary`, `buttonOutline`, `buttonDestructive`, `input`, `card`, `viewerWell`, `badge`, `badgeAccent`, `statusBanner`, `navBar` per `design-tokens.md` §6.
- `index.css`: replace the entire current file. Drop the current dark `:root` (`#0e1014` / `#e7e6ea` / `system-ui`) and global button styles. Insert the brutalist `:root` variables + body reset + `h1/h2/h3` italic-serif defaults + `input/button/textarea/select { border-radius: 0; font-family: inherit }` + global `box-sizing: border-box` per `design-tokens.md` §9.
- `index.html`: add the `<link>` block from `design-tokens.md` §9 inside `<head>` (before the existing `<script>` tag is moot — those go elsewhere). Add `preconnect` for `fonts.googleapis.com` + `fonts.gstatic.com`.
- `TopNav`:
  - Brand mark: italic-serif `Model3D` at 16px in `var(--font-display)`
  - Center: route links (`Create / Launch / Market / Track`) in `var(--font-body)` at 12px. Active route from `useLocation()` gets `borderBottom: 2px solid var(--accent)` + `paddingBottom: 2px`
  - Right: wallet pill via existing `auth/useSession` — if connected, mono truncated address (e.g. `0xC731…48BA`); if not, `buttonOutline` reading `CONNECT WALLET`. Always followed by mono `TESTNET` badge
  - Layout: flex row, `padding: 14px 20px`, `borderBottom: 1.5px solid var(--ink)`, `background: var(--paper-pure)`
- `App.tsx`: introduce a small inline `<Layout>` (or use `useLocation` directly in the App body) that wraps the `<Routes>` block. The wrapper renders `<TopNav />` when `location.pathname !== '/dev/compare'`. No `<Outlet>` refactor required.
- `PreviewCanvas.tsx`: single-line clearColor change; no other touches.

**Patterns to follow:**
- Existing `frontend/src/auth/useSession.tsx` — already supplies connected wallet address
- Existing `frontend/src/market/MarketPage.tsx` inline-style convention (the closest reference for how `tokens.ts` primitives get applied)

**Test scenarios** (TopNav.test.tsx):
- Renders brand mark, all four route links, and the TESTNET badge
- Active route: render inside MemoryRouter at `/market`, assert the `Market` link has the accent underline style (read computed/inline style); render at `/track`, assert `Track` is highlighted
- Wallet not connected: render with `useSession` mocked to return null account, assert `CONNECT WALLET` button is present
- Wallet connected: render with `useSession` mocked to return an address, assert truncated mono address appears (e.g. matches `/^0x[0-9a-f]{4}…[0-9a-f]{4}$/i`)
- Conditional hide: render the `App` (or `Layout`) at `/dev/compare`, assert TopNav not in document; render at `/`, assert TopNav present

**Verification:**
- `pnpm typecheck` clean
- `pnpm test` green — PreviewCanvas.test.tsx still passes (KD5), new TopNav tests pass, no regression
- `pnpm dev`: visit `/`, see paper-color background (`#F5F5F0`), Inter body font, italic-serif `Model3D` mark in nav. Visit `/dev/compare`, no nav. Visit `/create`, PreviewCanvas wells render pure black.
- Definition-of-done from `polish-backlog.md` §0 MUST: tokens.ts exists, CSS variables active in DevTools, three font families loaded (Network tab), TopNav mounted, PreviewCanvas clearColor `#000000`

**Estimated:** ~2 hours.

**Commit:** `feat(ux): brutalist editorial foundation — tokens + TopNav + black PreviewCanvas (D-044)`

---

### U2. `/create` — Brutalist Creator page

**Goal:** Apply brutalist visual identity to the L1 publish flow — Actor 1's first interaction in the demo arc. After this unit, the `/create` screen reads as editorial: paper background, mono uppercase labels, black PreviewCanvas well, italic-serif page header, accent-filled mint button.

**Requirements:** `polish-backlog.md` §1 MUST (all 10 items). NICE items bundled if time allows.

**Dependencies:** U1.

**Files:**
- `frontend/src/creator/CreateModelPage.tsx` — page background, header, source-mode toggle, viewer well wrap, license card layout, all form labels, status / error / empty states
- `frontend/src/creator/PromptInput.tsx` — apply `tokens.input`, uppercase mono label
- `frontend/src/creator/NameInput.tsx` — same
- `frontend/src/creator/MintButton.tsx` — apply `tokens.buttonPrimary`
- `frontend/src/creator/CreateModelPage.test.tsx` — update copy assertions where label / status text changes
- `frontend/src/creator/PromptInput.test.tsx` — same if labels change
- `frontend/src/creator/NameInput.test.tsx` — same
- `frontend/src/creator/MintButton.test.tsx` — same

**Approach:**
- Page-level: replace inline page bg with `var(--paper)` + `var(--font-body)`. Page-top eyebrow `— L1 / PUBLISH` (mono uppercase, `--text-xs`, letter-spacing 1.5px) then h1 `Make a model.` (`--font-display` italic, `--text-display`, line-height 1.0, letter-spacing -1px).
- Source-mode toggle: two-cell toggle with shared 1.5px ink borders. Active cell `var(--accent)` fill + `var(--accent-ink)` text; inactive `var(--paper-pure)`. Shared center divider, not two independent buttons.
- PreviewCanvas wrap: place inside a `tokens.viewerWell` div. Empty state shows a wireframe-cube SVG placeholder (stroke `var(--well-ink)` at 30% opacity, 1.5px). Polish-backlog §1 specifies the SVG style.
- License policy: radio cards (Open / Restricted only — ALLOW_LIST removed per D-040). Active card has `border: 2px solid var(--accent)`. Royalty % input sits to the right of the active card.
- Form labels: `MODEL NAME`, `TAGS`, `LICENSE POLICY`, `DERIVATIVE ROYALTY` — all uppercase mono `--text-xs` letter-spacing 1.5px.
- Status text: replace any "Generating…" with `— GENERATING (Ns)` mono uppercase, ticking elapsed seconds.
- Error state: `FAILED · <reason> · RETRY →` mono uppercase, `var(--err)` for the FAILED label.

**Patterns to follow:**
- U1's TopNav for active-state styling reference (accent underline, mono uppercase letter-spacing)
- `polish-backlog.md` §1 for full MUST list

**Test scenarios:**
- Page renders with paper background (inline style or CSS var present)
- Source-mode toggle renders both cells; clicking switches active state
- Mint button uses `tokens.buttonPrimary` (accent fill, uppercase mono label)
- Generating state: assert mono uppercase status string appears when state is `generating`
- Error state: assert `FAILED` mono label with `var(--err)` color when state is `error`
- Existing test scenarios (mint click → PTB signing flow, prompt validation, name validation) continue to pass — only assertion text updates, not behavior

**Verification:**
- `pnpm typecheck` clean
- `pnpm test` green (4 affected test files all passing)
- `pnpm dev`: walk `/create` — empty state (wireframe placeholder), populate prompt + name, see live updates, click mint, see status banner replace generic spinner
- Definition-of-done per `polish-backlog.md` §8: paper bg, no emoji, no rounded corners, accent count ≤5, three font families, loading + empty + error states present

**Estimated:** ~3 hours.

**Commit:** `feat(ux): /create brutalist editorial polish (D-044)`

---

### U3. `/launch` — Brutalist Launch page

**Goal:** Apply brutalist visual identity to the L1→L2 fork flow. Actor 1 selects a base Model3D, authors variants, fires the one-signature `launch_collection_with_tokens` PTB.

**Requirements:** `polish-backlog.md` §2 MUST. NICE items bundled if budget allows.

**Dependencies:** U1, U2 (reuses patterns established in /create — page header, form labels, viewer well).

**Files:**
- `frontend/src/collection/LaunchCollectionPage.tsx`
- `frontend/src/forge/VariantEditor.tsx` — restyle variant rows as horizontal bordered strips
- `frontend/src/forge/VariantPreview.tsx` — mini viewer well per variant
- `frontend/src/collection/LaunchCollectionPage.test.tsx`
- `frontend/src/forge/VariantEditor.test.tsx`

**Approach:**
- Page bg + header (`— L2 / MINT` eyebrow, italic-serif h1) following U2 pattern
- Base Model3D picker: thumbnail row of forkable models (existing `useModelIndex` filter, `glb_blob_id` non-empty). Each entry is a small viewer well + italic-serif name + mono creator address. Active selection: `border: 2px solid var(--accent)`.
- Variant editor: each row a horizontal bordered strip. Name input (`tokens.input`), color picker (existing), patch preview in mini `viewerWell` (60×80), delete button (`tokens.buttonDestructive`, outline only).
- "+ ADD VARIANT" button: full-width-of-variants-section, `border: 1.5px dashed var(--ink)`, mono uppercase label.
- Launch button: `tokens.buttonPrimary` reading `LAUNCH COLLECTION (N TOKENS) →`. Helper row below in mono: `Signs once · pays gas · mints L2`.

**Patterns to follow:**
- U2's form-label and viewer-well patterns
- Existing `useModelIndex` + base-picker logic — pure style change, no behavioral change

**Test scenarios:**
- Page renders header + base picker + variants section + launch button
- Base picker: active selection shows accent border (assert inline-style or computed border)
- Variant editor: rendering 3 variants shows 3 strips; clicking delete on the middle one drops it (existing behavior, assertion holds)
- Add variant: clicking the dashed-border button appends an empty variant row
- Launch button label: text matches `LAUNCH COLLECTION (N TOKENS)` template
- Existing PTB-build tests (`collectionTxBuilders.test.ts`) untouched — those test the chain layer, not UI

**Verification:**
- `pnpm typecheck`, `pnpm test` clean
- `pnpm dev`: visit `/launch`, pick a base, add 2 variants, see editorial strip layout, click LAUNCH (sign aborted is fine — chain layer unchanged)
- Definition-of-done per `polish-backlog.md` §8

**Estimated:** ~2 hours.

**Commit:** `feat(ux): /launch brutalist editorial polish (D-044)`

---

### U4. `/market` — Brutalist Market page (heaviest unit)

**Goal:** Replace the ad-hoc dark theme on the headline new feature with brutalist editorial. This is the highest polish yield per hour per phase-progress 2026-05-23 — the screen is currently the most prototype-looking AND the most-watched in the demo arc.

**Requirements:** `polish-backlog.md` §3 MUST (all 10 items, plus the status-emoji → mono-label table). NICE items: `YOURS` badge and hover-invert if budget allows.

**Dependencies:** U1.

**Files:**
- `frontend/src/market/MarketPage.tsx` — full restyle: page bg, card grid (editorial shared-borders), listing card layout, price formatting (two-line), status banner page-foot, "Your cars" section, empty states, drive-it link color
- `frontend/src/market/MarketPage.test.tsx` — update copy assertions on emoji status (`⚠️ Could not confirm` → mono `× CONFIRM FAILED`), price-line format, empty-state copy
- (potentially) `frontend/src/ux/StatusBanner.tsx` (new) — extract IF this is the third screen that needs the pattern; otherwise inline

**Approach:**
- Page style: replace `pageStyle` (`background: '#15171b'; color: '#ddd'; fontFamily: 'system-ui'`) with `{ background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-body)' }`. Single change reframes the page.
- Card style: replace `cardStyle` (dark bg, gray border, 8px radius) with `tokens.card` (paper-pure, 1.5px ink, 0 radius).
- Card grid: replace `flexWrap: 'wrap', gap: 12` with CSS grid where adjacent cards share borders. Editorial grid look — independent floating cards lose the "catalog" feeling. Use `display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'` on the outer container, then cells use `borderRight: 1.5px solid var(--ink); borderBottom: 1.5px solid var(--ink)` (collapses to single hairlines between cells). Outer container has top + left ink borders to close the frame.
- Listing card: viewer well (pure black) with wireframe + L2 badge + numbered `001/004` counter overlay; card body — italic-serif name (`--text-md`, weight 500), mono `BY 0x…` row, top-bordered (`borderTop: 1px solid var(--ink)`) price + Buy row.
- Price formatting: two-line. Top `0.10 SUI` (`--text-lg`, weight 500); bottom `+ 0.005 ROYALTY (5%)` (`--text-xs`, mono, all caps). Drop the long parenthetical `0.X SUI (asking) · 0.Y SUI (you pay, incl. 5% royalty)`.
- Status emojis → mono labels:
  - `⏳ Reading…` → `— SYNCING (FULLNODE)`
  - `✅ Confirmed` → `✓ CONFIRMED · <token> → YOUR WALLET · /track`
  - `⚠️ Could not confirm` → `× CONFIRM FAILED · <reason> · [REFRESH]`
- Status banner placement: page-foot. Pure black bg, white text, accent label. Inline-style or extract `StatusBanner` per KD3 (only if we're already at 3 sites — likely still inline at this point, defer extraction).
- Empty states: `Nothing for sale yet` and `You don't own any unlisted cars` restyled as centered mono uppercase paragraphs, optional dashed-border container.
- "Drive it on the track →" link color: replace `#7aa2ff` with `var(--ink)` underlined, accent on hover. Polish-backlog §3 calls out the rule: avoid two accent uses in the same paragraph.

**Patterns to follow:**
- `tokens.card`, `tokens.viewerWell`, `tokens.statusBanner` primitives from U1
- D-044 anti-pattern list (`design-tokens.md` §8) — verify ≤5 accent uses on the rendered page

**Test scenarios:**
- Page renders with paper background (not dark)
- Card grid uses grid display (assert inline `display: 'grid'` or computed style)
- Listing card has viewer well (assert child div has black background)
- Price formatting: two-line — top-line `SUI` amount in larger size, bottom-line mono `ROYALTY` label
- Status: `× CONFIRM FAILED` mono label appears when fullnode read-back fails (update line 192's existing ⚠️ assertion)
- Empty state ("Nothing for sale yet") renders mono uppercase copy
- Drive-it link: color is ink (not the old `#7aa2ff`)
- Existing buy + list integration tests (PTB build, refresh polling, StrictMode aliveRef behavior) continue to pass — only copy / style assertions change

**Verification:**
- `pnpm typecheck`, `pnpm test` clean — 345 frontend tests still green (baseline from phase-progress 2026-05-23)
- `pnpm dev`: visit `/market` with the testnet listings live (v7 IDs from phase-progress). Card grid renders editorial. List a car, buy a car (or witness existing live listings), watch the status banner cycle `SYNCING → CONFIRMED`.
- Count accent uses on a fully-loaded page — ≤5 (anti-pattern check).
- Definition-of-done per `polish-backlog.md` §8.

**Estimated:** ~3 hours.

**Commit:** `feat(ux): /market brutalist editorial polish (D-044)`

---

### U5. `/track` — Brutalist Track page

**Goal:** Restrain the chrome and let the Babylon canvas speak. `/track` is mostly 3D — chrome should recede. Add italic-serif overlays (countdown, result) and mono HUD elements (lap time, speedometer) without bordered boxes.

**Requirements:** `polish-backlog.md` §4 MUST. NICE items deferred (lineage badge + race-time HUD bar — bank for screencap motion mitigation if needed).

**Dependencies:** U1.

**Files:**
- `frontend/src/track/TrackPage.tsx` — page treatment (full-bleed black under TopNav), car carousel restyle, empty state, loading state
- `frontend/src/track/Countdown.tsx` — gigantic italic-serif numerals, white on transparent
- `frontend/src/track/ResultOverlay.tsx` — italic-serif headline + mono subtitle
- `frontend/src/track/carCarousel.tsx` — mini viewer well per car, mono SELECTED label on active
- `frontend/src/track/TrackPage.test.tsx`
- `frontend/src/track/Countdown.test.tsx`
- `frontend/src/track/ResultOverlay.test.tsx`

**Approach:**
- Page treatment: keep TopNav (it's editorial chrome), then full-bleed black canvas area. The canvas IS the well — no inner border, no card.
- Car carousel: each thumbnail in a 60×80 `tokens.viewerWell`. Italic-serif name below in white. Active car: mono `— SELECTED` label (white, letter-spacing 1.5px).
- Countdown overlay: italic-serif numerals at 120px (`--text-display` × 3). Centered, white on transparent. Sequence `3.` `2.` `1.` `GO.` — periods included for editorial detail (matches polish-backlog §4 verbatim).
- Result overlay: italic-serif headline (`Lap 1 · 38.5s`), mono uppercase subtitle (`PERSONAL BEST` or `+ 2.1s VS LAST`). Accent only if positive delta (≤5 accent rule still applies).
- HUD: top corners, mono uppercase, white-on-black, no borders / no boxes. Just text. Restraint.
- Loading state: full black canvas + centered mono `— LOADING TRACK · BABYLON + HAVOK · 12 MODULES`.
- Empty state (no owned cars): full-bleed black + italic-serif `Nothing to drive yet.` + mono `MINT A COLLECTION ON /LAUNCH OR BUY ONE ON /MARKET` (both linked).

**Patterns to follow:**
- Existing `lapState` / countdown lifecycle logic — no behavioral change
- U1's mono / italic-serif rules from tokens

**Test scenarios:**
- Countdown: at state `3`, renders large italic-serif `3.` (assert text content + font-family inline style); at `GO`, renders `GO.`
- ResultOverlay: positive delta (`+ 2.1s VS LAST`) → accent-colored delta; personal best → `PERSONAL BEST` mono subtitle
- Car carousel: active car renders `— SELECTED` mono label
- Empty state: when `useOwnedTokens` returns empty, renders italic-serif headline + mono CTA
- Loading state: mono uppercase placeholder text present during scene load
- Existing `racetrackScene.test.ts`, `lapState.test.ts`, `useOwnedTokens.test.ts`, `personalBest.test.ts` — untouched, no UI assertions

**Verification:**
- `pnpm typecheck`, `pnpm test` clean
- `pnpm dev`: visit `/track` with an owned car, watch countdown overlay, complete a lap, see result overlay
- Definition-of-done per `polish-backlog.md` §8

**Estimated:** ~2 hours.

**Commit:** `feat(ux): /track brutalist editorial polish (D-044)`

---

### U6. `/` — Brutalist Browse landing page

**Goal:** Apply brutalist to the landing page — the *only* place on the site that explains the product before the user clicks. Hero headline, three-layer pitch in body, editorial-grid catalog, three-CTA row for the demo arc.

**Requirements:** `polish-backlog.md` §5 MUST. NICE items (footer wordmark, hash anchors) bundled if budget allows.

**Dependencies:** U1, U4 (reuses editorial-grid pattern from /market).

**Files:**
- `frontend/src/browse/BrowsePage.tsx` — hero section, catalog grid, tag filter chips, three-CTA row
- `frontend/src/browse/ModelCard.tsx` — single viewer well + creator + license badge
- `frontend/src/browse/CollectionCard.tsx` — two stacked thumbnails + collection name + size (`12 OF 50 MINTED`)
- `frontend/src/browse/BrowsePage.test.tsx`
- `frontend/src/browse/CollectionCard.test.tsx`

**Approach:**
- Hero: italic-serif headline (`A model marketplace. On Sui. With composable IP.`), mono eyebrow (`— SUI OVERFLOW 2026 / WALRUS TRACK`), and a short paragraph naming the three layers (L1 publish · L2 mint · L3 access).
- Catalog grid: same editorial shared-border treatment from U4 (`display: grid`, adjacent borders collapse).
- Model vs Collection card: visual distinction so the L1/L2 difference reads. Models = single viewer well + creator + license badge. Collections = two stacked variant thumbnails + collection name + size.
- Tag filter chips: mono uppercase, 1.5px border, active = accent fill.
- Three-CTA row near page foot: `FOR CREATORS / FOR BUYERS / FOR DRIVERS` → `/create`, `/market`, `/track`. Each = black-well thumbnail + mono uppercase label + italic-serif tagline.

**Patterns to follow:**
- U4's editorial grid pattern (shared borders, adjacent cells)
- U1's mono / italic-serif typography rules

**Test scenarios:**
- Hero renders headline + eyebrow + three-layer paragraph
- Tag filter chips render mono uppercase, clicking toggles active state
- Three-CTA row renders three cards linking to `/create`, `/market`, `/track`
- ModelCard renders viewer well + creator + license badge
- CollectionCard renders two thumbnails + name + size string (`12 OF 50 MINTED` format)
- Existing data-fetching tests (`useModelIndex.test.ts`) untouched

**Verification:**
- `pnpm typecheck`, `pnpm test` clean
- `pnpm dev`: visit `/`, see hero, scroll catalog, click a CTA — lands on `/create`/`/market`/`/track`
- Definition-of-done per `polish-backlog.md` §8

**Estimated:** ~2 hours.

**Commit:** `feat(ux): / landing brutalist editorial polish (D-044)`

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Newsreader font CDN unavailable / slow | Low | Low | Fallback chain `'Newsreader', Georgia, serif` already in `tokens.ts`. Pre-connect link in `index.html`. Demo still readable in worst case. |
| R2 | MarketPage.test.tsx copy assertions break beyond the known line 192 | Low | Low | Pre-checked — only one ⚠️ banner assertion. Other tests assert PTB / refresh behavior, not copy. Update inline in U4 commit. |
| R3 | PreviewCanvas clearColor change breaks a test | None | — | Pre-verified — test mocks `clearColor = { set: () => {} }`, value-agnostic. |
| R4 | 19 ad-hoc dark-style usages across the codebase | Med | Low | Audited via grep; each per-screen unit (U2–U6) cleans its own. No central refactor needed. |
| R5 | TopNav routing edge case (account loads asynchronously, brief CONNECT flash on every page) | Med | Low | Delegate to existing `useSession` hook — already handles the loading→connected transition. If flash is jarring, add a `useEffect` debounce in U1's TopNav implementation. |
| R6 | NICE bundling overruns the per-unit hour budget | Med | Med | Cut NICE first when overrun. MUST is the must-ship line. |
| R7 | Accent count >5 on `/market` once `YOURS` badge + kiosk grouping NICE items land | Low | Low | Accent budget audit in U4 verification step. Defer NICE items if count blown. |
| R8 | Brutalist read as "unstyled" without typography confidence (D-044 ⚠️ consequence) | Low | High | U1 loads all three typefaces upfront. Visual check on `/` after U1 lands — if Newsreader doesn't appear in DevTools "Computed → font-family", debug before moving to U2. |
| R9 | Demo screencap reads as "still" (D-044 ⚠️ consequence) | Med | Med | NICE PreviewCanvas auto-rotation is the listed mitigation; deferred to post-U6 if screencap rehearsal reveals the problem. |
| R10 | Time pressure forces incomplete unit landings (half-styled screens) | Med | High | One commit per unit (KD6) — partial work either lands fully or stays on branch. No "I'll finish that tomorrow" mid-unit splits. |

---

## System-Wide Impact

- **Affected users**: 100% of users — the visual identity is global. No A/B, no flag.
- **Affected developers**: all frontend code that touches inline styles. After this plan: `tokens.ts` is the source of truth; new styles ad-hoc → reviewer pushback.
- **Affected tests**: ~5 test files have copy-level assertions to update (MarketPage, CreateModelPage, possibly Countdown, ResultOverlay, BrowsePage). Per-unit, inline.
- **CI**: no changes to test infrastructure or build pipeline. Vite picks up `index.html` link + `index.css` automatically. No new packages.
- **External services**: adds dependency on Google Fonts CDN at runtime. Documented in R1 mitigation.
- **Bundle size**: marginal — three `<link>` tags, no JS bloat. Tokens module is small (~2 KB).

---

## Verification (project-wide, after U6 lands)

1. `pnpm typecheck` + `pnpm test` + `pnpm build` all clean
2. `pnpm dev`: walk the demo arc `/ → /create → /launch → /market → /track`. Each screen passes its own `polish-backlog.md` §8 checklist:
   - Page bg `--paper` (or `--well` for /track)
   - No emoji anywhere
   - No `border-radius > 0`
   - Accent ≤5 instances per page (count them)
   - Only Newsreader / Inter / JetBrains Mono in the Computed → font-family DevTools panel
   - Loading + empty + error states exist and use the system
3. Cross-browser: Chrome + Safari render identical chrome (Babylon canvas excepted)
4. 30-second screencap of the demo arc, watched muted — visual identity coherent
5. Anti-pattern audit: cross-reference against `design-tokens.md` §8 — no gradients, no shadows, no rounded corners, no soft borders, no off-system tints
6. Update `docs/phase-progress.md` end-of-session — "U15 UX polish: D-044 rolled out across demo arc, X / Y / Z units committed."

---

## Out-of-band / Adjacent

- **`/dev/compare` 404 in production**: polish-backlog §6 calls this out. Lightweight check during U1 (we're already in App.tsx). If non-trivial, defer.
- **`pitch/` mockup re-render**: phase-progress 2026-05-23 noted the 4-vibe + hybrid mockups exist only in chat. Re-rendering for the pitch deck is a separate task; not in this plan.
- **Demo recording rehearsal**: after U6 lands, do one screencap pass on the demo arc to validate R8 + R9 hold. If not, motion mitigation + typography retune become Phase 5 tasks.

---

## References

- Origin: `docs/ux/design-tokens.md`, `docs/ux/polish-backlog.md`, `docs/decisions.md` D-044
- Phase progress: `docs/phase-progress.md` (2026-05-23 evening entry — U15 UX polish kickoff)
- CLAUDE.md commit conventions + decision-discipline heuristics
- Existing inline-style reference: `frontend/src/market/MarketPage.tsx` (current pattern that `tokens.ts` mirrors)
- Existing wallet read: `frontend/src/auth/useSession.tsx` (used by U1 TopNav)
