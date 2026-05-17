# Phase Progress

## Last Updated: 2026-05-17 evening — **Plan-004 shipped end-to-end.** All 5 units (U1 car-physics fix, U2 extruded ribbon track, U3 lap state machine + triggers, U4 HUD + PB + retry, U5 carousel teardown) landed in 6 commits on `feat/phase-2-sui-integration`. Frontend tests: 159 → 214 (+55), backend 132, workspace typecheck clean. **Manual /track smoke remains user-driven** — drive a lap with the dev fixture, beat a PB, switch cars, confirm per-car PB isolation. See plan's §Verification.

## Session 2026-05-17 evening — Plan-004 tiny-racetrack game loop

### Commits this session

```
77bb053 chore(backend): revert glb.ts cast to Float32Array<ArrayBuffer>
a0aad59 feat(track): U5 — carousel switching teardown + PB isolation across cars
068d11b feat(track): U4 — HUD overlay + per-car PB + result modal + retry
76f5ea2 feat(track): U3 — lap state machine + per-frame trigger volumes + reset
1f9a363 feat(track): U2 — procedural oval track (ribbon + tangent-aligned barriers)
3936401 feat(track): U1 — fix car physics (pivot + steer via physics API)
fd55d1b docs(plan): brainstorm + plan-004 — tiny racetrack 1-lap game loop
e3e458e feat(browse): top-nav links to Forge + Racetrack; relabel single mint
e9b1dea feat(frontend): dev /dev/compare page for Tripo model_version diffing
5a386f5 chore(backend): TS-compat GLB cast + Tripo Turbo-v1.0 + verbose submit errors
```

### Unit completion

| Unit | Files added/modified | Tests delta | Commit |
|---|---|---|---|
| U1 | racetrackScene.{ts,test.ts} | +7 (KTD-1/KTD-2 wiring) | `3936401` |
| U2 | oval.{ts,test.ts} + racetrackScene.{ts,test.ts} | +12 (9 oval + 3 net scene) | `1f9a363` |
| U3 | lapState.{ts,test.ts} + racetrackScene.{ts,test.ts} | +14 (10 reducer + 4 wiring) | `76f5ea2` |
| U4 | personalBest.{ts,test.ts}, ResultOverlay.{tsx,test.tsx}, TrackPage.{tsx,test.tsx} | +20 (6 PB + 7 modal + 7 page) | `068d11b` |
| U5 | TrackPage.{tsx,test.tsx} | +2 (AE6 isolation scenarios) | `a0aad59` |

### Key decisions made during execution

- **KTD-7 ribbon track** delivered. Catmull-Rom math implemented inline in `oval.ts` rather than wrapping Babylon's `Curve3.CreateCatmullRomSpline` — keeps the module pure (no WebGL needed in tests) and decouples us from Babylon's spline behavior changing across versions. Lap perimeter ~150 units at the chosen (35×50, r=10) config.
- **KTD-4 Havok trigger volumes** → **AA-3 fallback chosen.** Used per-frame distance-check (TRIGGER_RADIUS=8) instead of `PhysicsShape.isTrigger`. Plan accepts both; AA-3 was cheaper to wire, deterministic, and avoided the 15-min spike into the 1.3.12 Havok type definitions. Documented inline.
- **R-r4b safety ground** preserved underneath the road. Wide flat invisible floor at y=-0.5 catches the car if it bounces over a barrier. Road ribbon's MESH collider is the primary driving surface; ground is the fallback floor (kept the implementation cost ~5 LOC and removes a class of "car falls into void" demo failures).
- **HUD stays mounted during scene reload.** During carousel switching, the loading overlay covers the HUD visually but the values for the new car are already in the DOM — no flash of empty state. Surfaced by writing the U5/AE6 test.
- **glb.ts cast reverted.** Earlier 5a386f5's "unknown-cast for compat" was actually a regression; @gltf-transform/core's setArray() pins to `Float32Array<ArrayBuffer>` (narrow). Restored explicit narrow cast — works on both backend TS 5.5 and frontend TS 5.8.

### Verification status

- ✅ Frontend tests: 214 passed (159 → 214, +55 new — U1+U2+U3+U4+U5 collectively)
- ✅ Backend tests: 132 passed (no change — backend untouched in plan-004)
- ✅ Move tests: untouched (21 passed, no contract changes)
- ✅ Workspace typecheck: clean (shared + backend + frontend)
- ⏳ **Manual /track smoke** (user-driven — per CLAUDE.md "if you can't test the UI, say so explicitly"): drive a lap with `/dev-glbs/p1.glb`, beat the PB, retry via button + R-key, switch cars in carousel, confirm per-car PB isolation. See plan's §Verification.

