---
status: active
type: feat
date: 2026-06-06
origin: docs/brainstorms/2026-06-06-landing-live-3d-wells.md
depth: deep
---

# feat: Landing Live-3D Wells (Hero Blender Viewport + Live Lifecycle Panels)

## Summary

Upgrade the landing page's five visual wells from a single hero render + four static SVG panels into live Babylon scenes, keeping the D-044 brutalist-editorial chrome (mono headers, layer captions, tagline, layout) unchanged. The hero becomes an auto-rotating grey Blender-style viewport (grid + XYZ axis + gizmo); the four lifecycle panels animate to *show* the pipeline — PROMPT types itself out, MODEL shows a half-solid/half-wireframe tusk, VARIANT shows three colored tusks, IN-GAME spawns the tusk into a neutral game scene with a VFX glow. A shared lazy-mount primitive (IntersectionObserver + pause-off-screen) keeps the page smooth; low-end/mobile reuses the existing static-fallback path.

---

## Problem Frame

The landing page is the single most evaluator-facing surface for the Sui Overflow 2026 submission, and today it *tells* rather than *shows*: the hero is a non-interactive framed render and the four-stage lifecycle strip below it is deliberately static SVG art (plan-023 made it pure-presentational). A judge skimming has to read captions to grasp that this is a live 3D generate-and-remix tool. The product's whole pitch is inherently visual, yet renders as a still life. This plan makes the wells behave like the product they advertise, without destabilizing the established visual identity (direction B from the brainstorm: well-contents only, not a page-wide redesign).

Two existing Accepted decisions are touched and must be handled explicitly, not silently:
- **plan-023 KD-1/AC-6** made `LifecycleStrip` deliberately static ("no state, no effects, no Babylon"). This plan reverses that.
- **D-044** mandates pure-black 3D wells ("the contrast is what makes the model visible… clearColor must be #000"). The hero's grey Blender viewport requires a scoped exception ADR, modeled on **D-091** (the `/track` exemption). Scope is the **hero well only** — the four panels keep their black wells.

---

## Requirements Trace (origin: docs/brainstorms/2026-06-06-landing-live-3d-wells.md)

- **R1** (well-contents only, editorial chrome preserved) → U4–U8
- **R2** (replace model with `tusk.glb`, reuse across wells) → U1
- **R3** (hero grey Blender viewport: grid, XYZ axis, gizmo) → U2 (ADR), U4
- **R4** (hero auto-rotate, no drag) → U4
- **R5** (PROMPT typing loop, no Babylon) → U8
- **R6** (MODEL half-solid/half-wireframe, slow spin) → U5
- **R7** (VARIANT three colored tusks) → U6
- **R8** (IN-GAME neutral scene + spawn VFX + glow) → U7
- **R9** (lazy-mount, pause off-screen, never all render loops at once) → U3, U5–U7
- **R10** (static-fallback on low-end/mobile) → U3, U5–U8
- Acceptance examples **AE1–AE5** → mapped in unit test scenarios.

---

## Key Technical Decisions

