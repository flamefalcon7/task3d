# Current Process — Phase 3 Code-Complete

> ⚠️ **STALE as of 2026-06-05 — describes the retired Phase-3 architecture.** The on-chain artifacts, struct shapes, entry functions, and endpoints below predate D-029/D-074/D-075/D-078 and the v12 republish. Authoritative current state: `contracts/model3d/sources/model3d.move`, `docs/decisions.md` (through D-089), and `README.md`. Key deltas: package is now **v12 `0xbf0affb8…02d1`** (not `0x18a480b3…`); architecture is L1 `Model3D` + `AccessEntitlement` → L2 `NftCollection` + `NftToken` (`Collection`/`Access` deleted); Seal encryption shipped; procedural generators removed (D-033). Needs a full rewrite during Phase 5 docs cleanup.

Last updated: **2026-05-16 PM** (after U6 + dev-server bring-up fixes + D-023 LLM router removal)
Branch: `feat/phase-2-sui-integration` (10 Phase 3 commits ahead of base)
Test totals: Move 37 + Backend 130 + Frontend 158 = **325 tests, all green**

This is a snapshot of how the system actually works right now — endpoints, env vars, external services, flows. Updated when the architecture shifts; not a spec (see `docs/spec.md`) or a plan (see `docs/plans/`).

---

## On-chain artifacts (Sui testnet)

```
PackageID:  0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3
UpgradeCap: 0x11b63b1f9a1677e20a6f7015416da8dde4e291b72ed7563cc5de2bf0268fd795
Deploy tx:  8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A
Active wallet (creator): 0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed
```

Module: `model3d::model3d`. Phase 3 shape — `Collection` wraps the shared Walrus quilt blob; each `Model3D` references `(collection_id, patch_id)` instead of carrying its own `blob: Blob`. Phase 2's `publish_and_share` still works via degenerate-of-1 Collection wrapping.

Public entries:
- `new_license_terms(...) -> LicenseTerms`
- `new_variant_spec(...) -> VariantSpec`
- `publish_collection(blob, name, slug, license, clock, ctx) -> Collection`
- `mint_variant(&mut coll, spec, shape_type, lineage_blob_id, is_encrypted, clock, ctx) -> Model3D`
- `share_collection(coll)`
- `publish_and_share(...)` — Phase 2 ABI; rewired internally as a 1-variant Collection
- `purchase_model_access(...) -> Access` — Phase 2; still works under new shape

---

## Local dev startup

```bash
cd /Users/rickyeh/flamefalcon/overflow2026
pnpm dev    # runs backend on :3001 + frontend on :5173 in parallel
```

Backend hard-fails if `backend/.env` is missing or `JWT_SECRET` < 32 bytes. The dev script uses `tsx watch --env-file=.env src/server.ts` so the env file is read at startup. Generate a fresh secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Backend endpoints (Hono on :3001)

All routes mounted in `backend/src/app.ts` + `backend/src/server.ts`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Liveness probe — returns `overflow2026 backend ok` |
| GET | `/api/shapes` | none | Procedural shape catalog (7 shapes, slider config for the frontend) |
| POST | `/api/generate` | **see below** | Generate a single GLB. Two body shapes: |
| | | none | slider mode: `{shape:'box'|'chest'|..., ...params}` → procedural generator, free |
| | | JWT | prompt mode: `{prompt:'...'}` → D-023 direct dispatch to Tripo (no LLM), **costs Tripo credits** |
| POST | `/api/collection/build` | JWT | Material-swap N variant GLBs from one base GLB. Returns N base64 GLBs. Used by `/forge`. |
| POST | `/api/auth/challenge` | none | Step 1 of sign-in: client supplies Sui address, server returns nonce |
| POST | `/api/auth/verify` | none | Step 2: client supplies signed nonce, server verifies + returns JWT |

CORS allow-list: `http://localhost:5173`, `http://127.0.0.1:5173` (see `app.ts:17`).

---

## Frontend routes (React Router on :5173)

