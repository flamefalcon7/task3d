# Phase Progress

## Last Updated: 2026-05-14 (Phase 2 plan written + 6-persona doc review applied + P1 patches landed; ready for ce-work dispatch)

### Hackathon Tracker
- Days to submission (6/21): **38 of 38**
- Days to demo day (7/20–21): **67 of 67**
- Days to winners (8/27): **105 of 105**

### Current Phase
**Phase 1: Scaffold — DONE.** Next: **Phase 2: Sui Integration** (5/20 – 5/29, ~10 days).

See `docs/spec.md` §6 for full 5-phase plan.

### Completed This Session

**Pre-Phase 1 (prior sessions)**:
- Pre-work research: Walrus + Seal deep dive, Sui Overflow 2026 handbook verification, SDK landscape (2026-05-08 release train), Tripo competitive analysis, industry pain points
- Architecture: Composable Creator Economy / Programmable IP Layer (D-001), 3-tier `Model3D + Access + Derivative` (D-002), policy modes (D-003), royalty cap (D-004), snapshot immutability (D-005)
- Tech stack locks: GLB only (D-006), drop react-babylonjs (D-007), @mysten/* pinned (D-008), Walrus upload relay (D-010)
- Strategy: testnet submission, mainnet by 8/27 (D-009)
- Office-hours session (D-011): agentic framing pivot — LLM router orchestrates procedural + Tripo generators; lineage on Walrus
- Office-hours session (D-012): TS unified across browser + server; drop Go; `@gltf-transform/core` + Hono + Node 22 LTS
- Office-hours session (D-013): v1 scope refocus — cut L2 Derivative, promote Kiosk to v1 must-have, framing narrows to 5 Sui+Walrus exclusive selling points

**Phase 1 (this session)**:
- Phase 1 plan `docs/plans/2026-05-14-001-feat-phase-1-scaffold-plan.md` (Lightweight depth, 5 units, ~5 days estimate)
- Local env: Node 22.22.3 installed via nvm, locked via `.nvmrc`; pnpm 8.14.1 (Homebrew) used for workspace
- **U1 — Monorepo skeleton**: root `package.json` + `pnpm-workspace.yaml` + `tsconfig.base.json` + `.editorconfig` + 6 top-level dirs. `pnpm install` clean
- **U2 — `shared/`**: `@overflow2026/shared` workspace with `GenerateParams` (discriminated union), `LineageRecord`, `Generator`, `Router`, `ShapeCatalog`. Builds clean
- **U3 — `backend/`**: Hono on `:3001`, 4 procedural generators (box / chest / cylinder / sphere) via `@gltf-transform/core`, `HardcodedRouter` stub behind `Router` interface, zod-validated `POST /api/generate` + `GET /api/preview/:id` + `GET /api/shapes`. **26/26 unit + route tests green**. Live e2e verified: GLB magic `glTF`, 864 B for a 1×1×1 box
- **U4 — `frontend/`**: Vite + React 19 + imperative Babylon wrapper (per D-007 — no `react-babylonjs`), shape picker with dynamic sliders, `Generate` button, Vite proxy `/api` → backend. **6/6 component tests green** (Babylon mocked for jsdom). Live proxy round-trip verified via curl
- **U5 — E2E + docs**: root `pnpm dev` brings both servers up in parallel; README updated with `Run locally (Phase 1)` section + Stack corrections (Go → Node, missed in earlier README pass); this phase-progress update; Phase 1 dev loop confirmed working
- **Post-implementation review** (`/review` skill): scope clean, 7 findings. Applied 2 [P2] fixes: schema ranges aligned to catalog ranges (`backend/src/lib/schema.ts`) + 2 boundary tests added (`width: -1` → 400, `width: 99` → 400)
- **Real-browser smoke** (D-007 / Plan Risk row 3 mitigation): opened `:5173` in browser, exercised all 4 shapes. **Found: cylinder appeared hollow.** Root cause: top + bottom cap fan winding was CW (faces pointing inward), back-face culled → user saw through the caps. Fix in `backend/src/generators/cylinder.ts:54-64` (swap last two indices on each cap fan) + 2 regression tests (`top cap triangles face +Y`, `bottom cap triangles face -Y`). Tests now catch any future cap-winding regression on cylinder. Other 3 shapes verified visually correct.

### In Progress

- **Branch**: `feat/phase-2-sui-integration` (all Phase 2 work lives here; merge to main at Phase 2 end)
- **Plan**: `docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` — 10 units, Deep depth. 6-persona doc review applied (6 P1 patches + cross-persona escalations landed before dispatch).
- **ADRs landed**: D-015 (Model3D tags + lineage_blob_id), D-016 (publish_and_share + purchase_model_access + duration_ms + Phase 4 Kiosk caveat), D-018 (Move input bound assertions), **D-019 (SuiClient → SuiJsonRpcClient + SuiGrpcClient split, surfaced by U3)**. D-017 reserved for U7 React Router 7. Spec §2.5 + §2.8 amended.
- **OQ-013** (Phase 4 Kiosk coexistence) added; **OQ-014** (writeFilesFlow popup count) RESOLVED by U3 — 2 popups for 2 files (quilted into one blob).
- **Units committed (6 commits on branch since main)**:
  - `3fa0f1e` U1 — API refactor (inline bytes; 31 backend + 6 frontend tests)
  - `fbea2d3` U2 — Move contract `model3d::model3d` (21 Move tests pass locally; deploy block — see below)
  - `b832137` U10 — 3 procedural generators sword/hammer/platform (62 backend tests, +31 from U10)
  - `3004f2a` U3 — Walrus frontend wiring with writeFilesFlow + upload relay (17 frontend tests, +11)
  - `eac0c59` D-019 ADR + spec §2.5 amendment
  - `8e5edc6` Move.toml deploy block research notes
- **🚧 Deploy block (parked, well-researched)**:
  - Walrus testnet pkg: `0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66` (queried via `sui client object` on Walrus system_object → `objType`)
  - WAL testnet pkg: `0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a` (queried via WAL coin `objectType`)
  - `sui move build` passes with `override-addresses` syntax in Move.toml; `sui client publish` rejects "unpublished dependencies" because Walrus + WAL upstream Move.toml lacks `[package] published-at`. Sui CLI 1.72.1 has no flag to satisfy this without `--with-unpublished-dependencies` (which republishes the deps — bad).
  - Three resolutions documented in `contracts/model3d/Move.toml`: (a) fork Walrus with `published-at`, (b) local clone + patch + path dep, (c) newer Sui CLI version with proper override flag.
  - Phase 2 U4–U10 don't need a deployed contract; U7–U9 integration smoke tests will need it. Deploy investigation deferred to a focused session before final integration.
- **Subagent in flight (started 2026-05-15 ~01:30 GMT+8)**: U5 retry #2 — first attempt died on Read truncation, second on Anthropic API rate limit (now reset).

### Dispatch sequencing (for resume)

1. **U5** (AnthropicRouter) — in flight. Touches `shared/src/types.ts`, `backend/src/agent/router.ts`, `backend/src/lib/schema.ts`, `backend/src/server.ts`, `backend/src/routes/generate.ts`.
2. **After U5 lands**: dispatch **U4 + U6 in parallel** (zero file overlap):
   - U4 (Auth): `frontend/package.json`, `frontend/src/main.tsx`, `frontend/src/auth/*`, `backend/src/routes/auth.ts`, `backend/src/server.ts`, `backend/src/lib/schema.ts`, `backend/src/lib/jwt.ts`
   - U6 (Tripo): `shared/src/types.ts` (full TripoParams over U5 placeholder), `backend/src/generators/tripo.ts`, `backend/src/lib/tripo-client.ts`, `backend/src/generators/index.ts`
   - **CAVEAT**: U4 + U6 both touch `backend/src/server.ts` if U6 needs server bootstrap changes; verify. U6 also touches `shared/src/types.ts` which U4 doesn't — safe.
3. **After U6 lands**: dispatch **U8** (Browse marketplace) — adds `Model3DSummary` to `shared/src/types.ts`, creates `frontend/src/browse/*`, modifies `frontend/src/App.tsx`.
4. **After U4 + U8 land**: dispatch **U7 + U9 in parallel** (mostly disjoint — U7 = `frontend/src/creator/*` + `frontend/src/sui/publishPtb.ts`; U9 = `frontend/src/buy/*` + `frontend/src/sui/purchaseAccessPtb.ts`).
5. **Manual orchestrator step**: resolve testnet deploy block (one of the 3 options in `contracts/model3d/Move.toml`); capture `MODEL3D_PACKAGE_ID` + UpgradeCap into `.env.testnet`. Then run U7 + U9 e2e smoke against testnet.

### Next Concrete Step
**Dispatch /ce-work on the Phase 2 plan.** The 9 units have meaningful parallelism: U1 (API refactor), U2 (Move contract), U3 (Walrus), U4 (Auth), U5 (AnthropicRouter), U6 (TripoGenerator), U10 (3 procedural generators) are mostly independent and can dispatch in parallel via worktree-isolated subagents. U7 (Creator e2e), U8 (Browse), U9 (Buyer e2e) are integration units and run sequentially after foundations land.

Original sequencing reference per `docs/spec.md §6 Phase 2`:

Sequencing per `docs/spec.md` §6 Phase 2:
1. **Move contract** — `model3d::model3d` package in `contracts/`. Reference `SharedBlob` pattern from `@mysten/walrus`. **D-014**: add `tags: vector<String>` field on `Model3D`. Local `sui move test` for mint/extend/burn. Deploy to testnet, record `MODEL3D_PACKAGE_ID`
2. **Walrus** — wire `@mysten/walrus@1.1.7` + `@mysten/walrus-wasm@0.2.2` in frontend, Vite WASM config, upload relay endpoint in backend, `writeFilesFlow` upload from browser
3. **Auth** — dApp Kit 1.0 + Enoki Google zkLogin + Slush wallet; backend verifies signed challenge → Sui address, JWT session
4. **LLM router (D-011)** — replace `HardcodedRouter` with `AnthropicRouter` using `@anthropic-ai/sdk` + structured output + zod schema. Cost ~$0.001/call (Haiku). Keep `Router` interface unchanged so frontend code does not refactor. **D-014**: LLM also extracts tags from prompt
5. **`TripoGenerator` (D-014, from D-011 Phase 3 → Phase 2)** — `backend/src/generators/tripo.ts` implements `Generator` interface. Async polling client. Fixed params: P1 model, `face_limit=5000`, `texture=false`. Used in seed phase only; demo观众不直接呼叫
6. **Lineage on Walrus (D-011)** — backend writes `lineage.json` blob alongside GLB per generation (prompt, LLM decision trace, params, generator source)
7. **End-to-end creator flow** — type → LLM route → procedural/Tripo generate → preview → Walrus upload → PTB `model3d::mint(tags)` → testnet wallet shows Model3D NFT
8. **Browse marketplace (D-014)** — Sui indexer query for all `Model3D` on testnet; frontend `/` Browse page with grid + Walrus aggregator preview + Buy Access flow; frontend `/generate` becomes secondary route
9. **End-to-end buyer flow (D-014)** — Browse → click card → Connect Wallet → Buy Access → wallet shows soulbound `Access`
10. **Generator catalog expansion** — add sword / hammer / platform procedural generators (total 7 procedural shapes)

### Blockers / Open Questions
See `docs/open-questions.md`. None block Phase 2 start. Open follow-ups:
- Anthropic API budget tracking (Haiku ~$0.001/call; demo budget ~$0.10 — not material)
- **D-014a Phase 3 game scene form factor** (G1/G2/G3) — decide at end of Phase 2 (~5/29) once catalog content is known. See OQ-011
- **OQ-012 catalog search** — v1 ships browse + tag filter only; semantic search v1.1+
- **Tripo free tier budget** — 300 credits/month × 2 months (May+June) = 6-10 P1 calls total. Reserve for Phase 3 seed catalog (5-8 hero models). Do not burn on Phase 2 testing — use `texture=false` (60 credits/call) or fewer test calls

### Notes for Next Session
- **Phase 1 invariants to preserve in Phase 2**:
  - `Router` interface in `shared/src/types.ts` is the seam — Phase 2's `AnthropicRouter` must implement it; frontend `lib/api.ts` and Hono route handlers should not change
  - `Generator` interface is the second seam — Phase 3's optional `TripoGenerator` slots in here
  - `LineageRecord` is the third seam — Phase 2 fills `prompt` and `llmDecision`, Phase 3 may flip `generatorSource` to `'tripo'`
- Backend GLB store is currently `backend/tmp/<uuid>.glb` (local disk). Phase 2 replaces with Walrus upload — `backend/tmp/` writes can be kept as a transient staging area before Walrus PUT, or dropped entirely if frontend uploads directly via upload relay
- Per D-013: Kiosk + TransferPolicy is v1 must-have (Phase 4), L2 Derivative is v1.1 deferred (preserve `Derivative` / `DerivativeApproval` Move structs in `spec.md §2.8` but do not implement in v1)
- User stated preference: **finish early, more time for pitch deck + demo video polish**. Bias toward compressing Phase 1–4, expanding Phase 5
- All 14 ADRs (D-001 ... D-014) in `docs/decisions.md` — do not reopen without prompting. **D-014 reframes Tripo to "creator's optional self-paid tool" + demo to "browse-first marketplace"** — the previous mental model of "every user types prompt → service generates" is wrong now
- Frontend TS pin is `~5.8.0` (matches Vite scaffold's `erasableSyntaxOnly` requirement); backend + shared are on `~5.5.0`. Not unified yet — bump when convenient
- `vite.config.ts` and `vitest.config.ts` are split intentionally — Vitest 2.x's bundled Vite 5 types conflict with Vite 8's `server.proxy`. Don't merge them back without a Vitest 3 upgrade
- **Procedural mesh testing lesson (Phase 1 cylinder bug)**: vertex-count + triangle-count assertions are NOT enough. They pass while winding is inverted — only browser rendering reveals it. **For every new generator added in Phase 2+, write a normal-direction test for at least one representative triangle per face/cap.** See `backend/src/generators/cylinder.test.ts:triNormalY` for the helper pattern; Phase 2 generators (sword, hammer, platform) should each carry equivalents
- v2+ vision (post-hackathon): full Composable Creator Economy / Programmable IP Layer (D-001 vision) once L2 PMF validated
