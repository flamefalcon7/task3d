---
title: "feat: S5 MTG-style actor cards for the Tusk3D landing page"
type: feat
status: completed
date: 2026-05-29
plan_number: 024
origin: docs/brainstorms/2026-05-29-s5-actor-cards-requirements.md
depth: standard
---

# feat: S5 MTG-Style Actor Cards (plan-024)

Origin requirements: `docs/brainstorms/2026-05-29-s5-actor-cards-requirements.md` (approved). All product decisions (KD-1…KD-7, the locked card-copy table, the 9 acceptance criteria) are settled in the origin and are **not re-litigated here** — this plan translates them into implementation units.

---

## Problem Frame

The landing page explains the *pipeline* (S4 LifecycleStrip) and offers *verb*-based entry (S6 KeycapRow) but never names the **four actors** of the composable creator economy. S5 adds a **4-card actor row** between S4 and S6 that casts modelCreator / nftCreator / buyer / gameDev as brutalist-editorial trading cards (MTG anatomy), giving visitors **role-based dispatch** ("I'm a game dev → `/integrate`") and producing individually screenshot-able marketing/deck assets.

Display-only, frontend-local, static presentational, D-044 brutalist, testnet, direct-to-trunk on `main`. This is the **last unshipped landing survivor**.

---

## Scope Boundaries

**In scope:** one new static component (`ActorCards`) + colocated CSS module + colocated test; mounting it on `LandingPage`; extending the landing doc-order test.

**Non-goals (from origin):** no live/on-chain data; no Access/Seal/Derivative vocabulary; not a replacement for S6; no glossy/holo/3D-flip effects (single CSS `:hover` tilt is the only motion); no accent rebalance (zero `#FF4500`); no new routes.

