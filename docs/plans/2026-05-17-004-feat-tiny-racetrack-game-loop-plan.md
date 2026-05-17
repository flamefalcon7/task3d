---
date: 2026-05-17
status: active
type: feat
topic: tiny-racetrack-game-loop
origin: docs/brainstorms/2026-05-17-tiny-racetrack-game-loop-requirements.md
---

# feat: Tiny Racetrack 1-lap time trial + car physics fix

## Summary

Turn `/track` into a playable 1-lap time-trial: drive an owned car around an extruded-ribbon Bezier oval, see lap time, beat a localStorage personal best, retry. Fixes the U6 car-spinning bug as a prerequisite. 5 implementation units, all touching `frontend/src/track/`. U2 (track geometry) is the longest unit (~2 days, hard time-boxed with named fallback) per plan-time call-out.

---

## Problem Frame

`/track` (shipped in U6 as the Tiny Racetrack) is the buyer-side payoff for the demo arc — the proof that a minted Model3D is actually consumable as game content. The U6 unit was scope-locked to "minimum-viable" per OQ-D5 (no opponents, timer, SFX, wheel spin) and shipped a Babylon scene with physics, WASD, and a chase camera. Two problems are now visible:

1. **Car physics bug.** The loaded car spins in place instead of driving forward. Root cause is in `frontend/src/track/racetrackScene.ts:148`: `carContainer.meshes[0]` picks up the GLB root transform node (often a zero-vertex `__root__`), so the box collider gets a degenerate bounding box. Compounded by steering at `:196-200` mutating the mesh transform directly, fighting Havok's own angular velocity.
2. **No game loop.** Even with physics fixed, the scene has no goal, feedback, or replayable beat. A demo viewer watches a car drive in a rectangle for 30 seconds and learns nothing about what makes the asset valuable.

Both fix in the same neighborhood; bundling them avoids a "bug fix" PR that no one can verify in isolation. The origin brainstorm doc resolved gameplay shape (time-trial, tight oval, result overlay + retry) so planning can focus on the technical decomposition.

---

## Requirements Trace

All R-IDs reference `docs/brainstorms/2026-05-17-tiny-racetrack-game-loop-requirements.md`. R1–R14 listed in the origin map cleanly to implementation units below; AE1–AE6 map to specific test scenarios.

| Origin | Implementation site |
|---|---|
| R1–R3 (car physics correctness) | U1 |
| R4–R6 (track geometry + bounds) | U2 |
| R7–R10 (lap detection + timing + PB) | U3 (state machine), U4 (PB persistence + display) |
| R11–R13 (end-of-lap UX + retry) | U4 |
| R14 (carousel switching teardown) | U5 |
| AE1, AE4 (lap detection rules) | U3 test scenarios |
| AE2, AE3 (PB delta math) | U4 test scenarios |
| AE5 (retry semantics) | U4 test scenarios |
| AE6 (per-car PB isolation) | U5 test scenarios |

---

## Key Technical Decisions

### KTD-1 — Steer via physics API, not mesh transform

The U6 code rotates `car.rotate(Vector3.Up(), STEER_RATE)` on every steer keypress (`racetrackScene.ts:196-200`). This mutates the mesh's local transform while Havok keeps its own angular velocity on the body, so the two diverge — the body keeps its angular momentum, the mesh visually jumps, and the friction model accumulates spin. Fix: read current yaw from `carBody.body.getAngularVelocity()` (or compute it from facing) and `setAngularVelocity()` the new value on steer input. Forward impulse stays as-is.

### KTD-2 — Bind physics to the real geometry mesh, not the GLB root

`carContainer.meshes[0]` returns the loader's `__root__` TransformNode for most GLBs (Tripo's included). Its bounding box is either zero or wraps the entire imported hierarchy with the wrong orientation. Fix: pick `carContainer.meshes.find(m => m.getTotalVertices() > 0)` — the first actual geometry node — and parent it to a new `TransformNode` we own that gets the PhysicsAggregate. The TransformNode's bounding box wraps just the car geometry, giving a correct box collider.

### KTD-3 — React HUD overlay, not Babylon GUI

`@babylonjs/gui` would add ~120 KB to the bundle for a 3-element HUD (timer, PB, result modal). The existing project pattern (CreatorFlow, ForgePage, etc.) renders all UI as React overlay divs positioned absolutely over the canvas. Same here: HUD is a `<div>` sibling of the canvas in `TrackPage.tsx`. Game state from `racetrackScene` flows out via callbacks (`onLapComplete`, `onTimerTick`) into React state.

### KTD-4 — Havok trigger volume for lap detection, with checkpoint enforcement

