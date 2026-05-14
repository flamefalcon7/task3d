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
- **Backend**: Go, [`qmuntal/gltf`](https://github.com/qmuntal/gltf) — procedural mesh generation, zero AI API cost

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

## Repository structure

```
.
├── CLAUDE.md                  # Session protocol for AI agents
├── docs/
│   ├── spec.md                # Full specification (architecture, technical decisions, plan)
│   ├── decisions.md           # Architecture Decision Records (ADR log)
│   ├── phase-progress.md      # Current progress
│   └── open-questions.md      # Unresolved questions
├── backend/                   # Go (Phase 1+)
├── frontend/                  # React + Vite + Babylon (Phase 1+)
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
