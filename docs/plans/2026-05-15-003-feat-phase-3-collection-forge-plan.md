---
title: "feat: Phase 3 Collection Forge + Tiny Racetrack"
type: feat
date: 2026-05-15
status: active
depth: standard
origin: docs/brainstorms/2026-05-15-collection-forge-requirements.md
related_decisions: [D-001, D-002, D-006, D-013, D-014, D-016, D-019, D-020, D-021]
new_decisions_required: [D-022 (@babylonjs/havok dependency)]
target_phase: 3
target_track: Walrus + Real-World Application
submission_deadline: 2026-06-21
estimated_days: 6-8
---

# feat: Phase 3 Collection Forge + Tiny Racetrack

## Summary

Add a creator-side **Collection Forge** (mint N paint-variants from 1 Tripo car GLB as a Walrus quilt + a single Sui PTB) and a buyer-side **Tiny Racetrack** (Babylon + Havok rigid-body driving demo on a bounded oval, loading owned car variants from Walrus). Replaces spec.md §6 Phase 3's "sample game scene" deliverable per D-020. Demonstrates the L1→Walrus→L3 economic loop in 90 seconds.

The Move contract gets a new `Collection` struct + 2 new entry functions; existing `publish_and_share` is unchanged. Testnet redeploy is mechanical per D-021. Phase 2 frontend (Browse, ModelDetail, Buy) is mostly reusable because OQ-D6 picked B.ii (Collection wrapper + N Model3D objects, each variant is its own NFT).

---

## Problem frame

Phase 2 ships a **1-asset-per-mint** flow. Real NFT collections (BAYC, Azuki, Pudgy Penguins) ship N variants of a base mesh with trait differences — that's the recognizable creator-economy product. Without a collection-minting surface, the demo story for the Walrus track is thin.

OQ-D2 source-code investigation killed the original assumption that `writeFilesFlow` returns N independent Sui Blob objects: a quilt is **one** `Blob` object with N internal byte-range patches. To mint N `Model3D` NFTs from one quilt, the Move contract needs to wrap the shared quilt in a `Collection` object and have each `Model3D` carry `(collection_id, patch_id)` instead of a `blob` field.

D-021 (Walrus subtree fix) makes testnet redeploy mechanical — the historical deploy block no longer applies.

---

## Scope boundaries

### In scope

- New Move structs: `Collection { id, blob: Blob, creator, name, slug, variant_count, created_at_ms }`; updated `Model3D` carries `collection_id: ID` + `patch_id: String` (replaces `blob: Blob`)
- New Move entries: `new_variant_spec(...)`, `publish_collection(blob, name, slug, license, clock, ctx) → Collection`, `mint_variant(&Collection, spec, params_json, name, tags, price, ...) → Model3D`, `share_collection(coll)`, `validate_collection_inputs(...)`
- Backend `POST /api/collection/build` — accepts `{ baseGlbBase64, variants: [{ baseColorRgb, textureId? }, ...] }`, returns N material-swapped GLBs as base64. JWT-gated for consistency with `/api/generate` prompt mode.
- `TEXTURE_LIBRARY` const in `shared/src/types.ts` (single source of truth) — 8 curated textures bundled as repo assets
- `useWalrusUpload` extension — surface `patchIds: string[]` from `flow.listFiles()` (currently dropped)
- Frontend `/forge` route — variant editor (color picker + texture dropdown + live preview), 3-popup mint flow, success screen
- Frontend `/collection/:slug` route — collection detail page showing N variant tiles loaded from Walrus aggregator via patchId
- Frontend Browse grid adjustment — group Model3D objects by collection_id; collection card replaces N variant cards in the grid
- Frontend `/track` route — Babylon scene + Havok rigid-body car + procedural oval track + chase camera + WASD input. Loads owned variant by patchId.
- Testnet redeploy with new contract version (drop `--dry-run`, capture real `MODEL3D_PACKAGE_ID`)
- Move tests: ~10 new (collection input validation, publish_collection + mint_variant flow, royalty/policy carryover)
- Frontend tests: ~15-20 new (Forge variant editor, MintButton 3-popup flow with collection PTB, Tracetrack scene smoke, collection grouping in Browse)
- Backend tests: ~5 new (material swap endpoint happy path + invalid variant spec + multi-material GLB defensive fallback)
- E2E two-wallet smoke on testnet (Wallet A mints, Wallet B buys + drives)

### Out of scope

- L2 Derivative (D-013 v1.1+ deferred — variants are L1 siblings, not derivatives)
- Mesh-level variation (only material slot swap in v1)
- Trait composition (BAYC-style 8 hats × 6 fur × 5 backgrounds)
- Generative texture from prompt
- Custom texture upload (user uploads to Walrus) — v1 uses curated library only
- Procedural-shape collections (sword/hammer/platform variants) — Forge backend accepts any GLB but UI only exposes Tripo prompt path in v1
- Phase 4 Kiosk + TransferPolicy (OQ-013, separate phase)
- Mainnet deploy (D-009, Phase 5)

### Deferred to follow-up work

- Multi-track / track selection in Tiny Racetrack
- Lap timer, leaderboard, opponent AI, multiplayer
- Engine SFX, collision SFX, music
- Wheel mesh separation + spin animation (cars stay as static meshes; arcade abstraction)
- Drift, jump, damage model, suspension
- First-person camera, instant replay
- Creator dashboard (`/forge/manage` — F5 in brainstorm; v1 if time permits, otherwise deferred)
- `React.lazy` code-splitting for `/track` (optional bundle-size optimization)

---

## Output structure

New files only. Existing frontend, backend, contracts stay in their existing trees.

```
contracts/model3d/sources/
├── model3d.move                       # modified — new structs + entries
└── tests/
    └── model3d_tests.move             # extended — ~10 new tests

backend/src/
├── routes/
│   ├── collection.ts                  # new — POST /api/collection/build
│   └── collection.test.ts             # new
└── lib/
    ├── gltf-material-swap.ts          # new — read/modify/write GLB material slots
    └── gltf-material-swap.test.ts     # new

backend/assets/textures/                # new — 8 curated PNG textures
├── matte.png
├── chrome.png
├── carbon-fiber.png
├── brushed-metal.png
├── gold.png
├── camo.png
├── gradient.png
└── wood-grain.png

shared/src/
└── types.ts                           # extended — TEXTURE_LIBRARY + CollectionMeta + VariantSpec types

frontend/src/
├── App.tsx                            # extended — 3 new routes
├── walrus/
│   └── useWalrusUpload.ts             # extended — surface patchIds[]
├── forge/                             # new directory
│   ├── ForgePage.tsx
│   ├── VariantEditor.tsx
│   ├── VariantPreview.tsx
│   ├── buildCollectionPtb.ts          # new PTB builder
│   ├── ForgePage.test.tsx
│   ├── VariantEditor.test.tsx
│   └── buildCollectionPtb.test.ts
├── collection/                        # new directory
│   ├── CollectionDetailPage.tsx
│   ├── useCollectionBySlug.ts
│   ├── CollectionDetailPage.test.tsx
│   └── useCollectionBySlug.test.ts
├── browse/
│   ├── BrowsePage.tsx                 # modified — group by collection_id
│   └── BrowsePage.test.tsx            # extended
└── track/                             # new directory
    ├── TrackPage.tsx
    ├── racetrackScene.ts              # Babylon + Havok scene setup
    ├── carCarousel.tsx                # owned-car picker
    ├── TrackPage.test.tsx
    └── racetrackScene.test.ts
```

Implementer may adjust the layout if implementation reveals a better one — per-unit `**Files:**` sections remain authoritative for what each unit creates.

---

## Requirements traceability

Origin: `docs/brainstorms/2026-05-15-collection-forge-requirements.md`. All R/A/F/AE IDs there are honored.

| Origin element | Plan element |
|---|---|
| A1 (Alice, creator) | U1 (Move entries enable mint), U3 (backend material-swap), U4 (Forge UI), U6 (testnet redeploy) |
| A2 (Bob, buyer) | U5 (Browse + collection detail), unchanged Phase 2 `purchase_model_access` |
| A3 (Bob, player) | U6 (Tiny Racetrack scene + owned-variant loader) |
| F1 (Forge mint) | U1, U3, U4 — 3-popup flow exactly as specified |
| F2 (Browse marketplace as collections) | U5 |
| F3 (Buy variant) | Unchanged Phase 2 flow — works because variants are sibling Model3D objects |
| F4 (Racetrack drive) | U6 |
| F5 (creator dashboard) | Deferred to follow-up work |
| AE1 (happy path car mint) | Test scenarios in U1, U3, U4, plus E2E in U7 |
| AE2 (browse as collections) | Test scenarios in U5, plus E2E in U7 |
| AE3 (buy variant) | E2E in U7 — purchase_model_access unchanged |
| AE4 (drive owned variant) | Test scenarios in U6, plus E2E in U7 |
| AE5 (variant count cap) | Test scenarios in U1 (Move-side cap) + U3 (backend cap) + U4 (UI cap) |
| OQ-D1=Car / OQ-D3=16 / OQ-D4=texture+color / OQ-D5=L2-locked / OQ-D6=B.ii | All carried forward verbatim into U1-U7 |

