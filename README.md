# 3D Model Generation Service

A Sui-native **composable creator economy** for low-poly 3D game assets.

> **Status**: Sui Overflow 2026 hackathon submission. Work in progress.
> Built for [Sui Overflow 2026](https://overflow.sui.io/), Walrus track.

---

## What it does

Creators publish base 3D models to **Walrus** (decentralized storage). Other creators fork them into **derivative series** with automatic on-chain royalty splits. Game developers buy **access** and integrate models into their games. All ownership, royalties, and licensing are **protocol-enforced on Sui Move** — not platform-enforced.

### Three-tier composable IP architecture

```
L1  Model3D       Creator publishes base content to Walrus
                  License policy: restricted / allow_list / permissionless
                  ↓
L2  Derivative    Other creators fork base into series (1-layer max)
                  Royalty snapshot at mint, ≤ 30% protocol cap
                  ↓
L3  Access        Soulbound receipt of paid access
                  Gates Seal-encrypted content (when used)
```

Not an NFT collection. `Model3D` is content — one creator publishes, many users pay for access. `Access` is a soulbound (non-transferable) Move object. `Derivative` is composable IP with automatic royalty cascading.

---

## Stack

- **Smart contract**: Sui Move 2024 — `model3d::model3d` package
- **Storage**: [Walrus](https://docs.wal.app/) — decentralized blob storage with on-chain lifecycle
- **Encryption** (optional v1.1): [Seal](https://seal-docs.wal.app/) — threshold IBE with on-chain policy
- **Marketplace** (optional v1.1): Sui Kiosk + TransferPolicy — protocol-level royalty enforcement
- **Frontend**: React + Vite, [Babylon.js](https://www.babylonjs.com/)
- **Auth**: zkLogin via [Enoki](https://docs.enoki.mystenlabs.com/) — Google sign-in, no wallet required
- **Backend**: Node 22 LTS + [Hono](https://hono.dev/) + [`@gltf-transform/core`](https://gltf-transform.dev/) — procedural mesh generation, zero AI API cost (per D-012)
- **LLM router** (Phase 2): [Anthropic SDK](https://docs.anthropic.com/) — Claude Haiku as natural-language → generator-params router (D-011), ~$0.001/call

---

## Roadmap

| Phase | Window | Deliverable |
|---|---|---|
| 1. Scaffold | 5/14 – 5/19 | Local end-to-end with mock data |
| 2. Sui Integration | 5/20 – 5/29 | Walrus + Move contract + zkLogin on testnet |
| 3. Real-World Application | 5/30 – 6/10 | Sample game scene + pitch deck + traction |
| 4. Mainnet + Derivative Layer | 6/11 – 6/20 | Full 3-tier on mainnet, optional Kiosk/Seal stretch |
| 5. Submission + Polish | 6/21 – 7/8 | Demo video, README, Demo Day prep |

Detailed plan: [`docs/spec.md`](docs/spec.md) §6. Live progress: [`docs/phase-progress.md`](docs/phase-progress.md).

---

## Run locally (Phase 1)

The Phase 1 dev loop runs entirely on your machine — no Sui, no Walrus, no API keys.

**Prerequisites**: Node 22 LTS (via [nvm](https://github.com/nvm-sh/nvm)) + pnpm 8.

```bash
nvm use            # picks up .nvmrc (22.22.3)
pnpm install       # installs all workspaces
pnpm dev           # starts backend (:3001) + frontend (:5173) in parallel
```

Open <http://localhost:5173>, pick a shape (box / chest / cylinder / sphere), drag the sliders, click **Generate**. The model previews in a Babylon canvas.

Run tests:

```bash
pnpm test          # all workspaces (backend + frontend)
pnpm typecheck     # all workspaces
```

---

## Repository structure

```
.
├── CLAUDE.md                  # Session protocol for AI agents
├── docs/
│   ├── spec.md                # Full specification (architecture, technical decisions, plan)
│   ├── decisions.md           # Architecture Decision Records (ADR log)
│   ├── phase-progress.md      # Current progress
│   └── open-questions.md      # Unresolved questions
├── shared/                    # @overflow2026/shared — types shared by browser + backend
├── backend/                   # Node 22 + Hono — procedural generators + LLM router (D-012)
├── frontend/                  # React + Vite + Babylon (imperative wrapper per D-007)
├── contracts/                 # Sui Move (Phase 2+)
├── samples/                   # Sample game scene (Phase 3+)
└── pitch/                     # Pitch deck + demo video assets (Phase 3+)
```

---

## License

TBD at submission. Likely MIT or Apache-2.0.

---

## Submission details (filled at Phase 5)

- **Demo URL**: TBA
- **Demo video** (≤ 5 min, YouTube): TBA
- **Testnet package ID**: TBA
- **Mainnet package ID** (target before 8/27): TBA
- **Contact**: TBA
