---
date: 2026-05-18
topic: racetrack-scene-polish
focus: high-ROI visual + game-feel polish for 30s pitch demo video
mode: repo-grounded
scope: tactical (meeting-test floor relaxed)
---

# Ideation: Racetrack Game Scene Polish

## Grounding Context

**Phase:** 3 (Sample game scene) · **Days to submission:** 34 of 38

**Current visual state:**
- Sky: flat clearColor RGB(0.55, 0.7, 0.85)
- Road: dark asphalt ribbon (0.18, 0.18, 0.2), 14u wide, Catmull-Rom oval
- Barriers: 48 tan boxes, uniform color
- Lighting: single HemisphericLight, no shadows
- Camera: ArcRotateCamera, 0.04 chase lerp
- HUD: React overlay (lap time + best)
- Post-processing: none. Particles: none. Audio: none. Fog: none.

**Game-feel state:**
- ✅ shipped: lap timing, PB persistence, chase camera, arcade steering, skid marks (hardcoded sizing per memory), result modal, R-key reset, carousel switching
- ❌ missing: audio, countdown, speedometer, off-track penalty, sector splits, drift particles

**Key code-structure leverage:**
- All ~70 tunables are named constants at top of `racetrackScene.ts` — easy to tune
- `skidMarks.ts` is single source of truth for sizing (do NOT derive from bounding box — failed twice per project memory)
- HUD is pure React (decoupled from Babylon)
- `lapState.ts` is a pure reducer (any new state like "intro" is testable in isolation)

**External grounding (web research):**
- Art of Rally / Absolute Drift formula: flat colors + post-processing + emissive markings + atmospheric sky. NOT textures.
- Babylon `DefaultRenderingPipeline` is a 30-min one-liner for bloom + FXAA + tonemap
- `@babylonjs/materials` SkyMaterial = Preetham atmospheric scattering, no cube map needed
- GPU particles (`GPUParticleSystem`) cost near zero on WebGL2 (Havok already requires WebGL2)
- Itch.io winning low-poly racers share 3 properties: non-flat sky, bloom on something emissive, drift particles

## Topic Axes
1. Environment & sky
2. Track surface & markings
3. Post-processing pipeline
4. Driving feedback
5. HUD & demo framing

## Ranked Ideas (all 7 accepted for implementation)

### 1. DefaultRenderingPipeline (bloom + FXAA + tonemap)
**Description:** Enable Babylon's built-in `DefaultRenderingPipeline` with bloom (threshold 0.7), FXAA, and image-processing tonemap. One-time setup at scene init.
**Axis:** Post-processing pipeline
**Basis:** `external:` Babylon docs (DefaultRenderingPipeline) — canonical Babylon polish move.
**Rationale:** Global multiplier on every other visual move. Transforms "flat WebGL" to "polished game" in one commit. Currently zero post-processing.
**Downsides:** ~5–10% GPU overhead.
**Confidence:** 95% · **Complexity:** Low · **Effort:** 30 min · **Status:** Unexplored

### 2. SkyMaterial atmospheric sky
**Description:** Replace flat clearColor with `@babylonjs/materials` SkyMaterial (Preetham atmospheric scattering) on a skybox. Pick golden-hour preset.
**Axis:** Environment & sky
**Basis:** `external:` `@babylonjs/materials` SkyMaterial; `direct:` `racetrackScene.ts` currently sets clearColor only.
**Rationale:** Sky fills ~40% of chase-cam frame. Procedural beats static texture because sun direction can later align with a DirectionalLight.
**Downsides:** Adds `@babylonjs/materials` dep (~50KB) → requires D-027 ADR.
**Confidence:** 90% · **Complexity:** Low · **Effort:** 45 min · **Status:** Unexplored

### 3. Red/white kerb stripes on barriers
**Description:** Alternate barrier material color per-segment (red/white outer, green/white inner). Pure material swap, no new geometry.
**Axis:** Track surface & markings
**Basis:** `external:` real-world racing convention; `direct:` `racetrackScene.ts` BARRIER_COUNT_OUTER/INNER (48 total uniform-tan boxes today).
**Rationale:** Strongest single signal that says "racetrack" rather than "abstract track."
**Downsides:** None functional.
**Confidence:** 95% · **Complexity:** Low · **Effort:** 30 min · **Status:** Unexplored

