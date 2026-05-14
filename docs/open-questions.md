# Open Questions

Unresolved questions captured during the project. Bootstrap pulled from `docs/spec.md` §7.5.

Add new entries below as **OQ-XXX** in order. Move resolved questions to the bottom section with date + resolution summary.

---

## OQ-001: What is MemWal (Walrus Memory) exactly?

**Why this matters**: Sui Overflow 2026 Walrus track framing is "verifiable data **and memory layer**". The "memory layer" part likely refers to MemWal. We may be missing a pitch hook by not integrating it.

**To resolve**: Read MemWal playground + GitHub repo. Compare against current Model3D design — does MemWal fit our use case (data layer for asset metadata?), or is it for agent memory (different scope)?

**Blocker level**: 🟡 Worth investigating before Phase 4 / pitch writing. Not blocking Phase 1.

---

## OQ-002: Real Walrus mainnet cost for ~100KB GLB, 10 epochs

**Why this matters**: Need real cost numbers before pricing model design (`Model3D.direct_access_price` / `Derivative.derivative_price`) and for pitch slide on "Walrus cheaper than S3+CloudFront".

**To resolve**: Run `walrus info` against mainnet system object after first deploy. Or check current-state cost calculator if accessible.

**Blocker level**: 🟢 Not blocking. Estimate as fractions of a cent for now.

---

## OQ-003: Enoki sponsored-tx on testnet — truly free?

**Why this matters**: Demo Day killer feature ("user signs in with Google, no gas, mints model"). If testnet sponsored tx counts against the free-tier quota, may need to pay $120/mo Pro plan earlier than planned.

**To resolve**: Register Enoki sandbox account, run one sponsored testnet tx, check dashboard quota.

**Blocker level**: 🟢 Not blocking. Worst case: pay during demo polish — $120 is acceptable.

---

## OQ-004: @mysten/dapp-kit 1.0 actual import paths

**Why this matters**: 1.0 was split into `-core` + `-react`. Most sample apps online are pre-1.0. We may hit cryptic import errors during Phase 2.

**To resolve**: Check current `sdk.mystenlabs.com/dapp-kit` starter; try imports in a minimal test app.

**Blocker level**: 🟡 Resolve before Phase 2 dapp-kit integration.

---

## OQ-005: Walrus package ID on testnet AND mainnet (current)

**Why this matters**: Hardcoding wrong package ID → build fails. MVR alias `@walrus/core` is the supposed-to-work path.

**To resolve**: Either resolve dynamically via system object lookup (`sui client object <SYSTEM_OBJECT_ID>`) or commit to MVR alias in `Move.toml` and never hardcode. Sanity-check works on both networks.

**Blocker level**: 🟡 Resolve during Phase 2 Move integration.

---

## OQ-006: DeepSurge submission portal — fields and flow

**Why this matters**: Submission deadline 6/21. If portal has surprise requirements (custom video format, special demo URL pattern, team registration prereqs, ID verification), we want to know now, not 6/20.

**To resolve**: Register on DeepSurge with placeholder team, examine submission form fields and required uploads.

**Blocker level**: 🟢 Not blocking, but worth doing before 6/15 buffer.

---

## OQ-007: Where to acquire mainnet WAL for demo

**Why this matters**: Mainnet has no WAL faucet. Need to plan: exchange (Binance / Coinbase / OKX)? DEX? OTC? Bridging via Wormhole?

**To resolve**: Check `walrus.xyz` for current mainnet WAL acquisition options; budget $5–20 for demo storage + ~$50 buffer.

**Blocker level**: 🟡 Resolve before Phase 4 mainnet deploy.

---

## OQ-008: Forensic watermark approach for 3D meshes

**Why this matters**: Phase 4 stretch C. If we attempt this, need a workable algorithm (mesh micro-perturbation encoding user ID, or texture metadata steganography).

**To resolve**: Research existing 3D watermarking academic literature; pick simplest approach for Phase 4.

**Blocker level**: 🟢 Not blocking; only relevant if attempting stretch C.

---

## OQ-009: Sample game scene tech choice (Three.js vs Unity WebGL vs Babylon)

**Why this matters**: Phase 3 deliverable. Three.js / Babylon (we already have Babylon in `frontend/`) is web-native, lighter, easier to embed in demo. Unity WebGL is more "game dev legitimate" but larger setup overhead (bundle size, build pipeline).

**To resolve**: User preference + time budget. **Babylon makes most sense** given we already use it in frontend — same Engine instance can be reused, no second 3D library to learn. Three.js is the alternative if Babylon proves heavy for the chosen scene form (depends on OQ-011 G1/G2/G3 outcome).