Detect lap completion by placing two Havok trigger volumes:
1. **Start/finish trigger** — invisible box collider straddling the start/finish line.
2. **Checkpoint trigger** — invisible box on the far straight (opposite side of the oval).

State machine: a lap counts only if `checkpoint` was hit since the last `start/finish` cross. Prevents reverse-crossing exploits (AE4). Havok v2 trigger volumes use `PhysicsShape.isTrigger = true` and emit collision-start events without solid response. If the 1.3.12 API doesn't expose this cleanly, fallback is per-frame plane intersection against `car.position.z` for the start/finish line.

### KTD-5 — localStorage PB keyed by car objectId

PB persists per car (`R10`, `AE6`). Storage key: `track-pb:${carObjectId}`. Value: stringified float (lap time in seconds). Simple `localStorage.getItem` / `setItem` — no JSON wrapper needed, no migration concerns (greenfield key namespace). Read on car-load, write on lap-complete-better-than-PB.

### KTD-6 — Extract game state machine to its own module

Pure game state (waiting / running / finished, current lap time, best time, checkpoint flag) lives in `frontend/src/track/lapState.ts` as a reducer-style pure module. `racetrackScene.ts` calls `dispatch({type: 'throttle'})`, `dispatch({type: 'checkpoint'})`, `dispatch({type: 'finishCrossed'})` from physics observers. Unit-testable without Babylon/Havok.

### KTD-7 — Procedural oval as extruded ribbon mesh + curve-aligned barrier boxes

Define an oval path as a Bezier curve (`Curve3.CreateCatmullRomSpline` from 8 control points laid out as a rounded rectangle, closed). Sample the curve at ~80 points.

- **Driveable surface (visual + collider)**: `MeshBuilder.ExtrudeShape` along the closed path with a flat road-cross-section profile (width ~14 units). Material is dark asphalt grey with a subtle line down the middle. Use `PhysicsShapeType.MESH` for the road's collider — Havok handles closed-extrusion meshes fine at this poly count.
- **Outer + inner barriers (physics)**: instead of one expensive MESH-collider ring, place ~12 short BOX walls per side (24 total) following the sampled curve. Each box is oriented tangent to the curve at its sample point. Visually they form smooth barrier rails; physically they're cheap box colliders the car bounces off like U6's perimeter walls.
- **Visual barriers (optional polish)**: a second `ExtrudeShape` for each barrier side using a tall thin profile, NO physics — purely cosmetic continuity so the player doesn't see the discrete box segments as visual gaps.
- **Lap length**: track perimeter ~150 units, targeted ~25s lap at U6's impulse tuning. Adjust the control-point layout during implementation to hit the target.

Start/finish line + checkpoint marker stay as flat `MeshBuilder.CreatePlane` decals at specific curve parameters (t=0.0 for finish, t=0.5 for checkpoint), oriented to lie flat on the road surface.

This is more work than the rejected inner-wall-ring alternative (~+1 day on U2) but produces a track that visually reads as a real circuit instead of "drive around a rectangle". User picked this path during plan-time call-outs.

---

## System-Wide Impact

| Surface | Change |
|---|---|
| `frontend/src/track/racetrackScene.ts` | Major refactor — physics fix, ribbon track + barrier rails, lap state hooks, trigger volume wiring |
| `frontend/src/track/racetrackScene.test.ts` | Extended — new test scenarios for physics correctness, track geometry, lap detection |
| `frontend/src/track/oval.ts` (new) | Pure Bezier oval curve construction + sampling + tangent helpers |
| `frontend/src/track/oval.test.ts` (new) | Curve sampling unit tests |
| `frontend/src/track/TrackPage.tsx` | HUD overlay added, callback wiring to scene, PB lifecycle |
| `frontend/src/track/TrackPage.test.tsx` | Extended — HUD smoke, PB display, retry |
| `frontend/src/track/lapState.ts` (new) | Pure game state reducer |
| `frontend/src/track/lapState.test.ts` (new) | Reducer unit tests |
| `frontend/src/track/personalBest.ts` (new) | localStorage wrapper for PB persistence |
| `frontend/src/track/personalBest.test.ts` (new) | localStorage roundtrip tests |
| `frontend/src/track/ResultOverlay.tsx` (new) | Modal UI showing lap result + retry button |
| `frontend/src/track/ResultOverlay.test.tsx` (new) | Modal render + retry callback tests |
| Bundle | +0 KB (no new deps — React overlay, no `@babylonjs/gui`) |

No backend, no Move contract, no Walrus, no Sui changes. No env vars, no public API. Phase 4 / Phase 5 work is unaffected.

---

## Output Structure