### 4. Emissive center stripe + checkered start line
**Description:** Add a thin yellow emissive ribbon down road centerline (picks up bloom from #1). Replace plain white start plane with alternating black/white checker pattern.
**Axis:** Track surface & markings
**Basis:** `external:` Art of Rally art-direction interview (flat colors + emissive markings + bloom is the entire formula).
**Rationale:** Compounds with #1. Defines road as road. Without markings, road reads as path.
**Downsides:** Center stripe needs either sub-segmented ribbon UVs or parallel decal mesh.
**Confidence:** 85% · **Complexity:** Low-Med · **Effort:** 1 hr · **Status:** Unexplored

### 5. FOV pump on acceleration
**Description:** Lerp `camera.fov` 60° → 68° tied to existing `forwardSpeed`. Reuses state already computed.
**Axis:** Driving feedback
**Basis:** `external:` threejs-speedup-effect canonical pattern; `direct:` `forwardSpeed` already in render loop.
**Rationale:** Free kinetic feel. Invisible in screenshot, visceral in video.
**Downsides:** May interact with chase-cam lerp; cap the swing.
**Confidence:** 90% · **Complexity:** Low · **Effort:** 20 min · **Status:** Unexplored

### 6. GPU tire-smoke particles when drifting
**Description:** `GPUParticleSystem` from rear-wheel anchors, gated by same lateralSpeed > 1.5 u/s threshold used by skid marks. Additive-blended gray, ~50k particle capacity.
**Axis:** Driving feedback
**Basis:** `external:` Babylon GPUParticleSystem (near-zero CPU cost); `direct:` `skidMarks.ts` already has the trigger and rear-wheel offsets.
**Rationale:** Particles are the most-remembered thing in 30s racing clips. Pairs with existing skid marks.
**Downsides:** Requires WebGL2 (Havok already mandates it).
**Confidence:** 85% · **Complexity:** Med · **Effort:** 1.5 hr · **Status:** Unexplored

### 7. Camera intro orbit + 3-2-1 countdown
**Description:** Add "intro" state to lapState: scene loads → 2s orbit around car (showcases Tripo GLB) → camera settles to chase → "3...2...1...GO!" overlay → input enabled. Skippable by holding W.
**Axis:** HUD & demo framing
**Basis:** `external:` Devpost hackathon-demo-tips ("open mid-action, not loading screen"); `reasoned:` current cold-start timer is demo-hostile, and the Tripo GLB (project core feature) has no showcase moment.
**Rationale:** Front-loads production value into first 3s judges see, AND implicitly demos the Tripo car. Two birds.
**Downsides:** New state in lap-state machine. Keep dev-skip for productivity.
**Confidence:** 80% · **Complexity:** Low-Med · **Effort:** 45 min · **Status:** Unexplored

## Implementation Staging (accepted 2026-05-18)

| Batch | Items | Effort | Why |
|---|---|---|---|
| **Batch 1** Environment foundation | #1 + #2 + #3 + #5 | ~2 hr | Multiplier base (bloom enables #4). Stops here = standalone-shippable improvement. |
| **Batch 2** Track markings | #4 | ~1 hr | Compounds on batch 1 bloom. |
| **Batch 3** Dynamics + opening | #6 + #7 | ~2.5 hr | Demo-video first-impression. First batch to sacrifice if time short. |

Re-evaluate between batches via 30s screen recording.

## Rejection Summary

| # | Idea | Reason Rejected |
|---|---|---|
| 1 | Bitmap road texture | User's first instinct — anti-pattern. Tiles visibly at speed; fights low-poly. #4 markings do the same job louder. |
| 2 | Bitmap sky cube map | Same anti-pattern. SkyMaterial (#2) gives dynamic sun-position for free. |
| 3 | Shadows via DirectionalLight | WebGL shadow maps cost perf for marginal gain on flat-color scene. |
| 4 | Linear/exp2 fog | Hides track end in a small oval; loses composition. |
| 5 | Distant hills/trees ring | SkyMaterial (#2) does this work; adds geometry to maintain. |
| 6 | Motion blur post-pass | Perf cost; readability tradeoff in 60fps browser. |
| 7 | Speed lines (anime style) | Style clash with low-poly + risks looking gimmicky. |
| 8 | Live PB-pace coloring | Requires sector splits; complex for marginal video impact. |
| 9 | Chromatic aberration on speed | Subtle in screen recording; #5 FOV pump wins this slot. |
| 10 | Engine audio (pitch by speed) | Pitch videos often muted with voice-over; uncertain audio context. |
| 11 | Tire squeal audio | Same audio concern + needs engine audio infra first. |
| 12 | Speedometer HUD | Car's perceived speed reads fine; fights minimal HUD aesthetic. |
| 13 | Title card overlay | Video editor adds this in post; in-scene is redundant. |
| 14 | Vertex-color edge gradient on road | Subtle in motion; #3 kerbs are louder. |
| 15 | Camera shake on barrier hit | Needs new collision detection wiring; modest gain. |
| 16 | Emissive skid marks | Subtle even with bloom; lower than other post uses. |
| 17 | Grass safety-ground tint | Barely visible in chase cam; not worth a touch. |

## Related
- ADR D-027 (to be written): adopt `@babylonjs/materials` for SkyMaterial
- spec.md §3 (Sample game scene goals)
- phase-progress.md (Phase 3 in flight)
- Project memory: skid marks use hardcoded sizing — do NOT derive from BB (failed twice)