---

## Key technical decisions

### KTD-1 — Move PTB chain shape (pattern b, not pattern a)

`publish_collection` must return `Collection` **by value** (not share it internally). The PTB chains N `mint_variant(&Collection, ...)` calls consuming the chained `Result`, then a final `share_collection(coll)` consumes the value. Pattern matches existing `publishPtb.ts` LicenseTerms chaining.

The alternative — `publish_collection` shares internally, then N `mint_variant` calls reference `tx.object(collectionId)` — fails because the shared object ID is only known *after* PTB execution. PTB-time arg resolution requires the value or its derived `Result` handle.

### KTD-2 — Every Move struct entry param gets a constructor (D-016 pattern)

`mint_variant` takes a `VariantSpec` struct: `{ patch_id: String, params_json: String, name: String, tags: vector<String>, direct_access_price: u64 }`. Add `public fun new_variant_spec(...)` in the same module. Frontend constructs each spec via `tx.moveCall('model3d::new_variant_spec', ...)` and passes the `Result` as the arg.

Avoids the captured PTB struct-arg pitfall (`docs/solutions/integration-issues/sui-ptb-struct-arg-pitfall-2026-05-15.md`). Verification: `client.dryRunTransactionBlock(tx)` against deployed testnet — never `JSON.stringify(tx.getData())` assertions.

### KTD-3 — `useWalrusUpload` exposes `patchIds[]`

Current hook returns `{ blobIds, blobObjects }` where every element shares the same Sui Blob — misleading API surface that hasn't tripped Phase 2 because single-file uploads are degenerate. Forge needs the per-file `id` from `flow.listFiles()` (synthetic `encodeQuiltPatchId(quiltId, startIndex, endIndex)`). Extend `UploadResult` to add `patchIds: string[]` — ~5 LOC change. Existing test fixture at `frontend/src/walrus/useWalrusUpload.test.tsx:52-55` already mocks the right shape.

### KTD-4 — `@babylonjs/havok` is a new dependency requiring D-022 ADR

Babylon scenes today are static renders (no physics). Adding rigid-body car + collision walls needs `@babylonjs/havok` (Havok WASM binding) — install + Vite `?url` plumbing (mirror `walrus-wasm` pattern from `walrusClient.ts:6`). Per CLAUDE.md new-dependency rule, this needs a D-022 ADR before U6 starts. Plan-003 captures this as a risk + a dependency-on-decision item.

### KTD-5 — `TEXTURE_LIBRARY` single-source-of-truth in `shared/src/types.ts`

8 curated textures: `matte`, `chrome`, `carbon-fiber`, `brushed-metal`, `gold`, `camo`, `gradient`, `wood-grain`. Declare once in shared as `const TEXTURE_LIBRARY = [...] as const`; spread into zod enum for `/api/collection/build` request, into the Forge UI dropdown, and into any future Move event encoding for indexer searches. Same pattern as `paramRanges` from `docs/solutions/design-patterns/param-ranges-single-source-of-truth-2026-05-15.md`.

### KTD-6 — Backend transports GLBs as base64-in-JSON (consistent with Phase 2)

Existing `/api/generate` returns `glbBytes` as base64 string (`backend/src/routes/generate.ts:94`). New `POST /api/collection/build` follows the same shape: request `{ baseGlbBase64, variants: [{ baseColorRgb, textureId? }, ...] }`, response `{ variants: [{ glbBase64 }, ...] }`. No multipart/form-data anywhere. Encoding cost (~33% overhead) is acceptable for hackathon scope.

### KTD-7 — JWT-gate `/api/collection/build` for consistency

Material-swap itself is cheap (no upstream API cost), so gating isn't strictly required. But Forge UI requires login anyway (publish PTB needs a wallet), so JWT gating costs nothing UX-wise and matches the Phase 2 prompt-mode `/api/generate` pattern. Mirrors `docs/solutions/best-practices/cors-is-browser-only-cost-bearing-endpoints-need-server-auth-2026-05-15.md` recommendation.

### KTD-8 — Tripo-to-Forge plumbing: two backend calls, one Tripo cost

Forge UI calls `POST /api/generate` first (existing, returns base car GLB from Tripo prompt — 60-120 credits), then calls `POST /api/collection/build` with `{ baseGlbBase64, variants }` (new, material-swap only — zero upstream cost). N paint variants cost the same as 1 variant in Tripo terms.

### KTD-9 — Move `Model3D` struct shape changes from `blob: Blob` to `(collection_id: ID, patch_id: String)`

This is a **breaking change** to the existing Move struct shape. Phase 2's `publish_and_share` is preserved but its `Model3D` returns now also need `(collection_id, patch_id)` — Phase 2 single-asset mints become "degenerate collections" of 1 variant. Migration path: `publish_and_share` internally builds a degenerate `Collection { variant_count: 1 }` + `mint_variant`, returning the single Model3D. Existing Phase 2 frontend test fixtures need data shape updates (~5-10 frontend tests).

Alternative considered: keep two parallel `Model3D` types. Rejected — splits the indexer query, doubles browse/buy code paths, no real benefit.

---

## System-wide impact

| Surface | Change |
|---|---|
| Move public ABI | `Model3D` struct shape changes (breaking — `blob` field replaced by `collection_id` + `patch_id`). New `Collection` struct + 4 new entry functions. Phase 2's `publish_and_share` rewired to internally produce a degenerate Collection. |
| Sui object graph | New `Collection` shared object per mint. Existing Phase 2 mints (post-redeploy) carry `collection_id` pointing at their own degenerate Collection. |
| Walrus storage | First production use of multi-file quilt batching. Phase 2's single-file uploads continue to work (still 1 file = 1 patch = degenerate quilt). |
| Indexer / GraphQL queries | `Model3DSummary` adds `collection_id: string`, `patch_id: string` fields. Browse query groups by `collection_id`. Existing `useModelById` etc. work unchanged after data shape update. |
| Frontend bundle | Adds `@babylonjs/havok` (~500KB gzipped Havok WASM lazy-loadable). Optional `React.lazy` for `/track` route deferred to follow-up. |
| Frontend tests | Phase 2 fixtures need data shape updates for `(collection_id, patch_id)`. New tests for Forge, Collection detail, Track. |
| Frontend routes | `/`, `/generate`, `/model/:objectId` (existing) + `/forge`, `/collection/:slug`, `/track` (new). 6 routes total. |
| Backend bundle | Adds `backend/assets/textures/*.png` (8 files, ~50KB each). No new npm dependencies. |
| `MODEL3D_PACKAGE_ID` env var | New value after redeploy. Phase 2 frontend `.env` + any docs need refresh. |

---

