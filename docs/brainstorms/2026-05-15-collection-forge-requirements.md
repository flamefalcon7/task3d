---
title: Collection Forge + Tiny Racetrack demo pair (Car + Racing)
status: ready-for-planning
created: 2026-05-15
phase: 3 (Real-World Application)
origin: chat ideation 2026-05-15 (replaces "sample game scene" framing in spec.md §6 Phase 3)
related_decisions: [D-001, D-002, D-006, D-013, D-014, D-016]
target_track: Walrus + Real-World Application
submission_deadline: 2026-06-21
---

# Collection Forge + Tiny Racetrack — Phase 3 demo pair (Car + Racing)

## Problem frame

Phase 2 ships a **1-asset-at-a-time** mint flow: creator generates one model → uploads one Walrus blob → mints one `Model3D` Sui object. This is correct for the underlying primitive but doesn't match how 3D NFT **collections** actually work in market — BAYC, Azuki, Pudgy Penguins all ship N variants of a base mesh with trait differences (color, texture, accessories).

Without a collection-minting surface, our demo story for Sui Overflow's "Real-World Application" track is thin: "creators can mint one model" is a primitive, not a product. A creator economy needs the leap from "one asset" to "a collection a buyer can browse and pick from."

This spec defines two paired demo apps that turn the Phase 2 primitive into a recognizable creator-economy product **without changing the v1 Move scope set in D-013** (no L2 Derivative).

## Why this demo pair (vs. the spec.md §6 "sample game scene")

| Old Phase 3 framing | New framing (this doc) |
|---|---|
| One sample game scene loading models from Walrus | Two paired apps — creator-side Forge + buyer-side Tiny Racetrack |
| Demonstrates: "Walrus serves 3D assets" | Demonstrates: **L1 batch-mint + Walrus quilt batching + L3 Access-gated game asset loading** — the full economic loop in 90 seconds |
| Scope: read-side (load + render) | Scope: read + write (mint + browse + buy + render) |
| Pitch-video screen time: 30 sec | Pitch-video screen time: 90 sec (full loop) |

D-013 cut L2 Derivative for v1. This spec **honors D-013**: variants are N **sibling** L1 `Model3D` objects all minted by the same creator with shared collection-identifier tags. No `Derivative` struct, no royalty backflow, no fork chain. The "composability" angle the demo highlights is **L1 batch + L3 gating**, not L2.

## Actors

- **A1 — Creator (Alice)**. Generates a base car via Tripo (text prompt → textured GLB). Designs a collection of N paint-variants by picking baseColor + optional texture per variant. Publishes the collection to Walrus + Sui in a single mint flow. Receives payment when buyers purchase Access to any variant.

- **A2 — Buyer (Bob)**. Browses the marketplace, sees Alice's collection (rendered as a grid of paint-variant thumbnails grouped under the collection). Buys Access to one specific variant (e.g., #7 — red metallic). Receives a soulbound `Access` Sui object.

- **A3 — Player (also Bob)**. Same wallet as A2. Opens Tiny Racetrack, which detects his owned Access receipts and loads his specific car variant GLB from Walrus onto a bounded oval track. Drives it with WASD / arrow keys.

## Key flows

### F1 — Collection Forge: design + mint

