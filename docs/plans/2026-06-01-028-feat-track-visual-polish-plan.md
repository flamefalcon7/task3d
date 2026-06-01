---
title: "feat: Track scene visual polish (lighting + material upgrade)"
type: feat
status: completed
created: 2026-06-01
origin: docs/brainstorms/2026-06-01-track-visual-polish-requirements.md
phase: "Phase 3 — Tiny Racetrack (visual polish pass)"
depth: standard
---

# feat: Track Scene Visual Polish (Lighting + Material Upgrade)

Upgrade the `/track` racing scene from a flat, dark, "2000s" look to a modern
real-time render, to impress Sui Overflow judges in the demo. The deficit is
**lighting and material response**, not geometry — the scene already ships sky,
bloom, FXAA, ACES tonemap, textured road/grass with normal maps, foliage, skid
marks, and tire smoke.

Origin requirements: `docs/brainstorms/2026-06-01-track-visual-polish-requirements.md`
(Option 2: Lighting + material polish).

---

## Problem Frame

`frontend/src/track/racetrackScene.ts` renders with only a `HemisphericLight`
(`:331`), no environment texture, no directional light, no shadows, and
`StandardMaterial` on all track surfaces. Consequences:

- **Car renders near-black** — car GLBs export PBR metallic/roughness materials;
  with no `scene.environmentTexture` (IBL) there is nothing for them to reflect.
  This is the primary cause of "the game looks dark."
- **Flat, formless** — hemispheric-only ambient light has no directional
  component; the `SkyMaterial` sun is painted, not a real light source.
- **Car floats** — no `ShadowGenerator`, so no contact shadow grounding the car.
- **Crushed midtones** — ACES tonemap runs with no exposure/contrast tuning.

---

## Scope & Approach

Six surfaces, ordered by bang-per-hour. Each is an independently shippable
atomic commit; the sequence can stop early if sprint time runs short and still
leave the scene meaningfully improved.

**Key constraint discovered in research:** `frontend/src/track/racetrackScene.test.ts`
mocks `@babylonjs/core` wholesale and carries **exact-count assertions**. The
load-bearing one is `onBeforeRenderObservable.add` asserting **exactly 3**
observers (test at `:619`). **No unit below adds a per-frame observer** — IBL,
directional light, shadows, SSAO, and fog are all static or render-once, so the
3-observer assertion stays valid. Every new Babylon class, however, must be
added to the core mock or the SUT throws at construction. Mock extension is
folded into each unit so every commit stays self-contained and green.

### IBL source decision (resolved during planning)

Use a **static prefiltered `.env`** committed to `frontend/public/textures/env/`,
not a `ReflectionProbe` derived from `SkyMaterial`. Rationale: PBR IBL needs a
prefiltered roughness mip-chain to light matte/rough surfaces correctly; a `.env`
is prefiltered by design, a raw reflection-probe cubemap is not. The probe's only
edge (exact sky-color match) is minor for a demo and tunable via
`environmentIntensity`. (see origin: `docs/brainstorms/2026-06-01-track-visual-polish-requirements.md`,
"Open design choice for ce-plan")

---

## Key Technical Decisions

- **D1 — Static `.env` for IBL** (above). Source a standard prefiltered Babylon
  environment `.env` (e.g. an outdoor/sunset preset) so the car picks up
  image-based lighting + reflections. Load failure must not blank the scene
  (mirror the existing `createFoliage` try/catch at `racetrackScene.ts:518`).
- **D2 — No new per-frame observers.** Preserves the test's 3-observer
  invariant and avoids per-frame cost. Lights are static; the shadow map
  refreshes itself; SSAO and IBL are pipeline-level.
- **D3 — Convert only track-surface materials to PBR** (road, grass, outer
  barriers). Leave the thin visual-only materials (center stripe emissive,
  checker cells, checkpoint, kerb bands) as `StandardMaterial` — they are flat
  unlit accents where PBR adds cost but no visible gain. No `StandardMaterial`
  count assertion exists in the test, so this is safe.
- **D4 — SSAO is performance-gated** behind a tunable enable flag and is the
  first thing dropped if fps suffers on the demo machine (it is the heaviest
  item). Verified last, after the cheaper wins are locked in.
