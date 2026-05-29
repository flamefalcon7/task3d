# S5 MTG-Style Actor Cards (modelCreator / nftCreator / buyer / gameDev) — Requirements

**Date**: 2026-05-29
**Status**: Approved (synthesis confirmed by user)
**Predecessor**: `docs/ideation/2026-05-28-tusk3d-landing-page-ideation.md` §S5 ("MTG-style actor cards", confidence 65%, complexity Medium, "mental model & workflow explainer" axis)
**Adjacent**: D-044 (brutalist editorial tokens), plan-019 (S1 LedeHero — shipped), plan-021 (S2 TelemetryStrip — shipped), plan-023 (S4 LifecycleStrip — shipped), plan-020 (S6 KeycapRow — shipped), plan-022 (S7 Masthead — shipped). S5 is the **last unshipped landing survivor**; S3 (topology mark) remains deferred.
**Architecture source of truth**: `docs/spec.md` §1.7/§2.8 ADR chain D-029 → D-031 → D-032 → D-035/036 → D-040, and `contracts/model3d/sources/model3d.move`. **The ideation doc's actor model (lines 41–46) is STALE and must not be copied verbatim** — see KD-1.

---

## Summary

S5 is a **4-card actor row** mounted on `LandingPage.tsx` **between `<LifecycleStrip />` (S4) and `<KeycapRow />` (S6)** (per ideation layout diagram line 312). It answers "who is this *for*, and what do they each do?" by casting the four Tusk3D actors as brutalist-editorial trading cards — Magic: The Gathering anatomy (name / cost / ability / flavor / provenance) rendered as matte card-stock, not glossy.

Where S4 explains the *pipeline* (PROMPT → MODEL → VARIANT → IN-GAME) and S6 offers *verb*-based dispatch (CARVE / RIFF / BROWSE / INTEGRATE), S5 offers **role-based dispatch**: a visitor who self-identifies as "I'm a game dev" finds their card and its `→ /integrate` provenance line. The three frames are complementary, not redundant.

It is chosen partly as a **compound asset** (like S4): each card is designed to **screenshot well individually** for Twitter/marketing reuse, so the same source feeds social posts and the pitch deck's "who it's for" slide.

Visual register: D-044 brutalist editorial — black-on-`#F5F5F0` paper, 1.5px borders, 0 radius, Newsreader italic for actor names + flavor, JetBrains Mono for cost + provenance, **zero `#FF4500` accent** (site budget is 5/5 full; KD-6).

---

## Problem

The landing page teaches the *product mechanic* (S4) and offers *action* entry points (S6), but never names the **people**. A composable creator economy only makes sense once you see that distinct actors play distinct roles and that one actor's output is another's input. Crypto-native visitors in particular read "who pays / who owns / who earns royalties" as the real signal that an economy exists. Without an actor frame, the royalty/ownership story stays abstract.

---

## Goals

- Name the four actors and make each one's **role, cost, and entry route** legible at a glance.
- Reinforce the composable-economy thesis: the cards visibly form a **production chain** (create → launch → browse) with gameDev as the **downstream consumer**.
- Produce **individually screenshot-able** cards for marketing/deck reuse (compounding).
- Stay strictly **honest to shipped v1** — no Access/Seal/Derivative vocabulary anywhere.

---

## Key Decisions