### Deferred to Follow-Up Work
- Wiring the cards into the pitch deck / Twitter assets (compound-asset reuse — same follow-up bucket as S4's KD-5).
- The stale `frontend/src/babylon/modePalette.ts:40` comment (non-existent "Move-contract MAX_VARIANTS (16)") — pre-existing, unrelated cleanup.

---

## Key Technical Decisions

### KD-A — Resolves OQ-1: provenance route is a clickable `<Link>`
The provenance line (`→ /create` etc.) renders as a react-router `<Link>` (the app already uses `react-router-dom`, see S6 `KeycapRow.tsx`). This makes role-based dispatch *real* rather than decorative. It does not confuse with S6: S6 keycaps are large verb buttons (primary dispatch); the card provenance is a small mono footer line scoped to a named role. Both can coexist pointing at the same routes — that is the intended "two mental frames, same destinations" design (origin Summary).

### KD-B — Resolves OQ-2: gameDev downstream device = mono kicker + `.downstream` class
The gameDev card carries (a) a small mono kicker line above its name — e.g. `↳ CONSUMES OUTPUT` — signaling it sits downstream of the create→launch→browse chain, and (b) a `.downstream` CSS class + `data-downstream="true"` attribute for a subtle visual offset/treatment. AC-7 only requires the distinction be *detectable*; the attribute makes it testable, the kicker makes it legible. Exact pixel treatment (offset amount, kicker styling) is implementation taste within this approach. The kicker text must avoid forbidden vocab (KD-1) — "consumes output" is clean.

### KD-C — Layout: 4-col grid → 2×2 at 767px (overflow-safe, inherited)
Mirror the **proven** `LifecycleStrip.module.css` / `KeycapRow.module.css` pattern: `grid-template-columns: repeat(4, 1fr)` collapsing to `1fr 1fr` at `max-width: 767px`, gap 0, 1.5px solid `#000` borders managed per-cell. This pattern does **not** horizontally overflow (the S7 375px bug was TelemetryStrip's inner *flex row* at `scrollWidth 804px`, not the grid) — so AC-8 is satisfied by construction, and the test still guards it.

### KD-D — Hover tilt must be layout-neutral and overflow-safe
The only motion is a CSS `:hover` `transform: rotate(...)` (no JS, no state). `transform` does not affect box model (like KeycapRow's `box-shadow` hover trick → no neighbor shift). Keep the angle small (≤ ~2°) so rotated corners of edge cards do not poke past the viewport and trigger a horizontal scrollbar. Respect `prefers-reduced-motion` is unnecessary for a transform-only hover with no transition, but a `transition` (if added for smoothness) must be gated behind `@media (prefers-reduced-motion: no-preference)`.

### KD-E — No ADR (confirms OQ-3)
Conventional static UI, no new pattern, no new dependency, no public-contract change. Per CLAUDE.md decision-discipline table this is "reversible in 30 min / routine" — no D-073 needed. (D-073 remains unallocated.)

---

## High-Level Technical Design

Single static component, data-driven from a frozen `ACTORS` array (mirrors `LifecycleStrip`'s `PANELS` and `KeycapRow`'s `KEYCAPS`). *Directional guidance for review, not implementation specification:*

```
ACTORS: readonly Actor[] = [
  { key:'modelCreator', name:'modelCreator', cost:'SUI gas + Tripo fee',
    ability:'Publishes a base model to Walrus and sets its license terms.',
    flavor:'Every tusk begins as a sentence.', route:'/create' },
  { key:'nftCreator', ... route:'/launch' },
  { key:'buyer', ... route:'/browse' },          // ability asserts OWNS a token
  { key:'gameDev', ..., route:'/integrate', downstream:true },  // kicker + .downstream
]

<section data-testid="actor-cards">
  <ol class=grid>
    {ACTORS.map(a =>
      <li class={a.downstream ? `${card} ${downstream}` : card}
          data-testid={`actor-card-${a.key}`} data-downstream={a.downstream || undefined}>
        {a.downstream && <span class=kicker>↳ CONSUMES OUTPUT</span>}
        <span class=name>{a.name}</span>        // Newsreader italic
        <span class=cost>{a.cost}</span>        // JetBrains Mono
        <p   class=ability>{a.ability}</p>      // body sans
        <span class=flavor>{a.flavor}</span>    // Newsreader italic
        <Link class=provenance to={a.route}>→ {a.route}</Link>  // mono, clickable
      </li>)}
  </ol>
</section>
```

Card copy is **verbatim from the origin Card Content table** (KD-1/KD-2 honest semantics). No `#FF4500` anywhere (KD-6).

---

## Implementation Units

### U1. ActorCards component + CSS module + colocated tests

**Goal:** Build the static 4-card actor row with full MTG anatomy, gameDev downstream distinction, clickable provenance, zero accent, and the overflow-safe responsive grid — fully covered by colocated tests.

**Requirements:** Origin KD-1…KD-7; AC-1 (count+order, the component half), AC-2 (5-part anatomy), AC-3 (routes verbatim + forbidden-vocab guard), AC-4 (ownership/integration wording), AC-5 (zero accent), AC-6 (static, no canvas), AC-7 (gameDev downstream detectable), AC-8 (375px no overflow). Plan KD-A…KD-D.

**Dependencies:** none.

**Files:**
- `frontend/src/landing/ActorCards.tsx` (create)
- `frontend/src/landing/ActorCards.module.css` (create)
- `frontend/src/landing/ActorCards.test.tsx` (create)

**Approach:**
- Static presentational, `import { type JSX } from 'react'`; no Babylon/canvas/fetch/`useState`/`useEffect`. Frozen `ACTORS` array; `.map` over it.
- Provenance = react-router `<Link to={route}>` (KD-A) — component must render inside a router in tests (wrap with `<MemoryRouter>` in the test, as the other landing tests do where they use `<Link>`; verify the existing convention).
- gameDev card: `.downstream` class + `data-downstream` attr + mono kicker (KD-B).
- CSS mirrors `LifecycleStrip.module.css`: 4-col grid → 2×2 at 767px (KD-C); 1.5px `#000` borders, 0 radius; Newsreader italic for `.name`/`.flavor`, JetBrains Mono for `.cost`/`.provenance`/`.kicker`, body sans for `.ability`. Card-stock feel: paper `#F5F5F0` bg, solid ink border. `:hover` `transform: rotate` tilt (KD-D), layout-neutral, small angle. `:focus-visible` ring on the `<Link>` (mirror KeycapRow's explicit outline since black borders swallow the default ring).
- Card copy **verbatim** from origin Card Content table.

**Patterns to follow:** `frontend/src/landing/LifecycleStrip.tsx` + `.module.css` (data-array + grid + 767px breakpoint + zero-accent), `frontend/src/landing/KeycapRow.tsx` (Link usage, `:hover` layout-neutrality, `:focus-visible` ring), `frontend/src/landing/LifecycleStrip.test.tsx` (forbidden-vocab word-boundary assertion, `within(strip).getAllByRole('listitem')`, no-canvas + no-`ff4500` assertions).

**Test scenarios** (`ActorCards.test.tsx`):
- *Covers AC-1.* Renders exactly **4** cards in order modelCreator / nftCreator / buyer / gameDev (assert via `getAllByRole('listitem')` order + per-card testid).
- *Covers AC-2.* Each card surfaces all five parts: name, cost, ability, flavor text, and a provenance link — assert each card's subtree contains non-empty text for each and a `<Link>`/anchor.
- *Covers AC-3 (load-bearing).* The four provenance routes appear verbatim — assert a link/anchor with `href` (or `to`) `/create`, `/launch`, `/browse`, `/integrate`. AND forbidden vocab absent: `expect(text).not.toMatch(/\baccess\b/i)`, `/\bseal\b/i`, `/\bderivative\b/i` (word-boundary, mirroring S4).
- *Covers AC-4.* buyer card text matches ownership language (`/\bowns?\b/i` or `/\btoken\b/i`) and NOT access; gameDev card text matches integration-registration language (`/\bregisters?\b|integration/i`).
- *Covers AC-5.* `container.innerHTML.toLowerCase()` contains no `ff4500`; no `keycap-accent-dot`-style accent element present.
- *Covers AC-6.* `container.querySelector('canvas')` is null; component renders without any fetch/state (no async act warnings) — static.
- *Covers AC-7.* gameDev card has the downstream marker — assert `data-downstream="true"` (or the `.downstream` class) present on the gameDev card and absent on the other three; assert the kicker text renders on gameDev only.
- *Covers AC-8 (regression guard).* At a narrow width the layout uses the 2×2 grid and does not overflow — assert the grid container does not set a fixed width forcing overflow (pragmatic JSDOM-level guard: the `.grid` has no inline width and uses the module's grid class; the true pixel check is the browser-verify step). Document that the definitive 375px no-horizontal-scroll check is the agent-browser verification, not JSDOM.

**Verification:** `node_modules/.bin/vitest` green for the new file; `node_modules/.bin/tsc -b` shows no new errors over the 32-error baseline; component renders the 4 cards with correct copy.

---

### U2. Mount ActorCards on LandingPage + extend doc-order test

**Goal:** Place `<ActorCards />` between `<LifecycleStrip />` and `<KeycapRow />`, and extend the landing doc-order test to lock the full sequence.

**Requirements:** AC-1 (mount position), AC-9 (doc-order).

**Dependencies:** U1.

**Files:**
- `frontend/src/landing/LandingPage.tsx` (modify — insert `<ActorCards />` after `<LifecycleStrip />`, before `<KeycapRow />`)
- `frontend/src/landing/LandingPage.test.tsx` (modify — `vi.mock('./ActorCards')` like the sibling mocks; extend the doc-order chain to Masthead → TelemetryStrip → LedeHero → LifecycleStrip → **ActorCards** → KeycapRow)

**Approach:** Mirror exactly how S4's `<LifecycleStrip />` was mounted and mocked (origin AC-9). Keep the `vi.mock` stub shape consistent with the other landing-component mocks already in the test.

**Patterns to follow:** the `LifecycleStrip` insertion + `vi.mock('./LifecycleStrip')` + doc-order assertion already present in `frontend/src/landing/LandingPage.tsx` and `LandingPage.test.tsx`.

**Test scenarios** (`LandingPage.test.tsx`):
- *Covers AC-9.* Doc-order assertion extended: the six landing sections render in order Masthead → TelemetryStrip → LedeHero → LifecycleStrip → ActorCards → KeycapRow (by testid index comparison, matching the existing chain technique).
- *Covers AC-1.* `<ActorCards />` is present in the rendered `LandingPage` (mock invoked once).

**Verification:** full `node_modules/.bin/vitest` suite green (≈720 baseline + new tests); `tsc -b` no new errors; browser-verify at `/` (see below).

---

## Verification Strategy

- **Unit:** `node_modules/.bin/vitest` — all new + existing tests green (baseline ~720 pass).
- **Types:** `node_modules/.bin/tsc -b` — exactly 32 pre-existing errors, no new ones.
- **Browser (required, per CLAUDE.md frontend protocol):** with `pnpm --dir frontend dev` on `:5173`, drive `agent-browser` at `/`:
  - Assert the 4 cards render between LifecycleStrip and KeycapRow, each with all five parts and correct verbatim copy.
  - Assert gameDev card is visually distinguished (kicker visible).
  - Set viewport 375×812 → confirm 2×2 stack with **no horizontal scrollbar** (the definitive AC-8 check; `document.documentElement.scrollWidth <= clientWidth`).
  - Hover a card → confirm subtle tilt, no neighbor shift, no overflow.
  - Screenshot for the user's taste check (also the marketing/deck compound-asset preview).

---

## Requirements Traceability

| Origin AC | Unit | Test scenario |
|---|---|---|
| AC-1 (4 cards, order, mount pos) | U1, U2 | U1 count/order; U2 mount present |
| AC-2 (5-part anatomy) | U1 | five-parts-per-card |
| AC-3 (routes verbatim + no forbidden vocab) | U1 | routes + word-boundary guard |
| AC-4 (ownership/integration wording) | U1 | buyer-owns / gameDev-registers |
| AC-5 (zero accent) | U1 | no `ff4500` |
| AC-6 (static, no canvas) | U1 | no-canvas / no-state |
| AC-7 (gameDev downstream detectable) | U1 | `data-downstream` + kicker |
| AC-8 (375px no overflow) | U1 (JSDOM guard) + browser-verify (definitive) | grid pattern + scrollWidth |
| AC-9 (doc-order) | U2 | extended doc-order chain |

---

## Deferred to Implementation

- Exact `:hover` tilt angle and whether to add a `prefers-reduced-motion`-gated transition (KD-D bounds it; pick during impl).
- Exact gameDev kicker styling / offset magnitude (KD-B; AC-7 only needs detectability).
- Whether `LandingPage.test.tsx` already wraps in a router that satisfies `<Link>`; if not, confirm `ActorCards.test.tsx` wraps with `<MemoryRouter>` (resolve by reading the existing test at impl start).

---

## Review

Frontend-touching → default 5-reviewer roster per CLAUDE.md: `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`, `ce-julik-frontend-races-reviewer`. Run report-only (direct-to-trunk, fixes applied manually).