```
Alice opens /forge
  → types a prompt → Tripo → textured base car GLB (60-120 Tripo credits, once)
      [v1 scope: Tripo car only; procedural-shape collections are v1.1+]
  → enters collection metadata: name, description, price per variant, variant count N (max 16)
  → "Design variants" UI shows N rows, each with:
      - color picker (baseColorFactor RGB)
      - optional texture pick from curated library (8-12 presets bundled)
      - live mini-preview rendered with the chosen material
  → "Mint collection" button
      Step 1: backend POST /api/collection/build accepts base GLB + N variant specs
              returns N modified GLBs (material slot swapped per spec)
      Step 2: frontend wraps N GLBs into one writeFilesFlow upload
              wallet popups: register, certify (2 popups, quilt-batched)
              → 1 Walrus quilt blob containing N paint variants
              → flow.listFiles() returns N {patchId, blobObject} pairs (same blobObject for all N)
      Step 3: frontend builds 1 PTB (Move shape per OQ-D6 = B.ii):
              - call publish_collection(quiltBlob, name, slug, ...) → returns Collection
                share Collection
              - for each variant i in 0..N:
                  call mint_variant(&Collection, patchId_i, params_json_i, price_i, tags_i, ...) → returns Model3D
                  share Model3D
              wallet popup: PTB approval (1 popup)
  → result: 3 wallet popups total
            on Sui: 1 Collection + N Model3D objects, all shared
            on Walrus: 1 quilt blob with N patches
  → success screen: "Minted collection 'Neon Drift Series' — 16 variants live"
```

### F2 — Browse marketplace as collections

```
Bob opens /
  → existing /browse grid groups variants by collection tag
      (off-chain indexer keys on tag prefix "collection:<slug>")
  → click collection card → /collection/:slug
  → shows N variant thumbnails (Walrus aggregator URLs, lazy-loaded)
  → each variant card shows its individual `Model3D` object id + price
```

### F3 — Buy a specific variant

```
Bob clicks variant #7 → /model/:id
  → existing Phase 2 BuyAccessButton
  → wallet popup: purchaseAccessPtb (1 popup)
  → backend indexer reflects ownership; UI flips to "Owned"
```

### F4 — Tiny Racetrack: drive owned variant

```
Bob opens /track (new route)
  → on mount: query Sui indexer for Access objects held by connected wallet
  → fetch each Access's target Model3D → resolve (collection_id, patch_id) → Walrus aggregator URL
  → "Pick your car" carousel shows all owned variants (thumbnail + name + variant #)
  → Bob picks variant #7 → that GLB loaded into Babylon scene
  → scene contents:
      - bounded oval track (procedural plane mesh, simple road material)
      - start/finish line marker
      - chase camera follows the car
      - skybox / ambient lighting
  → input loop (Babylon + Havok physics):
      - WASD / arrows: accelerate / brake / steer
      - rigid-body car (single static mesh — wheels do not spin in v1, accepted abstraction)
      - velocity clamp at ~20 units/s, simple turning radius
      - hard walls at track boundary (stop on impact, no damage model)
  → no win condition, no lap timer, no opponents (per OQ-D5 v1 scope lock)
  → if Bob owns zero variants: prompt "Buy a variant first" with /collection link
```

### F5 — Creator dashboard (stretch, v1 if time permits)

```
Alice opens /forge/manage
  → lists her own minted collections with sales counts
  → "Mint more variants" → re-enters F1 with same collection tag prefix
```

## Acceptance examples (concrete)

### AE1 — Happy path: Tripo car collection mint

Alice opens `/forge`, types prompt "futuristic racing car, low-poly, neon accents". AnthropicRouter routes to Tripo; Tripo returns a textured GLB in ~60 sec (one Tripo call). Alice enters collection name "Neon Drift Series", slug `neon-drift-series`, price 0.5 SUI per variant, variant count 16. Designs 16 paint variants: 12 solid colors (red/blue/green/cyan/...) + 4 metallic (gold/silver/copper/chrome). Each variant rendered correctly in preview (PBR material slot swapped via @gltf-transform/core without breaking UV mapping). Clicks Mint. 3 wallet popups fire in sequence:

1. Walrus register — quilt with 16 GLBs encoded
2. Walrus certify — quilt commits on-chain as 1 Blob
3. Sui PTB — `publish_collection(quiltBlob, ...)` then 16× `mint_variant(&Collection, patch_id, ...)`, all in one transaction

All succeed. Sui Explorer shows 1 Collection object + 16 Model3D objects all shared, each Model3D carrying `tags = ["collection:neon-drift-series", "variant:N/16"]`. Walrus aggregator can return each of 16 patches by `patchId`.

### AE2 — Browse marketplace as collections