- **D5 — Tunable constants** follow the existing top-of-file `const` convention
  in `racetrackScene.ts` (named consts + feel-tuning comments), so values are
  adjustable in-browser without re-reading the body.
- **D6 — No new npm dependency.** PBRMaterial, DirectionalLight, ShadowGenerator,
  SSAO2RenderingPipeline, and the `.env` loader (`CubeTexture.CreateFromPrefilteredData`)
  are all in `@babylonjs/core` 9.6.0. The `.env` is a committed asset, not a dep.

---

## Requirements Traceability

| Origin success criterion | Unit(s) |
|---|---|
| Car visibly lit with reflections (not near-black) | U1 |
| No crushed blacks; readable midtones | U1 |
| Car casts grounded contact shadow | U2 |
| Cohesive single-source-of-light feel | U2, U5 |
| Modern PBR material response on track surfaces | U3 |
| Ambient-occlusion depth in seams / under foliage | U4 |
| ~60 fps, no physics/gameplay regression, tests green | U4, U6 |

---

## Implementation Units

### U1. Environment IBL + tonemap exposure

**Goal:** Light the car (and all PBR surfaces) via an image-based environment
and stop ACES from crushing midtones. Single biggest visual win.

**Requirements:** Car lit with reflections; no crushed blacks.

**Dependencies:** none (lands first).

**Files:**
- `frontend/public/textures/env/<name>.env` — new prefiltered environment asset (committed)
- `frontend/src/track/racetrackScene.ts` — set `scene.environmentTexture`; add `environmentIntensity` + exposure/contrast tunables; tune `imageProcessing.exposure` / `.contrast` on the existing pipeline (`:723`)
- `frontend/src/track/racetrackScene.test.ts` — extend `@babylonjs/core` mock

**Approach:**
- Load the `.env` via `CubeTexture.CreateFromPrefilteredData('/textures/env/<name>.env', scene)`; assign to `scene.environmentTexture`. Wrap in try/catch like `createFoliage` so a fetch failure logs and continues (scene must not blank).
- Add tunable consts near the existing `BLOOM_*` block: `ENV_INTENSITY`, `TONE_EXPOSURE`, `TONE_CONTRAST`.
- Set `renderPipeline.imageProcessing.exposure` and `.contrast` after the existing tonemap wiring. Both are real proxies on Babylon's `ImageProcessingPostProcess` (verified, 9.7).
- API note (verified against installed type defs): `CubeTexture.CreateFromPrefilteredData(url, scene)` constructs and **returns the texture synchronously** — the file fetch is async but needs no ready callback for assignment. A *missing/invalid* `.env` fails inside the async loader (surfaced on `onLoadObservable`/console), **not** as a synchronous throw. Graceful degradation still holds because the assignment line is synchronous and a bad asset just leaves PBR surfaces unlit rather than blanking the scene; the try/catch guards the synchronous construction path.

**Patterns to follow:** existing texture loading (`racetrackScene.ts:368`), the `DefaultRenderingPipeline` block (`:709`), the `createFoliage` try/catch (`:518`).

**Test scenarios** (wiring-level, matching existing mock-based style):
- Happy path: `scene.environmentTexture` is assigned (mock Scene gains an `environmentTexture` field; assert non-null after build).
- Happy path: `imageProcessing.exposure` and `.contrast` are set to the tunable values on the pipeline mock.
- Error path: when the mock `CreateFromPrefilteredData` is made to throw, `createRacetrackScene` still resolves and the render loop still starts (assert `runRenderLoop` called) — proves the try/catch keeps the scene alive. (Note: the *real* loader fails async, not via throw; this test exercises the synchronous-construction guard, which is what the mock controls.)
- Mock extension: add `CubeTexture` class with a static `CreateFromPrefilteredData` spy; add `environmentTexture` to the Scene mock; **add `exposure: 0, contrast: 0` to the existing `DefaultRenderingPipeline` mock's `imageProcessing` object** (currently only `toneMappingEnabled`/`toneMappingType`, test `:269`) so the exposure/contrast read-back assertion works.

