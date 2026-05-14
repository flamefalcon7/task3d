---
title: "Phase 1 — Scaffold: TS monorepo + procedural generators + Babylon preview, fully local"
status: active
created: 2026-05-14
type: feat
depth: lightweight
phase: "1 of 5 (Scaffold)"
origin:
  - docs/spec.md §6 Phase 1
  - docs/phase-progress.md §Next Concrete Step
  - docs/decisions.md D-007, D-011, D-012, D-013
target_completion: "2026-05-19"
---

# Phase 1 — Scaffold

## Summary

Stand up the local end-to-end loop: shape picker UI in browser → `POST /api/generate` to a Node + Hono backend → procedural GLB built with `@gltf-transform/core` → returned as bytes → loaded into Babylon imperative wrapper → rendered preview. **No Sui, no Walrus, no Anthropic SDK** — those are Phase 2.

The plan is sequencing and concrete file layout, not architecture: all language / framework / runtime choices were locked in D-007 (drop `react-babylonjs`), D-011 (Generator interface), D-012 (TS unified), and D-013 (v1 scope: no L2 derivative). Node 22.22.3 and pnpm 8.14.1 are confirmed installed on the dev machine.

---

## Problem Frame

A submission-quality demo on 6/21 needs to show: user types/picks → 3D model previews in browser → mint flow → on-chain. Phase 1's job is to make the first three steps work locally with mocks for everything chain-related, so Phase 2 only has to swap the backend's generator-router stub for an Anthropic-backed router and add Walrus/Sui SDK calls, **without refactoring the boundary between browser / backend / shared types**.

The risk Phase 1 mitigates: discovering at Phase 2 day 7 that `@gltf-transform/core` can't express the chest geometry from the `/tmp/box-demo/` Go proof, or that Babylon's `LoadAssetContainerAsync` chokes on our GLB output. Catch both inside the 6-day scaffold window.

---

## Scope Boundaries

**In scope (Phase 1):**
- pnpm monorepo with `frontend/` / `backend/` / `shared/` / `contracts/` / `samples/` / `pitch/` workspaces (only `frontend`, `backend`, `shared` are populated this phase)
- TS `Generator` interface in `shared/`, used by browser (for typing) and backend (for implementation)
- 4 procedural generators in TS: box, chest, cylinder, sphere
- Hono server with `POST /api/generate`, `GET /api/preview/:id`, `GET /api/shapes`
- Vite + React + imperative Babylon wrapper; shape picker + slider UI
- End-to-end: pick shape → preview renders in browser, all local
- Per-generator unit tests asserting valid GLB output (parses, expected vertex/triangle counts)

**Out of scope (deferred to later phases):**
- Sui SDK / Move contract / `Model3D` mint — **Phase 2** (D-012)
- Walrus upload / `walrus-wasm` / upload relay — **Phase 2**
- Enoki zkLogin / dApp Kit / wallet — **Phase 2**
- Anthropic SDK / actual LLM routing — **Phase 2** (Phase 1 ships a hardcoded `shape name → generator` map stub behind the same `Router` interface so the swap is contract-only)
- Tripo integration — **Phase 3 decision point** (D-011)
- Sui Kiosk / TransferPolicy — **Phase 4** (D-013)
- L2 Derivative — **v1.1 deferred** (D-013)
- Backing the GLB store with anything beyond disk — `GET /api/preview/:id` reads from `backend/tmp/`, no S3/CDN

**Outside this product's identity:** N/A (covered by `docs/spec.md`)

**Deferred to follow-up work:**
- Backend rate limiting (Phase 3 per spec.md §6)
- Frontend deploy target (Vercel vs Walrus Site decision — Phase 3 per spec.md §6)

---

## Requirements

The acceptance criterion for Phase 1 (single sentence, mirrors `docs/phase-progress.md`): **user picks "Box" (or chest / cylinder / sphere) + slider params → preview renders in browser, all local**.

Phase 1 advances these from `docs/spec.md`:
- §0 point 4.5 — Generator architecture interface in place, even if Phase 1 only has procedural impls
- §1.7 — three-layer Model3D / Access architecture **is not built here**; only the asset-generation pipeline upstream of it
- §4 — SDK/runtime versions used in this phase: Node 22 LTS, Hono 4.6.x, `@gltf-transform/core` 4.x, `@babylonjs/core` 9.6.2, `zod` 3.x
- §4.3 — imperative Babylon wrapper, no `react-babylonjs`
- §4.6 — Hono on Node, `shared/` workspace for type sharing
- §4.7 — `@gltf-transform/core` as procedural GLB builder

