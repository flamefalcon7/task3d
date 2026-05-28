---
date: 2026-05-28
topic: tusk3d-landing-page
focus: redesign `/` as dedicated marketing landing for Tusk3D — eye-catching, name-aligned, explains usage, builds mental model
mode: repo-grounded
---

# Ideation: Tusk3D Landing Page

Run id: 342dd4d1 · 48 raw candidates → 7 survivors across 5 axes.

## Grounding Context

### Subject

Redesign the `/` route as a dedicated marketing landing page for **Tusk3D** (D-068), a Sui-native composable creator economy for low-poly 3D game assets. Submission deadline 2026-06-21 (Sui Overflow 2026, Walrus track).

### Locked Constraints

- **Brand = Tusk3D** (D-068 — capital T, "3D" disambiguator required to avoid Tusk YC W24 collision + walrus-ivory ethical framing risk). Working tagline: **"Carve. Mint. Riff."**
- **Aesthetic = D-044 brutalist editorial** — locked. Off-white `#F5F5F0`, pure black ink, single `#FF4500` accent (≤5 instances/page); Newsreader italic-serif display + Inter body + JetBrains Mono utility; 1.5px black borders, 0px radius, no gradients/shadows/glow; 3D models render in pure-black wells.
- **Route split** — `/` becomes marketing landing; existing marketplace (current BrowsePage catalog) moves to new `/browse` route. Move BrowsePage component, update App.tsx route. `/market` route stays as transactional buy page (separate function from catalog discovery).
- **Hackathon judging context** — Walrus track, judges watch screencap not live demo; technical implementation ~34% of score; working-product proof outranks pitch.
- **Editorial terminology** — D-044 broadsheet language. The page top is the **lede**, not "hero". Bottom CTA row is the **dispatch row** (or colophon row). "Hero" is SaaS vocabulary, not editorial.

### D-044 Token Specifics

From `docs/ux/design-tokens.md` + `frontend/src/ux/tokens.ts`:

- Color: `#F5F5F0` page, `#FFFFFF` surfaces, `#000000` ink + 3D wells, `#FF4500` accent (≤5 instances/page).
- Type: Newsreader italic-serif display, Inter sans body, JetBrains Mono for chain data.
- Layout: 1.5px black borders, 0px radius, grid-based, sparse whitespace, no gradients/shadows/glow.
- Anti-patterns: loud bright accent (collapses to "loud" if >5/page); screencaps feel still without subtle 3D rotation or accent flicker.

### Product Thesis (Three-Tier Composable Creator Economy)

- **L1 Collection** — modelCreator publishes shared Walrus quilt + LicenseTerms
- **L2 NftCollection + NftToken** — nftCreator forks base into colored variants in 3 wallet signatures (D-029 reversed D-013 — L2 SHIPPED, not deferred; the `NftToken` struct + `TransferPolicy<NftToken>` + `mint_nft_token` entry are in `contracts/model3d/sources/model3d.move`)
- **L3 Access** — buyer holds soulbound receipt; usable in games (key only, no store)

### Actors (4-way Mental Model)

1. **modelCreator** — publishes base mesh + license
2. **nftCreator** — forks base, designs variant palette, one-signature launch
3. **buyer** — pays for Access NFT, soulbound
4. **gameDev** — integrates the asset; reads Access on-chain

### Product Mental Model (4-Stage Lifecycle)

Higher-level than L1/L2/L3 contract architecture; this is the visitor-facing narrative:

```
prompt → model → variant → in-game obj
   ↓        ↓         ↓          ↓
(Tripo)    (L1)     (L2)       (L3 Access used in any game)
```

This 4-stage lifecycle is the page's "how it works" story. L1/L2/L3 labels appear as mono sub-captions per stage for crypto-savvy readers, but the headline is the lifecycle.

### Demo Arc Routes

`/create` (publish), `/launch` (fork variants), `/market` (buy transaction), `/track` (existing car-racing demo — NOT canonical Tusk3D content, just one example surface), `/collection/:slug` (variant browser), `/browse` (new — catalog moves here), `/integrate` (gameDev SDK).

### Visual Signature — Model ↔ Mesh Gradient

A unifying visual motif that recurs across multiple page elements: every Tusk3D 3D rendering shows itself as a gradient between *shaded surface* (the rendered form) and *wireframe mesh* (the underlying topology). A gradient line sweeps across the model surface revealing its mesh structure. This is the visual instantiation of the "Carve" verb — making the geometry visible — and ties D-044's line-drawing tradition to the product's core operation.