### Insights worth carrying forward

- **Plan-time hard-time-box + named fallback worked.** U2 carried a "2-day box, fall back to AA-2 inner-wall-ring if ribbon doesn't land by EOD-1". Implementation landed within the first attempt at the primary path. The fallback being named in the plan meant zero second-guessing during execution. Worth re-using on any "longest unit in the plan" that has known risk surface.
- **Pure-module + tiny mock pattern.** `oval.ts` uses only Babylon's Vector3 as a value type. Test mocks just Vector3 with a `{x,y,z}` class — no full Babylon mock surface needed. 9 tests in 6ms. Pattern reusable for any geometric/math helper that's "Babylon-adjacent but doesn't need WebGL".
- **Per-frame trigger volumes are simpler than Havok-native triggers.** AA-3 (plane intersection / distance check) shipped in ~15 LOC + 4 scene tests. Havok-native triggers would have required spelunking 1.3.12 .d.ts files + handling collision observable lifecycles + cleanup on dispose. For lap-detection-style "did X enter zone Y" gameplay, distance checks are correct by construction and easier to test.
- **HUD-during-reload surfaced by writing the U5 test.** The plan didn't explicitly call out "HUD stays mounted during scene reload" — I'd hidden it on sceneLoading initially. The AE6 test forced me to think about what the user actually sees during a carousel switch (loading overlay covers HUD visually anyway, so the conditional was strictly worse UX). Tests-as-spec working as intended.

### Hackathon Tracker

- Days to submission (6/21): **35 of 38**
- Days to demo day (7/20–21): **64 of 67**
- Days to winners (8/27): **102 of 105**

### Next concrete step

User runs the manual /track smoke per plan-004's §Verification. After that lands ✅: Phase 3 is fully closed (Forge + Tiny Racetrack both demo-ready). Next priority per the prior session's roadmap: **Phase 4 — Sui Kiosk + TransferPolicy royalty integration** (D-013 v1 must-have, biggest unstarted risk; OQ-013 → Phase 4 ADR needed first).

### Previous session notes preserved below

---

## Previously Last Updated: 2026-05-17 PM — **U7 path debugged.** 8 commits this session on `feat/phase-2-sui-integration` removing every latent blocker between Forge → Walrus → Sui that the Phase 3 test suite (mocked) couldn't catch. First successful live testnet mint produced collection `0x38bad19ea39a007cca17311275d99f7a15994b18632a2938a5a7e296ee4925b4` (1 variant `0x46f248975df4c202d8950efa26d9892b3bf62e9764d39829cea2f4786ae86a58`). Walrus round-trip script proven byte-identical end-to-end. Frontend tests: 159/159, tsc clean. **U7 capture artifacts (multi-variant mint, two-wallet buy + drive, 90-sec recording, Suiscan screenshots) still pending** — those are the human-driven steps the user runs through `pitch/demo-script.md`.

## Session 2026-05-17 PM — live-testnet debugging pass

User started this session asking how to test U7. Read past phase-progress + plan-003 §U7 + demo-script for context. Then ran the live mint path and surfaced 8 distinct blockers — each one a latent bug that vitest mocks couldn't surface. All fixed in-session with tests + typecheck green throughout.

### Commits this session

```
d155dff feat(preview): render real Babylon previews on browse/collection/model pages
a76bbc6 fix(forge): drop hardcoded 'Neon Drift Series' default collection name
7c1fa14 chore(walrus): node round-trip smoke test (upload + aggregator download)
ceebf17 fix(walrus): pass register tx digest into flow.upload()
cf98acf fix(babylon): pass pluginExtension '.glb' so blob: URLs load
a0a2cbe feat(forge): preview button — render variants before minting
3f5099e fix(walrus): add signAndExecuteTransaction to dapp-kit signer shim
```

### Bug-by-bug log