## Risks & dependencies

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `@babylonjs/havok` integration burns more than 1 day (no prior repo work). WASM loading, body-mesh attachment, input loop, chase camera — each could surface gotchas. | High | Day-slip on U6 | Pre-dispatch reading at ce-work time per `docs/solutions/conventions/subagent-dispatch-tight-reads-inline-skeletons-2026-05-15.md`. Inline Babylon+Havok scene skeleton with explicit TODOs before dispatching U6. Time-box at 4 days; if exceeded, descope to L1 inspect-only Trophy Hall pattern. |
| R2 | `@gltf-transform/core` material-swap breaks on multi-material Tripo GLBs (Tripo usually returns single-material but some prompts produce multi-material). | Medium | Variants render wrong material | Defensive code: iterate `doc.getRoot().listMaterials()`, swap on the first material with non-null `baseColorTexture` slot; log warning + skip other materials. Test scenario in U3 covers multi-material defensive path. |
| R3 | Move struct shape change (`blob` → `collection_id + patch_id`) breaks Phase 2 frontend fixtures and tests in non-obvious ways. | Medium | Phase 2 test regression | U1's test additions include a "degenerate Collection of 1 variant" path test. U2 (redeploy) runs full Phase 2 e2e against new contract before merging. Frontend fixture updates fan out from `frontend/src/__fixtures__/` if it exists, or per-test inline. |
| R4 | PTB with 17 object-creations (1 Collection + 16 Model3D) hits Sui per-PTB gas/op limits. | Low | Variant cap forced below 16 | Sui per-PTB limit is ~1024 operations; 17 is well under. Verified with `dryRunTransactionBlock` in U4 test. If it ever surfaces, drop cap to 12. |
| R5 | Tripo prompt for "futuristic racing car" returns weird/unusable mesh. | Low | Forge demo looks bad | Manual seed: generate 3-5 candidate base cars during U4 development, pick the best for demo recording. Tripo cost: ~300 credits — budget allows. |
| R6 | Subagent dispatch during ce-work execution burns context on broad reads (per the captured learning). | Medium | Wasted iterations | All U1-U7 subagent prompts must follow the tight-reads-inline-skeletons pattern. Plan units carry the file lists each unit's implementer should read; ce-work orchestrator copies them into dispatch prompts. |
| R7 | **(P0, surfaced by doc-review F2 2026-05-16)** Phase 2's `frontend/src/walrus/useWalrusUpload.ts` has a latent wiring bug: assigns the synthetic quilt-patch ID (from `flow.listFiles()[i].id`) to `blobObjectId`, but the real Sui Blob object ID is `f.blobObject.id`. Phase 2 never deployed, so this hasn't surfaced — but on first real PTB execution, `tx.object(input.blobObjectId)` will reject with "unknown object". | Certain | Blocks U2 e2e smoke + every Phase 2/3 mint | U2 must include an audit-and-fix sub-step: change `blobObjectId: f.id` → `blobObjectId: f.blobObject.id` (verify exact field name against `@mysten/walrus@1.1.7` SDK source — see `node_modules/.pnpm/@mysten+walrus@1.1.7_*/dist/flows/write-files.mjs:39-50`). Add regression test asserting `result.blobObjects[0].blobObjectId` is a 0x-prefixed 32-byte hex string, not a base64-encoded quilt-patch ID. Surface `patchIds[]` from `f.id` as a separate array per KTD-3. |
| R8 | **(P0, surfaced by doc-review ADV-1 2026-05-16)** KTD-1's PTB chain pattern (publish_collection returns Collection by value → N mint_variant borrows `&Collection` → share_collection consumes by value) may trip Sui's borrow checker. The cited `publishPtb.ts` LicenseTerms precedent is structurally different — LicenseTerms is consumed once, not borrowed N times then consumed. | Medium | Move ABI redesign mid-U4; second testnet redeploy | **Pre-U1 spike (30 min):** write a minimal Move + PTB integration test reproducing the exact shape against a localnet or testnet fork. Use `dryRunTransactionBlock` against deployed contract. If pattern fails, fallback (b): have `mint_variant` take Collection by value and return it (threading pattern), with `share_collection` at the end. Sketch BOTH shapes in U1 design before committing to the public ABI. |
| R9 | **(P0, surfaced by doc-review ADV-2/D-006/F4 2026-05-16)** Walrus aggregator URL convention for quilt-patch retrieval was filed as "deferred to implementation" but is load-bearing — affects which pages need the Walrus WASM (Browse + Track may need full WalrusClient, not just aggregator HTTP). Fallback ("download whole 16MB quilt + slice") makes /track car-load take 30s+. | Medium | /track car-load too slow for demo; bundle bloat if WalrusClient required on read-only routes | **Pre-U1 spike (30 min):** curl tests against testnet aggregator with `/v1/blobs/<quiltBlobId>?patch_id=<urlSafePatchId>` + check `@mysten/walrus` SDK examples for canonical browser-fetch-by-patch shape. Three outcomes: (a) aggregator HTTP supports patch query → cheap path, (b) only `client.getFiles({ ids })` works → Browse/Track need WalrusClient instantiated (add to U5/U6 Files), (c) neither → architecture change (per-variant blobs over single quilt, or HTTP Range requests). Pin the answer + update U5/U6 before they start. |

### Dependencies

| Dep | Status | Notes |
|---|---|---|
| D-021 (Walrus subtree fix) | ✅ Applied | `contracts/model3d/Move.toml` updated 2026-05-15 PM; `sui client publish --dry-run` succeeded. Real publish in U2. |
| D-022 (@babylonjs/havok dependency) | 🟡 Pending capture before U6 starts | Plan-003 surfaces it; user to approve + write ADR before U6 dispatch. ~5 min ADR write. |
| `@gltf-transform/core@^4.1.0` | ✅ Already in `backend/package.json` | No version bump needed for material API. |
| `@mysten/walrus@1.1.7` | ✅ Already in frontend | `flow.listFiles()` shape verified by OQ-D2 source-code read. |
| `@mysten/sui@2.16.2` | ✅ Already in frontend + backend | All new Sui client instantiations use `SuiJsonRpcClient` from `@mysten/sui/jsonRpc` per D-019. |
| `react-router-dom@7.5.0` | ✅ Already in frontend | New routes are sibling additions to existing 3-route shell. |
| Tripo free-tier budget | ✅ Headroom | 1500-1800 credits May-Aug; collection mint costs ~60-120 credits per base car. |

### Pre-flight spikes (run BEFORE U1 dispatches)

Three 30-minute spikes block U1 because they each could force ABI redesign. Total: ~1.5 hours.

1. **Spike-A — useWalrusUpload `blobObjectId` wiring audit (R7).** Verify the SDK return shape. Patch `useWalrusUpload.ts:104-107` if needed. Add regression test. **Output:** PASS / FAIL + patched code.
2. **Spike-B — PTB chain shape integration test (R8).** Build a minimal `publish_collection → 3× mint_variant → share_collection` PTB against a localnet fork or testnet (current contract version is fine — just exercise the borrow-then-consume shape, no Move changes needed). Use `dryRunTransactionBlock`. **Output:** PASS = U1 uses pattern (b) value-by-reference; FAIL = U1 uses threading pattern (Collection passed by value, returned).
3. **Spike-C — Walrus aggregator quilt-patch URL convention (R9).** curl tests against testnet aggregator + SDK example check. **Output:** (a) HTTP patch query → cheap; (b) SDK getFiles required → update U5/U6 Files to include WalrusClient setup; (c) neither → architecture change.

Each spike has explicit observable output that affects U1+. Roll the results into the plan via inline edits to U1/U2/U5/U6 before dispatching.

---

## Implementation units

7 units, dependency-ordered. U2 depends on U1; U3-U6 develop in parallel after U2; U7 integrates everything for the demo.

### U1. Move contract — Collection struct + new entries + tests

**Goal:** Add `Collection` Sui object wrapping the Walrus quilt Blob. Add `new_variant_spec`, `publish_collection`, `mint_variant`, `share_collection`, `validate_collection_inputs` entries. Rewire `publish_and_share` to internally produce a degenerate Collection (preserves Phase 2 ABI semantics under the new struct shape).

**Requirements:** F1 (Forge mint flow Sui side), AE1 (16-variant car mint), AE5 (variant cap enforcement), OQ-D6 (B.ii Collection wrapper architecture).

**Dependencies:** None (foundation).

**Execution note:** Do not start coding until **Spike-B (PTB chain shape)** completes. If Spike-B failed, the `mint_variant` signature changes from `(coll: &Collection, ...)` to `(coll: Collection, ...) → Collection` (threading pattern) — different ABI than the directional sketch below.

**Files:**
- `contracts/model3d/sources/model3d.move` — modify (new structs + entries; rewire `publish_and_share`)
- `contracts/model3d/sources/tests/model3d_tests.move` — extend (~11 new tests)

**Approach:**

```move
// Directional sketch — not implementation specification

public struct Collection has key, store {
    id: UID,
    blob: Blob,                 // shared quilt
    creator: address,
    name: String,
    slug: String,               // url-safe identifier
    variant_count: u32,
    created_at_ms: u64,
}

public struct VariantSpec has store, drop {
    patch_id: String,
    params_json: String,
    name: String,
    tags: vector<String>,
    direct_access_price: u64,
}

public struct Model3D has key, store {
    id: UID,
    collection_id: ID,          // ← replaces `blob: Blob`
    patch_id: String,           // ← quilt patch identifier
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

public fun new_variant_spec(
    patch_id: String, params_json: String, name: String,
    tags: vector<String>, direct_access_price: u64,
): VariantSpec { ... }

public fun publish_collection(
    blob: Blob, name: String, slug: String, license: LicenseTerms,
    clock: &Clock, ctx: &mut TxContext,
): Collection { ... }

public fun mint_variant(
    coll: &Collection, spec: VariantSpec, lineage_blob_id: String,
    is_encrypted: bool, clock: &Clock, ctx: &mut TxContext,
): Model3D {
    // (P1, F7) Authorization: only the collection's creator may add variants.
    assert!(coll.creator == ctx.sender(), ENotCollectionCreator);
    // ... existing field assignments ...
}

public fun share_collection(coll: Collection) {
    transfer::share_object(coll);
}

// Phase 2 ABI preserved via degenerate-of-1
public fun publish_and_share(
    blob: Blob, shape_type: String, params_json: String, name: String,
    tags: vector<String>, lineage_blob_id: String, direct_access_price: u64,
    is_encrypted: bool, license: LicenseTerms,
    clock: &Clock, ctx: &mut TxContext,
) {
    let coll = publish_collection(blob, copy name, ..., license, clock, ctx);
    let spec = new_variant_spec(
        b"".to_string(),  // empty patch_id for degenerate-of-1 (the whole blob)
        params_json, name, tags, direct_access_price,
    );
    let model = mint_variant(&coll, spec, lineage_blob_id, is_encrypted, clock, ctx);
    transfer::share_object(model);
    share_collection(coll);
}
```

