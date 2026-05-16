# 3D Model Generation Service

A Sui-native **composable creator economy** for low-poly 3D game assets — mint a 16-variant car collection in 3 wallet signatures, then drive the cars you buy in a Babylon + Havok racing scene. All on Walrus + Sui.

> **Status**: Sui Overflow 2026 hackathon submission. Phase 3 code complete; testnet contract live at `0x18a480b3...c3`. Demo recording pending.
> Built for [Sui Overflow 2026](https://overflow.sui.io/), **Walrus track**.

---

## What it does

Creators publish 3D model **collections** to [Walrus](https://docs.wal.app/) (decentralized storage). Each collection is N paint-variants of one base mesh, batched into a single Walrus quilt so 16 variants cost 2 wallet popups + 1 Sui PTB (not 32 + 16). Buyers pay for **soulbound Access NFTs** on Sui and immediately drive their car in a Babylon + Havok rigid-body racing scene. All ownership and licensing is **protocol-enforced on Sui Move** — not platform-enforced.

### Architecture (Phase 3, code-complete)

```
L1  Collection    Creator publishes the shared Walrus quilt blob.
                  License policy: restricted / allow_list / permissionless.
                  ↓
    Model3D       N variants reference (collection_id, patch_id).
                  Each variant is its own Sui shared object.
                  ↓
L3  Access        Soulbound Move object (key only, no store).
                  Buyer holds it forever; can't be transferred.
```

Not an NFT collection — `Model3D` is *content* that many buyers pay to access. `Access` is a soulbound (non-transferable) receipt. `Collection` wraps the shared quilt blob so N variants share one Walrus upload + one PTB mint.

**L2 Derivative** (deferred to v1.1) — composable forks of existing collections with automatic royalty cascading. Move-level scaffolding kept in `docs/spec.md` §2.8.

---

## Stack

- **Smart contract**: Sui Move 2024 — `model3d::model3d` package (testnet `0x18a480b3...c3`)
- **Storage**: [Walrus](https://docs.wal.app/) — decentralized blob storage with on-chain lifecycle. Phase 3 uses **quilt batching** (1 Walrus blob, N internal byte-range patches) so a 16-variant collection mint costs 2 Walrus popups instead of 32
- **Sui SDK**: `@mysten/sui@2.16.2` (`SuiJsonRpcClient`) — D-019
- **Frontend**: React + Vite + [Babylon.js](https://www.babylonjs.com/) (imperative wrapper, no `react-babylonjs` per D-007), [`@babylonjs/havok`](https://doc.babylonjs.com/features/featuresDeepDive/physics/) for Tiny Racetrack rigid-body physics — D-022
- **Auth**: dApp Kit + Slush wallet + optional zkLogin via [Enoki](https://docs.enoki.mystenlabs.com/) (Google sign-in)
- **Backend**: Node 22 LTS + [Hono](https://hono.dev/) + [`@gltf-transform/core`](https://gltf-transform.dev/) — procedural mesh generation + base-car-material-swap; zero AI API cost (D-012, D-023)
- **Generator**: [Tripo](https://www.tripoai.com/) (optional) — prompt → base car GLB. D-023: directly dispatched, no LLM in the loop
- **Encryption** (deferred to v1.1): [Seal](https://seal-docs.wal.app/) — threshold IBE for gated content
- **Marketplace** (Phase 4): Sui Kiosk + TransferPolicy — protocol-level royalty enforcement

---

## Roadmap

| Phase | Window | Deliverable | Status |
|---|---|---|---|
| 1. Scaffold | 5/14 – 5/19 | Local e2e with mock data | ✅ Done |
| 2. Sui Integration | 5/20 – 5/29 | Walrus + Move contract + zkLogin on testnet | ✅ Done |
| 3. Real-World Application | 5/30 – 6/10 | Collection Forge + Tiny Racetrack demo | ✅ Code complete; demo recording pending (U7) |
| 4. Mainnet + Kiosk | 6/11 – 6/20 | Kiosk + TransferPolicy royalty enforcement | Pending |
| 5. Submission + Polish | 6/21 – 7/8 | Demo video, README, Demo Day prep | Pending |

Detailed plan: [`docs/spec.md`](docs/spec.md) §6. Live progress: [`docs/phase-progress.md`](docs/phase-progress.md). Current architecture snapshot: [`docs/process.md`](docs/process.md).

---

## Run locally

**Prerequisites**: Node 22 LTS (via [nvm](https://github.com/nvm-sh/nvm)) + pnpm 8 + (for the contract) Sui CLI 1.72.1+.

### Minimum setup (read-only: Browse + slider mode)

```bash
nvm use                                  # picks up .nvmrc (22.22.3)
pnpm install                             # installs all workspaces
cp backend/.env.example backend/.env     # then edit JWT_SECRET (see below)
cp frontend/.env.example frontend/.env.local  # leave VITE_MODEL3D_PACKAGE_ID
                                         # set to the testnet id above
pnpm dev                                 # starts backend (:3001) + frontend (:5173)
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# paste into backend/.env as JWT_SECRET=...
```

Open <http://localhost:5173>. You can:
- **Browse** the marketplace (`/`) — see existing Model3D collections
- **Generate procedural shapes** (`/generate`) — pick box / chest / cylinder / sphere / sword / hammer / platform, drag sliders. No auth, no Sui, no Walrus.

### Full Forge + Track flow

Adds wallet sign-in (Slush works without extra setup) + Walrus uploads + on-chain mints + Babylon physics scene. Needs Tripo for the base car generation:

```bash
# Append to backend/.env:
TRIPO_ENABLED=true
TRIPO_API_KEY=<your_tripo_key>     # required if TRIPO_ENABLED=true
```

Then:
- **`/forge`** — type a prompt → base car (~60–120 s via Tripo) → pick 1–16 paint variants → 3 wallet signatures → on-chain Collection + N Model3Ds
- **`/collection/:slug`** — buyer-side variant grid; click a tile → buy Access
- **`/track`** — Babylon + Havok rigid-body scene; WASD to drive your owned cars

### Run tests

```bash
# from repo root
cd backend && pnpm vitest run    # 132 tests
cd frontend && pnpm vitest run   # 158 tests
cd contracts/model3d && sui move test   # 37 tests
# total: 325 tests, all green at code-complete
```

---

## Repository structure

```
.
├── CLAUDE.md                  # Session protocol for AI agents
├── docs/
│   ├── spec.md                # Full specification (architecture, technical decisions, plan)
│   ├── decisions.md           # ADR log (D-001 through D-023)
│   ├── phase-progress.md      # Current progress
│   ├── process.md             # Current architecture snapshot (endpoints, env, flow)
│   ├── open-questions.md      # Unresolved questions
│   ├── brainstorms/           # Brainstorm outputs (ce-brainstorm)
│   ├── plans/                 # Plan outputs (ce-plan); plan-003 = Phase 3
│   └── solutions/             # Captured learnings (ce-compound)
├── shared/                    # @overflow2026/shared — types shared by browser + backend
├── backend/                   # Node 22 + Hono — procedural generators + Tripo passthrough (D-023)
├── frontend/                  # React + Vite + Babylon (imperative wrapper per D-007) + Havok (D-022)
├── contracts/                 # Sui Move 2024 — model3d::model3d package
└── pitch/                     # demo-script.md + screenshots/ + recording (Phase 5)
```

---

## License

TBD at submission. Likely MIT or Apache-2.0.

---

## Submission details

- **Testnet package ID**: `0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3`
- **Sui Scan (deploy tx)**: https://suiscan.xyz/testnet/tx/8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A
- **Demo URL**: TBA (Phase 5 deploy target)
- **Demo video** (≤ 5 min, YouTube): TBA — script at [`pitch/demo-script.md`](pitch/demo-script.md)
- **Mainnet package ID** (target before 8/27): TBA
- **Contact**: TBA
