# Track Scene Visual Polish — Requirements

**Date**: 2026-06-01
**Status**: Requirements (ready for `/ce-plan`)
**Scope tier**: Standard, feature-tier
**Phase**: Phase 3 (Tiny Racetrack) — visual polish pass
**Source**: `/ce-brainstorm` session, 2026-06-01

---

## Problem

The `/track` racing scene "feels dark" and "looks rough — like a game from the
2000s." It is a demo surface whose job is to make the NFT integration tangible
and **impress Sui Overflow judges** during the pitch/demo. Current visual
quality undercuts that goal.

The scene is **not actually primitive** — it already ships:
- `SkyMaterial` procedural atmospheric sky (`racetrackScene.ts:346`)
- `DefaultRenderingPipeline` with bloom + FXAA + ACES tonemap (`:709`)
- Asphalt + grass diffuse textures with normal maps (`:368`, `:410`)
- Kenney foliage, GPU tire smoke, skid-mark trails, FOV-pump camera

So the deficit is **lighting and material response**, not geometry.

### Root-cause diagnosis (from `frontend/src/track/racetrackScene.ts`)

1. **No environment texture / IBL.** `scene.environmentTexture` is never set.
   Car GLBs (Tripo + user uploads) export **PBR metallic/roughness** materials;
   with nothing to reflect, metal and paint render near-black. **Primary cause
   of "the car looks dark."**
2. **Only a `HemisphericLight`** pointing up, no `DirectionalLight` (`:331`).
   Flat ambient response, no highlights, no sense of form. The `SkyMaterial`
   sun is *painted* — it emits no light into the scene.
3. **Zero shadows.** No `ShadowGenerator`. The car floats; contact shadow is the
   single biggest "modern game" cue.
4. **`StandardMaterial`** on road / grass / barriers — flatter response under
   ACES tonemap than PBR.
5. **No exposure/contrast tuning** on the tonemap → ACES can crush midtones,
   reading as "dark."

---

## Goal & success criteria

**Goal:** the `/track` scene reads as a modern (2020s) real-time render in the
demo recording, without ballooning carrying cost on a demo-only feature.

**Success criteria** (judged in-browser on the demo machine):
- Car is **visibly lit with reflections** — paint/metal no longer near-black.
- Car casts a **grounded contact shadow** — no floating.
- **No crushed blacks**; midtones readable; cohesive single-source-of-light feel.
- Road / grass / barriers have **modern material response** (PBR), with subtle
  ambient-occlusion depth in seams and under foliage.
- **~60 fps sustained** on the demo-recording machine; **no physics or gameplay
  regression**; existing Vitest suite stays green.

**Non-goals / explicitly deferred (Option 3 territory):**
- Color-grade LUT, depth-of-field, vignette
- Hero intro camera move, dedicated car-presentation pass
- New car models or track geometry
- Any mesh decimation / Walrus encoder change (unrelated to render quality)

---

## Scope (Option 2: Lighting + material polish)

Ordered by bang-per-hour; each item is independently shippable so the plan can
stop early if time runs short.

1. **Environment texture (IBL)** — set `scene.environmentTexture` so PBR
   surfaces (car especially) pick up image-based lighting + reflections.
   *Open design choice for ce-plan:* a static pre-baked `.env` served from
   `frontend/public/` **vs.** a `ReflectionProbe` derived from the live
   `SkyMaterial` (more cohesive with the painted sky, higher per-frame cost —
   probe can render once and freeze since the sky is static).
2. **Directional light + shadows** — one `DirectionalLight` aligned to the
   SkyMaterial sun direction (`SKY_INCLINATION` / `SKY_AZIMUTH`), plus a
   `ShadowGenerator` (contact-hardening or blur-PCF). Car = caster; road +
   ground = receivers.
3. **Tonemap exposure + contrast** — tune `imageProcessing.exposure` and
   `.contrast` so ACES no longer crushes midtones.
4. **PBR materials** — convert road / grass / barriers `StandardMaterial` →
   `PBRMaterial`, reusing existing diffuse+normal textures as albedo+bump.
   Asphalt: low roughness / slight wet sheen. Grass: high roughness, matte.
5. **SSAO** — `SSAO2RenderingPipeline` for ambient-occlusion depth in seams,
   under trees, around barriers. **Performance-gate this** — it is the heaviest
   item; drop first if fps suffers.
6. **Fog + sky tuning** — subtle `EXP2` fog for depth + atmosphere; re-tune
   SkyMaterial if its luminance now clashes with the IBL.

---

## Constraints & conventions

- **Tunable constants** — follow the existing `racetrackScene.ts` pattern:
  named `const` block at top of file with feel-tuning comments, so values are
  adjustable in-browser without re-reading the body.
- **No new npm dependency expected** — PBRMaterial, DirectionalLight,
  ShadowGenerator, SSAO2RenderingPipeline are all in `@babylonjs/core`. A static
  `.env` would add an **asset** (verify size; keep small). Confirm during plan.
- **New rendering pattern** → per `CLAUDE.md`, this warrants a **full ADR +
  plan-mode** before implementation (new pattern: PBR/IBL/shadows/SSAO).
- **Graceful degradation** — like the existing `createFoliage` try/catch, IBL
  load failure must not blank the scene.

---

## Risks & known gotchas

- **Test mock surface.** `racetrackScene.test.ts` mocks `@babylonjs/core` at the
  module boundary. Every new constructor (DirectionalLight, ShadowGenerator,
  PBRMaterial, SSAO2RenderingPipeline, environment-texture loader,
  ReflectionProbe) must be added to the mock or the suite breaks. This is the
  largest hidden cost in the change — budget for it explicitly.
- **Performance stacking.** Shadows + SSAO + PBR + bloom together can drop fps.
  Keep each item behind a tunable enable flag; verify fps after each.
- **IBL / painted-sky mismatch.** A static `.env` whose lighting direction or
  color disagrees with the procedural SkyMaterial sun will look incoherent.
  The reflection-probe-from-sky option avoids this but costs a render target.
- **Shadow acne / peter-panning** on the extruded road ribbon mesh — will need
  bias tuning.

---

## Verification

Per `CLAUDE.md` Frontend Verification Protocol (this is frontend-touching):
- Drive `/track` via the `ce-test-browser` skill (use the `?blob=<id>` dev hatch
  to load the scene without a wallet).
- Assert: car visibly lit, shadow present on ground, no crushed blacks, fps
  stable. Capture before/after stills for the pitch.
- Keep the Vitest suite green; hold the pre-existing tsc error baseline.
- Default frontend review roster applies (5-reviewer pattern incl.
  `ce-julik-frontend-races-reviewer`), though this change is render-pipeline
  rather than async-UI.

---

## Next step

Hand off to `/ce-plan` to sequence the six items into units, decide the
**IBL source** (static `.env` vs sky-derived reflection probe), and author the
ADR for the new rendering pattern.
