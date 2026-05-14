# Phase Progress

## Last Updated: 2026-05-14 (post-office-hours, D-011 ratified)

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

### In Progress
- Nothing yet — about to start Phase 1 implementation with D-011 architecture

### Next Concrete Step
**Start Phase 1 scaffold** (now including D-011 Generator interface + agent router stub):

1. `mkdir backend frontend contracts samples pitch`
2. Backend: `cd backend && go mod init github.com/<user>/model3d && touch main.go` — Go skeleton with `chi` router (or stdlib `net/http`)
3. **`backend/generators/generator.go`** — `Generator` interface (`Generate(params) → GLB bytes`, `Capabilities() → []string`)
4. **`backend/generators/box.go`** — port from `/tmp/box-demo/box.go`, implement `Generator` interface
5. **`backend/agent/router.go`** — stub only (hardcoded `shape name → generator` map). Phase 2 wires real Anthropic API.
6. Bring up frontend: `cd frontend && pnpm create vite . --template react-ts` — wire Babylon imperative wrapper (Engine + Scene + ArcRotateCamera + GLB loader in useEffect)
7. Wire frontend ↔ backend with mock JSON first, **no Sui / Walrus / LLM yet** (defer all to Phase 2)

End-of-Phase-1 checkpoint: user picks "Box" + slider params → preview renders, all local. `Generator` interface in place so Phase 2 LLM router and (optional) Phase 3 `TripoGenerator` slot in without refactor.

### Blockers / Open Questions
See `docs/open-questions.md` for unverified assumptions. None block Phase 1 start.

**D-011 follow-ups to track**:
- Anthropic API budget for Phase 2 (Haiku ~$0.001/call, demo ~100 calls = $0.10) — not material, but log spend
- Phase 3 Tripo decision (catalog adequacy review) — not blocking now

### Notes for Next Session
- User stated preference: **finish early, more time for pitch deck + demo video polish**. Bias toward compressing Phase 1–4, expanding Phase 5
- All 11 ADRs (D-001 ... D-011) in `docs/decisions.md` — do not reopen without prompting
- D-011 is a **framing + architecture decision**, not a code rewrite — Phase 1 still ships procedural, just with the right interface seams + agent narrative ready
- LLM in this project is a **router**, not a geometry producer — user explicitly confirmed in office-hours that "LLM draws mesh" is unstable. Do not let scope creep there.
- `/tmp/box-demo/` is a throwaway proof — port to `backend/generators/` then delete