```
frontend/src/track/
├── racetrackScene.ts          # MODIFY — physics fix + ribbon track + barriers + triggers
├── racetrackScene.test.ts     # MODIFY — physics + geometry test scenarios
├── TrackPage.tsx              # MODIFY — HUD overlay + callback wiring
├── TrackPage.test.tsx         # MODIFY — HUD/PB/retry smoke
├── oval.ts                    # NEW — Bezier oval curve + sampling helpers
├── oval.test.ts               # NEW — curve sampling unit tests
├── lapState.ts                # NEW — reducer + state machine
├── lapState.test.ts           # NEW — reducer unit tests
├── personalBest.ts            # NEW — localStorage wrapper
├── personalBest.test.ts       # NEW — roundtrip tests
├── ResultOverlay.tsx          # NEW — result modal component
├── ResultOverlay.test.tsx     # NEW — modal render + retry tests
├── carCarousel.tsx            # unchanged
├── useOwnedVariants.ts        # unchanged
└── useOwnedVariants.test.ts   # unchanged
```

---

## Risks & Dependencies

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-r1 | Havok v2 trigger volumes don't expose collision-start observers cleanly in 1.3.12; fallback to per-frame plane intersection adds CPU cost | Medium | Lap detection latency or 1-2 hour rework | Spike during U3 implementation (read `node_modules/@babylonjs/havok/lib/esm/HavokPhysics.d.ts` first). If unclear in 15min, jump to plane-intersection fallback. |
| R-r2 | Steering-via-physics-API (KTD-1) feels worse than mesh-rotate; cars feel sluggish or oversteer | Medium | UX regression vs current (broken) feel | Tune `setAngularVelocity` strength as a tunable constant. Acceptance: car turns visibly within 1 second of A/D held. |
| R-r3 | Tripo GLBs have multi-mesh hierarchy where `find(m => getTotalVertices() > 0)` picks a wheel or other sub-mesh, not the chassis | Low | Car loads with wrong collider shape | Confirm during U1 implementation with `frontend/public/dev-glbs/p1.glb` and `turbo-v1.glb`. If the first vertex-bearing mesh isn't the chassis, fall back to `carContainer.rootNodes[0]` with manual bounding-box compute. |
| R-r4 | Bezier-curve ExtrudeShape + tangent-aligned box walls take longer than +1 day estimate; U2 slips into a 2-day unit | Medium | U2 slip, eats into Phase 4 Kiosk budget | Hard time-box U2 at 2 days. If the ribbon extrusion isn't working by end of day 1, fall back to the rejected inner-wall-ring shape (AA-2 below — code is well-known from U6). Decision point named explicitly so the implementer doesn't grind. |
| R-r4b | `PhysicsShapeType.MESH` on the road collider performs poorly in Havok 1.3.12 or causes spurious collisions with the car's box collider edge | Medium | Car snags on road surface, juddery driving | Spike at U2 start with a minimal MESH-collider ground. If problematic, drop road's physics collider entirely — keep the visual ribbon and put a flat `MeshBuilder.CreateGround` underneath for physics. The car never falls through because the ground is solid; the ribbon is decoration. |
| R-r5 | localStorage in private/incognito mode or quota-exceeded throws | Low | PB doesn't persist; otherwise game works | Wrap reads/writes in try/catch; on failure, treat as "no PB" and don't display it. No user-facing error. |

### Dependencies

| Dep | Status | Notes |
|---|---|---|
| `@babylonjs/havok@1.3.12` | ✅ Already in `frontend/package.json` (D-022) | Trigger volume API needs inspection at U3 start |
| `@babylonjs/core@^9.6.0` | ✅ Already in deps | Provides `PhysicsBody.setAngularVelocity`, `TransformNode`, etc. |
| React 19 | ✅ Already in deps | HUD overlay component |
| `frontend/public/HavokPhysics.wasm` | ✅ Already shipped (U6) | Loaded via `locateFile` hook |
| Existing `useOwnedVariants` | ✅ Working | Provides the variant list + selected variant for `carObjectId` keying |

No external research needed — local patterns sufficient, SDK source available for any API questions.

---

## Implementation Units

5 units, dependency-ordered. U1 + U2 are independent of each other and could parallelize; U3 depends on U2 (needs trigger volume positions); U4 depends on U3 (needs game state); U5 depends on U3 + U4 (needs state + UI to clean up).

### U1. Fix car physics — bind to real mesh + steer via physics API

**Goal:** Eliminate the U6 spinning bug. Steering responds predictably; forward impulse pushes forward; the car drives.

**Requirements:** R1, R2, R3.

**Dependencies:** None.

**Files:**
- `frontend/src/track/racetrackScene.ts` — modify (mesh selection at line ~148, steer block at lines ~195-200)
- `frontend/src/track/racetrackScene.test.ts` — extend (~3 new scenarios)