Applied to: S1 lede tusk render, S3 identity mark (the mesh side, frozen as line drawing), S4 panel 2 (the gradient demonstration moment in the lifecycle strip).

### Canonical Example Asset

The visual example throughout the page is a **Tusk model** (Tripo-generated low-poly mammoth tusk) with 4-8 color/finish variants. The page demonstrates Tusk3D's pipeline on itself — eating own dogfood. Car/racing scene from existing `/track` route is NOT the canonical landing example; it's referenced only as "other content the system supports."

### External Prior Art (from Phase 1 web research)

- **Walrus track competition** is visually undifferentiated (2025 winners all used Devfolio-style static pages) — open opportunity gap.
- **Brutalist editorial 2026 trend** aligns with D-044 (zero radius, mono+neo-serif, acid accent).
- **Strong patterns**:
  - Joy Division *Unknown Pleasures* (Peter Saville, 1979) — data-as-cover-art structural reference for identity mark.
  - Departure Mono — product renders itself (the font's specimen page uses its own typeface as hero).
  - Sketchfab — in-page 3D viewer IS the pitch.
  - Magic: The Gathering card layout (Richard Garfield, 1993) — ability/cost/flavor/provenance structure for actor framing.
  - Evil Martians 100-devtool landing study — problem-oriented narrative outperforms feature lists; "how it works" block is highest-value when mechanic is non-obvious.
  - Stripe Connect — two-track hero (Platform / User) converging on how-it-works diagram.
- **Strong anti-patterns to avoid**:
  - Meshy-style SaaS-clean white aesthetic.
  - Linear-style dark+gradient+blur (now table stakes, not differentiating).
  - Side-by-side hero (generic SaaS feel).
  - Feature enumeration without pain-tie.

### Past Learnings

None. `docs/solutions/` corpus (25 entries) is 100% engineering-track — no UX / landing / IA / brutalist editorial decisions documented. This is the first such effort to capture; after ship, `/ce-compound` candidate for `design_pattern` or `convention` entry.

## Topic Axes

1. **Lede / first impression** — above-the-fold layout, primary visual, headline copy, 3-second "what is this"
2. **Name & metaphor identity** — how "Tusk3D" surfaces (typography, motif, tagline integration, brand voice)
3. **Mental model & workflow explainer** — the "how it works" block; prompt → model → variant → in-game obj
4. **Working-product proof** — live demo embed, video, in-page 3D, on-chain ticker, screen capture
5. **Dispatch & catalog handoff** — dispatch row keycaps, demo-arc routing, pointing at the moved `/browse` without rendering the catalog

## Ranked Ideas

### 1. Live Babylon tusk render with model↔mesh gradient as the lede

**Description:** The page lede is a `<canvas>` rendering a Tripo-generated low-poly tusk in a pure-black well. The tusk slowly rotates; a gradient line sweeps left-to-right across its surface every ~6 seconds, revealing the wireframe mesh on one side and the shaded form on the other. The gradient is the visualized "Carve" verb. Below the well, JetBrains Mono caption: `// L1 Collection #001 · prompt: "a low-poly mammoth tusk" · live from Walrus · bafy…3kQ`. After ~15 seconds of unattended dwell, a thin black-bordered strip slides up from below with an orange-accented link: "fork your own →" pointing to `/launch`. The model itself — the live tusk rendering — IS the screencap a judge will take, so the lede self-documents without copy.

**Axis:** working-product proof (also serves lede)

**Basis:** `direct:` grounding states "Hackathon judging: working-product proof outranks pitch; judges watch screencap not live demo." `external:` Sketchfab embedded viewer IS the pitch + Departure Mono self-render pattern.

**Rationale:** Solves three user requirements at once — eye-catching (motion + gradient), explains usage (Carve is visualized), demonstrates working product (live Babylon + live Walrus fetch + live Sui chain read). Tusk is the canonical example because the brand IS Tusk3D — eating own dogfood is the strongest possible Walrus-track signal. Differentiates immediately from 2025 Walrus-track winners which all used Devfolio-style static screenshots.

**Downsides:** Heaviest item on the page (Babylon bundle + Havok + Walrus fetch). Must screencap well even when motion stops; needs perf budgeting for mobile (probably MP4 fallback below a breakpoint). Failure mode if the Babylon scene crashes silently — page reads as broken. Tripo tusk model must be high-enough quality to merit being the brand face, low-enough poly to load fast.

**Confidence:** 70%

**Complexity:** High

**Status:** Unexplored

---

### 2. Live "AS OF" telemetry strip

**Description:** A horizontal monospace strip directly under the masthead: `AS OF 2026-06-15 14:22 PT · ●live · L1 COLLECTIONS 47 · L2 NFTS MINTED 312 · WALRUS BLOBS 89 · LATEST CID bafy…3kQ ↗`. Queries `SuiGrpcClient` + cached Walrus index on page load. The single `#FF4500` accent budget is spent on the `●live` indicator. Compounds: embeds verbatim into README, into pitch-deck slide (screenshot with timestamp = real testnet activity proof), into Twitter posts, into the `/integrate` SDK page as a credibility anchor. Survives 6/21→7/8 shortlist window because it keeps ticking.

**Axis:** working-product proof

**Basis:** `direct:` reuses existing `SuiGrpcClient` + Walrus read-path code that backs `/market` and `/track` (~20 lines). `external:` Stripe's "$X processed" widget, Etherscan homepage stats — live numbers > screenshots.

**Rationale:** Cheapest credibility-per-pixel on the page. Judges skimming for "is this deployed?" get the answer in 2 seconds. Most submissions are static snapshots; a ticking strip says "this is a working system, not a deck." Same strip pattern later embeds in blog posts via iframe.

**Downsides:** Stale-or-empty risk on bad days — if testnet activity dries up between 6/21 and 7/8, the strip becomes anti-proof. Needs cache + last-known-good fallback. RPC rate limits must be respected.

**Confidence:** 88%

**Complexity:** Low–Medium

**Status:** Unexplored

---

### 3. Topology-of-real-tusk identity mark

**Description:** The page's identity mark — appearing in the masthead and as a recurring motif — is a stark black-on-cream wireframe-line-drawing of a real Tusk3D-minted tusk model, fetched live from Walrus on page load. Refresh the page → different tusk variant, same typographic frame. Joy Division *Unknown Pleasures* sleeve as the structural reference: data-as-cover-art. Pairs with the wordmark `Tusk3D` set in Newsreader italic. The mark IS the mesh side of the model↔mesh gradient that the lede uses dynamically — same visual language, different layer.

**Axis:** name & metaphor identity

**Basis:** `external:` Peter Saville / Joy Division *Unknown Pleasures* (1979) and Departure Mono's self-render pattern — the brand's specimen page renders itself in its own product.

**Rationale:** Strongest possible Walrus-track signal: the brand mark literally cannot render unless the Walrus protocol works. Collapses identity + proof + aesthetic into one element. "Visualize the Tusk3D name" without ever depicting a literal tusk-as-illustration — the wireframe IS the visual.

**Downsides:** If Walrus fetch is slow or fails, the mark is absent on first paint — needs a sensible skeleton state (black well with mono caption `FETCHING bafy…`) that still reads as brutalist-editorial-intentional. Lede (S1) competes for the visitor's eye — placement matters; mark goes in masthead, lede sits below.

**Confidence:** 65%

**Complexity:** Medium

**Status:** Unexplored

---

### 4. PROMPT → MODEL → VARIANT → IN-GAME OBJ transformation strip

**Description:** A full-width 4-panel mid-page strip showing the product lifecycle. Each panel has a JetBrains Mono header word; each houses one black-well visualization; each shows the L1/L2/L3 contract-layer label as a mono sub-caption for crypto readers. Built as a single compound asset (same SVG/component source feeds README architecture diagram, pitch-deck slide 3, demo-video opening shot).

```
┌──────────┬──────────┬──────────┬──────────┐
│  PROMPT  │  MODEL   │ VARIANT  │IN-GAME   │
│          │          │          │  OBJ     │
│ "a low-  │ [tusk    │ [4×4     │ [tusk    │
│  poly    │  shaded  │  grid    │  afloat  │
│  mammoth │    ↔     │  of      │  in      │
│  tusk,   │  mesh    │  colored │  neutral │
│  ornate  │  grad-   │  tusk    │  babylon │
│  carve"  │  ient]   │  variants]│  scene] │
│          │          │          │          │
│ Tripo    │ L1 Coll  │ L2 NFT   │ L3 Acc   │
└──────────┴──────────┴──────────┴──────────┘
```

Below the strip, one Newsreader italic sentence: *"One prompt. One model. Sixteen forks. Every game."* Panel 2's gradient is the same model↔mesh sweep that runs on the S1 lede — visual rhyme between page sections. Panel 4 is a minimal Babylon scene (floor + horizon + floating tusk) explicitly meant as "any Babylon/Unity/Godot scene," not the existing `/track` car-racing demo.

**Axis:** mental model & workflow explainer

**Basis:** `direct:` from `docs/spec.md` §1.7 + §2.8 + grounding pain "Can't form mental model of the pipeline." `external:` Evil Martians 100-devtool study — "how it works is the highest-value section for products with non-obvious mechanics."

**Rationale:** Hits two user requirements directly (explain usage + mental model) plus a compounding bonus (same asset → README diagram, pitch slide, demo opening). The 4-stage visitor-facing narrative replaces the L1/L2/L3 jargon as the primary mental frame; the L-labels become sub-captions for crypto-literate readers.

**Downsides:** Requires 4 pre-rendered visualizations — real production cost. Panel 4 ("in-game obj") must read as "any game" abstractly without committing to a specific game scene — too neutral risks "uninteresting," too specific risks "this only works with our racing demo." Panel 3's variant grid must visually convey "16 cars in 3 signatures" without copy.

**Confidence:** 75%

**Complexity:** Medium

**Status:** Unexplored

---

### 5. MTG-style actor cards (modelCreator / nftCreator / buyer / gameDev)

**Description:** Below the transformation strip, four trading cards laid out in a row. Each card uses Magic-the-Gathering layout: actor name (Newsreader italic), mana cost (what they pay, in SUI or attention, mono), ability text (what they can do on Tusk3D, body sans), flavor text (one-line role poem, italic), and provenance (which route they use, mono with path: `→ /create`, `→ /launch`, `→ /browse`, `→ /integrate`). Cursor hovers tilt the card slightly (the only motion concession). Card aesthetic is brutalist-editorial card-stock, not glossy.

**Axis:** mental model & workflow explainer

**Basis:** `external:` Magic: The Gathering card design (Richard Garfield, 1993); Hugging Face model-cards as descendant.

**Rationale:** Composable creator economy IS a deck mechanic — actors play roles, royalties stack like ability chains. The MTG frame primes the reader to *think* in composition. Brutalist editorial + card-stock visual are compatible. Cards screenshot well individually for Twitter/marketing reuse — high compounding. The provenance line on each card doubles as a role-based dispatch entry, complementing the S6 verb-based dispatch row (different mental frames for different visitors).

**Downsides:** Risk of being "cute" rather than brutalist. Cards must commit to information density (real mana costs, real ability text) or collapse into icons-with-labels. Four-actor symmetry slightly conflicts with the reality that gameDev is downstream of L1/L2/L3, not parallel.

**Confidence:** 65%

**Complexity:** Medium

**Status:** Unexplored

---

### 6. CARVE / RIFF / BROWSE / INTEGRATE keycap dispatch row

**Description:** Page foot — a single full-bleed row of 4 chunky brutalist "keycap" buttons:

```
[CARVE]      [RIFF]      [BROWSE]●     [INTEGRATE]
 /create     /launch     /browse        /integrate
```

Each keycap is a tall rectangle, 1.5px black border, off-white fill, Newsreader italic uppercase letter, JetBrains Mono route path under it. On hover, button fills pure black with off-white text — instantaneous invert, no slide or fade. The `[BROWSE]` keycap carries the `#FF4500` accent dot to flag "this is where the catalog moved from `/`."

Verbs are chosen so two map to the tagline ("Carve. Mint. Riff." → CARVE, RIFF) and two are literal nouns where the tagline doesn't fit (BROWSE for catalog discovery, INTEGRATE for gameDev SDK entry). MINT is intentionally NOT a keycap — in the system, "mint" happens at all three creator routes (Collection mint in /create, NftToken mint in /launch, Access mint in /market), so making it a keycap would force a wrong 1:1 mapping. MINT stays in the tagline as a poetic creative-act verb.

**Axis:** dispatch & catalog handoff

**Basis:** `direct:` grounding pain "No clear next-click" + constraint "Route split — `/` does NOT render catalog" + D-044 layout language (1.5px borders, 0px radius, no gradients).

**Rationale:** Route paths under each keycap signal "this is a product, not a marketing page" and help judges navigate the demo arc without a tour guide. The orange dot on BROWSE solves the discoverability cost of the route split (catalog was at `/`, now at `/browse`). Verb-pair (CARVE/RIFF tagline-aligned) and noun-pair (BROWSE/INTEGRATE literal) is honest about which routes have evocative semantics and which don't.

**Downsides:** "CARVE" as a synonym for `/create` is metaphor-loaded; new visitors may not connect "carve a tusk" with "publish a 3D model" without the S4 transformation strip's context. `/track` is not in the dispatch — it surfaces only inside `/browse` or `/collection/:slug` as a per-asset "demo this asset" secondary CTA, which is intentional (the racing scene is one example surface, not the canonical Tusk3D outcome).

**Confidence:** 80%

**Complexity:** Low

**Status:** Unexplored

---

### 7. Versioned issue №NNN masthead

**Description:** The page masthead reads `Tusk3D №042 — TESTNET EDITION 2026-06-15 14:22 PT`. The `№042` auto-increments from `git rev-list --count main` at build time. Same number appears in the README header, the pitch deck slide number system, the OG image text, and social-post templates. Frames Tusk3D as a continuously-published editorial product rather than a one-shot hackathon submission. Pairs with the broadsheet typography of D-044 — masthead is Newsreader italic with a 1.5px rule below.

**Axis:** name & metaphor identity

**Basis:** `reasoned:` `git rev-list --count` is one line in `vite.config.ts`; the issue-number framing leverages D-044's print-broadsheet roots (cited in `docs/decisions.md` D-044 rationale).

**Rationale:** Trivial implementation, outsized compounding. Between 6/21 submission and 8/27 winners announcement, the issue number keeps climbing — every judge revisit shows visible progress. Solves "align to product name" by giving Tusk3D a typographic ritual: the wordmark is always set with an issue number, anchoring the name in editorial language rather than tech-bro typography.

**Downsides:** "Issue number" framing may muddy whether Tusk3D is a *product* or a *publication*. If branding direction pivots, this is harder to undo than an OG image. Number `№001` on first deploy looks suspect; need to seed from commit count, not zero.

**Confidence:** 90%

**Complexity:** Low

**Status:** Unexplored

---

## Page Layout (Top-to-Bottom)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [S3 topology    Tusk3D №042     TESTNET EDITION                     │
│   wireframe      ─────────       2026-06-15 14:22 PT                 │
│   mark]          Newsreader      mono                                │
│                  italic                                              │
├──────────────────────────────────────────────────────────────────────┤
│  AS OF 14:22 PT  ●live  · L1 COLLECTIONS 47 · L2 NFTS 312 ·          │
│  WALRUS BLOBS 89 · LATEST CID bafy…3kQ ↗                       (S2)  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────── pure-black well ───────────────────────────┐    │
│  │     [tusk rotating, shaded ↔ mesh gradient sweep]            │    │
│  │     ~6s loop                                          (S1)   │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  // L1 Collection #001 · prompt: "a low-poly mammoth tusk"           │
│  // live from Walrus · bafy…3kQ                                      │
│                          [after 15s dwell: fork your own → ]         │
│                                                  (accent FF4500)     │
├──────────────────────────────────────────────────────────────────────┤
│   ┌──────────┬──────────┬──────────┬──────────┐                      │
│   │  PROMPT  │  MODEL   │ VARIANT  │IN-GAME   │                      │
│   │          │          │          │  OBJ     │                      │
│   │ [text]   │ [tusk    │ [4×4     │ [tusk    │                      │
│   │ Tripo    │ shaded↔  │ tusk     │ neutral  │                      │
│   │          │ mesh     │ variants]│ babylon] │                      │
│   │          │ gradient]│          │          │                      │
│   │ L1 Coll  │ L1 Coll  │ L2 NFT   │ L3 Acc   │                      │
│   └──────────┴──────────┴──────────┴──────────┘                      │
│   "One prompt. One model. Sixteen forks. Every game."      (S4)      │
├──────────────────────────────────────────────────────────────────────┤
│   ┌────────────┬────────────┬────────────┬────────────┐              │
│   │modelCreator│ nftCreator │   buyer    │  gameDev   │              │
│   │ cost: 2σ   │ cost: 4σ   │ cost: 1σ   │ cost: 0    │              │
│   │ carves a   │ forks a    │ holds      │ embeds     │              │
│   │ collection │ base into  │ soulbound  │ Access in  │              │
│   │ from a     │ 16 colored │ Access NFT │ any game   │              │
│   │ prompt     │ variants   │            │ scene      │              │
│   │ → /create  │ → /launch  │ → /browse  │ →/integrate│              │
│   └────────────┴────────────┴────────────┴────────────┘    (S5)      │
├──────────────────────────────────────────────────────────────────────┤
│   ┌─────────────┐┌─────────────┐┌─────────────┐┌─────────────┐       │
│   │   CARVE     ││    RIFF     ││   BROWSE  ● ││  INTEGRATE  │       │
│   │  /create    ││  /launch    ││  /browse    ││  /integrate │       │
│   └─────────────┘└─────────────┘└─────────────┘└─────────────┘ (S6)  │
└──────────────────────────────────────────────────────────────────────┘
```

Accent `#FF4500` budget (≤5/page):
1. S2 telemetry `●live` dot
2. S1 lede "fork your own →" (15s dwell)
3. S6 BROWSE keycap accent dot