- **Grey hero viewport via a scoped D-044 exception (user-confirmed).** The hero well gets `clearColor` grey + a Blender grid/axis/gizmo. This needs a new ADR + a `design-tokens.md` scoped-exception block (mirroring D-091's `/track` carve-out). The exception is scoped to the **hero well only**; the four lifecycle panels keep `--well` pure black, so they stay D-044-compliant and need no exemption. (origin: Dependencies/Assumptions.)
- **Reuse `edgesGradientSweep` for the MODEL split, frozen at the midpoint — oscillate, don't turntable.** `setupEdgesGradientSweep(scene, meshes).setProgress(0.5)` renders the half-solid (PBR) / half-wireframe (edges-clone via clip plane) look and is already tested. **Critical geometry constraint (review-corrected):** the clip plane is fixed in **world space** along X and the union bbox is cached once at setup; auto-rotate orbits the *camera*, not the mesh — so a full turntable sends the cut edge-on at ±90° (split collapses to a seam) and swaps sides at 180°, which breaks AE3. The MODEL panel therefore uses a **gentle camera oscillation within a narrow frontal arc (~±30°)**, never a full revolution, so a solid region and a wireframe region are visible at every angle reached. (Avoids reinventing `applyCanvasMode`/`forceWireframe`.)
- **Off-screen panels dispose their Engine; only the hero stays warm (review-corrected).** `engine.stopRenderLoop()` halts the rAF but does NOT release the WebGL context or GPU buffers — keeping all panels warm would leave ~5 resident contexts for the whole session (hero + 4 panels, incl. VARIANT's 3 instances and IN-GAME's GlowLayer + GPU particles), exactly the integrated-GPU jank the Success Criteria calls *worse than static*. `LiveWell` therefore supports both modes behind a prop and **defaults below-fold panels to dispose-on-exit** (re-init of the 345K GLB on scroll-back is a few hundred ms, hidden by the static SVG until `onSceneReady`); the hero keeps its context warm but **pauses its render loop when scrolled out of view**. This bounds resident *and* running heavy scenes. R9 restated honestly: heavy scenes are torn down (panels) or paused (hero) when off-screen, never all running at once — but on a tall viewport the hero and the topmost panel can be briefly co-visible, so "≤ 2 co-visible heavy loops" is the real guarantee, to be confirmed on the tallest demo viewport. The `VITE_` kill-switch (below) is the measured-jank fallback.
- **Shared `LiveWell` primitive + `useInView` hook.** MODEL, VARIANT, IN-GAME all share: lazy-mount, engine/scene/camera/light setup, GLB load via `frameCameraToMeshes`, auto-rotate, pause/resume, StrictMode-safe dispose, and static-fallback composition. Four consumers (incl. hero reusing helpers) justify the abstraction. `useInView` is net-new (IntersectionObserver is used nowhere in the repo yet).
- **Hero keeps its Walrus-fetch→embedded-fallback flow unchanged** (resolves an origin deferred question). The "live from Walrus" caption is part of the data-layer native story; only the embedded fallback GLB and the well chrome change. The Walrus blob CID stays the existing placeholder until Rick's pre-flight mint (already a tracked pre-deploy item).
- **VFX/glow stay off the D-044 accent budget.** IN-GAME's glow uses a neutral color (well-ink white / cool tint), never `#FF4500`, so the panels remain accent-free and the page's ≤5-accent budget is untouched. Particle emission uses `start()`/`stop()` (never `emitRate=0`), keeps Babylon's default `updateSpeed`, and never reads `getActiveCount()` for liveness (per `docs/solutions/.../babylon-gpu-particle-emission-control...`).
- **StrictMode + hooks discipline is load-bearing.** All hooks declared above any `inView` early return (per `react-hooks-after-early-return-oauth-mask`); `aliveRef.current = true` re-asserted as the first statement of each effect body (per `react-strictmode-cleanup-only-effect-with-useref`); scene-effect cleanup guarded by `if (!engine.isDisposed)` + `engine.wipeCaches(true)`; post-`await` `scene.isDisposed` guards before mutating.

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
LandingPage
├── LedeHero (U4)                  always-live when renderMode==='live'; above fold, no IntersectionObserver
│     └── Babylon scene: grey clearColor + GridMaterial ground + AxesViewer + gizmo + auto-rotate tusk
│
└── LifecycleStrip (U8)            editorial chrome unchanged; PANELS now carry a render kind
      ├── PROMPT  → TypewriterPrompt (U8)         no Babylon; useInView-gated typing loop
      ├── MODEL   → LiveWell (U3) + edgesGradientSweep.setProgress(0.5)   (U5)
      ├── VARIANT → LiveWell (U3) + 3 instanced tusks, distinct colors    (U6)
      └── IN-GAME → LiveWell (U3) + ground + ShadowGenerator + spawn particles + glow  (U7)

LiveWell (U3) composes:
  useLedeRenderMode() ── live vs static-fallback (existing)
  useInView()        ── lazy-mount + pause/resume (NEW)
  3-effect Babylon lifecycle (engine / scene / glb-load) mirrored from PreviewCanvas + LedeHero
  static fallback: renders the panel's existing /lifecycle/*.svg when not live
```

Render-loop activity over a scroll session (satisfies R9 — never all at once):

```
viewport at hero:     [hero:RUN]  panel scenes not yet created
scroll to MODEL:      [hero:PAUSE? or RUN if visible] [MODEL:RUN] [VARIANT:created? no] ...
scroll past MODEL:    [MODEL:PAUSE] [VARIANT:RUN] ...
```

---

## Implementation Units

### U1. Swap canonical tusk model

**Goal:** Make `tusk.glb` (the 345K Downloads model) the single tusk used by hero + all panels.
**Requirements:** R2
**Dependencies:** none
**Files:**
- `frontend/public/models/tusk3d/tusk.glb` (new — copied from the user's `Downloads/tusk.glb`)
- `frontend/src/landing/LedeHero.tsx` (update `EMBEDDED_GLB_URL` constant)
- (constant is re-exported/shared for panels in U3 — see Approach)
**Approach:** Copy `Downloads/tusk.glb` into `frontend/public/models/tusk3d/tusk.glb` (345K, cleaner/smaller than the current 667K `walrus-tusk.glb`). Promote the embedded-GLB path to a shared constant (e.g. in a small `frontend/src/landing/tuskModel.ts` or reuse an existing constants location) so hero and all three Babylon panels reference one source. Leave `walrus-tusk.glb` in place for now (referenced history); the swap is the constant change, not a delete. Confirm the new GLB loads and frames correctly before wiring panels.
**Patterns to follow:** root-absolute public URL convention (`/models/tusk3d/...`); `LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' })`.
**Test scenarios:** `Test expectation: none -- asset swap + constant change; behavior is exercised by U4–U7 tests that load the model.` Verification that the URL resolves is covered by browser verification in U8.
**Verification:** Hero renders the new tusk locally; no 404 on `/models/tusk3d/tusk.glb`.

---

### U2. ADRs + design-tokens scoped exception

**Goal:** Record the two Accepted-decision changes before code depends on them.
**Requirements:** R1, R3 (governance for the grey well + live strip)
**Dependencies:** none
**Files:**
- `docs/decisions.md` (two new sequential D-0XX entries)
- `docs/ux/design-tokens.md` (scoped-exception block for the hero well, mirroring the D-091 `/track` block)
**Approach:** Write two ADRs using the project ADR template:
1. **Reverse plan-023 KD-1/AC-6** — `LifecycleStrip` moves from "deliberately static, no Babylon" to live Babylon panels with static-fallback. Note the layer-caption contract (INPUT/L1/L2/L3; never "Access"/"Seal"/"Derivative") and the zero-accent rule on panels remain in force.
2. **Scoped D-044 exception for the hero well** — the hero (`/` lede) may use a grey `clearColor` + grid/axis/gizmo chrome and continuous auto-rotation. Scope strictly to the hero well; the four lifecycle panels keep `--well` (#000). Reference D-044's own consequence note that anticipates "subtle 3D-viewer rotation" as the intended stillness mitigation. Model the carve-out on D-091.
Amend `design-tokens.md` with a short scoped-exception block naming the hero well, so the black-well rule isn't silently contradicted.
**Patterns to follow:** existing ADR entries D-044, D-091; the `design-tokens.md` line-9 `/track` exception block.
**Test scenarios:** `Test expectation: none -- documentation. Optionally a token-conformance assertion is added in U4/U8 tests (panels accent-free; only hero clearColor is non-black).`
**Verification:** Both ADRs present with correct sequential IDs and `Accepted` status; D-091 referenced; `design-tokens.md` updated; commit message references the reversed decision per the Decision Reversal Protocol.

---

### U3. Shared `LiveWell` primitive + `useInView` hook

**Goal:** One reusable, StrictMode-safe, lazy-mounted Babylon panel building block + the viewport-visibility hook it needs.
**Requirements:** R9, R10
**Dependencies:** U1
**Files:**
- `frontend/src/landing/useInView.ts` (new)
- `frontend/src/landing/useInView.test.tsx` (new)
- `frontend/src/babylon/LiveWell.tsx` (new — or `frontend/src/landing/LiveWell.tsx`; keep beside PreviewCanvas if reused beyond landing)
- `frontend/src/babylon/LiveWell.test.tsx` (new)
**Approach:**
- `useInView(options?)` → `{ ref, inView }` via `IntersectionObserver` (threshold ~0.25, optional `rootMargin`). SSR/no-IO-safe (return `inView:false` or a sensible default when `IntersectionObserver` is undefined). All hooks unconditional; re-assert `aliveRef.current = true` in the effect body.
- `LiveWell` props: `glbUrl`, `staticSrc`/`staticAlt` (the panel's existing SVG for fallback + as the mount placeholder), `testIdBase`, **`ariaLabel` (required — a plain-language description of what the well depicts, since a bare `<canvas>` is opaque to AT)**, **`offscreenPolicy?: 'dispose' | 'pause'` (default `'dispose'` for panels; hero passes `'pause'`)**, **`autoRotate?: boolean` (default `true` full-turntable; MODEL passes `false` to install its own bounded oscillation)**, and a `sceneHook`/`onSceneReady(scene, container, camera)` extension point so each panel (MODEL/VARIANT/IN-GAME) can decorate the base scene (sweep, instances, VFX) without duplicating lifecycle code.
- Composition: `const renderMode = useLedeRenderMode(); const { ref, inView } = useInView();`. Live only when `renderMode==='live'`. Create Engine/Scene on **first** `inView`. On `inView`→false: dispose the engine (`offscreenPolicy==='dispose'`) or `engine.stopRenderLoop()` (`'pause'`); on re-entry, recreate or `runRenderLoop()` accordingly. Camera framed via `frameCameraToMeshes` (reused verbatim from `PreviewCanvas`). Auto-rotate via a **new** unconditional `onBeforeRenderObservable` advancing `camera.alpha` — the *constant* (~0.2 rad/s) is borrowed from `PreviewCanvas` but **not** its idle-gate/pointer logic (the wells have no pointer interaction; no `attachControl`).
- **Mount/loading state:** until `onSceneReady` fires (engine up + GLB loaded + framed — 200–800ms for a 345K GLB), render the `staticSrc` `<img>` absolutely positioned **beneath** the canvas as a placeholder, then reveal the canvas on top. No empty black square in the editorial layout.
- Render branch (live): static `<img>` placeholder layer + `<canvas aria-label={ariaLabel} role="img">` on top; static-fallback branch: `<img src={staticSrc} .../>` only (mirror LedeHero's split; `onError`→hide for the SVG).
- **Testid convention (canonical, inherited by all wells):** `{testIdBase}-canvas` and `{testIdBase}-static-image` (e.g. `lifecycle-panel-model-canvas`). The hero retains its established `lede-canvas`/`lede-static-image` ids for backward-compat with existing tests.
- **Kill-switch (first-class deliverable):** read `VITE_LANDING_LIVE_WELLS` (default on) here and in the hero; when off (or `import.meta.env` low-power build), every well collapses to its static-fallback branch and the Babylon imports tree-shake out of the landing bundle (per `vite-build-time-flag-tree-shake-gate`). This is the one-flip revert if the live path janks on the demo machine.
**Technical design (directional, not spec):**
```
LiveWell:
  hooks (all unconditional): useLedeRenderMode, useInView, refs(engine,scene,container), createdRef
  effect[isLive, inView]:
    if !isLive or !inView: if created -> engine.stopRenderLoop(); return
    if !createdRef: create engine+scene+camera+light; runRenderLoop(()=>sceneRef?.render());
                    load GLB -> frameCameraToMeshes -> onSceneReady(scene,container,camera); createdRef=true
    else: engine.runRenderLoop(...)   // resume
    cleanup: guarded by !engine.isDisposed -> dispose extension, container, scene, engine.wipeCaches(true)
```
**Patterns to follow:** `frontend/src/babylon/PreviewCanvas.tsx` (3-effect lifecycle, `frameCameraToMeshes`, `isDisposed`/`wipeCaches` discipline, auto-rotate observer); `frontend/src/landing/useLedeRenderMode.ts` (synchronous-init, unconditional hooks, SSR guard); the two StrictMode/hooks solution docs. **Mock boundary (applies to every well test):** all `@babylonjs/core` classes, the `@babylonjs/loaders` side-effect import, and every Babylon helper factory (`setupEdgesGradientSweep`, `frameCameraToMeshes`, grid/axes/VFX builders) are mocked at the module boundary — only React/hook behavior runs against real code. No WebGL in CI.
**Test scenarios:**
- `useInView`: returns `inView:false` initially; flips true when the mocked `IntersectionObserver` callback fires with `isIntersecting:true`; flips back false; disconnects observer on unmount; returns a safe default when `IntersectionObserver` is undefined (jsdom). Mock `IntersectionObserver` globally.
- `LiveWell` (Babylon mocked, under `<StrictMode>`): renders the static `<img>` when `useLedeRenderMode` is forced `'static-fallback'`; renders the canvas (with the placeholder `<img>` beneath) when `'live'`; canvas carries the passed `aria-label`; **Covers AE2** — forced live + inView then off-screen with `offscreenPolicy='dispose'` → `engine.dispose` called; with `offscreenPolicy='pause'` → `engine.stopRenderLoop` called and `engine.dispose` NOT called on the off-screen transition; engine constructed exactly once across a StrictMode double-mount + an inView false→true→false→true sequence (dispose policy) re-creates cleanly on re-entry; dispose runs under the `!isDisposed` guard; `frameCameraToMeshes` invoked after GLB load; placeholder `<img>` present until `onSceneReady`.
**Verification:** Both hook and primitive unit tests pass under StrictMode; no "rendered fewer hooks" error across inView toggles.

---

### U4. Hero Blender viewport (LedeHero rewrite)

**Goal:** Turn the hero into a grey auto-rotating Blender-style viewport of the new tusk.
**Requirements:** R1, R3, R4 — **Covers AE5**
**Dependencies:** U1, U2 (hero inlines its own grid/axis chrome and reuses `frameCameraToMeshes` from `PreviewCanvas`, **not** `LiveWell` — so it does **not** depend on U3 and can be built first/in parallel as the highest-impact, most-evaluator-visible change; if U3 slips, the hero still ships)
**Files:**
- `frontend/src/landing/LedeHero.tsx` (modify)
- `frontend/src/landing/LedeHero.test.tsx` (modify)
- Grid/axis/auto-rotate setup is **inlined in `LedeHero.tsx`'s scene effect — do not pre-extract a `blenderChrome.ts`** (the panels keep black wells and don't use grid/axes; auto-rotate already lives in `LiveWell`, so a shared chrome module would have exactly one consumer). Extract later only if a second consumer appears.
**Approach:** Keep the existing 4-effect structure and the Walrus-fetch→embedded-fallback flow unchanged. Changes inside the scene effect:
- `scene.clearColor` set to the grey from the U2 token (replacing `(0,0,0,1)`).
- **Remove the existing `setupEdgesGradientSweep` call** (LedeHero currently runs the 6s wireframe-sweep loop). A grid/axis Blender viewport reads clean as a solid PBR tusk; a wireframe gradient wiping across an orbiting grey viewport would be muddy, and the same world-X-plane-vs-camera-orbit problem as U5 applies. Hero shows the solid tusk only.
- Add a ground **grid** via `import { GridMaterial } from '@babylonjs/materials/grid/gridMaterial'` (tree-shaken subpath per D-027, mirroring `racetrackScene.ts`'s `SkyMaterial` import — the U4 test mocks this subpath like the existing `skyMaterial` mock) on a `MeshBuilder.CreateGround`, sized to the framed composition, lines in `--well-ink`/grey.
- Add an **XYZ axis** indicator via `import { AxesViewer } from '@babylonjs/core/Debug/axesViewer'` (net-new to the repo) and a small **camera/orientation gizmo** corner indicator.
- Add **auto-rotation**: a **new** unconditional `onBeforeRenderObservable` advancing `camera.alpha` (constant ~0.2 rad/s borrowed from `PreviewCanvas`, but **not** its idle-gate/pointer mechanism — the hero has no pointer interaction); still **no `attachControl`** (R4).
- **Loading state:** keep the static keyframe `<img>` visible until `onSceneReady` (engine up + GLB framed), then reveal the canvas — no black/grey flash. Pause the hero render loop when it scrolls out of view (`offscreenPolicy: 'pause'`-style guard; the brutalist hero is fine frozen when off-screen).
- Editorial caption block, dwell-CTA, render-mode static-fallback `<img>` all unchanged (R1).
**Patterns to follow:** existing `LedeHero.tsx` effect shape; `racetrackScene.ts` `MeshBuilder.CreateGround` + tree-shaken `@babylonjs/materials/*` subpath imports (D-027); `PreviewCanvas` auto-rotate constant (~0.2 rad/s, mechanism re-implemented without the idle gate).
**Test scenarios (Babylon mocked, `<StrictMode>`, render-mode forced):**
- **Covers AE5** — forced `'live'`: a `<canvas>` (`lede-canvas`) renders, `scene.clearColor.set` called with the grey (not `0,0,0`), grid + axis builders invoked, auto-rotate observer registered; forced `'static-fallback'`: the keyframe `<img>` renders and no engine is constructed.
- Camera has no `attachControl` call (R4 guard); auto-rotate observer advances `camera.alpha` with **zero pointer events** (no idle gate — opposite of the PreviewCanvas idle-gated test).
- `setupEdgesGradientSweep` is **not** called (sweep removed from hero).
- Keyframe `<img>` stays mounted until `onSceneReady`, then canvas is revealed (loading-state guard).
- Engine constructed exactly once across the Walrus→embedded source swap (regression guard, preserved from existing test).
- New tusk URL (`/models/tusk3d/tusk.glb`) is the embedded fallback source.
**Verification:** Hero shows grey gridded viewport with slowly rotating tusk on desktop; static keyframe on mobile; existing dwell-CTA still appears at 15s.

---

### U5. MODEL panel — half-solid / half-wireframe

**Goal:** Live tusk split half shaded-solid, half wireframe, slowly rotating, split held.
**Requirements:** R6 — **Covers AE3**
**Dependencies:** U3
**Files:**
- `frontend/src/landing/panels/ModelPanel.tsx` (new)
- `frontend/src/landing/panels/ModelPanel.test.tsx` (new)
**Approach:** Render `LiveWell` with the tusk (`offscreenPolicy='dispose'`, `testIdBase='lifecycle-panel-model'`); in `onSceneReady`, call `setupEdgesGradientSweep(scene, meshes)` then `.setProgress(0.5)` to freeze the clip-plane cut at the midpoint (solid on one side, edges/wireframe on the other). Dispose the sweep control in cleanup. Keep the well black (no D-044 exception). **Rotation (review-corrected):** the sweep's clip plane is fixed in **world space** along X with the bbox cached once at setup, and `LiveWell`'s default auto-rotate orbits the *camera* — a full turntable would push the cut edge-on at ±90° (split collapses) and swap sides at 180°, violating AE3. So MODEL **disables `LiveWell`'s default auto-rotate** (`autoRotate={false}`) and installs its own observer that **oscillates `camera.alpha` within a narrow frontal arc (~±30° around the front)**, easing back and forth — the cut never goes edge-on or inverts, so both regions read at every angle.
**Patterns to follow:** `frontend/src/babylon/edgesGradientSweep.ts` (`setProgress(0.5)` freeze; world-space planes `new Plane(±1,0,0,0)`; load-bearing `import '@babylonjs/core/Rendering/edgesRenderer'`); `LedeHero` prior sweep usage.
**Test scenarios (Babylon + `edgesGradientSweep` mocked, `<StrictMode>`):**
- Forced `'static-fallback'`: renders `/lifecycle/model.svg` `<img>`, no canvas.
- Forced `'live'` + inView: `setupEdgesGradientSweep` called and `setProgress` called with `0.5` (**Covers AE3** — split frozen at midpoint, not looping).
- `LiveWell` default auto-rotate disabled; the panel's own oscillation observer keeps `camera.alpha` within the bounded arc (assert it never reaches ±90° from front — the edge-on guard).
- Sweep control `.dispose()` called on unmount; canvas testid `lifecycle-panel-model-canvas`.
**Verification:** On desktop, MODEL well shows a gently rocking tusk that is visibly solid on one half and wireframe on the other **throughout the motion** (never collapsing to all-solid/all-wire); mobile shows the SVG.

---

### U6. VARIANT panel — three colored tusks

**Goal:** Three tusks in distinct colors (a triptych), conveying "same model, three forks."
**Requirements:** R7
**Dependencies:** U3
**Files:**
- `frontend/src/landing/panels/VariantPanel.tsx` (new)
- `frontend/src/landing/panels/VariantPanel.test.tsx` (new)
**Approach:** Render `LiveWell` (`offscreenPolicy='dispose'`, `testIdBase='lifecycle-panel-variant'`); in `onSceneReady`, create three instances of the loaded tusk (thin/standard instances sharing geometry to avoid 3× load cost), arrange them across the well, and assign each a distinct material color. **Palette (named, not implementer-invented):** three **desaturated/muted tints that read against a pure-black well and stay within the brutalist-editorial register** — i.e. low-saturation, mid-value; explicitly **not** neon/high-chroma (neon green/magenta would satisfy "not #FF4500" yet violate D-044). Define the three exact hex values in the U2 design-tokens block as `--variant-1/2/3` so build and test reference one source. Frame the camera to the union of the three. Slow shared auto-rotation from `LiveWell`. Keep well black.
**Patterns to follow:** instancing over re-loading (`createInstance`/thin instances); `frameCameraToMeshes` over the instance set; existing color/material handling in `applyCanvasMode.ts` (`partColors`) for safe material color assignment.
**Test scenarios (Babylon mocked, `<StrictMode>`):**
- Forced `'static-fallback'`: renders `/lifecycle/variant.svg`, no canvas.
- Forced `'live'` + inView: exactly three instances created; the three colors equal the recorded `--variant-1/2/3` token values (not just "distinct and not #FF4500"); none equal the D-044 accent token.
- Instances/materials disposed on unmount (no leak across StrictMode remount).
- Canvas testid `lifecycle-panel-variant-canvas`.
**Verification:** VARIANT well shows three differently-colored tusks on desktop; SVG on mobile.

---

### U7. IN-GAME panel — neutral scene + spawn VFX + glow

**Goal:** Tusk spawns into a neutral minimal game scene (ground tile + soft shadow) with a looping particle/glow entrance.
**Requirements:** R8 — **Covers AE4**
**Dependencies:** U3
**Files:**
- `frontend/src/landing/panels/InGamePanel.tsx` (new)
- `frontend/src/landing/panels/InGamePanel.test.tsx` (new)
- Spawn VFX logic is **inlined in `InGamePanel.tsx` — do not pre-extract a `spawnVfx.ts`** (one consumer; extract only if it grows past ~30 lines).
**Approach:** Render `LiveWell` (`offscreenPolicy='dispose'`, `testIdBase='lifecycle-panel-ingame'`); in `onSceneReady`, build a neutral scene: `MeshBuilder.CreateGround` tile + `DirectionalLight` + `ShadowGenerator` for the soft shadow. **Spawn read = emissive glow first, particles as enhancement:** ramp the tusk's `emissiveColor`/`emissiveIntensity` (or a `GlowLayer`) as the *primary* entrance signal so AE4 holds even where GPU particles aren't available; add a `GPUParticleSystem` burst behind the **required `if (!GPUParticleSystem.IsSupported) return <no-op>` guard** (per `tireSmoke.ts`), controlled by `start()`/`stop()` (never `emitRate=0`), default `updateSpeed`, runtime `DynamicTexture` sprite, neutral/cool color. **Loop driver (specified, not deferred):** drive the loop off `scene.onBeforeRenderObservable` accumulated `deltaTime` (so it pauses/tears down with the render loop and never fires while off-screen — no stray `setInterval`), with a single `LOOP_PERIOD_S` constant constrained `> particleLifetime + glowRampDuration` so `start()` is never re-issued mid-burst. **Between bursts the tusk stays visible and holds its emissive glow** — only the particle burst replays; the tusk never disappears. All VFX colors stay off the accent budget (neutral/white/cool, never `#FF4500`). **Not** tied to Rage Racing — no `/track` palette or branding (D-091 boundary).
**Patterns to follow:** `frontend/src/track/tireSmoke.ts` (`GPUParticleSystem.IsSupported` no-op guard, factory: capacity, gradients, `DynamicTexture` radial sprite, `{ tick, dispose }`); `frontend/src/track/racetrackScene.ts` (`CreateGround`, `DirectionalLight`, `ShadowGenerator`); `babylon-gpu-particle-emission-control` solution doc (start/stop, updateSpeed, never read getActiveCount).
**Test scenarios (Babylon + particle system mocked, `<StrictMode>`):**
- Forced `'static-fallback'`: renders `/lifecycle/in-game.svg`, no canvas.
- Forced `'live'` + inView: ground + shadow generator created; tusk emissive/glow applied (primary spawn signal present even with particles mocked to `IsSupported=false` → no-op); particle system started via `start()` (not `emitRate`) when supported; **Covers AE4** — loop replays via the `onBeforeRenderObservable` accumulator, not one-shot-then-inert, and the tusk stays visible/glowing between bursts.
- Loop guard: no `start()` issued while a burst is in flight (`LOOP_PERIOD_S > lifetime` honored).
- VFX/glow color is not the accent token (accent-budget guard).
- Particle system + glow disposed on unmount; off-screen path disposes the engine (`offscreenPolicy='dispose'`) so the loop stops with it.
**Verification:** IN-GAME well shows the tusk dropping in with a glowing particle burst over a shadowed ground tile, looping; SVG on mobile.

---

### U8. LifecycleStrip integration + PROMPT typing + test rewrite

**Goal:** Wire the three live panels + the typing PROMPT into `LifecycleStrip`, preserving editorial chrome, and update the now-invalid tests.
**Requirements:** R1, R5, R10 — **Covers AE1**
**Dependencies:** U5, U6, U7
**Files:**
- `frontend/src/landing/LifecycleStrip.tsx` (modify — PANELS gain a render kind; render live components with static-fallback)
- `frontend/src/landing/LifecycleStrip.module.css` (modify only if needed for canvas sizing within `.well`)
- `frontend/src/landing/TypewriterPrompt.tsx` (new — PROMPT typing component)
- `frontend/src/landing/TypewriterPrompt.test.tsx` (new)
- `frontend/src/landing/LifecycleStrip.test.tsx` (modify — remove zero-canvas / exactly-3-`<img>` assertions)
**Approach:**
- Extend the `PANELS` model so each panel declares its render kind (`typing` | `model` | `variant` | `ingame`) while keeping `header`, `layer`, and the fallback `img`/`alt`/`prompt` fields. Render the matching live component inside each `.well`; the editorial `header`/`layer` spans, tagline, borders, and grid layout are untouched (R1). Layer captions stay contract-locked (INPUT/L1/L2/L3; never Access/Seal/Derivative).
- `TypewriterPrompt`: `useInView`-gated; types the prompt char-by-char with a blinking cursor, pauses on completion, loops (R5). Pure text/CSS, no Babylon. **Canonical prompt string = `"a low-poly walrus tusk"`** (matches origin R5 and the hero caption; supersede `LifecycleStrip.tsx`'s current `"a low-poly walrus tusk, ornate carve"` so all three surfaces agree). Respect `prefers-reduced-motion` → render the full string statically, no timer. Use a timer; clean up on unmount/inView-exit. **Accessibility:** the outer element carries a static `aria-label="a low-poly walrus tusk"` (the complete string) and the animated text span is `aria-hidden="true"`, so screen readers announce the prompt once rather than character-by-character (or silently).
- Rewrite `LifecycleStrip.test.tsx`: drop the "canvas is null" and "exactly 3 `<img>`" assertions (no longer true); keep the locked layer-caption assertions, the never-"Access/Seal/Derivative" word-boundary assertion, and the zero-`#FF4500`-accent assertion on the strip; mock the three live panels + `TypewriterPrompt` to avoid WebGL/timers in the strip test (assert the right child per panel key).
**Patterns to follow:** existing `LifecycleStrip.tsx` PANELS/`.well` structure; LedeHero static/live split + `data-render-mode`; `useLedeRenderMode` for reduced-motion-adjacent gating.
**Test scenarios:**
- `TypewriterPrompt`: **Covers AE1** — starts from empty string on inView (fake timers), advances one char per tick, shows blinking cursor, loops after completion; `prefers-reduced-motion` → full string rendered immediately, no timer; timer cleared on unmount; outer element exposes the full string via `aria-label` and the animated span is `aria-hidden`.
- `LifecycleStrip`: renders four panels with locked headers/layers; the never-Access/Seal/Derivative assertion still passes; strip-level zero-accent assertion still passes; each panel key renders its mapped (mocked) live component; mobile/static-fallback path still renders the SVG `<img>` per panel.
**Verification:** Full landing page renders four live panels on desktop with chrome intact; mobile shows SVGs + static prompt text; `pnpm --dir frontend test` green; browser-verified via `agent-browser --headed` across `/` (Babylon screenshots need `--headed`).

---

## System-Wide Impact

- **Landing route `/` only.** No backend, contract, or Walrus write-path changes. Hero's existing Walrus read/fetch is preserved as-is.
- **New pattern introduced:** `IntersectionObserver` (via `useInView`) — first use in the repo; documented here and worth a `docs/solutions/` capture after landing (multi-canvas + Babylon-test-mocking are noted gaps).
- **Test surface:** `LifecycleStrip.test.tsx` and `LedeHero.test.tsx` change; ~6 new test files. All Babylon stays mocked at the module boundary (no WebGL in CI).
- **Perf:** up to 4 WebGL contexts on `/` (hero + 3 panels once scrolled); only visible scenes run render loops. Watch frame health on the demo laptop.
- **Reviewers:** frontend-touching → default 5-reviewer roster (`ce-julik-frontend-races-reviewer`, `ce-correctness-reviewer`, `ce-testing-reviewer`, `ce-api-contract-reviewer`, `ce-adversarial-reviewer`). The races reviewer is especially relevant (observer + dispose + StrictMode).

---

## Risk Analysis & Mitigation

- **Multi-canvas perf/jank on the most important page.** *Mitigation:* below-fold panels **dispose** their engine off-screen (not just pause), so resident WebGL contexts stay bounded; hero pauses when scrolled away; static-fallback gate excludes mobile/low-end; **first-class `VITE_LANDING_LIVE_WELLS` kill-switch** (default on; per `vite-build-time-flag-tree-shake-gate` solution — constant-folded so Babylon tree-shakes out of the landing bundle when off) reverts the whole strip+hero to the static SVG/keyframe path in one flag flip if jank shows up on the demo laptop. Treat this flag as a deliverable, not a maybe. Re-validate frame health on the tallest demo viewport (hero + topmost panel can be co-visible).
- **StrictMode double-mount / hooks-after-early-return.** *Mitigation:* hoist all hooks above `inView` early returns; re-assert `aliveRef` in effect bodies; wrap new tests in `<StrictMode>`; `isDisposed` guards + `wipeCaches`. Both failure modes are documented solutions — follow them verbatim.
- **D-044 drift.** *Mitigation:* grey is scoped to the hero well via U2 ADR; panels stay black + accent-free; VFX/glow use neutral colors; keep the strip's zero-accent test.
- **MODEL split breaking under rotation (review-corrected).** The sweep clip plane is **world-space**-fixed, and camera-orbit auto-rotate would push it edge-on at ±90° and invert at 180° (AE3 violation). *Mitigation:* MODEL disables `LiveWell`'s turntable and uses a bounded ±30° frontal oscillation so the split never collapses or inverts — resolved in U5, not deferred.
- **GLB visual quality as wireframe / 3 instances.** *Mitigation:* confirm the 345K tusk is manifold/clean during U1 before wiring panels (it renders as edges in MODEL and ×3 in VARIANT).

---

## Scope Boundaries

- **Well-contents only** — no page-wide redesign toward a 3D-IDE language (origin Approach B).
- **Hero is auto-rotate only** — no drag/orbit.
- **IN-GAME is a neutral scene** — not tied to Rage Racing `/track` assets/branding, and not a multi-prop diorama.
- **VARIANT is three tusks**, not a 16-fork grid.
- **No backend / contract / Walrus write changes.** Hero's existing Walrus read-fetch is kept, not extended.
- **Live canvas, not pre-rendered loop video, for the panels.** A short looping WebM of the same motion would deliver similar perception at near-zero GPU cost (an alternative raised in review). Rejected for v1 because: the hero's "live from Walrus" caption needs a genuinely live scene to be honest, and keeping all four wells on one live mechanism (with the `VITE_` kill-switch as the static escape hatch) is simpler than maintaining a hybrid canvas+video pipeline 15 days out. Revisit if the demo-laptop frame budget proves too tight even after dispose-on-exit.

### Deferred to Follow-Up Work

- `docs/solutions/` capture of the multi-canvas lazy-mount + Babylon-test-mocking patterns (noted gap) — after the feature lands.
- Optional: extract `LiveWell` to a more general location if reused outside landing.
- Optional richer IN-GAME diorama / Rage-Racing tie — explicitly out for v1.

---

## Deferred to Implementation

- Exact grey hex for the hero `clearColor` (tune visually against tusk contrast; record in U2 token).
- Grid size/spacing, axis length, and gizmo placement (tune to the framed composition).
- Particle capacity / glow intensity / loop interval for IN-GAME (tune to taste within the perf budget).
- Whether `LiveWell` lives in `frontend/src/babylon/` vs `frontend/src/landing/` (decide when writing U3 based on reuse).
- Thin-instances vs standard instances for VARIANT (pick during U6 against the GLB).

---

## Verification Strategy

- `pnpm --dir frontend test` green, including rewritten `LifecycleStrip.test.tsx` / `LedeHero.test.tsx` and the new hook/primitive/panel/typewriter tests, all under `<StrictMode>`.
- Browser verification via `agent-browser --headed` (Babylon needs headed) across the demo arc, focused on `/`: hero grey viewport + rotation; four panels live on desktop; mobile/static-fallback shows SVGs + static prompt; no console hook-count errors; CTA still appears at 15s.
- `docs/ux/frontend-checklist.md` pass — especially the effect-deps / race category for the observer lifecycle.