| # | Symptom (live testnet) | Layer | Root cause | Commit |
|---|---|---|---|---|
| 1 | `signer.signAndExecuteTransaction is not a function` at popup 1 | dapp-kit ↔ Walrus | `@mysten/walrus@1.1.7` client.mjs:1298 calls `signer.signAndExecuteTransaction({transaction,client})`; our shim only exposed `toSuiAddress + signTransaction`. Comment in code even claimed otherwise — true of older SDK, not 1.1.7. | `3f5099e` |
| 2 | No way to preview variants before signing 3 popups | Forge UX | Mint button ran build → upload → sign as one block. Added Preview button + freshness hash check; Mint reuses GLBs if state unchanged. | `a0a2cbe` |
| 3 | Variant preview canvas empty (load silently fails) | Babylon | `LoadAssetContainerAsync` infers loader from URL extension; `blob:` URLs have none. Passing `pluginExtension: '.glb'` unconditionally (we only ever load GLB per D-006). | `cf98acf` |
| 4 | `Either resume.blobObjectId or upload digest must be provided` at Walrus relay step | Walrus upload flow | `useWalrusUpload` called `flow.upload({})`. The canonical pattern (SDK's own `run` generator) captures `txDigest` from `executeRegister` and forwards it into `upload({digest})`. | `ceebf17` |
| 5 | Need offline confidence Walrus path actually works | infra | Wrote `frontend/scripts/walrus-roundtrip.mjs` — mirrors `useWalrusUpload` line-by-line but driven by an Ed25519 keypair. Verified 781 KB GLB + 4 KB random both round-trip byte-identical in 12.4 s. Quilt batching confirmed (same `blobObjectId` across patches). | `7c1fa14` |
| 6 | Collection name pre-filled "Neon Drift Series" on every visit | Forge UX | The plan-003 brainstorm example name leaked into `useState` default. Reset to empty; placeholder + `canMint` length check already gate the button. | `a76bbc6` |
| 7 | `/`, `/collection/<id>`, `/model/<id>` all show static ◇ glyph instead of model | preview UX | All 3 pages had hidden `<img>` tags pointing at GLB URLs (which `<img>` can't render). Comments labelled it "Phase 5 polish may render Babylon" — promoted now since user is actually browsing live mints. Each page swapped to per-tile `PreviewCanvas`. | `d155dff` |
| (additional) | Earlier session's `bdefe91` / `16c023c` / `b56b50d` etc. were the prior-session batch of similar live-testnet fixes. Same theme: vitest covers code shape, not API contract reality. | — | — | — |

### Live-testnet artifacts produced this session

```
Mint tx digest:    AZSBMxc2RcHTtBrPiKVRHaM3y7xEXCsStsoPsxE234nr   (Walrus quilt round-trip script)
Collection object: 0x38bad19ea39a007cca17311275d99f7a15994b18632a2938a5a7e296ee4925b4
Model3D variant:   0x46f248975df4c202d8950efa26d9892b3bf62e9764d39829cea2f4786ae86a58
Walrus blob:       OSRXKPVDiQhXzif8G11QsRjLXPX11Ul4c9sgWf7AAzM
Walrus blob obj:   0x92f8c97ffa12d8564be0f79177a31e07f8b7a6dc9242bf8d04f1020672f19ef7
Wallet (creator):  0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed (capy)
```

### Insights worth carrying forward

- **Vitest blind spots are systemic, not bug-of-the-day.** Every blocker this session was a contract mismatch between our code and a third-party SDK — and every one had tests that mocked the SDK with our wrong assumption baked in (`useWalrusUpload.test` mocked `executeRegister` shape; `ForgePage.test` mocked `useWalrusUpload` entirely; `PreviewCanvas.test` mocked Babylon's loader so the `blob:` URL extension issue couldn't fire). Captured CLAUDE.md note already says "type checking and test suites verify code correctness, not feature correctness." Reinforced 5x this session. **Action**: any new SDK adapter should ship with at least one integration test that hits the real SDK (or a recorded fixture), not a fully mocked one.
- **A Node-side round-trip script is a force multiplier.** `walrus-roundtrip.mjs` decouples Walrus debugging from React + wallet popups + Babylon. When a browser-side bug surfaces, we can split-test: does the Node script pass? If yes → bug is React/wallet-side; if no → bug is Walrus-side. Saved at least 2 wrong directions this session.
- **D-006 GLB-only assumption simplifies Babylon plumbing.** Unconditional `pluginExtension: '.glb'` is correct precisely because the decision is locked. Worth re-examining when v1.1 considers FBX/USDZ — the unconditional pattern would silently break.
- **WebGL context cap is going to bite on Browse/Collection pages.** Capped now via per-tile canvases that work fine ≤8 cards but degrade past that. Acceptable for v1 (variant cap is 16; marketplace card count is small in demo). Phase 5 fix: lazy-mount via IntersectionObserver, or generate static thumbnails at mint time.

### What still needs to happen for U7 dev verification (per D-026: capture deferred to Phase 5)

1. Mint a real **5-variant** collection via Forge on localhost-testnet (multi-variant flow not yet exercised live)
2. Switch to a **second wallet** (faucet ~5 SUI), click Buy Access on a variant — confirm tx succeeds
3. Open `/track` on wallet B, confirm the owned variant appears in the carousel and drives

Recording, Suiscan screenshots, and production URLs are explicitly **out of scope until Phase 5** (D-026 — record once against the final mainnet + Kiosk flow rather than re-record after every phase).

### Feature priorities going forward (per user direction 2026-05-17 PM)

User priority order: **complete all features first → deploy + record at the end.** Two ADRs landed this session capturing the resulting scope edits:

- **D-025**: drop the seed catalog. Live mints during demo recording are viable now that Turbo-v1.0 (D-024) brings prompt-mode to ~15s; the seed catalog mitigation no longer applies. Frees ~5–8 Tripo calls as recording-day buffer.
- **D-026**: defer production deploy + demo capture + traction signals to Phase 5. Avoids re-recording after Phase 4 mainnet redeploy + Kiosk integration. Project stays localhost-only until Phase 5.

**Remaining feature work (in priority order):**

1. **Phase 3 close**: U7 dev verification (5-variant mint + buy + drive on localhost-testnet) — small remaining lift, no recording
2. **Phase 4**: Sui Kiosk + TransferPolicy royalty integration (D-013 v1 must-have, zero LOC today — biggest unstarted risk)
3. **Phase 4**: Mainnet redeploy + network switcher in frontend
4. **Phase 4 Stretch A**: Seal encryption for `is_encrypted=true` models
5. **Phase 4 Stretch B**: Forensic watermark
6. **Phase 5**: Production deploy (Vercel + cloud VM), demo recording, Suiscan capture, DeepSurge submission, README polish, pitch deck slides, traction signals — all batched at the end

### Hackathon Tracker
- Days to submission (6/21): **35 of 38**
- Days to demo day (7/20–21): **64 of 67**
- Days to winners (8/27): **102 of 105**

---

## Phase 3 closeout (2026-05-16 PM) — kept for context

### Commits this session

```
d811870 refactor(router): drop AnthropicRouter; prompt mode dispatches to Tripo (D-023)
+1 docs(env) — Enoki vars documented in frontend/.env.example
b56b50d fix(dev): backend env loading + correct Sui testnet GraphQL endpoint
638b9c5 feat(frontend): U6 — /track Havok physics + WASD + chase camera
773feee feat(frontend): U5 — Browse grouping + /collection/:slug
80344ce feat(frontend): U4 — /forge + buildCollectionPtb
417474f feat(backend): U3 — POST /api/collection/build
73eb32f chore(phase-3): pre-stage shared types + route stubs (U3/U4/U5 parallel-batch prep)
0d0e0ab feat(deploy): U2 — publish model3d to testnet — Phase 3 contract live
0769617 feat(contract): U1 — Phase 3 Collection struct + N×variant mint flow
3ff78ee docs(adr): D-022 @babylonjs/havok adoption for Tiny Racetrack physics
cf26fb0 fix(walrus): spikes A+B+C — patch useWalrusUpload wiring; verify PTB chain shape
```

### ADRs landed this session

- **D-020** — Phase 3 demo pivot (Collection Forge + Tiny Racetrack)
- **D-021** — Walrus testnet dep subtree fix (one-line Move.toml change)
- **D-022** — `@babylonjs/havok` adoption for Tiny Racetrack rigid-body physics
- **D-023** — drop `AnthropicRouter`; prompt mode dispatches directly to Tripo (narrows D-011 + D-014)

### Sui testnet artifacts (live, verified)

```
PackageID:  0x18a480b3ff2219ac6666177221bafb37aa79a81122890581025b4737aef05ac3
UpgradeCap: 0x11b63b1f9a1677e20a6f7015416da8dde4e291b72ed7563cc5de2bf0268fd795
Deploy tx:  8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A
Gas used:   ~0.029 SUI on testnet
Deployed wallet (creator):
            0x3116881ca3ebeb80f4ec82f1f11572d6341875d6c3f2cbeaf6990fb5723591ed
Sui Scan:   https://suiscan.xyz/testnet/tx/8gKrqemFVcAeBr3rifQurRDGuSF7pm2Yp44wXo15Kv5A
```

### Plan-003 unit completion

| Unit | Status | Commit | Test delta |
|---|---|---|---|
| **Spike-A** useWalrusUpload wiring | ✅ PASS | `cf26fb0` | +1 regression test |
| **Spike-B** PTB chain shape (pattern b) | ✅ PASS | `cf26fb0` | +5 structural tests |
| **Spike-C** Walrus aggregator URL (outcome a) | ✅ PASS | docs only | n/a |
| **U1** Move Collection struct + entries | ✅ | `0769617` | Move 21 → 37 |
| **U2** Testnet deploy + Phase 2 regression smoke | ✅ | `0d0e0ab` | All 250 tests at deploy time |
| **U3** Backend material-swap endpoint | ✅ | `417474f` | Backend 113 → 130 |
| **U4** Forge page + buildCollectionPtb | ✅ | `80344ce` | Frontend 100 → 119 |
| **U5** Browse grouping + Collection detail | ✅ | `773feee` | Frontend 119 → 158 |
| **U6** Tiny Racetrack + Havok | ✅ R1 PASS (no fallback) | `638b9c5` | Frontend 158 (+20 in track/) |
| **U7** E2E + demo capture | ⏳ User-driven (manual) | — | n/a |

### Live-tested endpoints (post-D-023, current dev server state)

All 6 backend endpoints + 4 external services verified working via curl. See `docs/process.md` for the full endpoint matrix.

Two issues we discovered ONLY by running the live dev server (vitest had passed but missed both):
1. Backend died at startup with `JwtConfigError: JWT_SECRET must be set` — fixed in `b56b50d` by adding `--env-file=.env` to the `tsx watch` dev script + generating + documenting `backend/.env` template.
2. Browse "Failed to fetch" — `SUI_GRAPHQL_ENDPOINT` pointed at the deprecated + DNS-removed `sui-testnet.mystenlabs.com`. Replaced with `graphql.testnet.sui.io/graphql` per current Sui docs.

CLAUDE.md captures the underlying lesson: "type checking and test suites verify code correctness, not feature correctness — if you can't test the UI, say so explicitly rather than claiming success." Failed to honour that twice this session; ChatGPT-equivalent learnings captured in process doc.

### Insights worth carrying forward

- **Pre-flight spikes pattern works.** Three 30-min spikes (R7/R8/R9) all landed PASS verdicts BEFORE U1 dispatched — saved ABI churn that would have wasted ~1 day if we'd discovered them mid-U1.
- **D-023 lesson** (LLM router as decorative-for-committed-flow-UX): when the user-facing surface has already pre-committed to a generator choice, an LLM "deciding which generator" call is decorative — pay the latency + cost + failure-mode tax for zero signal. Reusable for any AI-routed app: ask "is the routing decision actually open at this UX surface?" before integrating an LLM router.
- **Worktree isolation false-negative.** `Agent isolation: "worktree"` failed for this repo with `Cannot create agent worktree: not in a git repository`, despite the repo being a real one. Fell back to shared-directory mode + pre-staging shared files (commit `73eb32f`) to avoid collisions. Worked cleanly. Worth filing this with the harness team — the git-detection has a false-negative case.
- **Parallel-batch with pre-staging.** Even without worktree isolation, U3+U4+U5 parallel-dispatched successfully by pre-staging shared files (`shared/src/types.ts`, route stubs in `App.tsx`) so each subagent had clean isolated file ownership. Pattern worth re-using.
- **Subagent dispatch tight-reads pattern held up.** All 4 U-units (U3/U4/U5/U6) used inline skeletons + 5-8 file read lists per the captured 2026-05-15 learning. Zero subagent OOM'd at 40-50K tokens this round — Phase 2's failure mode didn't reappear.

### Hackathon Tracker
- Days to submission (6/21): **37 of 38**
- Days to demo day (7/20–21): **66 of 67**
- Days to winners (8/27): **104 of 105**

---

## Pre-Phase-3 history (prior sessions, kept for context)

## Original log header (kept for history):

## ~2026-05-16 AM Snapshot~ — Plan-003 written, doc-reviewed (headless), 9 P0+P1 fixes walkthrough applied. **Ready for `/ce-work`.** Plan file: `docs/plans/2026-05-15-003-feat-phase-3-collection-forge-plan.md`. 3 pre-flight spikes (A/B/C) documented in plan's Risks & Dependencies section — they run before U1. Branch `feat/phase-2-sui-integration` carries uncommitted docs (D-020, D-021, brainstorm, plan, Move.toml fix, phase-progress, solutions update) — recommend committing before `/ce-work` dispatches.

### Hackathon Tracker
- Days to submission (6/21): **37 of 38**
- Days to demo day (7/20–21): **66 of 67**
- Days to winners (8/27): **104 of 105**

### Current Phase
**Phase 2: Sui Integration — CODE COMPLETE 2026-05-15.** 10 units shipped on `feat/phase-2-sui-integration` branch (17 commits since `main`); 104 backend + 91 frontend + 21 Move tests all green. Two operational blockers before merge to `main`:
1. **Testnet deploy** — Walrus + WAL `published-at` dep linking unresolved (3 paths documented in `contracts/model3d/Move.toml`). Phase 2 code is testnet-ready; just need the deploy step.
2. **Live e2e smoke** — depends on deploy; will produce real `MODEL3D_PACKAGE_ID` and demo screenshots.

Next: **Phase 3 — Real-World Application** (5/30 – 6/10 per `docs/spec.md` §6); see Notes.

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

### Phase 2 Code Closeout (2026-05-15)

- **Branch**: `feat/phase-2-sui-integration` (17 commits since `main`)
- **Plan**: `docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` — 10 units, Deep depth. 6-persona doc review applied (6 P1 patches + cross-persona escalations landed before dispatch).
- **ADRs landed**: D-015 (Model3D tags + lineage_blob_id), D-016 (publish_and_share + purchase_model_access + duration_ms + Phase 4 Kiosk caveat), D-017 (react-router-dom@7.5.x), D-018 (Move input bound assertions), D-019 (SuiClient → SuiJsonRpcClient split). Spec §2.5 + §2.8 amended.
- **OQs**: OQ-004 RESOLVED by U4 (dapp-kit 1.0 is a single package, no -core/-react split; real import paths captured). OQ-013 (Phase 4 Kiosk coexistence) added — defer to Phase 4 ADR. OQ-014 RESOLVED by U3 (writeFilesFlow quilts N files into one blob → 2 popups regardless of file count).

#### Units shipped (commit hashes)

| Unit | Commit | Adds | Tests |
|---|---|---|---|
| U1 | `3fa0f1e` | API refactor — inline GLB bytes + lineage in `POST /api/generate` response; drop `/api/preview/:id` + `backend/tmp/` | backend 26 → 31, frontend 6 |
| U2 | `fbea2d3` | Move contract `model3d::model3d` — L1 + Access + tags + lineage_blob_id + D-018 input assertions | Move 21 |
| U10 | `b832137` | sword/hammer/platform procedural generators + normal-direction tests | backend 31 → 62 |
| U3 | `3004f2a` | Walrus frontend — `getWalrusClient`, `useWalrusUpload` driving writeFilesFlow + relay | frontend 6 → 17 |
| U5 | `7064f28` | AnthropicRouter — tool-use structured output + zod, `paramRanges` single-source-of-truth, `HardcodedRouter` fallback | backend 62 → 72 |
| U4 | `ff73b01` | Auth — dApp Kit + Enoki + Slush + signed-challenge JWT (flag-byte scheme dispatch) | backend 72 → 89, frontend 17 → 29 |
| U6 | `20b9c54` + `42d345d` | TripoGenerator — async polling client (Tripo P1 v2/openapi); env-gated; server.ts wiring | backend 89 → 104 |
| U8 | `5a79d64` | Browse marketplace — Sui GraphQL indexer + grid + BrowserRouter shell; `Model3DSummary` type | frontend 29 → 42 |
| U7 | `ed01a1b` | Creator e2e — CreatorFlow + PromptInput + NameInput + MintButton (Step X of 3) + publishPtb + BCS LicenseTerms snapshot | frontend 42 → 67 |
| U9 | `ce626e1` | Buyer e2e — ModelDetailPage + BuyAccessButton + purchaseAccessPtb + useModelById + useOwnsAccess (DL-009 guard) | frontend 67 → 91 |

**Final test counts: backend 104, frontend 91, Move 21 = 216 total tests, all green.**

### Phase 2 Knowledge Capture (2026-05-15 PM)

Eight `docs/solutions/` entries written via 8 sequential `/ce-compound` lightweight passes — captures Phase 2's non-obvious learnings while context is fresh, so future Phase 3+ sessions (and `ce-learnings-researcher`) inherit them:

| # | Doc | Category | Why it's worth capturing |
|---|---|---|---|
| 1 | `sui-ptb-struct-arg-pitfall-2026-05-15.md` (prior session) | integration-issues | P0 PTB struct-as-`vector<u8>` bug — `dryRunTransactionBlock` test rule |
| 2 | `walrus-wal-published-at-deploy-block-2026-05-15.md` | integration-issues | The current testnet deploy block + 3 documented resolution paths |
| 3 | `mysten-sui-client-split-jsonrpc-grpc-2026-05-15.md` | tooling-decisions | D-019 — `SuiClient` → `SuiJsonRpcClient`/`SuiGrpcClient` migration |
| 4 | `walrus-writefilesflow-popup-batching-2026-05-15.md` | architecture-patterns | OQ-014 — N files = 2 popups via quilt batching |
| 5 | `param-ranges-single-source-of-truth-2026-05-15.md` | design-patterns | R14 — `paramRanges` shared by zod + catalog + RouterDecisionSchema |
| 6 | `cors-is-browser-only-cost-bearing-endpoints-need-server-auth-2026-05-15.md` | best-practices | P0 #2 — CORS doesn't gate `curl` against metered upstreams |
| 7 | `in-memory-nonce-store-needs-explicit-ttl-sweep-2026-05-15.md` | best-practices | Parked P1 — lazy-delete leaks abandoned nonces |
| 8 | `subagent-dispatch-tight-reads-inline-skeletons-2026-05-15.md` | conventions | Compound-engineering workflow learning: broad-read subagents die at 40-50K |

CLAUDE.md project-structure tree already references `docs/solutions/` (added with the first capture). All 8 docs are now discoverable to `ce-learnings-researcher` runs starting Phase 3.

### Phase 2 Polish Batch (2026-05-15 late PM, commit `48a480e`)

5 P1/P2 mechanical fixes from the code-review batch (the user picked "Demo-risk + mechanical (Recommended)"):

| # | Fix | Files | Tests added |
|---|---|---|---|
| 1 | **MintButton dead-branch step labels** — replaced unreachable `popupCount === 0/1` branches with reactive `uploadStage` from `useWalrusUpload`. Walrus stages (`awaiting-register` / `relay-upload` / `awaiting-certify`) now drive accurate Step 1/2 of 3 labels. | `useWalrusUpload.ts`, `MintButton.tsx`, `CreatorFlow.tsx` | +3 (uploadStage coverage) |
| 2 | **Tripo per-request timeout** — `TripoClient.submitTask` / each `pollTask` fetch / `downloadGlb` now ride `AbortSignal.timeout(30s)`. A hung TCP connection no longer outlives `pollTask` `maxWaitMs`. AbortError surfaces as `TripoTimeoutError`. | `tripo-client.ts` | +3 (per-fetch AbortError → TimeoutError) |
| 3 | **JWT verify zod-parse** — replaced `as unknown as SessionClaims` with `SessionClaimsSchema` (zod) parse. New `JwtMalformedError` class. Forged-but-validly-signed malformed payloads now reject loudly. | `jwt.ts`, `auth.test.ts` | +2 (missing sub, non-Sui-address sub) |
| 4 | **Schema drift consolidation** — exported `boxParamsSchema`...`platformParamsSchema` + `proceduralParamsSchemas` array from shared. Backend's `generateParamsSchema` now composes from the shared array. Single authoring site. | `shared/src/types.ts`, `backend/src/lib/schema.ts` | (no new tests; existing pass) |
| 5 | **Nonce TTL sweep** — `createInMemoryNonceStore` now runs `setInterval`-based eviction (unref'd) instead of relying on lazy delete-on-read. New `stopSweep()` on `NonceStore`. Existing expired-nonce test cleaned up. | `auth.ts`, `auth.test.ts` | +1 (sweep evicts expired) |

**Final test counts after polish: backend 113, frontend 94, Move 21 = 228 total tests, all green.** Branch state: 24 commits since `main`.

### Phase 2 Deploy Investigation (2026-05-15 late PM)

Investigated path (c) "MVR / Sui CLI re-check" per the user's preference for lowest-friction path. **Result: path (c) fully blocked.**

- **Sui CLI 1.72.1** is the latest release on `MystenLabs/sui` (verified via WebFetch of GitHub releases). No 1.72.2+ exists.
- **`sui client publish --help`** does not include any flag to assert "this dep is already published at X" from the consumer side. The `--with-unpublished-dependencies` flag does the wrong thing (would publish our own copy of Walrus, not reference the deployed one). `--pubfile-path` is for compilation, not deploy.
- **MVR alias syntax** (`Walrus = { mvr = "@walrus/core" }`) is rejected by CLI 1.72.1 — `mvr` key not wired into the manifest parser at all.
- **Walrus upstream Move.toml** (`MystenLabs/walrus@testnet`) still declares `walrus = "0x0"` with no `[package] published-at`. Same for the transitive `wal` package (`wal = "0x0"`). Mysten has not added it.

Verdict: the deploy block is real and requires **path (a) fork** or **path (b) local-clone + patch**. Estimated 10-30 min of mechanical work; can be done anytime before 6/21 submission. **Phase 3 onward does NOT depend on deploy** — the contract code is correct and tested, only the on-chain instantiation is parked.

### 🚧 Blocking issues for `main` merge

1. ~~**Testnet deploy**~~ — ✅ **RESOLVED 2026-05-15 PM (D-021)**. The block was a wrong-subtree diagnosis: `contracts/walrus@testnet` is the source tree, deployed artifact lives at `testnet-contracts/walrus@main` with `Published.toml`. `Move.toml` fixed; `sui client publish --dry-run` reports `execution status: success`. Real publish deferred until Phase 3's Move contract change is ready (avoids 2 redeploys). See D-021 + `docs/solutions/integration-issues/walrus-wal-published-at-deploy-block-2026-05-15.md` (resolution header).
2. **Live e2e on testnet** — Once Phase 3 Move contract change lands and real publish executes, run two-wallet smoke: Wallet A (active address `0x3116...91ed`) mints a 16-variant car collection via `/forge`; Wallet B (new keypair) browses, buys variant Access, opens `/track` and drives it. Capture tx hashes + Sui Explorer screenshots for pitch deck.

### Next concrete step

**Phase 3 demo shape locked**: Collection Forge + Tiny Racetrack (Car + Racing). D-020 strategy + D-021 deploy unblocking both applied. Brainstorm doc final: `docs/brainstorms/2026-05-15-collection-forge-requirements.md`.

All 6 brainstorm OQs resolved 2026-05-15 PM:

| OQ | Decision |
|---|---|
| OQ-D1 | **Car** (Tripo: 1 base car + N paint variants via material swap, ~60-120 credits per collection — large headroom on free tier) |
| OQ-D2 | Path A dead (SDK source read); quilt = 1 Sui Blob; Move change required |
| OQ-D3 | Variant cap **16** |
| OQ-D4 | **Texture + color** (8 curated textures bundled + RGB picker per variant) |
| OQ-D5 | Tiny Racetrack **L2 driveable, minimum-viable scope** (WASD + Havok physics + bounded oval; no opponents, no timer, no SFX, no wheel spin) |
| OQ-D6 | **B.ii** — Collection wrapper + N Model3D objects (each variant is its own NFT; Phase 2 frontend mostly reusable) |

**→ Next action: run `/ce-plan`** with brainstorm doc as origin, depth = **Standard**, target ~6-8 build days. Plan-003 must cover:

- Move contract change: new `Collection` struct + `publish_collection` entry + `mint_variant` entry. Move test additions ~10 new tests on top of existing 21.
- Testnet redeploy via D-021 path (`sui client publish --gas-budget 200000000` — drop `--dry-run`), produces real `MODEL3D_PACKAGE_ID`.
- Backend `POST /api/collection/build` — accepts base GLB + N variant specs, returns N GLBs via `@gltf-transform/core` material swap.
- Frontend Collection Forge page (variant editor + curated 8-texture library + 3-popup mint flow).
- Frontend Browse adjustment: group by collection.
- Frontend Tiny Racetrack page (Babylon scene + Havok rigid-body + WASD + chase camera + procedural oval track mesh).
- E2E smoke test on testnet with two wallets.

Parallel tracks (don't gate on plan-003):
- **(Phase 3 parallel)** Seed catalog: generate 5-8 hero collections (mix of car + sword/hammer for procedural-path coverage) for wider marketplace demo content.
- **(Phase 4)** Kiosk + TransferPolicy ADR needed before plan-004 (resolves OQ-013, target ~6/11).
- **(Phase 5)** Pitch deck + demo video — Forge + Racetrack 90-sec arc is the centerpiece.

**Time budget:** 37 days to submission (6/21). Phase 2 shipped 8 days ahead of its 5/29 deadline; Phase 3 brainstorm + 2 ADRs (D-020, D-021) all landed today. Healthy buffer for Phase 5 polish.

### Notes for next session

- Phase 2 was a 38-day-budget sprint; we shipped in **2 calendar days** (2026-05-14 → 2026-05-15). That's ~8 days ahead of the 5/29 Phase 2 deadline per spec §6. Buffer goes to Phase 5 pitch deck + demo video polish per user preference.
- Subagent dispatch pattern that worked: **inline code skeletons + tight 3-6 file read list + explicit "don't touch X" lists**. The pattern that failed: broad "read whatever you need" prompts (3 subagents died at 40-50K tokens mid-investigation; one rate-limited on Anthropic API).
- Phase 4 Kiosk decision (OQ-013) needs to happen before Phase 4 starts (~6/11). Phase 2 used `share_object(Model3D)` per D-016 which has the bifurcation caveat (shared Model3Ds can't be retroactively placed in Kiosks).
- Backend has graceful fallback for missing `ANTHROPIC_API_KEY` (HardcodedRouter takes over). For Phase 5 demo, set the env var so prompt-mode works.
- `useOwnsAccess` (U9) silently returns false on GraphQL errors — pessimistic default. Acceptable for v1 since Move-level doesn't prevent duplicate Access.

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
