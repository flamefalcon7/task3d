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

**One subheading:** *"The car you just watched was AES-encrypted on Walrus until a soulbound on-chain entitlement unlocked it. Pay once, own forever, drive immediately. Sui testnet, today."*

**Visual:** big screenshot of the `/track` scene mid-drive. Sui + Walrus + Babylon logos in a tight footer row.

---

## Slide 2 — The problem (1 slide, 25 sec)

**Headline:** *"Every 3D game asset lives or dies inside someone else's company."*

**Root cause (one line):** a centralized platform owns the assets, the payment rails, AND the licensing rules. One chokepoint — pain on both sides:

**Two columns, one cause:**
- **Creators get erased.** The platform dies and takes the work *and* the income with it. Google Poly shut down 2021 — irreplaceable glTF/GLB work, gone. FlippedNormals is closing **March 2026** — 3,500 creators' storefronts + income, to zero. Even alive: sold once, no derivative cut, royalties strippable.
- **Buyers get rented.** 30% platform cut on every sale, and a finite catalog you can't always find what you need in.

**The kicker (why this is a Walrus problem):** a web2 platform *structurally cannot* promise your asset survives its own death — the company can always die or change terms. Only decentralized storage (**Walrus**) + on-chain rules (**Sui Move**) can. Tusk3D removes the chokepoint: asset on Walrus, rules on Sui.

**Visual:** left — a "PLATFORM CLOSED / 404" headstone over scattered asset thumbnails (Poly 2021 · FlippedNormals 2026). Right — Tusk3D: asset on Walrus (no company), rules on Sui (enforced), both surviving the dead platform. Small source footer: TechCrunch 2020 (Poly), CG Channel 2026 (FlippedNormals).

> Evidence + sourcing: `docs/brainstorms/2026-06-05-problem-evidence-centralized-3d-platforms.md`. Enforcement honesty: derive fee is enforced on-chain at fork (shipped); secondary resale royalty needs Kiosk (roadmap) — don't overclaim "enforced" uniformly.

---

## Slide 3 — What we built (1 slide, 30 sec)

**Headline:** *"Carve → Mint → Riff → Drive — the L1 base → L2 collection loop in 90 seconds."*

**Visual:** the architecture diagram from `README.md` (Model3D + AccessEntitlement → NftCollection + NftToken) but more polished. Add a parallel "Walrus quilt → 1 Blob, N patches" diagram showing the storage efficiency.

**Three callouts on the right:**
- **Carve + Mint** (`/create`): Tripo prompt **or** GLB upload → tag parts → set license → (gated content Seal-encrypted) → 1 Walrus upload → `publish` a shared `Model3D`. Buyer pays `access_fee` once at `/model/:id` → soulbound `AccessEntitlement`.
- **Riff** (`/launch`): an entitlement holder forks the base → picks N paint-variants → 1 Walrus quilt + 1 Sui PTB → on-chain `NftCollection` + N tradeable `NftToken`s.
- **Drive** (`/track`): owned variants load into a Babylon + Havok rigid-body scene. Same Walrus quilt-patch URL drives both the marketplace thumbnail and the game asset.

> **Demo config (locked 2026-06-05): Tripo prompt-mode ON · 4 variants · Seal ON (encrypted `allow_list` base).** There is no `/forge`; L1 publish (`/create`) and L2 launch (`/launch`) are separate steps. Honest wallet-interaction counts for this config: `/create` ~5 (Tripo fee + 3 Walrus + publish) · buy access 1 · Seal unlock 1 · `/launch` 4 (2 Walrus + `launch_with_entitlement` + `mint_tokens`). The old "3 signatures" line is **retired** — the encrypted fork is a 2-step on-chain flow (cap first, then pin the post-decrypt quilt), which is exactly what makes entitlement-gated decryption safe. Lead with the storage (4×) + "pay once, own forever" numbers, not the raw signature count.

---

## Slide 4 — What's Sui/Walrus-specific (1 slide, 30 sec)

This is the originality + track-fit slide. Be explicit about what would NOT work on other chains.

**Headline:** *"Three things only Sui + Walrus can do."*

**Three rows, each a one-line claim + one-line proof:**

