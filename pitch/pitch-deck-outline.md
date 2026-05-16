# Pitch Deck Outline — Sui Overflow 2026 (Walrus Track)

Target: 5–7 slides, 3-minute Demo Day pitch. Audience: Sui Foundation judges + builder community. Stack: Google Slides / Figma → export PDF for submission.

This is structure only — visual design + final copy in Phase 5. Use this to anchor `pitch/demo-script.md` (90-sec video) and any longer-form pitch.

---

## Frame the pitch around the right axis

Sui Overflow scores on (per the [2026 handbook](https://mystenlabs.notion.site/overflow-2026-handbook)):
- **Originality** — what's specifically Sui/Walrus-native that wouldn't make sense elsewhere?
- **Technical execution** — does it actually work? Is the code thoughtful?
- **Real-world utility** — would real users do this?
- **Track fit (Walrus)** — does Walrus do something load-bearing here?

Anchor every slide to one of those.

---

## Slide 1 — Hook (1 slide, 15-20 sec)

**Headline:** *"NFT collections become drivable games. Sui + Walrus only."*

**Single demo gif / 5-sec loop:** Wallet B drives the variant they just bought, hits a wall, bounces, recovers. No menus, no UI chrome — just the car physics.

**One subheading:** *"Creator mints 16-variant car collection in 3 signatures. Buyer drives what they own seconds later. All on Sui testnet today."*

**Visual:** big screenshot of the `/track` scene mid-drive. Sui + Walrus + Babylon logos in a tight footer row.

---

## Slide 2 — The problem (1 slide, 25 sec)

**Headline:** *"Real NFT collections ship N variants of a base mesh — BAYC, Azuki, Pudgy Penguins. Today's on-chain economy can't handle this without 32 wallet signatures + duplicated storage."*

**Three bullets:**
- A 16-variant mint with one-blob-per-variant = 16 Walrus stores + 16 PTBs = 32 wallet popups. Demo recording would be 4 minutes of popups. Nobody ships this.
- Composable collections (1 base mesh, N skins) is the *recognizable* creator-economy product, not 1-mint-per-asset.
- Existing NFT marketplaces solve the storage with IPFS pinning services (centralized) and the variants with off-chain metadata (mutable, not protocol-guaranteed). Both compromises are eliminated by Walrus + Sui Move.

**Visual:** a split — left side "BAYC traits diagram (8 hats × 6 fur × 5 backgrounds = 240 variants)"; right side a flowchart showing "16 mints × (encode + register + certify) + 16 PTBs = 32 popups today."

---

## Slide 3 — What we built (1 slide, 30 sec)

**Headline:** *"Collection Forge + Tiny Racetrack — the L1→Walrus→L3 economic loop in 90 seconds."*

**Visual:** the architecture diagram from `README.md` (Collection → Model3D × N → Access) but more polished. Add a parallel "Walrus quilt → 1 Blob, N patches" diagram showing the storage efficiency.

**Three callouts on the right:**
- **Collection Forge** (`/forge`): one prompt → base car GLB (Tripo) → pick N variants → 3 wallet signatures → 1 Walrus quilt + 1 Sui PTB → on-chain Collection + N Model3Ds
- **Tiny Racetrack** (`/track`): buyer's owned cars load into a Babylon + Havok rigid-body driving scene. Same Walrus quilt-patch URL drives both the marketplace thumbnail and the game asset.
- **Marketplace** (`/`, `/collection/:slug`): Browse groups variants by collection (1 card per series). Click → variant grid → buy Access → drive.

---

## Slide 4 — What's Sui/Walrus-specific (1 slide, 30 sec)

This is the originality + track-fit slide. Be explicit about what would NOT work on other chains.

**Headline:** *"Three things only Sui + Walrus can do."*

**Three rows, each a one-line claim + one-line proof:**

1. **Walrus quilt batching** — 16 variants share 1 Walrus Blob; per-variant byte-range patches addressable by URL. 16× storage reduction + 1 wallet popup instead of 16 for upload. *(Proof: live demo shows 16-variant mint completing in 3 popups.)*
2. **Sui shared objects** — `Collection` is shared; N `Model3D` variants reference its ID. No "owner" indirection, no global serializer bottleneck, parallel reads on every variant. *(Proof: testnet PTB at `8gKrqemFV...` creates 17 shared objects in one tx.)*
3. **Soulbound Access via Move's `has key` only** — no `store` ability means the Access NFT *cannot* be transferred, period. It's a Move type-system guarantee, not a runtime check. Same code on Ethereum needs a custom transfer guard contract; Sui makes it a type signature. *(Proof: source — `Access { id, target_id, holder, expires_at_ms } has key`.)*

Each claim is one row, ~30 chars of body. Don't over-explain.

---

## Slide 5 — Demo (1 slide, 30 sec)

**No copy — embed the 90-sec demo video.** Slide is a single video player + a "Demo URL: <link>" caption.

If presenting live, this is where you run the actual demo — `/forge` mint → `/collection/:slug` browse → `/track` drive. Switch to the slide for video playback if anything breaks.

(See `pitch/demo-script.md` for the shot list + voiceover script.)

---

## Slide 6 — What's next (1 slide, 20 sec)

**Headline:** *"Phase 4 + 5: mainnet, Kiosk royalties, more collections."*

**Three rows:**
- **Mainnet by 8/27** (Sui Overflow winners deadline) — D-009. Mainnet deploy is mechanical given the testnet path is proven (D-021).
- **Sui Kiosk + TransferPolicy** — protocol-level royalty enforcement on Access resales. Phase 4 plan starts post-submission.
- **L2 Derivative** — Move scaffolding already in `docs/spec.md`. Other creators fork your Collection into a derivative series with automatic royalty cascading. Deferred to v1.1 per D-013.

---

## Slide 7 — Team + ask (1 slide, 15 sec)

Standard last slide. Name(s), one-line bio, links:
- GitHub: <repo URL>
- Demo: <localhost / deployed URL>
- Testnet PackageID: `0x18a480b3...c3`
- Contact: email / Twitter

**Ask** (if presenting live to investors / partners): *"We're looking for [one specific thing — testnet game studio partner / mainnet stress testing collaborator / etc.]."*

---

## Tone / style notes

- **No marketing language**. "Decentralized" appears at most once. "Web3-native" never appears. Engineers can smell those.
- **Numbers, not adjectives**. "16 variants in 3 signatures" beats "lightning-fast mint flow."
- **Lead with the demo**. Architecture is service to the demo, not the other way around.
- **Phase 3 is feature-complete**. Don't apologize for what's deferred (L2 Derivative, Kiosk) — frame as roadmap with concrete dates.
- **One thing per slide**. If you find two ideas in a slide, split it.

---

## Anti-patterns to avoid

- ❌ Slide 1 "What is Sui? What is Walrus?" — judges already know. Lead with the demo.
- ❌ "Built with Claude / AI-assisted" framing — judges score the product, not the toolchain.
- ❌ Apologizing for Phase 4/5 not being done — the deadline is 6/21, you're on schedule.
- ❌ Pricing / token / business model slides — Sui Overflow scores building, not GTM.
- ❌ Tech-stack name-soup slides (logos of every tool used). Stack belongs on README.

---

## Source artifacts

When designing, pull from:
- Live screenshots from `/forge`, `/collection/:slug`, `/track` (after U7)
- The demo recording itself (`pitch/demo-recording.mp4` after U7)
- Sui Scan screenshot of the deploy tx `8gKrqemFV...`
- `docs/decisions.md` for technical depth on any judge follow-up Q
- `docs/process.md` for architecture diagrams (or build cleaner ones in Figma)