**Blocker level**: 🟡 Resolve together with OQ-011 before Phase 3 start (5/30).

---

## OQ-010: Pitch deck format and length

**Why this matters**: Sui Overflow handbook didn't specify a pitch deck format for shortlisted teams' Demo Day pitch. Typical hackathon: 5–10 slides, 5 minutes total. Without explicit guidance, default to industry-standard.

**To resolve**: Check handbook + ask devrel@sui.io if shortlisted teams get specific deck requirements.

**Blocker level**: 🟢 Not blocking; relevant if shortlisted (announced 7/8).

---

## OQ-011: Phase 3 sample game scene form factor (G1 / G2 / G3)

**Why this matters**: D-014 deferred this decision until Phase 2 catalog is complete. The scene form (Trophy Room / Dress-up Mannequin / Mini-Adventure) should be driven by what kinds of Model3D we actually have, not chosen blind.

**Three candidate forms**:
- **G1 Trophy Room** — first-person walk-through showcase, no character, NFTs on pedestals. ~2-3 days. Fits well if catalog is large-prop heavy (castles, dragons).
- **G2 Dress-up Mannequin** — single Mixamo-rigged character, equip slots for NFT weapons/armor/props from your Access inventory, 360° preview. ~3-4 days. Fits if catalog is weapon/equipment heavy. **Currently recommended fallback**.
- **G3 Mini-Adventure** — top-down or 3rd-person character + walkable terrain + pickup items + equip. ~5-7 days. Highest production value but highest scope risk (character controller, animation blend, collision).

**To resolve**: At end of Phase 2 (~5/29), review catalog composition + remaining Phase 3 budget → write **D-014a** ADR locking the choice. Pick the form that lets the chosen catalog shine while leaving Phase 5 buffer.

**Constraint from D-014**: all meshes in the scene must come from our service (procedural + Tripo seed), not external free game assets. Mixamo character is the only external dependency allowed.

**Blocker level**: 🟡 Decide by 5/29 (Phase 2 end).

---

## OQ-012: Catalog search / discovery beyond pure browse (v1.1+)

**Why this matters**: D-014 chose pure browse + tag filter for v1, deferred semantic search to v1.1+. Need to decide approach when traction proves search is wanted.

**Three approaches**:
- **S1. LLM semantic search** — embed user prompt + each Model3D's description/tags → cosine top-K. Cost: embedding API per query. Best UX.
- **S2. Tag-based filter only** — frontend filter chips by tag. Cost: 0. Lowest UX but functional.
- **S3. Backend indexer with prompt search** — Phase 2 already builds a Sui indexer query for Browse. Extend with text search across `tags` and (future) `description` field. Mid-cost, mid-UX.

**To resolve**: Don't resolve in v1. Watch v1 user behavior (do users complain "can't find what I want"?) → pick S1 or S3 in v1.1 based on signal. **S2 is v1 default and likely enough for ~20-30 catalog items.**

**Blocker level**: 🟢 Not blocking v1. Revisit post-submission.

---

## OQ-013: Phase 4 Sui Kiosk + Phase 2 share_object Model3D coexistence

**Why this matters**: Plan-002 D-016 captures that Phase 2 uses `transfer::share_object(Model3D)` so `purchase_model_access` works without Kiosk. Sui Kiosk takes ownership of items, so a shared-object Model3D cannot be retroactively placed in a Kiosk. Phase 4's Kiosk integration must decide: (a) accept a bifurcated catalog where Phase 2 mints stay shared and Phase 4 mints go through Kiosk (Browse must query both), or (b) ship a migration helper that re-mints Phase 2 models into Kiosks (loses original mint timestamp + tx hash).

**To resolve**: Phase 4 ADR (D-???) at start of Phase 4 (~6/11). For Phase 2 work, no action needed — `publish_and_share` ships as designed.

**Blocker level**: 🟢 Not blocking Phase 2. Decide at Phase 4 start.

---

## OQ-014: `writeFilesFlow` with 2 files — 2 popups or 4?

**Why this matters**: Plan-002 U7 assumes 2 files (GLB + lineage) in `writeFilesFlow({ files: [glb, lineage] })` produces a single 2-popup sequence (one register, one certify). If the SDK actually fires 2 register + 2 certify (4 popups), the creator UX gets significantly worse and `MintButton` copy needs to say "Step X of 5" instead of "Step X of 3".

**To resolve**: U3 day-1 smoke test with a real Slush wallet against testnet relay. Document the actual popup count in U3 PR. Adjust U7's MintButton copy accordingly.

**Blocker level**: 🟡 Resolve at U3 implementation; affects U7 UX spec.

---

# Resolved Questions

(Move resolved items here with date + one-line resolution.)