**Verification:** In-browser, the car body shows visible reflections/brightness and the scene midtones are no longer crushed. Vitest green.

---

### U2. Directional light + contact shadows

**Goal:** Add a real key light aligned to the painted sun and ground the car with
a contact shadow.

**Requirements:** Grounded shadow; cohesive light direction.

**Dependencies:** U1 (exposure tuned first so shadow contrast reads correctly).

**Files:**
- `frontend/src/track/racetrackScene.ts` — add `DirectionalLight` + `ShadowGenerator`; register car pivot/meshes as casters, road ribbon + safety ground as receivers
- `frontend/src/track/racetrackScene.test.ts` — extend mock

**Approach:**
- Add a `DirectionalLight` whose direction is derived from `SKY_INCLINATION` / `SKY_AZIMUTH` (the existing sky-sun tunables at `:257`) so the cast shadow matches the painted sun. Keep the `HemisphericLight` as fill; drop its intensity via a new tunable so the directional light reads as the key.
- Create a `ShadowGenerator` (blur-exponential or contact-hardening; tunable map size + bias consts). Car geometry meshes → shadow casters; `roadRibbon` and `safetyGround` → `receiveShadows = true`.
- The car meshes are loaded async (`carParts`, `:619`); add them as casters after parenting.
- Tunables: `DIR_LIGHT_INTENSITY`, `HEMI_LIGHT_INTENSITY`, `SHADOW_MAP_SIZE`, `SHADOW_DARKNESS`, `SHADOW_BIAS`.

**Patterns to follow:** sun-direction math already encoded in the SkyMaterial tunables (`:249`–`:259`).

**Test scenarios:**
- Happy path: `DirectionalLight` constructed once; `ShadowGenerator` constructed once.
- Happy path: car geometry meshes are registered as shadow casters (mock `ShadowGenerator` exposes a spy for `addShadowCaster` or `getShadowMap().renderList`); assert the vertex-bearing car parts are added, the `__root__` is not.
- Happy path: `roadRibbon` and `safetyGround` mock meshes have `receiveShadows` set true.
- Edge: `HemisphericLight` intensity is set to the reduced fill value (assert the assignment) so it doesn't wash out the key light.
- Regression guard: `onBeforeRenderObservable.add` **remains at exactly 3 total** (cumulative across all units — this unit adds no new per-frame observer). The whole `@babylonjs/core` module is mocked, so only the SUT's own `scene.onBeforeRenderObservable.add` calls count; Babylon's internal observers in the real `ShadowGenerator` never touch the mock.
- Mock extension: add `DirectionalLight` + `ShadowGenerator` classes/spies; add `receiveShadows` to ground/ribbon mock meshes.

**Verification:** In-browser, the car casts a soft shadow onto the road that tracks its motion; light direction is consistent with the sky. Vitest green.

---

### U3. PBR materials for road / grass / barriers

**Goal:** Replace flat `StandardMaterial` track surfaces with `PBRMaterial` so
they respond to the new IBL + key light.

**Requirements:** Modern material response.

**Dependencies:** U1 (IBL must exist for PBR to read correctly).

**Files:**
- `frontend/src/track/racetrackScene.ts` — convert asphalt (`:410`), grass (`:368`), outer-barrier kerb materials (`:460`) to `PBRMaterial`
- `frontend/src/track/racetrackScene.test.ts` — extend mock

**Approach:**
- Asphalt: `PBRMaterial` with `albedoTexture` = existing diffuse, `bumpTexture` = existing normal, `metallic = 0`, `roughness` low-ish (tunable, slight wet sheen). Grass: same shape, `roughness` high (matte). Reuse existing `uScale`/`vScale`.
- Keep visual-only accent materials (`center-stripe-mat`, checker, checkpoint) as `StandardMaterial` per D3.
- Tunables: `ASPHALT_ROUGHNESS`, `ASPHALT_METALLIC`, `GRASS_ROUGHNESS`.

**Patterns to follow:** existing material+texture wiring at `:368` and `:410` (same property assignment shape, swap the class + metallic/roughness fields).