**Patterns to follow:**
- Existing `validate_publish_inputs` ladder (`contracts/model3d/sources/model3d.move:139-157`) — mirror the assertion structure for `validate_collection_inputs` (slug length, variant_count cap, etc.)
- Existing test scaffold using `sui::test_scenario` (alias `ts`) — see `contracts/model3d/sources/tests/model3d_tests.move:216-251`
- Existing `mint_blob` test helper (`tests/model3d_tests.move:75-90`) using `walrus::system::new_for_testing`
- Existing `new_model_for_testing` + `destroy_model_for_testing` pattern — add `destroy_collection_for_testing` symmetrically

**Test scenarios:**

- Covers AE1, AE5. `validate_collection_inputs_rejects_empty_slug` — empty string slug aborts with `EBlobIdMalformed` or new `ESlugMalformed` const.
- `validate_collection_inputs_rejects_variant_count_zero` — variant_count = 0 aborts.
- `validate_collection_inputs_rejects_variant_count_17` — variant_count = 17 aborts with `ETooManyVariants` (new const, cap = 16).
- `validate_collection_inputs_accepts_variant_count_16` — boundary happy case.
- `validate_collection_inputs_rejects_slug_too_long` — slug > 64 chars aborts.
- `publish_collection_happy_path_sets_creator_and_fields` — creator address matches sender, name/slug/variant_count fields populated.
- `mint_variant_creates_model3d_referencing_collection` — Model3D.collection_id matches Collection.id, patch_id stored verbatim.
- `mint_variant_carries_per_variant_pricing` — different variants on same collection can have different direct_access_price.
- `publish_collection_then_3_variants_then_share_collection` — full PTB-shape integration test mimicking Phase 3 mint flow; verifies all objects created + shared.
- `publish_and_share_phase2_compatibility` — calling existing `publish_and_share` produces 1 Collection + 1 Model3D (degenerate). Model3D fields match Phase 2 expectations.
- (Replaces incoherent test from earlier draft.) `mint_variant_rejects_non_creator_sender` — wallet A publishes Collection; wallet B (different sender) calls `mint_variant(&coll, ...)`. Aborts with `ENotCollectionCreator` (per F7 authorization fix). Critical for the "single-creator collection" invariant the brainstorm assumes.
- `params_json_max_length_for_mint_variant_is_1024` — VariantSpec with `params_json` of 1025 chars aborts (per SEC-004 — XSS surface reduction; lowered from the 4096 used by Phase 2's `validate_publish_inputs` since material-swap doesn't need the larger budget).
- `validate_collection_inputs_royalty_carryover` — license.derivative_royalty_bps copied into Collection; each Model3D inherits same license.

**Verification:** All 31 Move tests pass (21 existing + ~10 new). `sui move build` clean. `sui move test` exits 0.

---

### U2. Testnet redeploy + env var refresh + Phase 2 regression smoke

**Goal:** Publish the new contract version to testnet (drops `--dry-run`, captures real `MODEL3D_PACKAGE_ID`). Update `frontend/.env` + `backend/.env`. Run Phase 2 e2e smoke against the new contract to confirm `publish_and_share` Phase 2 compatibility actually works.

**Requirements:** All Phase 3 work depends on this — frontend PTB builders need the real package ID.

**Dependencies:** U1.

**Files:**
- `contracts/model3d/Move.toml` — no change (D-021 fix already applied)
- `frontend/.env.example` + frontend developer's local `.env` — new `VITE_MODEL3D_PACKAGE_ID`
- `backend/.env.example` + backend developer's local `.env` — same
- `README.md` — refresh deploy section if any references current package id

**Approach:**

**Step 0 — required prerequisite (per R7 / Spike-A):** apply the `useWalrusUpload.ts` wiring fix. Current code at `frontend/src/walrus/useWalrusUpload.ts:104-107` does `blobObjectId: f.id` where `f.id` is the SDK's synthetic quilt-patch ID, not the Sui Blob object id. Verify the correct field name (likely `f.blobObject.id`) against `@mysten/walrus@1.1.7`'s `dist/flows/write-files.mjs:39-50`. Apply the fix + add a regression test asserting `result.blobObjects[0].blobObjectId` matches `/^0x[0-9a-f]{64}$/` (a real Sui object id), not a base64 quilt-patch string. Also surface the synthetic ids as a new `patchIds: string[]` field per KTD-3. Without this fix, U2's e2e smoke + every Phase 2/3 mint will fail at `tx.object(input.blobObjectId)`.

**Step 1 — publish.** `cd contracts/model3d && sui client publish --gas-budget 200000000` (drop `--dry-run` from the verified command).
**Step 2 — record.** Capture the returned `PackageID:` from "Published Objects" section + `UpgradeCap` ObjectID.
**Step 3 — env update.** Update `VITE_MODEL3D_PACKAGE_ID` across frontend + backend `.env` files.
**Step 4 — Phase 2 smoke.** Boot full stack locally; run existing Phase 2 happy-path manual smoke (mint a sword via existing `/generate` UI, browse it, buy from second wallet, verify Access NFT in Sui Explorer).
**Step 5 — failure handling.** If Phase 2 smoke fails: `publish_and_share`'s degenerate-Collection rewire is buggy → back to U1. If Step 0 wasn't applied or didn't take, mints fail at PTB step with "object not found" — re-check the useWalrusUpload fix.

**Patterns to follow:**
- D-021 deploy verification pattern (already verified once via `--dry-run`)
- Existing `MODEL3D_PACKAGE_ID` consumption in `frontend/src/sui/publishPtb.ts` + `frontend/src/sui/purchaseAccessPtb.ts` (read via `import.meta.env`)

**Execution note:** Real testnet deploy is a one-shot — get U1 fully tested before running U2. Avoid burning 2 redeploys on the same iteration.

**Test scenarios:**
- Test expectation: none — this is an operational unit, not a feature unit. Verification is the Phase 2 smoke (existing tests + manual e2e).

**Verification:** New `MODEL3D_PACKAGE_ID` recorded. Phase 2 single-asset mint flow still works end-to-end against the new contract (manual e2e + existing Phase 2 frontend/backend tests still green).

---

### U3. Backend material-swap endpoint + `TEXTURE_LIBRARY` shared module

**Goal:** Implement `POST /api/collection/build`. Accept base GLB + N variant specs; for each variant, swap baseColor + (optional) baseColorTexture in the GLB material slot via `@gltf-transform/core`; return N modified GLBs as base64. Add `TEXTURE_LIBRARY` const to `shared/src/types.ts` and 8 PNG assets to `backend/assets/textures/`.

**Requirements:** F1 (Forge mint flow — backend material swap step), AE1 (16-variant mint), AE5 (variant cap), KTD-5 (texture library single-source), KTD-6 (base64 transport), KTD-7 (JWT-gated).

**Dependencies:** U2 (env vars stable so backend can boot cleanly).

**Files:**
- `shared/src/types.ts` — extend (add `TEXTURE_LIBRARY`, `CollectionMeta`, `VariantSpec` types)
- `backend/src/routes/collection.ts` — new
- `backend/src/routes/collection.test.ts` — new
- `backend/src/lib/gltf-material-swap.ts` — new (pure function: `swapMaterial(glb: Uint8Array, spec: VariantMaterialSpec) → Uint8Array`)
- `backend/src/lib/gltf-material-swap.test.ts` — new
- `backend/src/lib/schema.ts` — extend (add `collectionBuildRequestSchema`)
- `backend/src/app.ts` — modify (mount `/api/collection` route)
- `backend/assets/textures/*.png` — 8 new files (curated stock textures, ~50KB each)