**Approach:**
- Replace `carContainer.meshes[0]` with `carContainer.meshes.find(m => m.getTotalVertices() > 0)`. Call it `carGeometry`.
- Create a new `TransformNode('car-pivot', scene)`. Parent `carGeometry` to it. Set `carPivot.position = new Vector3(0, 1, 0)`. Attach the `PhysicsAggregate` to `carPivot`, NOT to `carGeometry`. This isolates the physics body's transform from any GLB-internal hierarchy weirdness.
- For steering: remove `car.rotate(...)` calls. Instead, on A/D keypress, read `carBody.body.getAngularVelocity()`, project to Y axis only, add/subtract a steer impulse (`STEER_TORQUE = 4`), and `setAngularVelocity()` it back. This keeps physics state authoritative.
- Forward/reverse impulse unchanged (already uses `carBody.body.applyImpulse(...)`).
- Add an angular damping factor (`body.setLinearDamping(0.2); body.setAngularDamping(0.6)`) so the car doesn't slide forever after letting go. Tune values during implementation.

**Patterns to follow:**
- Existing static aggregates at `racetrackScene.ts:96, :133` show the `PhysicsAggregate(mesh, type, options, scene)` shape.
- Existing keyboard observer at `:176-180` stays as the input source.

**Test scenarios:**
- Forward impulse moves the car along its facing direction (not sideways). Given car spawned at origin facing +Z, after applying forward impulse 10 times via the forward-key handler, `car.position.z > 0`.
- Steer A rotates the body counter-clockwise around Y. Given car at rest, after 60 frames of A held, `body.getAngularVelocity().y > 0` AND the car's facing direction (from `getDirection(Vector3.Forward())`) has changed by >0.5 rad.
- Steer-then-forward goes diagonal, not in a tight spin. Given car at rest, after 30 frames of A+W held simultaneously, `car.position.x < 0` AND `car.position.z > 0` (forward-left motion in world space).
- Car physics aggregate is attached to a TransformNode with a non-degenerate bounding box. The constructed aggregate's underlying mesh has `getBoundingInfo().boundingBox.extendSize.length() > 0.1`.

**Verification:** Loading `/track` with a dev fixture GLB (`p1.glb`), the car drives forward on W, steers smoothly on A/D, doesn't spin in place when no keys are pressed.

---

### U2. Procedural oval track — extruded ribbon + curve-aligned barrier walls + start/finish geometry

**Goal:** Replace the empty 200×200 ground with a visually-real track: an asphalt ribbon following a Bezier oval, smooth-looking barrier rails on both sides, visible start/finish stripe and checkpoint decal.

**Requirements:** R4, R5, R6.

**Dependencies:** None (independent of U1).

**Execution note:** Hard time-box at 2 days. If ExtrudeShape + tangent-aligned barriers aren't working by end of day 1, fall back to the simpler inner-wall-ring shape (see AA-2 in Alternative Approaches) — U6's wall-loop pattern transplants directly. Decision point owned by the implementer at the boundary.

**Files:**
- `frontend/src/track/racetrackScene.ts` — modify (replace static ground + add new track-geometry block)
- `frontend/src/track/oval.ts` — new (curve definition + sampling helper, separated for unit-testing the math)
- `frontend/src/track/oval.test.ts` — new
- `frontend/src/track/racetrackScene.test.ts` — extend (~3 new scenarios)

**Approach:**

`oval.ts` exports pure functions:
- `buildOvalControlPoints(width: number, length: number, cornerRadius: number): Vector3[]` — returns 8 control points laid out as a rounded rectangle in XZ plane (Y=0).
- `sampleOvalCurve(controlPoints: Vector3[], samples: number): Vector3[]` — wraps `Curve3.CreateCatmullRomSpline(..., samples, true /* closed */)` and returns the sampled points.
- `tangentAt(samples: Vector3[], index: number): Vector3` — returns the unit tangent direction at sample `index` for orienting barrier boxes.