### KD-1 — Actor semantics corrected to shipped v1 (load-bearing)
The ideation actor model (lines 41–46: "buyer pays for Access NFT, soulbound" / "gameDev reads Access on-chain") is the **dead pre-D-029 framing** and must NOT be reproduced. Corrected, verified against `model3d.move`:
- **modelCreator** → publishes a base `Model3D` to Walrus + sets `LicenseTerms`. (L1)
- **nftCreator** → forks a base into a **variant collection** via `launch_collection` (pays the pay-to-derive fee; earns the creator side). (L2 publish side)
- **buyer** → **buys and OWNS** an `NftToken` via `mint_nft_token` — ownership, not access. Pays listing price + 5% primary-sale royalty (`AMOUNT_BP_DEFAULT` 500 bps). (L2 buy side)
- **gameDev** → **registers an integration** via `register_integration` (pays registration fee) to use collections as in-game objects. (L3)
- **Forbidden vocabulary on the card surface**: `Access`, `Seal`, `Derivative` (all v1.1 / unshipped). Enforced by test, mirroring S4's word-boundary guard. ("license"/"LicenseTerms", "variant", "fork", "royalty" are all shipped v1 and allowed.)

### KD-2 — Cost line = honest *qualitative* costs, no hardcoded SUI numbers
Each card's MTG "mana cost" slot states what the actor pays in words, not digits — exact SUI amounts aren't finalized and would go stale / invite a judge gotcha. Locked copy in the Card Content table below.

### KD-3 — gameDev card visually distinguished as downstream
The first three cards (create → launch → browse) read as a left-to-right **production chain**; the gameDev card is set apart with a subtle visual treatment (e.g. a connector/offset/"downstream" marker — exact device is a plan/design detail) signaling it **consumes the chain's output** rather than being a parallel fourth peer. This honestly reflects that gameDev is downstream of L1/L2/L3 (the asymmetry ideation flagged at line 212), while keeping a four-card row.

### KD-4 — Full MTG anatomy (five-part card)
Each card commits to real information density: **actor name** (Newsreader italic) · **cost** (mono) · **ability** (one concrete sentence, body sans) · **flavor** (one-line italic role poem) · **provenance** (mono route, `→ /create` etc.). No collapse into icon-with-label.

### KD-5 — Provenance = role-based dispatch, 1:1 with S6 verbs
Each provenance line is a real `react-router` route (verified in `frontend/src/App.tsx`) and maps to the S6 KeycapRow verb for the same actor:

| Actor | Provenance | S6 verb |
|---|---|---|
| modelCreator | `→ /create` | CARVE |
| nftCreator | `→ /launch` | RIFF |
| buyer | `→ /browse` | BROWSE |
| gameDev | `→ /integrate` | INTEGRATE |