**Approach:**

```typescript
// shared/src/types.ts — directional sketch
export const TEXTURE_LIBRARY = [
  'matte', 'chrome', 'carbon-fiber', 'brushed-metal',
  'gold', 'camo', 'gradient', 'wood-grain',
] as const;
export type TextureId = typeof TEXTURE_LIBRARY[number];

export interface VariantMaterialSpec {
  baseColorRgb: [number, number, number, number]; // 0-1
  textureId?: TextureId;
}

// backend/src/lib/gltf-material-swap.ts — directional sketch
import { Document, NodeIO } from '@gltf-transform/core';

export async function swapMaterial(
  baseGlb: Uint8Array,
  spec: VariantMaterialSpec,
  textureLoader: (id: TextureId) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const io = new NodeIO();
  const doc = await io.readBinary(baseGlb);
  const materials = doc.getRoot().listMaterials();
  if (materials.length === 0) throw new Error('no_material_in_base_glb');
  const target = materials[0]; // defensive: first material only; log if >1
  target.setBaseColorFactor(spec.baseColorRgb);
  if (spec.textureId) {
    const pngBytes = await textureLoader(spec.textureId);
    const tex = doc.createTexture().setImage(pngBytes).setMimeType('image/png');
    target.setBaseColorTexture(tex);
  }
  return await io.writeBinary(doc);
}

// backend/src/routes/collection.ts — directional sketch
// (SEC-001 mitigation) Body-size cap BEFORE JSON parse. 12MB headroom for 8MB GLB base64-encoded.
app.use('/build', bodyLimit({ maxSize: 12 * 1024 * 1024 }));
app.post('/build', async (c) => {
  const auth = c.req.header('Authorization');
  // ... JWT gate per Phase 2 pattern ...
  const body = await c.req.json();
  const parsed = collectionBuildRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid_params', issues: parsed.error.issues }, 400);
  const { baseGlbBase64, variants } = parsed.data;
  if (variants.length > 16) return c.json({ error: 'too_many_variants' }, 400);
  if (variants.length < 1) return c.json({ error: 'too_few_variants' }, 400);
  const baseGlb = Uint8Array.from(Buffer.from(baseGlbBase64, 'base64'));
  const swapped = await Promise.all(variants.map((v) => swapMaterial(baseGlb, v, loadTexture)));
  return c.json({ variants: swapped.map((g) => ({ glbBase64: Buffer.from(g).toString('base64') })) });
});

// shared/src/types.ts schema additions — directional sketch
// (SEC-001 + SEC-004) Hard caps + JSON.parse validation on user-supplied fields.
export const collectionBuildRequestSchema = z.object({
  baseGlbBase64: z.string().min(1).max(11_000_000), // ~8MB GLB binary → ~10.7MB base64
  variants: z.array(z.object({
    baseColorRgb: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    textureId: z.enum(TEXTURE_LIBRARY).optional(),
    paramsJson: z.string().max(1024).refine(
      (s) => { try { JSON.parse(s); return true; } catch { return false; } },
      { message: 'params_json must be valid JSON ≤ 1024 bytes' },
    ),
  })).min(1).max(16),
});

// backend/src/lib/gltf-material-swap.ts — defensive texture loader (SEC-002)
const TEXTURES_DIR = path.resolve(__dirname, '../../assets/textures');
function loadTexture(id: TextureId): Promise<Uint8Array> {
  const candidate = path.join(TEXTURES_DIR, `${id}.png`);
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(TEXTURES_DIR + path.sep)) {
    throw new Error('texture_path_escape'); // defense-in-depth even though Zod enum guards id
  }
  return fs.promises.readFile(resolved);
}
```

**Patterns to follow:**
- Hono route module pattern from `backend/src/routes/generate.ts` (`buildXxxRoute(deps) => Hono`)
- Zod validation pattern from `backend/src/routes/generate.ts:26-32` — `safeParse` → 400 with `error` + `issues`
- JWT gate pattern from existing `/api/generate` prompt mode (auth ladder)
- `paramRanges` single-source-of-truth pattern from `shared/src/types.ts:20-59` (`as const` + spread into zod)
- `@gltf-transform/core` API: see official docs https://gltf-transform.dev/classes/core.material.html for `setBaseColorFactor` + `setBaseColorTexture`. The existing `backend/src/lib/glb.ts` uses creation API; this unit needs the read+modify+write API which is different but in the same package.

**Test scenarios:**
- Covers AE1. `swapMaterial_happy_path_swaps_baseColor` — input GLB has one material with baseColor [1,1,1,1]; spec sets to [1,0,0,1]; output GLB's first material reads [1,0,0,1].
- `swapMaterial_adds_texture_when_provided` — spec includes textureId; output material has baseColorTexture populated.
- `swapMaterial_preserves_mesh_topology` — vertex count + index count unchanged between input + output.
- `swapMaterial_throws_on_no_material` — input GLB without any materials throws `no_material_in_base_glb`.
- `swapMaterial_uses_first_material_when_multiple` — multi-material GLB swaps only the first; others unchanged (defensive R2 mitigation).
- Covers AE5. `build_endpoint_rejects_17_variants` — POST with 17 specs returns 400 `too_many_variants`.
- `build_endpoint_rejects_0_variants` — POST with empty array returns 400 `too_few_variants`.
- `build_endpoint_rejects_invalid_baseColorRgb` — RGB array of length 3 (missing alpha) returns 400.
- `build_endpoint_rejects_unknown_textureId` — textureId not in `TEXTURE_LIBRARY` returns 400.
- `build_endpoint_requires_jwt` — request without Authorization header returns 401.
- `build_endpoint_happy_path_3_variants` — POST with 3 valid variants returns 3 base64 GLBs; each decodes to a valid GLB header.
- (SEC-001) `build_endpoint_rejects_oversized_base_glb` — POST with `baseGlbBase64` longer than 11MB returns 413 from bodyLimit middleware OR 400 from Zod max — either is acceptable; assert the request is rejected before `@gltf-transform/core` is invoked (so the OOM vector is closed).
- (SEC-004) `build_endpoint_rejects_oversized_params_json` — variant with `paramsJson` longer than 1024 bytes returns 400.
- (SEC-004) `build_endpoint_rejects_invalid_json_params_json` — variant with `paramsJson` that is not valid JSON returns 400.
- (SEC-002) `texture_loader_rejects_path_escape` — internal unit test: calling `loadTexture` with a value that would `path.join` outside `TEXTURES_DIR` throws `texture_path_escape`. Defense-in-depth test even though Zod enum guards external entry.

**Verification:** Backend tests pass (~5-6 new). Live smoke: `curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer <jwt>" --data @fixtures/collection-build-request.json http://localhost:3001/api/collection/build` returns valid JSON with N base64 GLBs.

---

### U4. Frontend Collection Forge page + `useWalrusUpload` extension + PTB builder

**Goal:** Implement `/forge` route. Variant editor (color picker + texture dropdown per row, 1-16 variants), live mini-preview rendered with chosen material per variant, 3-popup mint flow (build endpoint → Walrus quilt upload → Sui PTB calling `publish_collection` + N×`mint_variant` + `share_collection`). Extend `useWalrusUpload` to surface per-file `patchIds`.

**Requirements:** F1 (Forge mint flow), AE1 (16-variant happy path), AE5 (variant cap UI enforcement), KTD-1 (PTB chain pattern b), KTD-2 (struct constructor pattern), KTD-3 (patchIds surfaced).

**Dependencies:** U2 (real `MODEL3D_PACKAGE_ID`), U3 (build endpoint live).

**Files:**
- `frontend/src/walrus/useWalrusUpload.ts` — modify (add `patchIds: string[]` to `UploadResult`)
- `frontend/src/walrus/useWalrusUpload.test.tsx` — extend (assert `patchIds` length matches input files length)
- `frontend/src/App.tsx` — modify (add `/forge` route)
- `frontend/src/forge/ForgePage.tsx` — new
- `frontend/src/forge/VariantEditor.tsx` — new (per-row controls)
- `frontend/src/forge/VariantPreview.tsx` — new (Babylon mini-scene per variant)
- `frontend/src/forge/buildCollectionPtb.ts` — new
- `frontend/src/forge/ForgePage.test.tsx` — new
- `frontend/src/forge/VariantEditor.test.tsx` — new
- `frontend/src/forge/buildCollectionPtb.test.ts` — new

**Approach:**