In `racetrackScene.ts`:
- Build the curve once: `controlPoints = buildOvalControlPoints(80, 50, 12)`, `samples = sampleOvalCurve(controlPoints, 80)`.
- **Road ribbon** (visual + physics): construct the road cross-section as a 2-point line in local X (width 14), pass to `MeshBuilder.ExtrudeShape({path: samples, shape: [...], cap: Mesh.CAP_ALL, scene})`. Material is dark asphalt with a thin centerline. Wrap in a `PhysicsAggregate(ribbon, PhysicsShapeType.MESH, {mass: 0}, scene)`.
- **Barrier walls** (physics): pick 24 sample indices (every 80/24 ≈ 3rd sample). For each, place a `MeshBuilder.CreateBox('barrier-outer-i', {width: 1, height: 4, depth: 3}, scene)` offset 8 units perpendicular-outward from the sample (along the negative of the curve's local normal). Repeat for inner barriers offset 8 units perpendicular-inward. Each box gets a `mass: 0` PhysicsAggregate. Boxes are rotated to align with the curve tangent at their sample point.
- **Barrier visual continuity (optional polish)**: a second `ExtrudeShape` for the outer barrier using the same path offset (+8) with a tall thin profile — NO physics, just visual smoothness. Only do this if time permits within the 2-day box.
- **Start/finish line**: `MeshBuilder.CreatePlane('start-finish', {width: 14, height: 2}, scene)` placed at `samples[0]` with Y=0.02, rotated to lie flat and aligned to the curve tangent. Material: high-contrast checker. NO physics.
- **Checkpoint marker**: same shape at `samples[40]` (mid-way around). Lower opacity, smaller. NO physics.
- **Spawn position**: `samples[0]` with Y=1, rotated to face the curve tangent at index 0 (i.e., into the first straight). Save spawn pos + rotation as module constants for U4 retry.

**Patterns to follow:**
- Existing `wallSpecs` loop at `racetrackScene.ts:104-134` is the template for the per-segment barrier boxes (loop the same shape, just driven by sampled curve points instead of hardcoded positions).
- Babylon `Curve3.CreateCatmullRomSpline` + `MeshBuilder.ExtrudeShape` are both in `@babylonjs/core@9.6.0`; no new dependency.

**Test scenarios:**
- `oval.ts`: `buildOvalControlPoints(80, 50, 12)` returns 8 points; first and last differ but form a closed loop when treated cyclically.
- `oval.ts`: `sampleOvalCurve(points, 80)` returns 80 `Vector3`s; perimeter distance (sum of segment lengths) is in the range 140-160 (target ~150).
- `oval.ts`: `tangentAt(samples, 0)` is approximately perpendicular to `tangentAt(samples, 20)` (90° turn between adjacent quarter-arcs of an oval).
- Scene wiring (extend existing mocked test): total physics aggregates = 1 (ribbon, MESH) + 24 outer barrier boxes + 24 inner barrier boxes + 1 car (dynamic) = 51. Update existing `physicsAggregateCtor` count assertion.
- Scene wiring: `start-finish` mesh exists by name with no physics aggregate.
- Scene wiring: `checkpoint` mesh exists by name with no physics aggregate.
- Scene wiring: car spawn position is the first sample point, lifted to Y=1.

**Verification:** Loading `/track`, the scene shows a smooth asphalt oval with continuous-looking barrier rails on both sides, a checkered stripe at start/finish, a faint decal at the checkpoint, and the car spawned on the start line facing into the first straight. Driving the car around once feels like driving on an actual track, not bouncing through a square corridor.

---

### U3. Lap state machine + Havok trigger volumes + timing

**Goal:** Detect when the car completes a lap (crossed start/finish forward AFTER hitting the checkpoint). Tick a lap timer while running. Expose state changes as observable callbacks for U4's HUD.

**Requirements:** R7, R8.

**Dependencies:** U2 (needs start/finish + checkpoint geometry positions).

**Execution note:** Implement `lapState.ts` test-first — the reducer is pure and the behavior is well-specified by AE1, AE4. Get the reducer green before wiring the trigger volumes.

**Files:**
- `frontend/src/track/lapState.ts` — new
- `frontend/src/track/lapState.test.ts` — new
- `frontend/src/track/racetrackScene.ts` — modify (add trigger volumes, observer wiring, scene-update tick)

**Approach:**

`lapState.ts` exports a pure reducer + initial state:

```ts
// Directional sketch — not implementation spec.
type Status = 'waiting' | 'running' | 'finished';
interface LapState {
  status: Status;
  startedAtMs: number | null;
  currentLapMs: number;
  finishedLapMs: number | null;
  checkpointHit: boolean;
}
type Action =
  | {type: 'throttle'; nowMs: number}
  | {type: 'tick'; nowMs: number}
  | {type: 'checkpoint'}
  | {type: 'finishCrossed'; nowMs: number}
  | {type: 'reset'};

function lapReducer(state: LapState, action: Action): LapState;
function initialLapState(): LapState;
```

Rules (mirror AE1, AE4, AE5):
- `throttle` while `waiting`: transition to `running`, set `startedAtMs`.
- `tick` while `running`: update `currentLapMs = nowMs - startedAtMs`.
- `checkpoint` while `running`: set `checkpointHit = true`. No-op in other states.
- `finishCrossed` while `running` AND `checkpointHit === true`: transition to `finished`, set `finishedLapMs = nowMs - startedAtMs`.
- `finishCrossed` while `running` AND `checkpointHit === false`: no-op (AE4 — reverse-crossing exploit prevention).
- `reset` from any state: return `initialLapState()`.

In `racetrackScene.ts`:
- Create two trigger volumes after the inner walls: `start-finish-trigger` (box collider straddling the start/finish line, `isTrigger: true` if Havok supports it; otherwise per-frame intersection check in the render loop), `checkpoint-trigger` (same shape, on north straight).
- Hook physics collision-start observers: car-vs-start-finish-trigger → dispatch `finishCrossed`; car-vs-checkpoint-trigger → dispatch `checkpoint`.
- First W keypress dispatches `throttle`.
- Each render frame dispatches `tick` and emits the current state via a `onLapStateChange?: (s: LapState) => void` option in `RacetrackSceneOptions`. TrackPage owns the state, scene is stateless w.r.t. game state.

**Patterns to follow:**
- Reducer style matches existing patterns in the codebase (`useReducer`-ish without React).
- Babylon physics collision API: `scene.onBeforePhysicsObservable.add(...)` for pre-tick hooks; `body.getCollisionObservable()` for collision events. Confirm exact 1.3.12 API at implementation start.

**Test scenarios:**
- **Covers AE1.** Reducer: `throttle` from `waiting` → `running` with `startedAtMs` set. `tick` after `throttle` advances `currentLapMs`.
- **Covers AE4.** Reducer: `finishCrossed` while `running` AND `checkpointHit === false` is a no-op (state unchanged).
- Reducer: `finishCrossed` after `checkpoint` while `running` → `finished` with `finishedLapMs` populated.
- Reducer: `reset` from any state → fresh `waiting` state with `checkpointHit: false`.
- Reducer: `throttle` while already `running` is a no-op (no timer restart).
- Scene wiring (mocked): a `finishCrossed`-triggering collision event observer is registered against the start-finish-trigger body.
- Scene wiring (mocked): a `checkpoint`-triggering collision observer is registered against the checkpoint-trigger body.
- Scene wiring (mocked): the `onLapStateChange` callback fires when state transitions.

**Verification:** Driving the car forward on `/track`, the timer starts on first W, ticks visibly, hits the checkpoint trigger silently, and registers a lap on crossing the start/finish line again. Driving backward across start/finish without passing checkpoint does NOT register a lap.

---

### U4. HUD overlay + PB persistence + result modal + retry

**Goal:** React HUD shows live timer + PB, result modal appears on lap-complete with Retry button (and R keybinding), PB persists per car in localStorage.

**Requirements:** R9, R10, R11, R12, R13.

**Dependencies:** U3 (needs `LapState` + callbacks from scene).

**Files:**
- `frontend/src/track/personalBest.ts` — new
- `frontend/src/track/personalBest.test.ts` — new
- `frontend/src/track/ResultOverlay.tsx` — new
- `frontend/src/track/ResultOverlay.test.tsx` — new
- `frontend/src/track/TrackPage.tsx` — modify (HUD overlay div, lap state hook, PB lifecycle)
- `frontend/src/track/TrackPage.test.tsx` — extend (~3 new scenarios)

**Approach:**

`personalBest.ts` — minimal localStorage wrapper:
- `getPb(carObjectId: string): number | null` — read `track-pb:${carObjectId}`, parse float. Returns null on missing or parse failure.
- `setPb(carObjectId: string, lapMs: number): void` — write the value.
- Both wrap try/catch (private mode / quota); silent failure (R-r5 mitigation).

`ResultOverlay.tsx` — modal component:
- Props: `{ lapMs: number; previousPbMs: number | null; isNewPb: boolean; onRetry: () => void }`.
- Renders centered modal with: lap time formatted `MM:SS.cc` or `SS.cc`, previous PB or "—", PB delta `-Z.ZZs` or `+Z.ZZs` or "NEW PB!" (AE2, AE3 formatting).
- Retry button with `data-testid="track-retry-button"`.
- Backdrop blocks pointer events but doesn't close on click — only Retry resets.

`TrackPage.tsx` changes:
- Hold `LapState` in React state via `useState`. Pass `onLapStateChange` callback to `createRacetrackScene`.
- Render HUD div absolutely positioned over the canvas: `Lap: SS.cc` top-center, `Best: SS.cc` top-right.
- When `LapState.status === 'finished'`, render `<ResultOverlay>`. Compute `previousPbMs` from `getPb(selectedVariant.objectId)` BEFORE updating. If `lapMs < previousPbMs || previousPbMs === null`, call `setPb` and pass `isNewPb={true}`.
- Retry handler: call the scene handle's `reset()` (new exported method from U3's scene wiring — resets car position + dispatches `reset` to state machine).
- Keyboard listener at TrackPage level: 'r' or 'R' → if `status === 'finished'`, trigger retry; if `status === 'running'`, also allow mid-run retry (R13).