Bob (different wallet) opens `/`. Marketplace grid groups Sui Model3D objects by `collection:` tag prefix. "Neon Drift Series" appears as one card with the 16 variants underneath. Clicking the card opens `/collection/neon-drift-series`, showing 16 variant tiles (each loaded from Walrus aggregator via its patch_id). Each tile shows: thumbnail, name, price, individual Model3D object id.

### AE3 — Buyer purchases a specific variant

Bob clicks variant #7 (red metallic) on the collection page. Confirms 0.5 SUI via `purchase_model_access(model: &Model3D, payment, ...)` — unchanged from Phase 2. Receives soulbound `Access` Sui object with `target_id` = variant #7's `Model3D` object id.

### AE4 — Tiny Racetrack drives owned variant

Bob opens `/track`. Scene queries Sui for Bob's Access objects, resolves the one for variant #7 → (collection_id, patch_id) → Walrus aggregator URL. The car GLB loads onto a bounded oval track with red-metallic paint intact. Chase camera engages. Bob accelerates with W, steers with A/D, brakes with S. Car drives smoothly; collides with track walls and stops. Variants Bob does NOT own do not appear in his car-picker carousel. Bob can also switch to a different owned variant via the picker and the same physics applies.

### AE5 — Variant count cap enforcement

Alice tries to mint a 32-variant collection. UI caps at 16 (variant count slider max). If she edits the request to 32 via dev tools, the build endpoint rejects with 400.

## Scope boundaries

### In v1

- ✅ Base model: **Tripo car only** (per OQ-D1) — text prompt → textured GLB, one Tripo call per collection
- ✅ Variant differentiation: material slot swap (baseColorFactor + baseColorTexture) via `@gltf-transform/core`
- ✅ Variant count: 1-16 per collection
- ✅ Collection identity: on-chain via shared `Collection` Sui object (per OQ-D6 = B.ii); additionally `tags = ["collection:<slug>", "variant:<n>/<total>"]` on each Model3D for indexer-side grouping
- ✅ Walrus upload: 1 quilt for all N variants (2 wallet popups regardless of N)
- ✅ Sui mint: 1 PTB calling `publish_collection(quiltBlob, ...)` then N× `mint_variant(&Collection, patch_id_i, ...)`
- ✅ Tiny Racetrack: WASD-controlled rigid-body car on bounded oval track, chase camera, hard-wall collision stops (no damage)
- ✅ Single asset class: **car only** for v1 demo cycle

### Deferred (v1.1+)

- ❌ Mesh-level variation (only material slots in v1)
- ❌ Trait composition / combinatorial generation (BAYC-style "8 hats × 6 fur × 5 backgrounds = 240 tokens")
- ❌ Generative texture from prompt
- ❌ L2 Derivative — buyers forking a variant into their own series (D-013 v1.1 scope)
- ❌ Lineage-aware royalty splits across forks (depends on L2)
- ❌ Tiny Racetrack: opponents, AI cars, lap timer, leaderboard, scoring, engine/collision SFX
- ❌ Tiny Racetrack: wheel mesh separation + spin animation (cars are static meshes in v1; wheels do not rotate)
- ❌ Custom texture upload (user uploads their own texture → Walrus). v1 uses curated library only.
- ❌ Procedural-shape collections (sword/hammer/platform from Phase 2 generators). Deferred to v1.1; the Forge backend is built to accept procedural GLB as base too, but v1 UI only exposes the Tripo prompt path.

### Outside this product's identity

- ❌ Generic NFT viewer (we are a creator tool + game asset consumer, not an OpenSea clone)
- ❌ Auction / bidding mechanics (fixed price per variant)
- ❌ Secondary market for variants (Phase 4 Kiosk + TransferPolicy is separate — D-013, OQ-013)

## Resolve before planning

These were the questions that materially change the implementation plan. All resolved 2026-05-15 PM.

### OQ-D1 — Demo asset class: Sword or Car?  ✅ RESOLVED → **Car**