---

## Key Technical Decisions

All major decisions ratified upstream — these are plan-local micro-choices only:

| # | Decision | Rationale |
|---|---|---|
| P1 | `.nvmrc` at repo root locks Node `22.22.3` | Avoids "works on my machine" between sessions; nvm auto-switches on `cd` |
| P2 | pnpm 8.14.1 (current Homebrew) is acceptable for Phase 1 | Workspace works in 8.x; D-012 didn't pin pnpm minor; deferring corepack→pnpm@9 cleanup until it actually bites |
| P3 | Backend writes GLB to `backend/tmp/<uuid>.glb`, served at `GET /api/preview/:id` | Simplest store; no need for S3/CDN until Walrus replaces this in Phase 2 |
| P4 | Generator interface returns `{ glbBytes: Uint8Array, lineageStub: Partial<LineageRecord> }` | Phase 1 lineage is empty `{}`; Phase 2 fills it with prompt + LLM decision trace without changing the return shape |
| P5 | `agent/router.ts` is a class implementing `Router` interface, Phase 1 impl is hardcoded `Map<shapeName, Generator>` | Phase 2 replaces internals with Anthropic call; no caller refactor |
| P6 | Test runner: `vitest` (backend + frontend) | One runner across both workspaces; works natively with TS+ESM; no Jest/ts-jest overhead |
| P7 | Module format: ESM (`"type": "module"`) in all workspaces | `@gltf-transform/core` ESM-only; modern default; matches Vite |

---

## Implementation Units

### U1. Monorepo skeleton

**Goal:** Repo has a working pnpm workspace with all top-level directories and root-level config (Node lock, TS base config, gitignore additions already done).

**Requirements:** Acceptance criterion (workspace boots, `pnpm install` from root succeeds).

**Dependencies:** None (this is the first unit).