Reserve: 2 remaining.

## Implicit Disciplines (not surveyed survivors but applied throughout)

- **Engineer voice** (F6.4) — all copy written engineer-to-engineer, no marketing voice
- **Tagline verbs as button labels** (F4.4) — CARVE / MINT / RIFF appear as in-app primary CTAs wherever the corresponding action happens; landing primes app vocabulary
- **Editorial terminology** — `lede` (not "hero"), `colophon` (not "footer"), `dispatch row` (not "CTA row"). Code identifiers stay code-like (e.g., `<HeroStack>`-style component names are fine internally) but visitor-facing copy and design-language docs use editorial words.

## Implementation Scope Notes

- `/browse` is a new route created as part of this work: move existing BrowsePage component from `/` to `/browse`, update App.tsx route table (single-line change), update NavGuard if it references the homepage path.
- `/market` route stays as transactional buy-page (separate function from catalog discovery).
- `/track` is NOT canonical Tusk3D landing content — it's the existing car-racing demo, surfaces only inside `/browse` or `/collection/:slug` as a per-asset "demo this asset" secondary CTA.
- L2 is shipped (D-029 reversed D-013). Survivors describing L2 NftCollection/NftToken behavior reflect actual contract state per `contracts/model3d/sources/model3d.move`.
- Tripo-generated tusk model + 4-8 variant palette is needed as input. Owner: user (Tripo generation outside this ideation).