**Decision (2026-05-15 PM):** Car via Tripo. Originally my recommendation was Sword (zero Tripo cost); user preferred Car for the stronger demo punch ("3D NFT 收藏品" mental model + Tiny Racetrack as the natural use context).

**Tripo budget impact is contained**: only **one** Tripo call per collection (the base car). N paint variants are produced by material-slot swaps in `@gltf-transform/core` — no further Tripo cost. Single collection of 16 variants ≈ 60-120 credits. Free-tier 300/month × 5-6 months (May-Aug) = 1500-1800 credits available. Budget headroom is large.

Rejected alternatives:
- ~~Sword (procedural)~~: zero AI cost but weaker demo. Demo punch matters more than 1-2 days of build-cost difference per the user's strategic call.
- ~~Both (sword + car)~~: 2× polish work; risk to 6/21 deadline.

### OQ-D2 — Walrus quilt → Sui Blob mapping  ✅ RESOLVED 2026-05-15

**Resolution by source-code read** (no testnet spike needed): `@mysten/walrus@1.1.7` `flows/write-files.mjs` `listFiles()`:

```javascript
return quiltIndex.patches.map((patch) => ({
    id: encodeQuiltPatchId({ quiltId: certResult.blobId, patchId: { ... startIndex, endIndex } }),
    blobId: certResult.blobId,         // ← SAME for all N elements
    blobObject: certResult.blobObject, // ← SAME for all N elements
}));
```

A quilt corresponds to **one** Sui `Blob` object. N files are byte-range patches inside it. The `id` field is a synthetic `encodeQuiltPatchId(quiltId, startIndex, endIndex)`, not a Sui object id.

**Path A (N independent Sui Blob objects per upload) does not exist.** The current `useWalrusUpload.ts` `UploadResult.blobIds: string[]` API surface is misleading — every element is the same blob id; Phase 2's existing mint flow hasn't tripped on this only because it always passes 1 file (degenerate quilt).

Remaining viable paths:

- **B.i (rejected)** — call `writeBlobFlow` × N independently. 16 variants = 32 wallet popups. Demo UX disaster.
- **B.ii / B.iii (both require Move contract change + testnet redeploy)** — see new OQ-D6 below.

**Plan-003 must include a Move contract change and a redeploy step.** Redeploy is no longer a hard blocker (see footnote on testnet deploy resolution below).