Whether the provenance line is itself a clickable `<Link>` or static text is a plan-time call (lean: clickable, to make the role-dispatch real — but must not duplicate S6's job confusingly). 

### KD-6 — Zero `#FF4500` accent
Site accent budget is 5/5 full (S2 `●LIVE` dot + S6 BROWSE keycap among them). S5 ships **zero-accent**, same as S4. Asserted by test.

### KD-7 — Mirror shipped landing component convention
`frontend/src/landing/ActorCards.tsx` (or similar) + colocated `.module.css` + `.test.tsx`. Static presentational: `import { type JSX }`, no Babylon/canvas/fetch/state. The only motion concession is a CSS `:hover` tilt (`transform`), no JS. Pattern source: `KeycapRow.tsx` / `LifecycleStrip.tsx`.

---

## Card Content (locked copy — honest to shipped v1)

> Ability/flavor wording is directional and may be lightly tuned at implementation; the **cost**, **provenance**, and **forbidden-vocabulary** constraints are fixed.

| # | Actor (name) | Cost (mono) | Ability (one sentence) | Flavor (italic) | Provenance |
|---|---|---|---|---|---|
| 1 | **modelCreator** | `SUI gas + Tripo fee` | Publishes a base model to Walrus and sets its license terms. | *Every tusk begins as a sentence.* | `→ /create` |
| 2 | **nftCreator** | `pay-to-derive + gas` | Forks a base into a variant collection — one signature launches the whole palette. | *Riff on what already exists.* | `→ /launch` |
| 3 | **buyer** | `listing price + 5% royalty` | Buys and owns an on-chain token — the variant is yours, not rented. | *Own the object, not a license.* | `→ /browse` |
| 4 | **gameDev** *(downstream)* | `registration fee + gas` | Registers an integration to drop Tusk3D collections into any game. | *Where the carving ends up.* | `→ /integrate` |

Note: card 2's flavor deliberately rhymes with S4's "Sixteen forks" tagline; "sixteen" stays flavor-only (it is the frontend `MAX_VARIANTS`, not a contract cap — pre-existing, see `docs/phase-progress.md`).

---

## Non-Goals

- **No live data / no on-chain reads.** Cards are static; costs are qualitative copy, not fetched.
- **No Access/Seal/Derivative surfacing** (v1.1/unshipped — KD-1).
- **Not a replacement for S6.** S6 stays the primary verb-dispatch row; S5 adds the role frame.
- **No glossy/holo/3D-flip card effects.** Brutalist matte card-stock only; single `:hover` tilt is the lone motion.
- **No accent rebalance.** S5 does not spend or move the `#FF4500` budget.
- **No new routes.** Provenance points only at routes that already exist in `App.tsx`.

---

## Acceptance Criteria

- **AC-1** — `ActorCards` renders **4 cards** in order modelCreator / nftCreator / buyer / gameDev, mounted between `<LifecycleStrip />` and `<KeycapRow />` on `LandingPage`.
- **AC-2** — Each card surfaces all five MTG parts: name, cost, ability, flavor, provenance route (KD-4).
- **AC-3** *(load-bearing)* — The four provenance routes appear verbatim (`/create`, `/launch`, `/browse`, `/integrate`) **and** the forbidden vocabulary (`Access`, `Seal`, `Derivative`) appears **nowhere** in the rendered card surface (word-boundary assertion, mirroring S4).
- **AC-4** — The buyer card asserts **ownership** language (owns / token), not access; the gameDev card asserts **integration registration**, not "reads access".
- **AC-5** — **Zero `#FF4500`** in the component DOM (KD-6).
- **AC-6** — Component is **static**: no `<canvas>`, no Babylon import, no fetch, no `useState`/`useEffect` in the strip (assert no canvas; the hover tilt is pure CSS).
- **AC-7** — gameDev card is visually distinguished as downstream (KD-3) — assert via the distinguishing testid/class the plan chooses.
- **AC-8** — **375px mobile**: 4 cards stack/scroll without horizontal page overflow (regression guard — S7 had a 375px overflow bug).
- **AC-9** — `LandingPage.test.tsx` doc-order extended to Masthead → TelemetryStrip → LedeHero → LifecycleStrip → **ActorCards** → KeycapRow.

---

## Dependencies / Assumptions

- D-044 tokens in `frontend/src/ux/tokens.ts` (paper `#F5F5F0`, ink `#000`, 1.5px borders, 0 radius, Newsreader italic, JetBrains Mono).
- Routes `/create`, `/launch`, `/browse`, `/integrate` exist (verified in `frontend/src/App.tsx`).
- Shipped contract semantics per `model3d.move` (D-029 ownership model, `register_integration`, 5% `AMOUNT_BP_DEFAULT`).
- Direct-to-trunk on `main` (no remote). vitest baseline ~720; tsc baseline 32 pre-existing errors.
- Frontend-touching → default 5-reviewer roster at review time (ce-correctness, ce-testing, ce-api-contract, ce-adversarial, ce-julik-frontend-races).

---

## Open Questions

- **OQ-1** (plan-time) — Is the provenance line a clickable `<Link>` or static text? Lean clickable (makes role-dispatch real); plan decides, must not confuse with S6.
- **OQ-2** (design-time) — Exact visual device for gameDev's downstream distinction (connector line / offset / label). Plan/implementation call; AC-7 only requires it be detectable.
- **OQ-3** (deferred) — Whether any ADR (D-073+) is warranted. Likely none — this is conventional static UI with no new pattern (S7's build-time injection was the exception). Plan confirms.