**Files:**
- `package.json` (create) — root `package.json`, `private: true`, scripts: `dev`, `build`, `test` delegating to workspaces
- `pnpm-workspace.yaml` (create) — packages: `frontend`, `backend`, `shared`
- `.nvmrc` (create) — contents: `22.22.3`
- `tsconfig.base.json` (create) — strict mode, `module: NodeNext`, `target: ES2022`, `moduleResolution: NodeNext`, `composite: true` (for project references)
- `.editorconfig` (create) — 2-space, LF, trim trailing whitespace
- `frontend/`, `backend/`, `shared/`, `contracts/`, `samples/`, `pitch/` (create empty dirs with `.gitkeep` where they'll stay empty this phase)

**Approach:**
- `pnpm-workspace.yaml` lists the three populated packages only; `contracts/` and `samples/` get `.gitkeep` so they exist in git but aren't workspaces yet
- Root `package.json` scripts use `pnpm -r --filter` so `pnpm dev` runs `backend dev` + `frontend dev` in parallel
- `tsconfig.base.json` is extended by each workspace; not itself a build target

**Patterns to follow:** None local (greenfield).

**Test scenarios:** none — pure scaffolding, no behavior.

**Verification:** `pnpm install` at repo root succeeds with zero errors. `node --version` inside the repo (via nvm auto-switch) reports `v22.22.3`. `ls` shows all six top-level directories.

---

### U2. `shared/` — type contracts

**Goal:** A single source of truth for `GenerateParams`, `LineageRecord`, `Generator`, `Router`, and `ShapeId` that browser and backend both consume.

**Requirements:** Generator architecture interface (D-011). Type sharing across workspaces (D-012, spec.md §4.6).

**Dependencies:** U1.

**Files:**
- `shared/package.json` (create) — name `@overflow2026/shared`, type `module`, main `dist/index.js`, types `dist/index.d.ts`, scripts `build` (`tsc`), `dev` (`tsc --watch`)
- `shared/tsconfig.json` (create) — extends `../tsconfig.base.json`, `outDir: dist`, `rootDir: src`
- `shared/src/index.ts` (create) — barrel re-exporting from `./types`
- `shared/src/types.ts` (create) — type definitions

**Approach:**
- `ShapeId = 'box' | 'chest' | 'cylinder' | 'sphere'`
- `GenerateParams` is a discriminated union keyed on `shape`: e.g., `{ shape: 'box', width: number, height: number, depth: number }`, `{ shape: 'chest', width: number, height: number, depth: number, lidOpenRadians: number }`, etc.
- `LineageRecord` per D-011: `{ id: string, shape: ShapeId, params: GenerateParams, prompt?: string, llmDecision?: unknown, generatorSource: 'procedural' | 'tripo', createdAt: string }`. Phase 1 only fills `id`, `shape`, `params`, `generatorSource: 'procedural'`, `createdAt`.
- `Generator` interface: `generate(params: GenerateParams): Promise<{ glbBytes: Uint8Array, lineageStub: Partial<LineageRecord> }>`
- `Router` interface: `route(shapeOrPrompt: { shape: ShapeId, params: GenerateParams }): Promise<{ generator: Generator, lineageStub: Partial<LineageRecord> }>`. Phase 1 only accepts `{ shape, params }`; Phase 2 widens to also accept `{ prompt: string }`.

**Patterns to follow:** None local (greenfield).

**Test scenarios:** none — type-only module, no runtime behavior.

**Verification:** `pnpm --filter @overflow2026/shared build` produces `shared/dist/index.{js,d.ts}` with no TS errors. Importing `Generator` from `@overflow2026/shared` in a scratch backend file type-checks.

---

### U3. `backend/` — Hono server + procedural generators

**Goal:** Backend runs on `localhost:3001`, serves three endpoints, generates valid GLB bytes for all four shapes via `@gltf-transform/core`.

**Requirements:** Acceptance criterion (backend half of e2e). Spec.md §6 Phase 1 backend bullets. D-011 (`Router` stub). D-012 (Hono + gltf-transform/core).

**Dependencies:** U1, U2.

**Files:**
- `backend/package.json` (create) — deps: `hono`, `@hono/node-server`, `@gltf-transform/core`, `zod`, `@overflow2026/shared` (workspace:*). Dev deps: `typescript`, `tsx`, `vitest`, `@types/node`. Scripts: `dev` (`tsx watch src/server.ts`), `build`, `test` (`vitest run`).
- `backend/tsconfig.json` (create) — extends base, references `../shared`
- `backend/src/server.ts` (create) — Hono app, `@hono/node-server` listening on `3001`, CORS open to `localhost:5173`, mounts three routes
- `backend/src/agent/router.ts` (create) — `HardcodedRouter implements Router` with `Map<ShapeId, Generator>`
- `backend/src/generators/index.ts` (create) — barrel
- `backend/src/generators/box.ts` (create) — `BoxGenerator implements Generator`, ~30 LoC. 8 verts, 12 tris, parameterized w/h/d, pivot bottom-center (port logic from `/tmp/box-demo/box.go` — not the code, the geometry)
- `backend/src/generators/chest.ts` (create) — `ChestGenerator`, ~60 LoC. Body box + lid box, lid rotates around back-top edge by `lidOpenRadians`
- `backend/src/generators/cylinder.ts` (create) — `CylinderGenerator`, ring of `segments` verts top + bottom, side quads + top/bottom caps
- `backend/src/generators/sphere.ts` (create) — `SphereGenerator`, UV sphere with `latSegments`, `lonSegments`
- `backend/src/routes/generate.ts` (create) — `POST /api/generate`: zod-validates body against `GenerateParams`, calls router, writes glb to `backend/tmp/<uuid>.glb`, returns `{ id, lineageStub }`
- `backend/src/routes/preview.ts` (create) — `GET /api/preview/:id`: streams `backend/tmp/<id>.glb` with `Content-Type: model/gltf-binary`
- `backend/src/routes/shapes.ts` (create) — `GET /api/shapes`: returns shape catalog with param schemas (for frontend slider config)
- `backend/tmp/.gitkeep` (create) — directory exists in git, content gitignored

**Test files:**
- `backend/src/generators/box.test.ts` (create) — see scenarios
- `backend/src/generators/chest.test.ts` (create)
- `backend/src/generators/cylinder.test.ts` (create)
- `backend/src/generators/sphere.test.ts` (create)
- `backend/src/routes/generate.test.ts` (create) — endpoint smoke test using Hono's test client

**Approach:**
- Use `@gltf-transform/core`'s `Document` API: build `Buffer` → `Accessor` for positions and indices → `Primitive` (mode `TRIANGLES`) → `Mesh` → `Node` → `Scene` → serialize with `NodeIO().writeBinary(doc)` to get `Uint8Array`
- All meshes: positions as `Float32Array` (vec3), indices as `Uint16Array` (scalar)
- Manifold-by-construction: dedup verts where shapes share corners; consistent winding (CCW outward); no per-face normals in Phase 1 (Babylon recomputes flat normals on load — acceptable for preview)
- `backend/tmp/` add to `.gitignore` (already covered by `node_modules` / `dist` / `build`; explicitly add `backend/tmp/*` `!backend/tmp/.gitkeep`)
- Router stub: constructor builds `Map<ShapeId, Generator>`; `route({ shape, params })` returns the matching generator. Phase 2 replaces this class with `AnthropicRouter` behind same `Router` interface.

**Patterns to follow:**
- Box geometry from `/tmp/box-demo/box.go` (8 verts, 12 tris, bottom-center pivot) — replicate vertex/index tables in TS, do not port Go code per D-012
- Chest geometry from `/tmp/box-demo/chest.go` (rotation around back-top edge of body) — replicate matrix math in TS

**Test scenarios:**

*box.test.ts*
- Happy path: `generate({ shape:'box', width:1, height:1, depth:1 })` returns Uint8Array of nonzero length
- Happy path: parsing the returned bytes via `NodeIO().readBinary()` yields a Document with exactly 8 unique vertex positions and 12 triangles
- Happy path: pivot at bottom-center — bounding box `minY === 0` for `height:1` input
- Edge case: `width: 0.001` (very small) still produces valid GLB (no NaN/Inf in positions)
- Error path: `width: -1` rejected by zod validator before reaching generator (covered in `generate.test.ts`)

*chest.test.ts*
- Happy path: `lidOpenRadians: 0` (closed) — bounding box matches body-only height
- Happy path: `lidOpenRadians: Math.PI/2` (fully open) — lid Z extent extends beyond body's back face
- Happy path: parsed GLB has 16 unique vertex positions and 24 triangles
- Edge case: `lidOpenRadians: Math.PI` (lid flipped fully back) produces valid manifold output

*cylinder.test.ts*
- Happy path: `segments: 16, radius: 0.5, height: 1` → 32 side verts + 2 cap centers, valid GLB
- Edge case: `segments: 3` (minimum) produces a triangular prism, no crash

*sphere.test.ts*
- Happy path: `latSegments: 8, lonSegments: 16, radius: 0.5` → expected vertex count formula matches
- Edge case: pole vertices (`latSegments` minimum 2) don't produce degenerate triangles

*generate.test.ts*
- Happy path: `POST /api/generate` with valid box params → 200, JSON `{ id: string, lineageStub: {...} }`
- Happy path: subsequent `GET /api/preview/:id` returns the GLB bytes with `Content-Type: model/gltf-binary`
- Error path: `POST /api/generate` with `{ shape: 'cube' }` (invalid shape) → 400 with zod error message
- Error path: `GET /api/preview/missing-id` → 404
- Integration: `GET /api/shapes` returns all four shapes with their param schemas (consumed by frontend in U4)

**Verification:** `pnpm --filter backend test` passes all scenarios. `pnpm --filter backend dev` starts the server on `localhost:3001`; `curl -X POST http://localhost:3001/api/generate -H 'Content-Type: application/json' -d '{"shape":"box","width":1,"height":1,"depth":1}'` returns `{ id, lineageStub }` and the subsequent `curl http://localhost:3001/api/preview/<id> -o /tmp/test.glb` produces a valid GLB.

---

### U4. `frontend/` — Vite + React + imperative Babylon wrapper

**Goal:** Browser app on `localhost:5173` shows shape picker + sliders; clicking "Generate" calls backend; resulting GLB renders in a Babylon canvas.

**Requirements:** Acceptance criterion (frontend half of e2e). D-007 (no react-babylonjs, imperative wrapper). Spec.md §4.3.

**Dependencies:** U1, U2, U3 (frontend will hit backend's `/api/shapes` at startup).

**Files:**
- `frontend/package.json` (create) — scaffold via `pnpm create vite . --template react-ts`, then add deps: `@babylonjs/core`, `@babylonjs/loaders`, `@overflow2026/shared` (workspace:*). Dev deps already from Vite: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/react`, `jsdom`.
- `frontend/vite.config.ts` (modify — Vite scaffold default) — add `server.proxy` for `/api` → `http://localhost:3001`
- `frontend/tsconfig.json` (modify — Vite scaffold default) — extend base, references `../shared`
- `frontend/src/main.tsx` (modify — Vite default) — strip default styles
- `frontend/src/App.tsx` (modify — Vite default) — split into shape picker + preview pane layout
- `frontend/src/babylon/PreviewCanvas.tsx` (create) — ~40 LoC. `useEffect` builds `Engine`, `Scene`, `ArcRotateCamera`, `HemisphericLight`. `useEffect` watches `glbUrl` prop; on change, `SceneLoader.LoadAssetContainerAsync` + add to scene. Cleanup on unmount. Resize observer.
- `frontend/src/components/ShapePicker.tsx` (create) — fetches `/api/shapes` on mount, renders shape dropdown + dynamic sliders for the selected shape's params
- `frontend/src/components/GenerateButton.tsx` (create) — calls `POST /api/generate` with current params, sets `glbUrl` state to `/api/preview/${id}`
- `frontend/src/lib/api.ts` (create) — `fetchShapes()`, `generate(params)` typed against `@overflow2026/shared`

**Test files:**
- `frontend/src/components/ShapePicker.test.tsx` (create)
- `frontend/src/babylon/PreviewCanvas.test.tsx` (create) — render-only smoke

**Approach:**
- Imperative Babylon: refs to canvas element; `useEffect` once for Engine/Scene/Camera/Light; `useEffect` dependency on `glbUrl` for asset load. Refs hold engine + scene for cleanup.
- Vite proxy avoids CORS in dev. Production deploy (Phase 3) will set `VITE_API_BASE` env.
- Slider config comes from `/api/shapes` response — backend is single source of truth for param ranges. Phase 2 doesn't need a frontend change when a new shape is added; only `shared/types.ts` widens.
- Loading state: while `glbUrl` is in flight, show a spinner; on error, show error message (no toast lib).

**Patterns to follow:**
- Babylon imperative wrapper pattern from spec.md §4.3 link (Babylon official React doc)

**Test scenarios:**

*ShapePicker.test.tsx*
- Happy path: mocks `fetch('/api/shapes')` returning the 4-shape catalog → component renders dropdown with 4 options
- Happy path: selecting 'chest' from dropdown renders a slider for `lidOpenRadians` (not present for 'box')
- Edge case: slider change calls the `onParamsChange` prop with the new params object
- Error path: failed `/api/shapes` fetch shows error state, no dropdown rendered

*PreviewCanvas.test.tsx*
- Happy path: component mounts and creates a canvas element (smoke only — we can't actually test WebGL render in jsdom)
- Integration: passing `glbUrl` prop triggers `SceneLoader.LoadAssetContainerAsync` (mocked)

**Verification:** `pnpm --filter frontend dev` opens `localhost:5173`; the page shows the shape picker, fetches `/api/shapes` on load (visible in network panel), and selecting box + clicking Generate shows a box rendered in the Babylon canvas. `pnpm --filter frontend test` passes.

---

### U5. End-to-end smoke + README

**Goal:** Two-process dev loop documented and verified; root `pnpm dev` brings up both servers; all four shapes preview end-to-end in browser.

**Requirements:** Acceptance criterion in full (the e2e is the deliverable).

**Dependencies:** U1, U2, U3, U4.

**Files:**
- `package.json` (modify root) — `"dev": "pnpm -r --parallel --filter backend --filter frontend dev"`, `"test": "pnpm -r test"`
- `README.md` (modify) — add "Phase 1 dev loop" section: `nvm use`, `pnpm install`, `pnpm dev`, what to expect at `localhost:5173`. Keep existing public-facing content above this section.
- `docs/phase-progress.md` (modify) — flip Phase 1 status, list completed units, set Next Concrete Step to "Phase 2: Move contract + Walrus + Anthropic router" per spec.md §6
- `docs/decisions.md` (modify) — append micro-ADR D-014 if anything in P1–P7 above needed an actual decision write-up (most should not — they're plan-local). Skip if unneeded per CLAUDE.md hackathon-mode "Skip ADR for routine implementation"

**Approach:**
- Two-process dev is intentional (no `concurrently` lib); pnpm's `--parallel` is enough
- Smoke test is manual: open browser, exercise each shape with edge-case slider values (very small, very large), watch network tab for 200s, watch console for errors
- README addition keeps the file submission-ready; don't pollute with internal protocol stuff

**Test scenarios:**
- Manual smoke: `pnpm dev` from cold; both `:3001` (backend) and `:5173` (frontend) come up within 5 seconds
- Manual smoke: each of box / chest / cylinder / sphere renders without console errors
- Manual smoke: rapid slider drag does not produce errors (regenerate-on-change rate-limited or debounced — note if needed, defer the debounce if not)
- Manual smoke: backend dies → frontend shows usable error state, doesn't blank screen

**Verification:** End-of-phase checkpoint passed (see below).

---

## End-of-Phase Checkpoint

Phase 1 is **done** when **all** of these are true:

1. `git clone <repo> && cd && nvm use && pnpm install && pnpm dev` works on a clean machine (no manual setup beyond Node 22 + pnpm 8)
2. All four shapes (box, chest, cylinder, sphere) render correctly in browser with slider params live
3. `pnpm test` passes from repo root — all generator unit tests green, all route tests green, all frontend component tests green
4. `Router` interface in `shared/` is the only boundary the Phase 2 LLM router will need to replace — no caller refactor anticipated
5. `docs/phase-progress.md` reflects Phase 1 complete, points at Phase 2 next concrete step

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@gltf-transform/core` API differs from `qmuntal/gltf` enough that chest takes >60 LoC | Med | Low — adds a day, doesn't change plan shape | If it balloons past 100 LoC, simplify chest to box-only for Phase 1 and revisit before Phase 2 ends |
| Vite + workspace deps via `workspace:*` doesn't HMR-update `shared/` types automatically | Med | Low — annoying but workaround is `pnpm --filter shared build --watch` in a third terminal | Document in README if hit |
| Babylon `LoadAssetContainerAsync` rejects our GLB (missing required field, e.g., min/max accessor bounds) | Low-med | Med — would block U4 verification | `@gltf-transform/core`'s `NodeIO` emits min/max by default; verify on day 1 of U3 with a smoke load in Node before U4 starts |
| pnpm 8 → 9 lockfile churn if a teammate's machine has 9 | Low | Low | Document Node 22 + pnpm 8 in README; revisit corepack later |

---

## Sequencing

```
U1 (skeleton, ~0.5 day)
  └─> U2 (shared types, ~0.5 day)
        ├─> U3 (backend + generators + tests, ~2 days)  ◄── biggest unit
        └─> U4 (frontend + Babylon wrapper + tests, ~1.5 days)
              └─> U5 (e2e + README, ~0.5 day)
```

**Total estimate: 5 days, fits 6-day Phase 1 window with 1 day buffer for Risk row 1 or 3.**

U3 and U4 can partially parallelize once U2 ships — frontend can mock backend with static `/api/shapes` and a fixture GLB while U3 finishes generators.

---

## Notes for `ce-work`

- Hackathon discipline (CLAUDE.md): don't gold-plate. If a test scenario above feels excessive for a scaffold task, write the happy-path one and skip the rest — Phase 1's job is to ship the loop, not exhaustive coverage. Phase 5 has time for hardening.
- Per D-012 explicitly: **do NOT port `/tmp/box-demo/*.go`** — write fresh TS. The Go files are a geometry reference only.
- Per D-011: the `Router` interface in `shared/` is load-bearing — every Phase 2 LLM-routing change should ship without touching `frontend/src/lib/api.ts` or the Hono route handlers. Treat that as a hard invariant during U3 design.
- If anything in this plan turns out wrong during execution, update `docs/phase-progress.md` Notes section but **don't edit this plan body** — the plan is a decision artifact, drift goes elsewhere.