> **Note on testnet deploy block** (separate from OQ-D2): the Phase 2 testnet deploy block (Walrus + WAL `published-at` linking) was misdiagnosed. Per Sui Overflow mod 2026-05-15 AM: the upstream source tree `MystenLabs/walrus@testnet:contracts/walrus/` intentionally has `walrus = "0x0"` (it's re-published on upgrades). The deployed-package metadata lives at `MystenLabs/walrus@main:testnet-contracts/walrus/Published.toml`. Sui CLI 1.72.1 reads `Published.toml` natively. One-line fix: change our `Move.toml` git dep to `subdir = "testnet-contracts/walrus", rev = "main"`. Verified — `Published.toml` exists with `published-at = "0x849e95d2..."`, version 3. WAL flows transitively from the same subtree. This converts the deploy block from "fork or local-clone" to a trivial Move.toml edit. **Captured as D-021 ADR (pending in same session).**

### OQ-D6 — Move contract shape for N-variant collection  ✅ RESOLVED → **B.ii**

**Was load-bearing.** Replaced OQ-D2 as the architectural fork. Affects Move struct shape, entry function count, Sui object count per collection, and Browse marketplace UX.

Both options required Move contract changes + testnet redeploy. Deploy is trivial per D-021 fix.

#### B.ii — Collection wrapper + N individual Model3Ds

```move
public struct Collection has key, store {
    id: UID,
    blob: Blob,                  // shared quilt
    creator: address,
    name: String,
    slug: String,
    variant_count: u32,
    created_at_ms: u64,
}

public struct Model3D has key, store {
    id: UID,
    collection_id: ID,           // ← reference (was: blob: Blob by-value)
    patch_id: String,            // ← quilt patch identifier
    creator: address,
    shape_type: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    lineage_blob_id: String,
    direct_access_price: u64,
    is_encrypted: bool,
    license: LicenseTerms,
    created_at_ms: u64,
}
```

- Per collection: **1 Collection object + N Model3D objects**
- Each variant feels like a full NFT — own object id, own browse-card, own price
- Browse marketplace UX: minimal change from Phase 2 (group by `collection_id`)
- Buyer flow: unchanged — `purchase_model_access(model: &Model3D, payment, ...)` still works as-is
- Renderer: read `model.collection_id` → fetch Collection (1 RPC) → get `blob.blob_id` → fetch `patch_id` from quilt
- More gas (creating N+1 objects per collection); more on-chain bytes
- Mental model: **BAYC / Azuki** — each token is its own NFT

#### B.iii — Single Model3D with variant metadata + variant-indexed Access

```move
public struct Model3D has key, store {
    id: UID,
    blob: Blob,                  // owns the quilt directly
    creator: address,
    variant_count: u32,
    variants: vector<VariantMeta>,
    name: String,                // collection-level
    shape_type: String,
    tags: vector<String>,
    lineage_blob_id: String,
    is_encrypted: bool,
    license: LicenseTerms,
    created_at_ms: u64,
}

public struct VariantMeta has store, copy, drop {
    patch_id: String,
    params_json: String,
    direct_access_price: u64,    // per-variant pricing
}

public struct Access has key {
    id: UID,
    target_id: ID,               // Model3D
    variant_index: u32,          // ← NEW field
    holder: address,
    expires_at_ms: u64,
}
```

- Per collection: **1 Model3D object + N Access objects (when purchased)**
- Variants live in `vector<VariantMeta>` inside the single Model3D
- Browse UI changes: 1 collection card → click → 16 variant tiles (data from `model.variants`); browse grid scales linearly in collections, not variants
- Buyer flow: new entry `purchase_variant_access(model: &Model3D, variant_index: u32, payment, ...)`
- Renderer: read `access.variant_index` → look up `model.variants[index].patch_id` → fetch from quilt
- Less gas (1 Model3D per collection); browse-grid scaling improves with many collections
- Mental model: **concert tickets** — your Access has a seat (variant_index)

#### Tradeoff matrix

| | B.ii (Collection + N Model3Ds) | B.iii (1 Model3D + indexed Access) |
|---|---|---|
| Move complexity | Larger — new Collection struct + 2 entries | Smaller — extends existing structs + 1 new entry |
| Mint PTB | 1 `publish_collection` returning Collection + N `mint_variant(collection, patch_id, ...)` calls | 1 `publish_collection_with_variants(blob, variants[], ...)` call |
| Gas per mint | High — N+1 objects created | Low — 1 object created |
| Browse marketplace UX | Group-by-collection-id; minimal Phase 2 redesign | Collection cards + on-click variant grid; new view |
| Buyer flow | Unchanged from Phase 2 (purchaseAccessPtb still works) | New PTB shape with `variant_index` |
| Indexer-side complexity | Low — query existing Model3D type | Medium — query VariantMeta inside Model3D |
| Demo mental model | "Each variant is its own NFT" — familiar to NFT audience | "Your Access has a seat number" — less familiar |
| Sui ecosystem precedent | Closer to Suins / Capy patterns | Closer to ticket / event NFT patterns |
| Code-change footprint frontend | Smaller — most Phase 2 components work | Larger — Browse + ModelDetail + Buy flows change |
| Frontend test churn | Lower | Higher (Phase 2's 94 frontend tests partly need rewriting) |

#### Recommendation

**B.ii** — for these reasons:
1. **Lower frontend churn**: Phase 2's `BrowseGrid`, `ModelDetailPage`, `BuyAccessButton`, `useOwnsAccess`, `useModelById` all keep working with minor adjustments. B.iii rewrites all of them.
2. **Familiar NFT mental model**: BAYC/Azuki framing is what hackathon judges expect from "NFT collection."
3. **Per-variant pricing flexibility**: each Model3D has its own `direct_access_price` — easy to demo "rare variants cost more."
4. **Indexer-side simplicity**: existing `Model3DSummary` indexer query works; just adds collection grouping.

Tradeoff: more gas per collection mint. For 16 variants, that's ~17 object creations in one PTB — well within Sui per-PTB limits.

**Decision (2026-05-15 PM): B.ii.** Confirmed by user. Plan-003 builds on this Move shape.

### OQ-D3 — Variant count cap  ✅ RESOLVED → **16**

**Decision (2026-05-15 PM): 16.** Conservative, fits most NFT collection conventions ("limited-edition" series), fits in one Walrus quilt under reasonable size assumptions (16 × ~1 MB ≈ 16 MB total), and 17 object-creations in 1 PTB (Collection + 16 Model3D) is well under Sui's per-PTB gas/op limits. Easy to relax later if needed.

### OQ-D4 — Material-only vs texture-swap  ✅ RESOLVED → **Texture + color**

**Decision (2026-05-15 PM): texture + color** (the medium path). Bundle 8 curated textures (matte / metal / wood grain / camo / gradient / chrome / brushed-metal / carbon-fiber) with the frontend. Backend swaps `baseColorTexture` + `baseColorFactor` via `@gltf-transform/core`. Adds ~1 day vs color-only, much stronger demo (BAYC-style trait differentiation).

### OQ-D5 — Tiny Racetrack v1 scope  ✅ LOCKED → **L2 driveable, minimum-viable scope**

**Decision (2026-05-15 PM): L2 driveable, with strict scope lock.** Original Recommendation was L1 (canned animation, ~3 days). User pushed for L2 driveable on the grounds that car + racing avoids the costly parts of L1+sword (no character mesh, no skeleton, no grip-pivot computation). Estimated build: **~3 days** if the scope-lock below is held.

#### v1 includes

| Capability | Detail |
|---|---|
| Player car | One car GLB at a time (the owned variant Bob picks from his garage carousel) |
| Track | One bounded oval — procedural plane mesh, simple road material, start/finish-line marker for visual reference (not gameplay) |
| Physics | Babylon + Havok rigid body, velocity-clamp ~20 units/s, simple turning radius, hard-wall collision (stops car on impact) |
| Camera | Chase camera following the car (single mode) |
| Input | WASD + arrow keys: accelerate / brake / steer |
| UI | Speedometer (optional, low-priority) |
| Visuals | Skybox, basic ambient + directional light |

#### v1 explicitly excludes (do not get pulled in)

- ❌ Opponent cars / AI
- ❌ Lap timer, lap counter, finish-line "win" condition
- ❌ Leaderboard
- ❌ Multiplayer
- ❌ HP / damage / collision penalty
- ❌ Drift, jump, suspension
- ❌ First-person camera, instant-replay
- ❌ Engine SFX, collision SFX, soundtrack
- ❌ Wheel mesh separation + spin animation (cars stay as static meshes — arcade abstraction)
- ❌ Multiple tracks, track selection
- ❌ Tuning UI (max speed, friction, etc.)

The scope is locked because Phase 3 budget is 14 days across Forge + Walrus quilt + Move + Browse + Racetrack + seed catalog. Tiny Racetrack getting more than ~3 days steals from the rest. If a stretch goal lands (lap timer, opponent AI), it gets bumped into Phase 5 polish week, not Phase 3.

## Carry-forward decisions (must respect)

- **D-001 / D-013**: v1 ships L1 (Model3D) + L3 (Access) only. No L2 Derivative. Collection Forge mints **sibling** L1 objects, not derivatives.
- **D-006**: GLB only for v1. No FBX/USDZ in Collection Forge output.
- **D-014**: LLM extracts tags. Collection Forge prepends collection-identifier tags (`collection:<slug>`, `variant:<n>/<total>`) before passing tags to `mint_variant`.
- **D-016**: existing `publish_and_share` entry stays for the single-asset Phase 2 mint flow. Collection Forge adds **new** entry functions `publish_collection(blob, ...)` (consumes the quilt Blob, shares Collection) and `mint_variant(&Collection, patch_id, ...)` (shares Model3D referencing the Collection). Phase 2's single-asset path is unchanged.
- **Phase 2 Walrus path**: `useWalrusUpload.uploadFiles(files: Uint8Array[], signer)` already handles multi-file quilt batching with 2 popups. Collection Forge passes N GLBs to this existing hook; consumer side reads `flow.listFiles()` for N `patchId`s (all sharing one `blobObject`) per the OQ-D2 source-code finding.
- **Phase 4 Kiosk separate**: Collection Forge does NOT integrate with Kiosk in v1. Phase 4 will retrofit if needed. Per OQ-013, shared Model3Ds (D-016) can't be retroactively placed in Kiosks — accepted tradeoff.

## Success criteria for the demo pair

By 6/21 submission:

1. **Forge demo**: end-to-end mint of a 16-variant car paint collection on Sui testnet, with 3-popup UX (2 Walrus + 1 Sui PTB calling `publish_collection` then 16× `mint_variant`), captured in a 30-sec screen recording.
2. **Browse demo**: marketplace shows the collection as a grouped card; clicking opens the collection page with 16 paint-variant thumbnails rendered from Walrus aggregator via patch_id.
3. **Buy demo**: second wallet purchases variant #7 (e.g., red metallic); receives soulbound Access; Tiny Racetrack loads variant #7's specific GLB (not variant #1, not any other).
4. **Tiny Racetrack demo**: 30-sec sequence — Bob picks his red metallic variant from the carousel, scene loads it on the oval track, Bob drives it (WASD), car responds correctly to input, collides with wall and stops.
5. **Combined pitch-video segment**: full 90-sec arc from mint → browse → buy → race, shot from two wallets.

If all 5 land: this becomes the centerpiece of the Walrus-track submission + demo video. The rest of the marketplace (existing Phase 2 single-asset mint) is the supporting cast.

## Out of scope (do not get pulled in)

- Polishing the existing Phase 2 single-asset mint flow beyond what already works
- Phase 4 Kiosk + TransferPolicy (separate phase, separate ADR pending OQ-013)
- Phase 4 royalty mechanics
- Improving the AnthropicRouter / TripoGenerator beyond Phase 2 capability
- Multi-network deploy (testnet only; mainnet is Phase 5 / D-009)

## Suggested next step

✅ All OQs resolved as of 2026-05-15 PM:

| OQ | Decision | Resolution date |
|---|---|---|
| OQ-D1 | Car (Tripo, 1 base + N paint variants via material swap) | 2026-05-15 |
| OQ-D2 | Path A dead; one quilt = one Sui Blob; need Move change | 2026-05-15 (SDK source) |
| OQ-D3 | Variant cap = 16 | 2026-05-15 |
| OQ-D4 | Texture + color (8 curated textures bundled) | 2026-05-15 |
| OQ-D5 | L2 driveable, strict scope lock — no opponents/timer/sound | 2026-05-15 |
| OQ-D6 | B.ii — Collection wrapper + N Model3D objects | 2026-05-15 |

✅ Deploy block (D-021) applied + dry-run verified.

**Ready for `/ce-plan`.** Origin: this doc. Depth: **Standard**. Target ~6-8 days build, inclusive of:
- Move contract change (new `Collection` struct + `publish_collection` + `mint_variant` entries) + redeploy
- Move test additions (collection-scoped tests, target ~10 new tests on top of existing 21)
- Backend `POST /api/collection/build` endpoint (material-swap via `@gltf-transform/core` + curated texture library)
- Frontend Collection Forge page (variant editor + preview + 3-popup mint flow)
- Frontend Browse marketplace adjustment (group by collection)
- Frontend Tiny Racetrack page (Babylon scene + Havok physics + WASD input + chase camera)
- E2E smoke test on testnet