| Path | Component | Purpose |
|---|---|---|
| `/` | `BrowsePage` | Marketplace grid — groups Model3Ds by `collection_id`, one CollectionCard per group |
| `/generate` | `CreatorFlow` | Phase 2 single-asset mint (procedural shapes; legacy entry point) |
| `/forge` | `ForgePage` | Phase 3 Collection mint: prompt → base car → N variants → 3-popup mint |
| `/collection/:slug` | `CollectionDetailPage` | Detail page for a Collection — N variant tiles, click → ModelDetail |
| `/model/:objectId` | `ModelDetailPage` | Single-variant detail — Buy Access flow (Phase 2; unchanged) |
| `/track` | `TrackPage` | Phase 3 Tiny Racetrack — Babylon + Havok rigid-body driving with owned variant cars |

Slug strategy in v1 is `slug == collectionId` (URLs look like `/collection/0xabc…`). Phase 4 indexer will swap to human slugs without changing the route shape.

---

## Env vars (full list)

### `backend/.env` (gitignored)

| Var | Required? | Effect if absent |
|---|---|---|
| `JWT_SECRET` | **YES** (≥ 32 bytes) | Server hard-fails at startup with `JwtConfigError` |
| `TRIPO_ENABLED` | optional (`'true'`) | `/api/generate` prompt mode → 400 `tripo_disabled` (slider mode still works) |
| `TRIPO_API_KEY` | required if `TRIPO_ENABLED=true` | Server hard-fails at startup (D-023: misconfig surfaces eagerly, not at first call) |
| `PORT` | optional (default 3001) | — |

### `frontend/.env.local` (gitignored)

| Var | Required? | Effect if absent |
|---|---|---|
| `VITE_MODEL3D_PACKAGE_ID` | required for real chain interactions | PTB builders default to `'0x0'` — every Sui call fails on chain |
| `VITE_ENOKI_API_KEY` | optional | Google zkLogin wallet skipped; Slush wallet still registered |
| `VITE_GOOGLE_CLIENT_ID` | optional | Same — Enoki needs both together |

---

## External services (current canonical URLs)

| Service | URL | Used by |
|---|---|---|
| Sui JSON-RPC (testnet) | `https://fullnode.testnet.sui.io:443` | `getJsonRpcFullnodeUrl('testnet')` SDK helper — WalletProvider + walrusClient |
| Sui GraphQL (testnet) | `https://graphql.testnet.sui.io/graphql` | `useModelIndex` + `useCollectionBySlug` (Browse + Collection detail) |
| Walrus aggregator (testnet, read) | `https://aggregator.walrus-testnet.walrus.space` | Variant GLB fetch via `/v1/blobs/by-quilt-patch-id/{patchId}` + degenerate-of-1 via `/v1/blobs/{blobId}` |
| Walrus upload relay (testnet, write) | `https://upload-relay.testnet.walrus.space` | `useWalrusUpload` quilt upload (in-browser via the SDK) |
| Tripo API | per Tripo SDK | Phase 3 base car generation. D-023: directly dispatched in prompt mode (no LLM in the loop). |

⚠️ The old GraphQL endpoint `sui-testnet.mystenlabs.com/graphql` has been deprecated AND DNS-removed. Don't reintroduce it; per docs.sui.io it's the `graphql.<network>.sui.io/graphql` family now.

---

## End-to-end mint flow (Phase 3 Forge happy path)