**Patterns to follow:**
- React overlay pattern: see `frontend/src/forge/ForgePage.tsx` for absolute-positioned overlays over a child component.
- Modal pattern: matches `ResultOverlay`'s placement — no library, just plain divs with `position: fixed`.
- HUD test setup: stub PreviewCanvas-style mock pattern (already in use for `TrackPage.test.tsx` per earlier read).

**Test scenarios:**
- `personalBest`: `getPb('missing')` returns `null`.
- `personalBest`: `setPb('0xCAR', 24310)` then `getPb('0xCAR')` returns `24310`.
- `personalBest`: `setPb` doesn't throw when localStorage throws (mock localStorage to throw QuotaExceededError).
- `personalBest`: `getPb` returns `null` when the stored value is garbage (e.g. `'not-a-number'`).
- **Covers AE2.** `ResultOverlay` with `previousPbMs=null, isNewPb=true`: result text contains "NEW PB!" and the lap time is formatted in seconds.
- **Covers AE3.** `ResultOverlay` with `previousPbMs=25100, lapMs=23420`: delta text contains "-1.68s" or "-1.68". Reverse case: with `lapMs=26500, previousPbMs=25100`, delta contains "+1.40s".
- `ResultOverlay` Retry button click invokes `onRetry` prop exactly once.
- `TrackPage` HUD shows the current best PB pulled from localStorage on car-load.
- **Covers AE5.** `TrackPage` Retry button click resets the scene (mock scene reset is called) and the ResultOverlay disappears.
- `TrackPage` keyboard 'r' triggers retry equivalently to button click.