```typescript
// frontend/src/forge/buildCollectionPtb.ts — directional sketch
import { Transaction } from '@mysten/sui/transactions';

export function buildCollectionPtb(input: {
  packageId: string;
  quiltBlobObjectId: string;     // the single Sui Blob from useWalrusUpload
  collectionName: string;
  collectionSlug: string;
  license: { policy, derivative_mint_fee, derivative_royalty_bps, commercial_use, require_attribution };
  variants: Array<{
    patchId: string;
    paramsJson: string;
    name: string;
    tags: string[];
    priceMist: bigint;
    lineageBlobId: string;
  }>;
  clockObjectId: '0x6';
}): Transaction {
  const tx = new Transaction();

  // 1. Construct LicenseTerms via constructor (KTD-2 pattern)
  const licenseResult = tx.moveCall({
    target: `${input.packageId}::model3d::new_license_terms`,
    arguments: [/* license fields as pure args */],
  });

  // 2. Call publish_collection — returns Collection by value (KTD-1 pattern b)
  const collectionResult = tx.moveCall({
    target: `${input.packageId}::model3d::publish_collection`,
    arguments: [
      tx.object(input.quiltBlobObjectId),
      tx.pure.string(input.collectionName),
      tx.pure.string(input.collectionSlug),
      licenseResult,
      tx.object(input.clockObjectId),
    ],
  });

  // 3. For each variant: construct VariantSpec + call mint_variant + share returned Model3D
  for (const v of input.variants) {
    const specResult = tx.moveCall({
      target: `${input.packageId}::model3d::new_variant_spec`,
      arguments: [
        tx.pure.string(v.patchId),
        tx.pure.string(v.paramsJson),
        tx.pure.string(v.name),
        tx.pure.vector('string', v.tags),
        tx.pure.u64(v.priceMist),
      ],
    });
    const modelResult = tx.moveCall({
      target: `${input.packageId}::model3d::mint_variant`,
      arguments: [
        collectionResult,
        specResult,
        tx.pure.string(v.lineageBlobId),
        tx.pure.bool(false), // is_encrypted = false
        tx.object(input.clockObjectId),
      ],
    });
    tx.moveCall({
      target: `0x2::transfer::public_share_object`,
      typeArguments: [`${input.packageId}::model3d::Model3D`],
      arguments: [modelResult],
    });
  }

  // 4. Final: share_collection consumes Collection by value
  tx.moveCall({
    target: `${input.packageId}::model3d::share_collection`,
    arguments: [collectionResult],
  });

  return tx;
}
```

**Patterns to follow:**
- Existing `frontend/src/sui/publishPtb.ts` lines 63-87 — `LicenseTerms` Result chaining pattern. Directly applicable.
- Existing `useWalrusUpload.ts` state pattern (status + stage + error) — Forge MintButton reuses it.
- Existing `frontend/src/creator/MintButton.tsx` — labels driven by uploadStage. Update copy to say "Sign 3 transactions to publish your collection (16 variants)" — popup count is 3 regardless of N variants per the captured Walrus quilt-batching pattern.
- React Router `<Link to="/collection/...">` pattern from existing Browse page.
- Babylon scene setup pattern from existing `frontend/src/preview/PreviewScene.tsx` (or wherever Phase 2 renders mini-previews) — but VariantPreview should be lighter weight (16 mini-scenes = render carefully).

**Test scenarios:**
- Covers AE1. `ForgePage_happy_path_mints_16_variants` — full integration: user enters prompt, base GLB returned (mock /api/generate), user picks 16 variant specs, clicks Mint, mock returns 16 swapped GLBs, mock Walrus upload returns 16 patchIds + 1 blobObjectId, mock signAndExecute confirms PTB. UI shows success screen.
- `VariantEditor_enforces_variant_count_cap_16` — clicking "+" 17 times caps slider at 16.
- `VariantEditor_color_picker_updates_preview_within_300ms` — debounced preview re-render.
- `VariantEditor_texture_dropdown_options_match_TEXTURE_LIBRARY` — dropdown shows exactly 8 options (no hard-coded list — sourced from `shared/src/types.ts`).
- `buildCollectionPtb_chains_license_then_collection_then_N_variants_then_share` — assert PTB transaction shape via `tx.getData()` inspection has correct moveCall sequence + Result references (NOT via JSON string match — use the `dryRunTransactionBlock` against mock SuiClient).
- `buildCollectionPtb_uses_struct_constructor_for_VariantSpec` — assert no `tx.pure.vector('u8', ...)` for any VariantSpec arg (anti-regression for PTB struct-arg pitfall).
- `useWalrusUpload_surfaces_patchIds_for_3_files` — mocked `flow.listFiles()` returns 3 entries with synthetic patchIds; `result.patchIds` has length 3 + matches mock data; all `result.blobObjects` reference the same `blobObjectId`.
- `useWalrusUpload_existing_tests_unchanged` — Phase 2's 1-file degenerate case still returns `patchIds: [string]` of length 1.
- `MintButton_copy_says_sign_3_transactions_for_collection_mode` — assert UI string when `mode='collection'` regardless of variant count.

**Execution note:** Test-first for `buildCollectionPtb` — write the failing assertion test for the chain shape BEFORE implementing the builder. PTB shape is the highest-risk technical decision in this unit per KTD-1.

**Interaction-state spec** (per doc-review D-001 + D-002 + D-003 + D-004):

- **Base-car generation wait state (D-002):** while `POST /api/generate` is in-flight (60-120s typical Tripo latency), show a spinner with copy "Generating your base car via Tripo… ~60 sec". Variant editor rows are hidden during this state, not greyed-out.
- **Variant preview empty state (D-003):** before the base GLB resolves, each variant row's preview slot shows a gray placeholder (CSS, not a Babylon canvas) — no idle WebGL contexts. After the GLB loads, all 16 previews use a single shared Babylon scene with thumbnail snapshots (offscreen render → ImageBitmap → DOM img) rather than 16 live canvases. Re-snapshot only the currently-focused variant on edit; debounce 300ms. (Resolves SG-003 + ADV-6 WebGL-context-cap hazard.)
- **Mint flow popup error states (D-001):** the MintButton already exposes `uploadStage` from `useWalrusUpload` (Phase 2 P1 polish). Extend the label switch to handle each rejection:
  - `awaiting-register` rejected → "Step 1 failed — Walrus upload canceled. Click to retry." (no Walrus cost incurred yet)
  - `awaiting-certify` rejected → "Step 2 failed — Walrus storage was paid for but not committed. Click to retry certify." Pass the existing `resume` token to `writeFilesFlow` instead of re-encoding.
  - Sui PTB rejected → "Step 3 failed — Sui transaction not submitted. Walrus quilt is already uploaded; click to retry PTB only." Cache the quilt's `blobObjectId` + `patchIds[]` in component state across the PTB retry. Do NOT re-trigger the Walrus flow.

**Per-variant pricing toggle (D-005):** UI defaults to "same price for all". Toggle ON expands per-row price inputs, each pre-populated with the global price value. Toggle OFF resets all rows to the (current) global price input — discards any per-row edits. State shape: `{ globalPrice: bigint, perVariantPrices: Record<number, bigint> | null }` (null = global only). On toggle OFF, `perVariantPrices` is set to null. On Mint, use `perVariantPrices?.[i] ?? globalPrice` for each variant's `directAccessPrice`.

**Verification:** Frontend tests pass (~12-15 new across the forge/ folder + useWalrusUpload extension). Live UX smoke: load `/forge`, enter prompt → preview shows base car → pick 16 variants → Mint → 3 wallet popups fire in correct sequence → Sui Explorer shows Collection + 16 Model3D objects shared.

---

### U5. Browse marketplace adjustment + Collection detail page