```
Wallet A (creator)
  │
  │ open /forge → connect Slush wallet → sign challenge → JWT in localStorage
  │
  ▼ "futuristic racing car, low-poly, neon accents"
POST /api/generate {prompt} + Bearer <jwt>
  │ Backend: HardcodedRouter dispatches directly to Tripo (D-023)
  │ Backend: derives lineage tags from prompt (split words, lowercase, ≤ 5)
  │ Backend: TripoGenerator polls Tripo until done (~60–120 s)
  │ Backend: returns {glbBytes: base64, lineageJson, lineageStub}
  ▼
Frontend: render base car preview
  │
  │ user picks N variants (1–16): per-row baseColorRgb + textureId from
  │ TEXTURE_LIBRARY (8 curated)
  ▼ Click Mint
POST /api/collection/build {baseGlbBase64, variants[]} + Bearer <jwt>
  │ Backend: swapMaterial(baseGlb, spec) for each variant
  │ Backend: returns {variants: [{glbBase64}, ...]}
  ▼
useWalrusUpload(variantGlbs, signer)
  │ Encode all N files into 1 quilt blob (one Walrus Blob with N internal patches)
  │ Popup 1: registerBlob — Walrus pays storage tokens, owner signs
  │ Popup 2: certifyBlob — committee signature signed by owner
  │ Returns: {blobObjects: [{blobId, blobObjectId}], patchIds: [string]}
  │   (all N entries share blobId + blobObjectId; patchIds[] is per-variant)
  ▼
buildCollectionPtb({quiltBlobObjectId, collectionName, slug, variants[]})
  │ Single PTB: new_license_terms → publish_collection → N × (new_variant_spec
  │            + mint_variant(&mut coll, …) + share Model3D) → share_collection
  ▼ Popup 3
signAndExecuteTransaction(tx)
  │ One on-chain tx mints 1 Collection + N Model3Ds, all shared objects
  ▼
Success: link to /collection/<slug>

Wallet B (buyer)
  │
  │ open / → see CollectionCard for "Neon Drift Series" with "N variants" badge
  │ click → /collection/<slug> → see N variant tiles fetched from Walrus aggregator
  │ click variant → /model/<objectId> → ModelDetailPage (existing Phase 2)
  ▼ Click Buy Access
purchaseAccessPtb({modelId, price, ...})
  │ One tx: purchase_model_access on Phase 2 contract path
  │   (unchanged — Access is soulbound `has key` only, no `store`)
  ▼ Single popup → signAndExecute
Wallet receives Access NFT.
  │
  ▼ open /track
useOwnedVariants() — query Sui for owned Access objects → resolve target_id → Model3D
  │
  ▼ Pick variant from carousel → fetch GLB from Walrus aggregator URL
createRacetrackScene({canvas, carGlbBytes})
  │ Engine + Scene + Havok physics + ground + walls + car as rigid body + chase camera + WASD
  ▼
Drive.
```

---

## Test surfaces

| Surface | Count | Command (from repo root) |
|---|---|---|
| Move | 37 | `cd contracts/model3d && sui move test` |
| Backend (Hono routes + generators + libs) | 132 | `cd backend && pnpm vitest run` |
| Frontend (React + Babylon mocks + PTB shape) | 158 | `cd frontend && pnpm vitest run` |
| Full TS type check | — | `cd frontend && pnpm tsc --noEmit -p tsconfig.app.json` + `cd backend && pnpm tsc --noEmit` |

Coverage gaps (what unit tests don't catch):
- Live Sui RPC / GraphQL outages
- Walrus upload relay rejections (rate limits, tip changes)
- Havok WASM load failures in the browser
- Wallet popup UX (Slush, Enoki) — manual testing required

---

## Known open follow-ups (rolled up from U1–U6 subagent reports)

- **Variant GLB thumbnails** — CollectionCard + CollectionDetailPage tiles emit hidden `<img>` for aggregator URL (assert-only); real GLB thumbnails deferred to Phase 5 polish.
- **Slug strategy** — `slug == collectionId` for v1. Phase 4 indexer should subscribe to `CollectionPublished` events and store human slugs.
- **`useOwnedVariants` shape filter** — F8 deliberately not implemented; every owned variant lands in the carousel including non-car shapes.
- **Per-variant lineage** — all N variants in a Forge mint share one `lineage_blob_id` (the quilt blob id). If per-variant lineage JSON becomes a requirement, need a second quilt upload.
- **Havok WASM bundling** — sits at `frontend/public/HavokPhysics.wasm` (2.0 MB unhashed). Phase 5 polish could add a postinstall fingerprint hook.
- **MintButton retry from cache** — on PTB rejection, Forge currently re-runs the full flow. Plan D-001 specified caching `blobObjectId + patchIds` so retry skips Walrus re-upload. Time-boxed for v1.
- **Tag extraction** — `ForgePage` currently emits `[\`collection:\${slug}\`, row.textureId]` per variant. If LLM extraction is dropped (see ADR D-023 if it lands), tags need a deterministic derivation strategy from the prompt.

---

## Commit history this session (Phase 3 increment)

```
b56b50d fix(dev): backend env loading + correct Sui testnet GraphQL endpoint
+1 docs(env) — Enoki vars in .env.example
638b9c5 U6 — /track Havok physics + WASD
773feee U5 — Browse grouping + /collection/:slug
80344ce U4 — /forge + buildCollectionPtb
417474f U3 — POST /api/collection/build
73eb32f prep — shared types + route stubs
0d0e0ab U2 — testnet deploy (PackageID captured)
0769617 U1 — Move Collection struct
3ff78ee D-022 ADR — Havok
cf26fb0 Spikes A+B+C
```