**Verification:** Driving a complete lap on `/track`, the HUD shows live timer counting up, the result modal appears on finish showing the time + PB comparison, clicking Retry (or pressing R) resets the car to spawn and starts a fresh lap on first W.

---

### U5. Carousel switching teardown — PB isolation across cars

**Goal:** Switching cars via the carousel cleanly resets game state, loads the new car's PB, and doesn't leak result overlays across cars.

**Requirements:** R14.

**Dependencies:** U3 (game state to reset), U4 (HUD + overlay to clear, PB lookup to re-trigger).

**Files:**
- `frontend/src/track/TrackPage.tsx` — modify (the variant-selection effect)
- `frontend/src/track/TrackPage.test.tsx` — extend (~1 new scenario)

**Approach:**
- The existing carousel `onSelect(variant)` handler in `TrackPage` already triggers scene re-creation (dispose old, create new). Extend it to:
  - Reset React lap state to `initialLapState()`.
  - Re-read PB from localStorage for the new car's `objectId`.
  - Ensure no `ResultOverlay` from prior car remains (cleared by lap-state reset).
- This is mostly already happening as a side effect of scene re-creation, but the lap state reset must be explicit since it lives in React state, not in the scene.

**Patterns to follow:**
- Existing variant-selection effect in `TrackPage.tsx` is the modification site.

**Test scenarios:**
- **Covers AE6.** Given car A had a completed lap (result overlay visible), when the user selects car B from the carousel: the ResultOverlay disappears, the HUD shows car B's PB (or "—"), and the next lap-complete uses car B's `objectId` for the new PB write.

**Verification:** Drive a lap on car A, see result. Switch to car B via carousel — result overlay gone, HUD shows car B's PB (likely "—" if first time). Switch back to car A — HUD shows car A's PB from earlier.

---

## Deferred to Implementation

Execution-time unknowns that plan-004 explicitly does not pre-resolve:

- **Havok v2 trigger-volume API exact shape in 1.3.12.** KTD-4's primary path uses `PhysicsShape.isTrigger = true` + collision-start observer. Fallback: per-frame plane intersection. Pick during U3 implementation by reading `node_modules/@babylonjs/havok/lib/esm/HavokPhysics.d.ts` first. Spike time-box: 15 minutes.
- **Tunable constants for physics feel** — `STEER_TORQUE`, `FORWARD_IMPULSE`, linear/angular damping factors. Pick during U1 implementation by driving the dev-fixture GLBs and adjusting until "feels like a car". Document the chosen values as named constants at the top of `racetrackScene.ts`.
- **Exact start/finish + checkpoint trigger volume sizes.** Approach calls for boxes spanning the track width but the precise depth (how thick the trigger is) is a tuning parameter — too thin and fast cars skip through; too thick and reverse-crossing is harder to detect. Start at depth 2 (units), adjust if either edge case bites during U3 testing.
- **Whether the "wait for first W" detection should also accept arrow keys or just W/S.** R7 says "first W/ArrowUp keypress" — implement both, but if implementation reveals UX issues (accidentally starting the timer by tapping arrow keys), narrow during U3.
- **Exact CSS for the HUD layout.** Position, font, opacity, color all chosen during U4 implementation. Match existing dark-theme palette from BrowsePage / CollectionDetailPage (`#15171b`, `#ddd`, etc.).
- **Whether the spawn-position rotation needs explicit setting.** The car should face north (+Z) on spawn. May need `carPivot.rotation.y = 0` explicitly if GLB import leaves residual rotation. Confirm during U1.
- **Whether `setLinearVelocity(Vector3.Zero())` + `setAngularVelocity(Vector3.Zero())` on retry suffices, or whether the body needs a full disable-enable cycle to truly stop the car.** Test during U4 retry implementation.