**Goal:** Group Browse grid by `collection_id` — N variants of one collection appear as a single collection card (showing N variant count + first variant's thumbnail). Click collection card → `/collection/:slug` shows full 16 variant tiles, each loaded from Walrus aggregator via its specific patchId.

**Requirements:** F2 (Browse marketplace as collections), AE2 (browse happy path).

**Dependencies:** U4 (real collection mints exist to query, or mock data).

**Files:**
- `frontend/src/App.tsx` — modify (add `/collection/:slug` route)
- `frontend/src/browse/BrowsePage.tsx` — modify (group + render collection cards)
- `frontend/src/browse/BrowsePage.test.tsx` — extend
- `frontend/src/collection/CollectionDetailPage.tsx` — new
- `frontend/src/collection/useCollectionBySlug.ts` — new (Sui GraphQL query: collections by slug tag)
- `frontend/src/collection/CollectionDetailPage.test.tsx` — new
- `frontend/src/collection/useCollectionBySlug.test.ts` — new
- `shared/src/types.ts` — extend `Model3DSummary` with `collection_id: string` + `patch_id: string` fields (likely also `collection_slug`, `variant_index`, `variant_total` from tags)

**Approach:**
- Browse grid: query Sui GraphQL for all Model3D objects (existing pattern), group client-side by `collection_id`. Render one collection card per group with N badge. Phase 2's single-asset mints from `publish_and_share` become "collections of 1" — still render with N=1 badge.
- Collection detail: extract slug from route params, query Sui GraphQL for all Model3D with matching `collection_slug` tag, render variant grid. Each tile fetches its GLB thumbnail from Walrus aggregator using `?file_index=<patchId>` (or whatever the aggregator API is for quilt patches).
- Walrus aggregator URL convention for quilt patches: confirm exact URL shape during U5 implementation. Existing aggregator usage in Phase 2 fetches whole blobs (single-patch quilts); multi-patch URL pattern needs doc check.

**Patterns to follow:**
- Existing `frontend/src/browse/BrowsePage.tsx` Phase 2 grid pattern
- Existing `frontend/src/buy/hooks.ts` (`useModelById`) GraphQL query pattern
- Existing `frontend/src/buy/ModelDetailPage.tsx` route pattern for `:objectId` extraction

**Test scenarios:**
- Covers AE2. `BrowsePage_groups_variants_by_collection_id` — mock GraphQL returns 16 Model3D objects sharing one collection_id; BrowsePage renders 1 collection card with "16 variants" badge.
- `BrowsePage_renders_solo_collection_for_phase2_mint` — Phase 2 single-asset mint (degenerate Collection of 1) renders as a normal card with "1 variant" badge.
- `BrowsePage_clicking_collection_card_navigates_to_collection_slug` — click handler navigates to `/collection/<slug>`.
- `CollectionDetailPage_renders_16_variant_tiles` — mock query returns 16 variants of same collection; page renders 16 tiles.
- `CollectionDetailPage_each_tile_has_unique_walrus_url` — each tile's preview img src includes that variant's patchId.
- `CollectionDetailPage_clicking_variant_tile_navigates_to_model_detail` — clicking variant #7 navigates to `/model/<that-variant's-model3d-object-id>`. Existing ModelDetailPage takes over for purchase flow.
- `useCollectionBySlug_filters_by_collection_slug_tag` — query GraphQL with tag prefix `collection:<slug>`; returns only matching Model3D.

**Verification:** Frontend tests pass (~6-7 new). Live smoke: load `/`, see collection card for U4's mint → click → load `/collection/:slug` → see 16 tiles with correct previews from Walrus aggregator.

---

### U6. Tiny Racetrack page + Havok physics + WASD + chase camera

**Goal:** Implement `/track` route. Babylon scene with bounded oval track, Havok rigid-body car (loaded from buyer's owned variant GLB), WASD/arrow input → velocity + steering, chase camera, hard-wall collision at track boundary. Car-picker carousel for switching among owned variants.

**Requirements:** F4 (Racetrack drive), AE4 (drive owned variant), KTD-4 (Havok dependency = D-022 ADR).

**Dependencies:** U2 (real package id + working Phase 2 mint to seed Access objects for test). D-022 ADR captured before U6 starts.

**Files:**
- `frontend/package.json` — modify (add `@babylonjs/havok` dependency)
- `frontend/src/App.tsx` — modify (add `/track` route)
- `frontend/src/track/TrackPage.tsx` — new (route shell + car carousel + scene host)
- `frontend/src/track/racetrackScene.ts` — new (pure Babylon scene setup function)
- `frontend/src/track/carCarousel.tsx` — new (lists owned variants)
- `frontend/src/track/useOwnedVariants.ts` — new (query Sui for Access objects + resolve to Model3D + patchId)
- `frontend/src/track/TrackPage.test.tsx` — new
- `frontend/src/track/racetrackScene.test.ts` — new
- `frontend/src/track/useOwnedVariants.test.ts` — new

**Approach:**

```typescript
// frontend/src/track/racetrackScene.ts — directional sketch
// Loaded lazily because Havok WASM is ~500KB
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3,
  MeshBuilder, PhysicsAggregate, PhysicsShapeType, SceneLoader,
  Color3, StandardMaterial,
} from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';

export async function createRacetrackScene(opts: {
  canvas: HTMLCanvasElement;
  carGlbBytes: Uint8Array;
}) {
  const engine = new Engine(opts.canvas, true);
  const scene = new Scene(engine);
  const havok = await HavokPhysics();
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

  // 1. Track ground (procedural plane, 200x200 units)
  const ground = MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, scene);
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

  // 2. Track walls — 4 thin boxes around the perimeter
  // ...

  // 3. Load car GLB from bytes
  const carContainer = await SceneLoader.LoadAssetContainerAsync(
    'data:', URL.createObjectURL(new Blob([opts.carGlbBytes])), scene,
  );
  const car = carContainer.meshes[0]; // root
  car.position = new Vector3(0, 1, 0);
  const carBody = new PhysicsAggregate(car, PhysicsShapeType.BOX, { mass: 1500 }, scene);

  // 4. Chase camera
  const camera = new ArcRotateCamera('chase', -Math.PI / 2, Math.PI / 3, 15, car.position, scene);
  // ... per-frame: camera.target.copyFrom(car.position) ...

  // 5. WASD input → linear/angular velocity
  // ... scene.onKeyboardObservable.add(...) ...
  // accelerate: carBody.body.applyImpulse(...)
  // steer: rotate carBody.body.transformNode.rotationQuaternion

  engine.runRenderLoop(() => scene.render());
  return { engine, scene, dispose: () => engine.dispose() };
}
```

**Patterns to follow:**
- `@babylonjs/havok` quick-start: https://doc.babylonjs.com/features/featuresDeepDive/physics/usingPhysicsEngine
- `HavokPlugin` setup pattern: https://playground.babylonjs.com/#62OTUJ
- `PhysicsAggregate` for rigid bodies: https://doc.babylonjs.com/typedoc/classes/BABYLON.PhysicsAggregate
- WASM loading via Vite `?url`: mirror existing `walrus-wasm` pattern from `frontend/src/walrus/walrusClient.ts:6` (`import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url'`)
- Babylon scene cleanup: mirror existing `frontend/src/preview/PreviewScene.tsx` `engine.dispose()` lifecycle

**Execution note:** Pre-dispatch reading is critical for this unit per the captured subagent-dispatch learning. Before implementing, read the Babylon Havok docs (5 min) + check `frontend/src/preview/` for the existing canvas/engine lifecycle pattern. Inline the scene-setup skeleton above into the ce-work dispatch prompt for U6.

**Test scenarios:**
- Covers AE4. `racetrackScene_loads_car_glb_into_scene` — given mock Uint8Array GLB, scene contains a mesh node from the loaded asset.
- `racetrackScene_car_responds_to_W_key_with_forward_impulse` — simulate W keydown; assert car physics body has positive z-velocity within 100ms.
- `racetrackScene_car_collides_with_wall_and_stops` — set car at high velocity toward wall; simulate physics for 1 second; assert car velocity near zero + position near wall.
- `racetrackScene_chase_camera_follows_car` — translate car by 10 units; assert camera target updates within 1 frame.
- `racetrackScene_dispose_releases_engine` — call dispose; assert engine.isDisposed === true.
- `useOwnedVariants_returns_only_access_targets` — mock Sui query returns 3 Access objects; hook returns 3 Model3D references with their patchIds.
- `useOwnedVariants_zero_owned_returns_empty_array` — wallet with no Access returns []; UI should show "Buy a variant first" prompt.
- (F8) `useOwnedVariants_filters_non_car_shape_types` — mock returns 5 Access objects: 3 cars + 1 sword + 1 hammer (Phase 2 mints owned by the same wallet). Hook returns only the 3 cars. Filter is `shape_type === 'car'` OR equivalent (e.g., collection's `slug` membership in a car-collection set).
- `carCarousel_renders_one_tile_per_owned_variant` — given 3 owned variants, carousel renders 3 selectable tiles.
- `carCarousel_clicking_variant_loads_into_track_scene` — click variant tile; TrackPage re-renders with that variant's GLB.
- (D-004) `TrackPage_shows_car_swap_loading_overlay` — during the Walrus fetch + Babylon load between car switches, an overlay appears on the canvas with copy "Loading variant…". Overlay clears once `SceneLoader.LoadAssetContainerAsync` resolves. 1-line CSS state — critical for the demo recording.
- `TrackPage_shows_buy_first_prompt_when_zero_owned` — empty Access list shows the prompt + link to `/`.

**Verification:** Frontend tests pass (~10 new). Live browser smoke: load `/track` with seeded Phase 2 Access NFT, scene renders with car on track, WASD drives the car, hitting wall stops it, frame rate ≥30fps on a modern laptop.

---

### U7. E2E two-wallet testnet smoke + demo capture

**Goal:** Run the full demo arc end-to-end on testnet with two real wallets. Capture transaction hashes, Sui Explorer screenshots, and a 90-second screen recording for the demo video.

**Requirements:** Full success criteria (1-5 from brainstorm). All AE1-AE5.

**Dependencies:** U6 (everything else done).

**Files:**
- `docs/phase-progress.md` — update (Phase 3 status, tx hashes, package id)
- `docs/spec.md` §6 — update (Phase 3 actual deliverables)
- `pitch/demo-script.md` — new (90-sec narration for demo video; rough draft for Phase 5 polish)
- `pitch/screenshots/` — new (Sui Explorer screenshots of mint + buy txns)
- `pitch/demo-recording.mp4` — new (raw 90-sec recording for Phase 5 editing)

**Approach:**
1. Wallet A: open `/forge`, mint "Neon Drift Series" — 16 variants. Capture all 3 wallet-popup signatures + final tx hash. Verify Sui Explorer shows 1 Collection + 16 Model3D shared. Verify Walrus aggregator URLs work for all 16 patches.
2. Wallet B: open `/`, see "Neon Drift Series" collection card. Click → see 16 variant tiles. Click variant #7 → see ModelDetail → click Buy → sign purchase. Capture tx hash. Verify wallet receives Access NFT.
3. Wallet B (same session): open `/track`, see variant #7 in carousel, click → scene loads with red-metallic paint, WASD drives car around track. Record 30 sec.
4. Stitch the three captures into a 90-sec rough cut.

**Patterns to follow:**
- Phase 2 e2e smoke was the prior playbook — apply the same flow shape, just over a Collection.

**Execution note:** Use two real testnet wallets (the existing Phase 2 dev wallet for A; a fresh keypair for B to avoid Phase 2 contamination). Fund wallet B with ~5 testnet SUI via faucet.

**Test scenarios:**
- Test expectation: none — this is a manual e2e capture, not an automated test unit. Verification = working recording + Sui Explorer URLs.

**Verification:** Demo video file exists, contains the full mint→browse→buy→drive arc, all 3 chapters are intelligible at 30fps. Sui Explorer links work. Phase progress updated with all hashes.

---

## Deferred to implementation

Execution-time unknowns that plan-003 explicitly does not pre-resolve:

- **Exact `EC_*` error code numbers** for new Move asserts (`ESlugMalformed`, `ETooManyVariants`, `EVariantCountZero`). Pick during U1 implementation — extend the existing 0-14 range in `model3d.move:24-31`.
- **Walrus aggregator URL convention for quilt patch retrieval.** Phase 2 fetches whole blobs; Phase 3 needs `?patch_id=...` or equivalent. Confirm exact shape against `@mysten/walrus` SDK or Walrus testnet docs during U5 implementation. Fallback: download the whole quilt and slice client-side using the patch's `startIndex`/`endIndex` (worst case ~16MB download per car preview — workable but slow).
- **Texture asset sourcing.** 8 PNGs needed in `backend/assets/textures/`. Either: (a) generate via stable-diffusion-style during U3 (1-2h), (b) hand-curate from CC0 sources (15min), (c) generate procedurally via canvas API at server boot (1h). Pick during U3.
- **Tripo prompt for the demo base car.** "futuristic racing car, low-poly, neon accents" is the working draft. Refine during U4 — generate 3-5 candidates, pick best for demo recording.
- **`React.lazy` vs eager loading for `/track` route.** Bundle-size optimization deferred. If full bundle is < 2MB gzipped, ship eager; else lazy-load.
- **Babylon canvas lifecycle on route change.** When user navigates away from `/track`, the scene needs to dispose to release Havok WASM memory. Confirm Babylon engine `dispose()` is called on unmount during U6 implementation.
- **Collision wall geometry.** Either 4 long thin boxes around an oval, or an extruded ring with PhysicsAggregate type `MESH`. Pick during U6 — start with 4 walls for simplicity.
- **Per-frame physics step + render rate sync.** Babylon default render loop runs at refresh rate; physics fixed step. Confirm Havok's `numIterations` + step size produce stable behavior at 60fps + 30fps during U6.
- **Variant pricing UI.** Brainstorm allows per-variant pricing. v1 demo can pin all 16 variants to same price (e.g., 0.5 SUI each) — UI gates "advanced: per-variant pricing" behind a toggle, default off. Decide during U4.
- **Move event emission** for `Collection` creation. Existing `ModelPublished` event fires once per `Model3D` — should `Collection` also emit a `CollectionPublished` event for indexer discovery? Decide during U1 — recommendation: yes, for browse-grid-by-collection efficiency.

---

## Alternative approaches considered

### AA-1 — OQ-D6 B.iii (1 Model3D + variant-indexed Access)

Rejected during brainstorm phase 2026-05-15 PM (see brainstorm OQ-D6 resolution). Would have produced fewer Sui objects but required rewriting Phase 2's Browse / ModelDetail / Buy flows to handle variant indices on Access tokens. Higher frontend churn + less familiar "concert tickets" mental model didn't justify the gas savings.

### AA-2 — N independent `writeBlobFlow` calls (B.i)

Rejected during OQ-D2 resolution. 16 variants would mean 32 wallet popups (UX disaster) and would defeat the captured quilt-batching pattern. Even though it would let us keep the existing Move contract unchanged, the user-facing experience makes it a non-starter for a demo.

### AA-3 — L1 inspect-only Trophy Hall instead of driveable Tiny Racetrack

Considered during scope-locking discussion 2026-05-15 PM. User chose L2 driveable for stronger demo punch despite the +1-2 day cost. Plan-003 accommodates by hard-locking the scope (no opponents, no timer, no SFX, no wheel spin) so the unit stays at ~3 days. R1 mitigation: if Havok integration exceeds 4 days, descope to Trophy Hall as fallback.

### AA-4 — Reuse existing `Model3D.blob: Blob` field instead of `(collection_id, patch_id)`

Would require keeping per-variant Walrus blobs (not quilt-batched) since Move ownership prevents one `Blob` from being moved into N Model3Ds. Same as AA-2 — UX disaster from N×2 popups. Rejected.

---

## Success metrics

- **Move tests**: 31 total passing (21 existing + ~10 new). 100% green required.
- **Backend tests**: ~6 new on `/api/collection/build` + `gltf-material-swap`. 100% green.
- **Frontend tests**: ~25-30 new across `forge/`, `collection/`, `track/`, `browse/`, and `useWalrusUpload` extension. 100% green. Total frontend test count ~120 after U7.
- **Testnet smoke**: Wallet A successfully mints 16-variant collection in 3 popups; tx confirmed on Sui Explorer.
- **Buyer smoke**: Wallet B buys variant #7 + loads it in `/track`.
- **Demo recording**: 90-second video covering mint → browse → buy → drive arc.
- **Build time**: Frontend production build ≤ 30s.
- **Bundle size**: ≤ 2MB gzipped main bundle (with Havok lazy-loaded if needed).
- **Phase 3 completion**: by 2026-05-29 (14-day budget; aim for 8 days to leave buffer for Phase 4+5 polish).

---

## Notes for the implementer

- **Pre-implementation reading list per unit** is in each unit's `Patterns to follow` section. Use those file paths verbatim in ce-work dispatch prompts to stay within the tight-reads-inline-skeletons pattern.
- **D-022 ADR for `@babylonjs/havok`** must be captured **before** U6 dispatches. Surface it to the user as a 5-min ADR write, not a blocker.
- **Sequencing**: U1 → U2 are sequential (deploy depends on contract). U3, U4, U5, U6 can develop in parallel with mock data after U2. U7 integrates everything.
- **Test-first posture** is called out only for `buildCollectionPtb` (U4) where it materially reduces risk of the PTB struct-arg pitfall. Other units are pragmatic implementation order — write tests as the code emerges.
- **Browser smoke required for U4, U5, U6** — Phase 1 caught a cylinder-winding bug that vitest snapshot tests missed. Per the captured procedural mesh testing lesson, visual checks aren't optional for any unit that renders 3D.
- **Phase 2 frontend fixtures** need a sweep to update for the new `(collection_id, patch_id)` data shape after U2. Allocate ~half a day in U2 verification for this.
- **Demo capture** (U7) should not be left for the last hour before submission. Schedule U7 with at least 3 days of slack before 6/21 in case the recording reveals issues that need code fixes.