## Rejection Summary

48 raw candidates → 7 survivors. Major cluster collapses:

| Cluster | # Rejected | Reason |
|---|---|---|
| C1 live on-chain proof | 6 | All variants of the same idea (receipt-style, editorial feed, deployment dashboard); collapsed into S2 |
| C2 product-as-lede | 3 | Cold-open / pre-rendered loop / single DRIVE button — all duplicates or too-radical variants of S1 |
| C3 workflow transformation | 2 | Animated pipeline + auto-cycling persona — covered by S4 + S5 |
| C4 technical-as-marketing | 4 | Move-docstring / changelog-as-page / htmx-README — too narrow audience or too radical |
| C5 define-by-negation | 2 | Strikethrough hero + sidebar negation — fragile competitor references / absorbed into S4 captions |
| C6 protocol-native | 2 | Walrus-fetch-logo / CID-as-hero — duplicates of S3 |
| C7 actor explainer | 3 | 4-column reading room / auto-cycling persona / gameDev-first — S5 MTG cards stronger |
| C8 dispatch variants | 5 | Inline editorial links / Whole Earth catalog / slash-key palette / every-noun-link — fail next-click discoverability |
| C9 tagline-as-structure | 3 | Single-verb hero / three-haiku page — abandon explanation |
| C10 print/broadsheet | 4 | Broadsheet hero / wall-card / postage-stamp / gatefold footer — compete with S1 or overlap `/browse` function |
| singletons | 6 | Pain-named hero / three-glyph tusk / reverse-chrono / HL2 tram / 50KB manifesto / 30-min dwell / 24-hour ship — alternates to survivors or process moves |
| cross-cutting synths | 6 | All 6 synth composites subsumed or rejected for being too aggressive on user requirements |

**Runner-up (not selected for survivor quota):** F4.7 spec-table footer — strong compounding move (canonical contract schema reference as a TS source-of-truth feeding `/integrate` SDK docs, README appendix, Move test fixtures). Cut for survivor count; worth revisiting if a 8th element is wanted in the page footer.

## Follow-ups (post-save)

- ✅ D-068 Tusk3D rename committed to README.md + CLAUDE.md (commit 9489601)
- ⏭ Tripo-generated tusk model + 4-8 variants pending (user to produce)
- ⏭ spec.md L2 stale references (lines 165, 172, 518, 645, 1262) deferred to Phase 5 polish per CLAUDE.md "submission deadline > docs perfection"
- ⏭ Update auto-memory observation 686 ("D-025 Latest, L2 Derivative Deferred to v1.1") — wrong on both counts (D-070 is latest, L2 shipped per D-029)