**Test scenarios:**
- Happy path: `PBRMaterial` constructed for asphalt, grass, and the two kerb-band materials (assert constructor call count = number of converted materials).
- Happy path: asphalt + grass PBR materials receive an `albedoTexture` and `bumpTexture` (assert the assignments via mock field capture).
- Regression: the road ribbon still gets a MESH physics collider (existing assertion at test `:553` unaffected — material swap is visual only).
- Mock extension: add `PBRMaterial` class (settable `albedoTexture`, `bumpTexture`, `metallic`, `roughness`, `albedoColor`).

**Verification:** In-browser, asphalt has subtle sheen and grass reads matte; both respond to the directional light. Vitest green.

---

### U4. SSAO ambient occlusion (performance-gated)

**Goal:** Add ambient-occlusion depth in seams, under foliage, and around
barriers — the final "rendered, not flat" cue.

**Requirements:** AO depth; ~60 fps; no regression.

**Dependencies:** U1–U3 (AO layered over the lit/PBR scene).

**Files:**
- `frontend/src/track/racetrackScene.ts` — add `SSAO2RenderingPipeline`; dispose it in the existing teardown (`:1123`)
- `frontend/src/track/racetrackScene.test.ts` — extend mock

**Approach:**
- Construct `SSAO2RenderingPipeline` attached to the chase camera; tunable strength/radius consts; behind an `SSAO_ENABLED` flag (D4) so it can be killed in one edit if fps drops.
- API note (verified): the constructor signature is `new SSAO2RenderingPipeline(name, scene, ratio, cameras?)` — `ratio` is a **required positional 3rd arg** (a number or `{ ssaoRatio, blurRatio }`), do NOT pass `[camera]` into that slot. Cameras go in the 4th arg. SSAO2 and the existing `DefaultRenderingPipeline` coexist fine — both register as named pipelines on the same `PostProcessRenderPipelineManager` per camera (verified standard combination).
- Add its `dispose()` to the scene `dispose()` alongside `renderPipeline.dispose()` (`:1140`) to avoid leaking render targets on carousel switch.

**Patterns to follow:** the `DefaultRenderingPipeline` lifecycle — constructed after the camera (`:709`), disposed first in teardown (`:1140`).

**Test scenarios:**
- Happy path (flag on): `SSAO2RenderingPipeline` constructed once with the chase camera.
- Happy path: its `dispose()` is called during scene `dispose()` (mirror the existing pipeline-dispose assertion pattern).
- Edge (flag off): when `SSAO_ENABLED` is false, the pipeline is not constructed (guards the perf kill-switch).
- Mock extension: add `SSAO2RenderingPipeline` class with a tracked `dispose` spy.

**Verification:** In-browser, contact darkening appears where trees/barriers meet ground; fps stays ~60 on the demo machine. If fps drops, flip `SSAO_ENABLED` off. Vitest green.

---

### U5. Fog + sky re-tune

**Goal:** Add atmospheric depth and reconcile the SkyMaterial luminance with the
new IBL so the horizon and lighting read coherently.

**Requirements:** Cohesive feel.

**Dependencies:** U1, U2 (tune against the final lighting).

**Files:**
- `frontend/src/track/racetrackScene.ts` — enable `EXP2` fog; re-tune `SKY_LUMINANCE` if it now clashes

**Approach:**
- Set `scene.fogMode = 2 /* Scene.FOGMODE_EXP2 */` using the **numeric literal**, not the static — the mocked `Scene` class defines no statics, mirroring the existing `TONEMAPPING_ACES = 1` literal idiom at `racetrackScene.ts:724`. Subtle `fogDensity` + `fogColor` matched to the sky horizon; tunable consts. Re-check `SKY_LUMINANCE` (`:256`) against the IBL brightness and adjust if washed/dim.

**Patterns to follow:** existing SkyMaterial tunable block (`:249`).

**Test scenarios:**
- Happy path: `scene.fogMode` is set to `2` and `fogDensity` is set (add `fogMode`/`fogDensity`/`fogColor` fields to the Scene mock; assert assignments).
- `Test expectation: light` — this is mostly feel-tuning; one wiring assertion that fog is enabled is sufficient. Visual quality judged in-browser.