---

## Alternative Approaches Considered

### AA-1 — Babylon GUI for HUD instead of React overlay

Rejected (KTD-3). `@babylonjs/gui` is +120 KB for 3 UI elements. React overlay is simpler, matches existing project pattern, and tests against React Testing Library (we already mock Babylon for jsdom).

### AA-2 — Inner-wall-ring track shape (4 box walls forming a smaller rectangle inside the perimeter)

Cheap shape that reuses U6's wall-box pattern directly. Lap length = perimeter of the inner rectangle's outside. Acceptable lap detection (checkpoint enforcement prevents cutting across). **Rejected** during plan-time call-outs in favor of KTD-7's extruded ribbon — user prioritized "looks like a real track" over the ~1-day savings. Kept here as the named fallback if KTD-7 slips past its 2-day box (R-r4) — the implementation pattern is identical to U6's wall-creation loop, so the swap is mechanical.

### AA-3 — Per-frame plane intersection for lap detection instead of Havok triggers

Rejected as primary path (KTD-4). Triggers are the right abstraction — no per-frame allocations, automatic body-pair filtering. But plane intersection is the documented fallback if the 1.3.12 API gives us trouble; the spike at U3 start picks the path.

### AA-4 — Single lap-count state outside React (in scene closure or module global)

Rejected. State machine in React enables Retry to be a pure event, makes the HUD a pure render of state, and unit-tests cleanly without Babylon. Scene-internal mutable state would force scene-recreation on retry (slow + GLB re-load).

### AA-5 — Bundle physics fix as a separate PR before the game-loop PR

Rejected (origin Key Decisions). The bug fix has no visible verification (just "drives smoothly") so it would land in a vacuum; the game loop needs the fix to work. Bundling makes the PR self-verifying.

---

## Success Criteria

Direct mapping from origin Success Criteria:

- A first-time visitor with no instructions can load `/track`, drive the car around the oval, complete a lap, and improve their time on a second attempt — without reading documentation or asking what to do.
- The 30-second `/track` segment of the demo recording shows a complete game arc (drive → lap → result → improved retry) without any spinning, getting stuck, or visible bugs.
- The car-spinning bug from U6 is provably gone — driving forward goes forward, steering rotates predictably, and the body doesn't accumulate runaway angular velocity.
- The plan ships with the existing test suite all green (currently 159 tests) plus the new scenarios from U1–U5 (~15-20 additional tests expected).

---

## Scope Boundaries

(Carried verbatim from origin Scope Boundaries — single list at Standard tier.)

- AI opponents, ghost cars, multi-car physics
- Audio / SFX / music
- Wheel spin animation, brake lights, suspension visuals
- Multi-lap races (1 lap only)
- Particle effects (dust, skid marks, exhaust, sparks on wall contact)
- On-chain time persistence or leaderboards
- Per-car or per-collection track variants / themes
- Mobile touch controls or gamepad support
- Photo mode, replay export, video capture
- Camera switcher (cockpit / top-down / cinematic)
- Server-side time validation / anti-cheat
- Difficulty selection, lap-time targets, tutorial overlay
- Penalties for hitting walls

### Deferred to Follow-Up Work

- **Solutions doc for the Babylon `pluginExtension` + blob-URL gotcha** — captured during this session as an unwritten learning. Worth a `docs/solutions/integration-issues/` entry during Phase 5 polish; not blocking this plan.
- **Extruded ribbon track geometry (AA-2)** — visual upgrade for v1.1, not needed for the demo recording.
- **WebGL context cap mitigation on browse/collection pages** — separate Phase 5 polish, unrelated to /track.

---

## Verification

- All 159 existing frontend tests continue to pass.
- New tests (~15-20) from U1–U5 all pass.
- `pnpm typecheck` clean.
- Manual smoke on `/track`: load with `p1.glb` dev fixture, drive a lap, see result, retry, switch cars via carousel, drive another lap on car B, swap back to car A and confirm car A's PB still shows.