1. **Walrus quilt batching** — up to 4 collection variants share 1 Walrus Blob; per-variant byte-range patches addressable by URL. `⌈N/4⌉` quilts for N variants — **4× fewer stores** than one-blob-per-variant. The same patch URL feeds the marketplace thumbnail *and* the in-game mesh. *(Proof: the demo's 4-variant launch is a single quilt = 2 Walrus popups + the mint PTB.)*
2. **Soulbound by Move ability, not runtime guard** — `AccessEntitlement` and `NftCollectionCreatorCap` are `has key` only — *no* `store`, so they *cannot* be transferred, wrapped, or Kiosk-placed. It's a Move type-system guarantee. The equivalent on Ethereum needs a custom transfer-guard contract; Sui makes it a type signature. *(Proof: source — `AccessEntitlement { id, model_id, holder } has key`.)*
3. **Seal decryption gated on an on-chain object** — `allow_list`/`restricted` bases are Seal envelope-encrypted; `seal_approve_entitlement` proves you hold the entitlement before the key unwraps. Encryption is *derived* from the license policy at publish (not a decorative flag), and `seal_id` is fixed at 32 bytes to close a prefix-truncation bypass we found and fixed in our own security audit (D-085). *(Proof: source — `is_encrypted` derived in `publish_encrypted`; 32-byte `seal_id` in `validate_seal_publish`.)*

Each claim is one row, ~30 chars of body. Don't over-explain.

> ⚠️ Reconcile before design: the old "17 shared objects in PTB `8gKrqemFV…`" proof was on the **retired** Phase-3 package (`0x18a480b3…`). Re-capture an object-creation proof against the live v12 package `0xbf0affb8…02d1` before citing tx hashes / object counts.

---

## Slide 5 — Demo (1 slide, 30 sec)

**No copy — embed the 90-sec demo video.** Slide is a single video player + a "Demo URL: <link>" caption.

If presenting live, this is where you run the actual demo — `/create` (encrypted base mint) → `/model/:id` (buy access + Seal unlock) → `/launch` (4-variant fork) → `/track` drive. Switch to the slide for video playback if anything breaks.

(See `pitch/demo-script.md` for the shot list + voiceover script.)

---

## Slide 6 — What's next (1 slide, 20 sec)

**Headline:** *"Phase 4 + 5: mainnet, Kiosk royalties, more collections."*

**Three rows:**
- **Mainnet by 8/27** (Sui Overflow winners deadline) — D-009. Mainnet deploy is mechanical given the testnet path is proven.
- **Sui Kiosk + TransferPolicy** — protocol-level royalty enforcement on `NftToken` resales. Kiosk wiring in progress.
- **User-owned MemWal memory** — today personal recall is namespace-isolated under one deployer account; next, each user's personal creative memory lives in a MemWalAccount **owned by their own Sui address** (global community recall stays deployer-curated). D-090. Turns "isolated" into genuinely "owned on Walrus."
- **Deeper L2 + integrations** — `IntegrationRecord` already lets games register against a collection (gameDev pays a register fee). Next: richer royalty cascading + more game integrations.

---

## Slide 7 — Team + ask (1 slide, 15 sec)

Standard last slide. Name(s), one-line bio, links:
- GitHub: <repo URL>
- Demo: <localhost / deployed URL>
- Testnet PackageID: `0xbf0affb8...02d1` (v12)
- Contact: email / Twitter

**Ask** (if presenting live to investors / partners): *"We're looking for [one specific thing — testnet game studio partner / mainnet stress testing collaborator / etc.]."*

---

## Tone / style notes

- **No marketing language**. "Decentralized" appears at most once. "Web3-native" never appears. Engineers can smell those.
- **Numbers, not adjectives**. "4× fewer Walrus stores; pay once for a soulbound entitlement" beats "lightning-fast mint flow." (Use only counts you've re-verified against the v12 contract — see the demo-config note in Slide 3.)
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
- Live screenshots from `/create`, `/model/:id`, `/launch`, `/collection/:slug`, `/track`
- The demo recording itself (`pitch/demo-recording.mp4` after U7)
- Sui Scan screenshot of the deploy tx `8gKrqemFV...`
- `docs/decisions.md` for technical depth on any judge follow-up Q
- `docs/process.md` for architecture diagrams (or build cleaner ones in Figma)