**Verification:** In-browser, distant track/foliage softens into atmosphere without obscuring the drivable area; sky and lighting feel like one scene. Vitest green.

---

### U6. Browser verification + tunable pass + before/after capture

**Goal:** Validate the full demo arc, lock feel-tuning values, and capture
before/after stills for the pitch.

**Requirements:** ~60 fps, no regression; demo-ready.

**Dependencies:** U1–U5.

**Files:** none (verification + constant tuning only; any tweaks land in `racetrackScene.ts`)

**Approach:**
- Per `CLAUDE.md` Frontend Verification Protocol: drive `/track` via the
  `ce-test-browser` skill using the `?blob=<id>` dev hatch (loads the scene
  without a wallet — `TrackPage.tsx:157`).
- Assert: car visibly lit, shadow present and tracking, no crushed blacks,
  PBR sheen on asphalt, AO darkening present, fps stable. Capture before/after
  stills for `pitch/`.
- Tune the new feel constants in-browser to final values.

**Test expectation: none** — verification + tuning unit, no new behavioral logic.

**Verification:** Full arc (`/`, `/create`, `/launch`, `/market`, `/track`)
smoke-clean; `/track` reads modern; before/after stills captured. Full Vitest
suite green; pre-existing tsc baseline unchanged.

---

## Scope Boundaries

### In scope
Lighting (IBL, directional, shadows, exposure), PBR conversion of track
surfaces, SSAO, fog, sky re-tune, browser verification.

### Deferred to Follow-Up Work
- Fingerprinted `.env`/WASM asset pipeline (out of scope per the existing
  Phase-5-polish note at `racetrackScene.ts:22`).

### Outside this product's identity (from origin "Non-goals")
- Color-grade LUT, depth-of-field, vignette (Option 3 cinematic).
- Hero intro camera move, dedicated car-presentation pass (Option 3).
- New car models or track geometry.
- Mesh decimation / Walrus encoder changes (unrelated to render quality).

---

## Risks & Mitigations

- **Test mock drift (highest cost).** Each new Babylon class must be added to the
  `@babylonjs/core` mock or the SUT throws. *Mitigation:* mock extension is
  folded into each unit; the load-bearing 3-observer / 25-box / 27-aggregate
  count assertions are explicitly preserved (no unit adds observers, boxes, or
  aggregates).
- **Performance stacking** (shadows + SSAO + PBR + bloom). *Mitigation:* D4 perf-
  gate on SSAO; verify fps after each unit; SSAO is first to drop.
- **Shadow acne / peter-panning** on the extruded road ribbon. *Mitigation:*
  `SHADOW_BIAS` tunable; tune in-browser in U2.
- **IBL / painted-sky mismatch.** *Mitigation:* `environmentIntensity` tunable;
  pick an outdoor/sunset `.env`; U5 reconciles sky luminance.
- **`.env` asset sourcing.** A prefiltered `.env` must be obtained and committed.
  *Mitigation:* U1 prerequisite; Babylon ships standard presets — no generation
  pipeline needed.

---

## Verification Strategy

- Unit/wiring tests extended per-unit; full Vitest suite stays green; pre-existing
  tsc error baseline unchanged.
- Browser verification (U6) across the demo arc via `ce-test-browser` + `?blob=`
  hatch.
- Default frontend review roster applies (5-reviewer pattern incl.
  `ce-julik-frontend-races-reviewer`), though this change is render-pipeline,
  not async-UI.
- This is a new rendering pattern → a light ADR should be captured in
  `docs/decisions.md` (IBL + shadows + PBR adoption for the track scene),
  referencing D-027 (the prior `@babylonjs/materials` adoption).

---

## Deferred Implementation-Time Unknowns

- Exact `.env` preset choice and final `environmentIntensity` (pick in-browser, U1).
- Final shadow technique (blur-exponential vs contact-hardening) and bias values
  (tune in-browser, U2).
- Final SSAO strength/radius and whether it survives the fps budget (U4/U6).
- Whether grass benefits from PBR at all vs staying Standard (judge in-browser, U3).
