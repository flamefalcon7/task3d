# Phase Progress

## Last Updated: 2026-05-14 (post-office-hours, D-011 + D-012 + D-013 ratified)

### Hackathon Tracker
- Days to submission (6/21): **38 of 38**
- Days to demo day (7/20–21): **67 of 67**
- Days to winners (8/27): **105 of 105**

### Current Phase
**Phase 1: Scaffold** (5/14 – 5/19, target 6 days) — about to start

See `docs/spec.md` §6 for full 5-phase plan.

### Completed This Session
- Pre-work research: Walrus + Seal deep dive, Sui Overflow 2026 handbook verification (via headless browser → mystenlabs.notion.site/overflow-2026-handbook), SDK landscape (2026-05-08 release train), Tripo competitive analysis, industry pain points (Sketchfab → Fab, Unity 2023, OpenSea royalty failure)
- Architecture: Composable Creator Economy / Programmable IP Layer (D-001), 3-tier `Model3D + Access + Derivative` (D-002), policy modes (D-003), royalty cap (D-004), snapshot immutability (D-005)
- Tech stack locks: GLB only (D-006), drop react-babylonjs (D-007), @mysten/* pinned (D-008), Walrus upload relay (D-010)
- Strategy: testnet submission, mainnet by 8/27 (D-009)
- Project structure + `CLAUDE.md` + `docs/` bootstrap
- **Office-hours session (D-011)**: framing pivot to **agentic** (LLM router + procedural primary + Tripo pluggable). Pure procedural validated locally via `/tmp/box-demo/{box,chest}.go` (816 B / 1008 B, manifold ✓). spec.md §0/§1.7/§1.8/§1.9/§6 updated to reflect
- **Office-hours session (D-012)**: stack consolidation — **drop Go backend, TS unified across browser + server**. 2-service split preserved (browser = Walrus/Sui, backend = generators + LLM router). spec.md §4 (`@gltf-transform/core` replaces `qmuntal/gltf`, Hono replaces chi), CLAUDE.md stack updated, repo gets `shared/` workspace
- **Office-hours session (D-013)**: product narrative critical review — **L2 Derivative no real user (Sarah was invented), framing too abstract**. Triple change: (1) L2 moved v1 → v1.1 (Move design preserved in §2.8 with deferral annotation), (2) Sui Kiosk + TransferPolicy promoted from Phase 4 Stretch → v1 must-have, (3) framing narrowed to **"Sui-Native 3D NFT Economy" with 5 explicit Sui+Walrus exclusive selling points** (Kiosk royalty / Move LicenseTerms / soulbound Access ability / Walrus permanence / Walrus lineage provenance). product.md rewritten 3-act → 2-act, spec.md §1.7 / §1.9 / §6 Phase 4 / §2.8 updated.

### In Progress
- Nothing yet — about to start Phase 1 implementation with D-011 architecture

### Next Concrete Step
**Start Phase 1 scaffold** (D-011 Generator interface + D-012 TS unified monorepo):

1. `pnpm init` at repo root, add workspace config (`pnpm-workspace.yaml`): `frontend/` / `backend/` / `shared/`
2. `mkdir frontend backend shared contracts samples pitch`
3. **`shared/`** — `pnpm init`, create `shared/src/types.ts` with `GenerateParams`, `LineageRecord`, `Generator` interface
4. **`backend/`** — `pnpm init`, install `hono @gltf-transform/core @anthropic-ai/sdk @mysten/sui zod`, dev deps `typescript tsx @types/node`. Files:
   - `backend/src/generators/generator.ts` — implements `Generator` interface
   - `backend/src/generators/box.ts` — `@gltf-transform/core` procedural (~20 LoC, equivalent to `/tmp/box-demo/box.go`)
   - `backend/src/generators/chest.ts` — body + lid rotation (~60 LoC, equivalent to `/tmp/box-demo/chest.go`)
   - `backend/src/agent/router.ts` — stub: hardcoded `shape name → generator` map (Phase 2 wires Anthropic)
   - `backend/src/server.ts` — Hono server with `POST /api/generate`, `GET /api/preview/:id`, `GET /api/shapes`
5. **`frontend/`** — `pnpm create vite . --template react-ts`, install `@babylonjs/core`, write 40-line imperative wrapper (`Engine` + `Scene` + `LoadAssetContainerAsync`)
6. Frontend ↔ backend wired with mock fetch, **no Sui / Walrus / LLM yet** (defer all to Phase 2)
7. **Skip**: do NOT port `/tmp/box-demo/box.go` — write fresh TS per D-012

End-of-Phase-1 checkpoint: user picks "Box" + slider params → preview renders, all local. `Generator` interface in `shared/` is the contract; Phase 2 LLM router and (optional) Phase 3 `TripoGenerator` slot in without refactor.

### Blockers / Open Questions
See `docs/open-questions.md` for unverified assumptions. None block Phase 1 start.

**D-011 follow-ups to track**:
- Anthropic API budget for Phase 2 (Haiku ~$0.001/call, demo ~100 calls = $0.10) — not material, but log spend
- Phase 3 Tripo decision (catalog adequacy review) — not blocking now

### Notes for Next Session
- User stated preference: **finish early, more time for pitch deck + demo video polish**. Bias toward compressing Phase 1–4, expanding Phase 5
- All 13 ADRs (D-001 ... D-013) in `docs/decisions.md` — do not reopen without prompting
- D-011 is a **framing + architecture decision** — Phase 1 still ships procedural with interface seams + agent narrative ready
- D-012 is a **language consolidation** — TS unified across browser + server. No Go anywhere. `@gltf-transform/core` replaces `qmuntal/gltf`.
- D-013 is a **v1 scope refocus** — cut L2 Derivative, promote Kiosk to v1 must-have, framing narrows to "5 Sui+Walrus exclusive selling points". L2 Move design preserved in §2.8 (annotated `v1.1 deferred per D-013`) but not implemented in v1.
- **v1 demo is 2-act**(Tom L1 + Marcus L3),L2 Sarah persona 已從 product.md 移除
- **Sui Kiosk + TransferPolicy 是 v1 必做**(D-013) — 沒它「protocol-enforced royalty」5-賣點 framing 站不住
- **Backend runtime locked: Node 22 LTS** (not Bun). D-012 left Bun as option; user picked Node at session close.
- LLM in this project is a **router**, not a geometry producer — user explicitly confirmed in office-hours that "LLM draws mesh" is unstable. Do not let scope creep there.
- `/tmp/box-demo/` is a Go throwaway proof — D-012 says **do NOT port**, write fresh TS
- v2+ vision (post-hackathon): full Composable Creator Economy / Programmable IP Layer (D-001 vision) once L2 PMF validated
