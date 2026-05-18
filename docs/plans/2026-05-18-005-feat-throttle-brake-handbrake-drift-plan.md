---
date: 2026-05-18
status: active
type: feat
topic: throttle-brake-handbrake-drift
origin: docs/brainstorms/2026-05-18-throttle-brake-handbrake-drift-requirements.md
---

# feat: Throttle / brake / handbrake-drift for /track

## Summary

Add three-pedal driving feel to `/track`: S becomes brake-then-reverse (with a 200ms hold gate at zero speed), Space becomes a Mario Kart-style handbrake (grip drops sharply + steering boost 1.5×), and the car emits visible skid mark ribbons whenever lateral velocity exceeds a threshold. Pure addition layered on top of the arcade-control model in `racetrackScene.ts` (commit `ab66427`) — no changes to lap state, chase camera, or any plan-004 surface. 3 implementation units, all in `frontend/src/track/`.

---

## Problem Frame

The `/track` arcade-control model treats S as a direct reverse impulse and has no dedicated brake or drift surface. Two pains follow.

First, the input vocabulary is impoverished — a player coming from any racing game expects S to slow them down before reversing, not lurch straight into reverse. There is no way to cancel forward momentum without releasing throttle and waiting for damping. Hot corners overshoot.

Second, tight corners look the same as straights from a viewer's perspective. The car simply tracks the road. There's no moment of skill the camera can capture, no shape distinct from "drive forward + steer." A racing demo without drift reads as a tech demo, not a game.

Both pains compound for the demo recording — the 30-second `/track` segment of the demo arc needs to read as *gameplay*, and the buyer-side payoff of plan-004 ("an owned NFT is consumable as game content") leans on that legibility.

---

## Requirements Trace

All R-IDs reference `docs/brainstorms/2026-05-18-throttle-brake-handbrake-drift-requirements.md`. AE1–AE6 are the origin's Acceptance Examples.

| Origin | Implementation site |
|---|---|
| R1 (W throttle unchanged) | Existing arcade-control model; no change |
| R2, R3, R4 (S brake-then-reverse + 200ms hold gate) | U1 |
| R5, R6, R7 (Space handbrake: grip drop + 1.5× steering, gated by forward speed, throttle/steer still active) | U2 |
| R8, R9, R10, R11 (skid mark ribbon, lateral-speed threshold, segment cap, Retry clears) | U3 |
| R12 (no changes to lap state / camera / HUD / PB) | Honored by scoping all changes to the input observer + a new visual module |
| R13 (carousel-switch survives) | Honored automatically — scene rebuild on car switch creates a fresh skidMarks instance |
| AE1, AE2 | U1 test scenarios |
| AE3, AE4 | U2 test scenarios |
| AE5, AE6 | U3 test scenarios |

---

## Key Technical Decisions

### KTD-1 — S brake state machine: forward-speed gate, not key-hold timer alone

Brake-to-reverse can't be a pure 200ms hold timer because that would also trigger on hot-corner brake taps (you hold S for 200ms while still moving forward at 14 u/s, you don't want to reverse). The 200ms timer arms ONLY after forward speed drops to a near-zero threshold (`BRAKE_REVERSE_SPEED_THRESHOLD`, ~0.5 u/s). While moving forward above the threshold, S applies brake force opposing the forward velocity; the timer stays null. When the car decelerates past the threshold AND S is still held, `brakeHoldStartMs` arms; 200ms later, reverseMode flips. Pressing W at any point cancels reverseMode immediately.

This matches the origin AE2 requirement and is the standard racing-game pattern.

### KTD-2 — Handbrake gates on forward speed, not all motion

R6 says handbrake only engages when `|forwardSpeed| > HANDBRAKE_MIN_SPEED`. The plain-language reason: if Space worked at zero speed, holding Space + A would let you spin in place — fun trick but it conflicts with the natural "parking-spot rotation" the arcade model already provides at low speed (the `STEER_MIN_FACTOR = 0.3` floor). Gating handbrake by speed keeps the two behaviors distinct. The brainstorm's Scope Boundaries deliberately puts burnout / spin-in-place out of scope.

### KTD-3 — Skid marks via per-segment `MeshBuilder.ExtrudeShape` with dispose-and-recreate on growth

The road ribbon in `racetrackScene.ts` already uses `MeshBuilder.ExtrudeShape` — same primitive applies here. Doc-review feasibility pass surfaced a load-bearing fact: in `@babylonjs/core@9.7.0`, `MeshBuilder.ExtrudeShape({updatable: true, instance: previousMesh})` only supports same-length path updates — passing a longer `path` array silently writes only the first N vertices that fit in the original buffer (`shapeBuilder.d.ts:15` documents this; `ribbonBuilder.js:277-314` is the runtime confirmation: instance update loops over `min(oldLength, newLength)`). Trying to grow a ribbon's path that way would leave the trail stuck at its initial length.

The skid-mark module therefore uses **dispose-and-recreate per growth tick** as the primary path, not as a fallback:
- Start a new "active" ribbon when lateral speed crosses the threshold upward, with a 2-point path (minimum `ExtrudeShape` accepts).
- On each subsequent tick the gate allows (lateral speed above threshold AND car moved ≥ `MIN_VERTEX_DISTANCE` since last emit), push a new point to the in-memory path, then dispose the previous mesh and create a fresh `ExtrudeShape` mesh from the grown path.
- Finalize (stop touching) the ribbon when lateral speed drops below threshold; the final mesh persists in the segments array.
- FIFO cap at `MAX_SEGMENTS` (12); when finalizing a new segment would push the array past the cap, dispose the oldest (the array momentarily holds N+1 between push and shift). See U3 tick logic for the canonical sequence.

**Performance budget:** at `MIN_VERTEX_DISTANCE = 0.5` and `MAX_FORWARD_SPEED = 18`, the gate fires at most ~30 Hz per active segment (car moves 0.3 u/frame at max speed; threshold gate at 0.5 u → ~every 2 frames). Only ONE segment is "active" (recreated) at any moment; the other 11 cap'd segments are static. Net per-frame cost: at most one mesh dispose + one `ExtrudeShape` create on emitting frames, zero otherwise. Babylon handles this trivially.

Alternatives considered:
- **`Mesh.updateMeshPositions` on a Lines / LineSystem mesh**: supports dynamic vertex count, would avoid the dispose churn. Rejected because line meshes have no thickness control in `@babylonjs/core@9.7.0`'s base API — skid marks would render as 1px GL lines, invisible at chase-cam distance. The ribbon's extruded cross-section gives us the 1.2 u road-readable width.
- **Per-frame plane spawns**: trivially simple but produces visible gaps at high speed. Rejected on visual quality.
- **Babylon's `TrailMesh`**: built-in but always-on emission; toggling requires the same dispose/recreate work but with less control over trail shape and width.
- **`GreasedLineMesh`**: newer and purpose-built with native width support, but availability and ergonomics in `@babylonjs/core@9.7.0` not confirmed. Could be revisited in v1.1 if dispose-and-recreate proves too churny in practice.

### KTD-4 — Skid marks live in their own module, not inline in `racetrackScene.ts`

`racetrackScene.ts` is ~600 LOC today (up from 460 at brainstorm time). U1 and U2 add another ~70 LOC between them. Adding ~80 LOC of skid-mark logic inline would push the file past 750. Splitting into `skidMarks.ts` keeps the scene readable, gives skid marks their own test surface, and isolates the rendering primitive choice (so future "switch to GreasedLine" is one file's change).

Module shape:
```
createSkidMarks(scene: Scene, lateralSpeedThreshold: number): {
  tick(carPosition: Vector3, carForward: Vector3, lateralSpeed: number): void;
  reset(): void;   // dispose all segments
  dispose(): void; // teardown for scene dispose
}
```

This is directional guidance, not implementation specification — exact method signatures may vary based on what's most ergonomic at implementation time.

### KTD-5 — Single trail from car-rear midpoint, not per-wheel; rear offset derived from car bounding box

Per-wheel skid marks (two parallel trails from rear-left and rear-right wheels) are more authentic but double the cost and add per-wheel offset math that's sensitive to the GLB's local axes (which already required tuning — see `CAR_GEOMETRY_YAW_OFFSET`). Single trail from a point at the rear of the car with the ribbon width set to ~1.2 units reads as "rear axle skid" without per-wheel complexity.

**Axis source:** the trail-origin direction MUST use `carPivot.getDirection(Vector3.Forward())` — the same call the input observer uses for throttle direction. This already incorporates `CAR_GEOMETRY_YAW_OFFSET`. Using world `-Z` would silently miss the yaw offset and place the trail in the wrong world direction (the same class of bug that produced the original "car faces wrong" report).

**Rear-offset magnitude:** initially derive from `carContainer.meshes` bounding box at scene init — get the vertex-bearing mesh's `getBoundingInfo().boundingBox.extendSize.z` (longest local axis after the yaw offset bakes in), use ~0.5× extend as the rear offset. Falls back to a constant if bounding-box inspection fails. Tune in-browser if the resulting trail position visibly clips the chassis or trails too far behind.

### KTD-6 — Skid emission is lateral-speed-gated, not handbrake-gated

R11 explicitly says skid marks emit during natural drifts too, not only handbrake-triggered ones. This means the emission gate is `|lateralSpeed| > SKID_LATERAL_SPEED_THRESHOLD`, with no awareness of whether handbrake is active. Handbrake increases lateral speed (because grip drops), so it naturally produces visible trails — but a hot-corner non-handbrake drift also produces trails. The behavior is unified across both paths and the test surface is simpler.

---

## System-Wide Impact

| Surface | Change |
|---|---|
| `frontend/src/track/racetrackScene.ts` | Modify — U1 (brake state machine), U2 (handbrake mode in input observer), U3 (instantiate + tick + reset + dispose skidMarks) |
| `frontend/src/track/racetrackScene.test.ts` | Extend — new scenarios for U1 / U2 / U3 wiring |
| `frontend/src/track/skidMarks.ts` | New — ribbon-based skid mark module |
| `frontend/src/track/skidMarks.test.ts` | New — pure unit tests for tick / threshold / cap / reset |
| Bundle | +0 KB (no new deps) |

No backend, no Move contract, no Walrus, no Sui changes. No env vars, no public API surface change. Lap state machine, chase camera, HUD, ResultOverlay, personalBest, carousel — all untouched.

---

## Implementation Units

3 units, dependency-ordered. U1 and U2 both modify the input observer in `racetrackScene.ts` but are independent in scope (brake state machine vs handbrake mode). U3 is a new module + wiring.

### U1. Brake state machine — S = brake-then-reverse with 200ms hold gate

**Goal:** S applies brake force opposing forward velocity. After the car decelerates to near-zero AND S is still held continuously for 200ms, switch to reverse mode and apply reverse impulse. Pressing W cancels reverse mode immediately. Releasing S cancels brake timer and reverse mode.

**Requirements:** R2, R3, R4. Covers AE1, AE2.

**Dependencies:** None (extends the existing arcade-control model that already decomposes forward / lateral velocity).

**Files:**
- `frontend/src/track/racetrackScene.ts` — modify (input observer; add constants + 2 scene-local state vars + brake/reverse-mode logic)
- `frontend/src/track/racetrackScene.test.ts` — extend (~3-4 new scenarios)

**Approach:**
- Add constants near the existing arcade tunables:
  - `BRAKE_FORCE` — magnitude of the per-frame impulse applied opposing the forward-velocity component. Tune so a car at `MAX_FORWARD_SPEED` decelerates to zero in ~2 seconds of held S.
  - `BRAKE_TO_REVERSE_HOLD_MS = 200` — how long S must be held continuously below the speed threshold before reverse engages.
  - `BRAKE_REVERSE_SPEED_THRESHOLD = 0.5` — forward-speed magnitude at which the brake transitions to reverse-prep mode.
- Add two scene-local state vars (in the closure, like `insideStartTrigger`):
  - `brakeHoldStartMs: number | null` — timestamp when S started being held below the speed threshold; reset to null whenever the gate condition breaks.
  - `reverseMode: boolean` — true once the 200ms timer elapses; resets on S release or W press.
- In the input observer, restructure the S handler with explicit if/else-if branches so the timer-arming and elapsed-time-check arms are mutually exclusive within the same tick:
  ```
  // Directional sketch — not implementation specification.
  if (keys.has('s') || keys.has('arrowdown')) {
    if (forwardSpeed > BRAKE_REVERSE_SPEED_THRESHOLD) {
      // Branch A: still moving forward — apply brake force opposing velocity.
      // Velocity-proportional, mirroring the lateral-grip pattern at racetrackScene.ts:~490:
      //   brakeImpulse = -forward * forwardSpeed * BRAKE_FORCE * CAR_MASS
      // BRAKE_FORCE is a dimensionless multiplier; start at ~0.04 and tune.
      // Velocity-proportional impulse asymptotically decelerates, no overshoot possible.
      carBody.body.applyImpulse(brakeImpulse, carPivot.absolutePosition);
      brakeHoldStartMs = null;
      reverseMode = false;
    } else if (brakeHoldStartMs === null) {
      // Branch B: near-zero speed AND timer not yet armed — arm it.
      brakeHoldStartMs = performance.now();
    } else if (!reverseMode && performance.now() - brakeHoldStartMs > BRAKE_TO_REVERSE_HOLD_MS) {
      // Branch C: near-zero speed AND timer armed AND elapsed — switch to reverse.
      reverseMode = true;
    }
    if (reverseMode) {
      // Apply reverse impulse using the existing tapered logic against MAX_REVERSE_SPEED.
      // Same shape as the existing reverse handler — copy from there.
    }
  } else {
    // S released — clear both bits of state.
    brakeHoldStartMs = null;
    reverseMode = false;
  }
  ```
- In the W handler, also reset: `brakeHoldStartMs = null; reverseMode = false;`. This ensures pressing W exits reverse-prep AND reverse mode instantly per R4 spirit.

**Patterns to follow:**
- The existing throttle / reverse handlers at `racetrackScene.ts:~350-380` for the impulse-application + taper pattern.
- The existing `insideStartTrigger` scene-local closure variable for the state-var pattern.

**Execution note:** Tune `BRAKE_FORCE` in-browser during implementation — the constant is a starting guess; actual feel needs a few iterations. Per the brainstorm's Outstanding Questions.

**Test scenarios:**
- **Covers AE1.** Mock body returns `getLinearVelocity = Vec3(0, 0, 12)` (forward speed 12). Simulate W release then S hold; tick the input observer 5 times. Assert `applyImpulse` called 5 times with vectors opposing forward (z component < 0). Assert no reverse impulse interleaved.
- **Covers AE2.** Mock body returns `getLinearVelocity = Vec3(0, 0, 15)`. Simulate S keydown; tick once; simulate S keyup (within 100ms). Re-tick: assert reverseMode false; no reverse impulse fires on subsequent tick.
- Brake-to-reverse transition: mock `getLinearVelocity = Vec3(0, 0, 0)` (stopped). Simulate S keydown; tick repeatedly across a 250ms timespan (mock `performance.now()` or use real time). Assert that AFTER 200ms has elapsed, the next tick fires a reverse-direction impulse (z > 0 forward = -z reverse if facing +Z).
- Reverse mode exit on S release: after entering reverse mode (per above), simulate S keyup. Assert `reverseMode === false` (verify via a follow-up tick that does NOT apply reverse impulse).
- W cancels reverse mode: after entering reverse mode, simulate W keydown. Tick. Assert no reverse impulse fires this tick (only forward impulse).

**Verification:** Loading `/track` with the dev fixture: holding S at speed visibly decelerates the car smoothly (not the jerky reverse-while-moving-forward of the old model). The car comes to a stop. Continuing to hold S for ~200ms more starts reversing. Tapping S to scrub speed mid-corner does NOT reverse.

---

### U2. Handbrake mode — Space drops lateral grip + boosts steering 1.5×

**Goal:** Holding Space while moving forward drops lateral grip sharply (target: ~85% reduction) and multiplies the steering angular-velocity coefficient by 1.5×. Throttle and steering keys remain functional throughout. Release of Space returns grip and steering to baseline immediately. Gated off when |forward speed| is below a small threshold (no spin-in-place).

**Requirements:** R5, R6, R7. Covers AE3, AE4.

**Dependencies:** None (also extends the input observer; independent of U1's state machine).

**Files:**
- `frontend/src/track/racetrackScene.ts` — modify (input observer; add constants + handbrakeActive derivation + grip/steering multiplier integration)
- `frontend/src/track/racetrackScene.test.ts` — extend (~3-4 new scenarios)

**Approach:**
- Add constants near U1's:
  - `HANDBRAKE_GRIP_MULTIPLIER = 0.13` — applied to `LATERAL_GRIP_PER_FRAME` while handbrake active (0.15 × 0.13 ≈ 0.02, matching the brainstorm's target).
  - `HANDBRAKE_STEER_MULTIPLIER = 1.5` — applied to the final steering angular-velocity magnitude. Tuning bracket: combined with the current 1.4 rad/s `STEER_ANGULAR_VELOCITY`, full-speed handbrake steering hits 2.1 rad/s — aggressive for a 3D arcade car and may pirouette on first test. If it overshoots, drop to 1.3× (1.82 rad/s); if it feels too tame, raise to 1.7× (2.38 rad/s). Acceptable range bounded ~1.3-1.7×.
  - `HANDBRAKE_MIN_SPEED = 1.5` — forward-speed magnitude below which handbrake mode does NOT engage.
- **Required code change in the keyboard observer** (`racetrackScene.ts:~424` — the `onKeyboardObservable.add` handler that maintains the `keys` Set). `KeyboardEvent.key` for the space bar is the literal `' '` (single-space character), NOT the string `'space'`. After computing `k = kbInfo.event.key.toLowerCase()`, normalize before adding: `if (k === ' ') k = 'space';`. Without this shim, `keys.has('space')` in the per-frame observer never matches and the handbrake feature silently fails. This is a verified API fact (per `KeyboardEvent.key` spec), not a spike — implement it as part of U2.
- In the per-frame input observer, derive `handbrakeActive` ONCE near the top after velocity decomposition:
  - `const handbrakeActive = keys.has('space') && Math.abs(forwardSpeed) > HANDBRAKE_MIN_SPEED;`
- Modify the steering branch: when applying `setAngularVelocity`, multiply the final y component by `(handbrakeActive ? HANDBRAKE_STEER_MULTIPLIER : 1)`.
- Modify the lateral grip branch: when applying the lateral-grip impulse, multiply `LATERAL_GRIP_PER_FRAME` by `(handbrakeActive ? HANDBRAKE_GRIP_MULTIPLIER : 1)` in the impulse computation.
- Throttle and brake handlers are untouched (R7).
- **Test scenarios must exercise the normalization path.** Mock keyboard events with `{ event: { key: ' ' } }` (literal space), not `{ event: { key: 'space' } }`. Tests that pass `'space'` directly bypass the shim and won't catch a regression in the normalization logic.

**Patterns to follow:**
- The existing arcade control logic for the velocity-decomposition / right-axis math.
- `STEER_MIN_FACTOR` constant pattern for tunable feel knobs.

**Test scenarios:**
- **Space-key normalization (regression guard).** Mock the keyboard observer with `{ event: { key: ' ' } }` (literal space character) on keydown. Assert the `keys` Set contains `'space'` after the observer runs (not `' '`). Then tick the per-frame observer with `getLinearVelocity = Vec3(0, 0, 12)` and `handbrakeActive` derivation should produce `true`. This test fails if the `if (k === ' ') k = 'space'` shim is ever removed — without it, U2 silently breaks at runtime even though every other test passes.
- **Covers AE3.** Mock body `getLinearVelocity = Vec3(0, 0, 12)`. Simulate D + Space keydown (using the normalized key shim — pass `{ event: { key: ' ' } }` to exercise the path); tick. Assert `setAngularVelocity` called with y magnitude equal to `STEER_ANGULAR_VELOCITY * speedFactor * HANDBRAKE_STEER_MULTIPLIER` (the 1.5× boost). Verify against the same scenario without Space — assert y magnitude is exactly `1 / HANDBRAKE_STEER_MULTIPLIER` of the with-Space value.
- **Covers AE3.** Mock body `getLinearVelocity = Vec3(0, 0, 12)` AND `lateralSpeed > 0` (set via mock or via the per-frame computation by faking forward direction off-axis). Simulate Space held + tick. Assert the lateral-grip impulse magnitude is multiplied by `HANDBRAKE_GRIP_MULTIPLIER` (smaller correction → more slide).
- **Covers AE4.** Mock body `getLinearVelocity = Vec3(0, 0, 0)` (stopped). Simulate Space + A keydown; tick. Assert `setAngularVelocity` called with the NORMAL (unboosted) y magnitude — handbrake gated off because speed is below threshold.
- R7 throttle-during-handbrake: Mock body forward at 12. Simulate Space + W keydown; tick. Assert both `applyImpulse` (forward throttle) AND `setAngularVelocity` modifications fire in the same tick — neither is disabled by handbrake state.

**Verification:** Loading `/track`: drive into a corner at 12+ u/s, hold D + Space. The car visibly slides outward through the turn (more than D alone) and the heading rotates faster. Release Space mid-turn: the slide resolves and the car settles into a normal grip-state turn within ~1 second.

---

### U3. Skid marks — per-segment ribbon with dispose-and-recreate growth, driven by lateral-speed threshold

**Goal:** Emit a dark ribbon trail behind the car whenever lateral speed exceeds a threshold. Multiple trail segments stack up over a lap; oldest are disposed when the cap is reached. Retry clears all current trails alongside the existing teleport behavior.

**Requirements:** R8, R9, R10, R11. (R13 carousel teardown is automatic — each scene rebuild creates a fresh skidMarks instance.) Covers AE5, AE6.

**Dependencies:** None — the velocity decomposition shipped at commit `ab66427` is the only prerequisite, and that's already in main. Ordered after U1/U2 only for test cumulativity. May proceed in parallel with U1/U2 under schedule pressure.

**Files:**
- `frontend/src/track/skidMarks.ts` — new (~100-120 LOC; pure module with Babylon imports for `Mesh`, `MeshBuilder`, `StandardMaterial`, `Vector3`)
- `frontend/src/track/skidMarks.test.ts` — new (~8-10 test scenarios)
- `frontend/src/track/racetrackScene.ts` — modify (declare `SKID_LATERAL_SPEED_THRESHOLD` constant; instantiate skidMarks at scene init passing the threshold; recompute lateralSpeed inside the lap-state observer; tick skidMarks; wire `skidMarks.reset()` into scene's `reset()` and `skidMarks.dispose()` into scene's `dispose()`)
- `frontend/src/track/racetrackScene.test.ts` — extend (~2-3 wiring scenarios)

**Approach:**

`skidMarks.ts` exports `createSkidMarks(scene, threshold)`:

```ts
// Directional sketch — not implementation specification.
export interface SkidMarks {
  tick(carPosition: Vector3, carForward: Vector3, lateralSpeed: number): void;
  reset(): void;
  dispose(): void;
}

export function createSkidMarks(scene: Scene, lateralSpeedThreshold: number): SkidMarks {
  const segments: Mesh[] = [];   // finalized segments (FIFO cap)
  let currentPath: Vector3[] | null = null;
  let currentMesh: Mesh | null = null;
  let lastEmitPos: Vector3 | null = null;
  // Rear-trail origin distance. Initialized lazily on first tick from the
  // car's bounding box (passing through carForward gives us access to it
  // via scene.meshes lookup) OR set once the car is available — in practice
  // the orchestrator should pass the computed value at construction time
  // rather than deferring to first tick. Falls back to REAR_OFFSET_FALLBACK
  // if the bounding box returns degenerate extents (R-r6 mitigation).
  let rearOffset: number = REAR_OFFSET_FALLBACK;
  const skidMat = /* StandardMaterial with the constants below */;
  // ... constants + closures
}
```

**Constant routing decision (SG-3):** `SKID_LATERAL_SPEED_THRESHOLD` is a **feel knob** per the origin's Success Criteria ("tuning knobs live at the top of the scene module"). It must be declared in `racetrackScene.ts` next to `LATERAL_GRIP_PER_FRAME` and passed into `createSkidMarks(scene, threshold)`. The other constants below are ribbon geometry / module implementation details and live module-local in `skidMarks.ts`.

In `racetrackScene.ts` constants block (next to `LATERAL_GRIP_PER_FRAME`):
- `SKID_LATERAL_SPEED_THRESHOLD = 3` — |lateralSpeed| above which emission starts/continues. Initial guess; tune in-browser.

Module-local constants in `skidMarks.ts`:
- `MAX_SEGMENTS = 12` — FIFO cap; when adding a new segment would exceed, dispose oldest.
- `SEGMENT_WIDTH = 1.2` — ribbon cross-section width (rear-axle approximation).
- `MIN_VERTEX_DISTANCE = 0.5` — minimum distance the car must move before another vertex is pushed to the active path; prevents bloat when stationary at threshold and bounds dispose/recreate frequency to ~30 Hz at max speed.
- `SKID_Y_OFFSET = 0.05` — tiny lift above road surface to avoid z-fighting with the asphalt ribbon.
- `REAR_OFFSET_FALLBACK = 1.5` — distance behind the car center where the trail originates. Used as the fallback if bounding-box inspection fails at init; otherwise the value is computed from `carContainer`'s vertex-bearing mesh `getBoundingInfo().boundingBox.extendSize` (~0.5× the longest local axis after the yaw offset bakes in). Either way, the trail-origin direction MUST come from `carPivot.getDirection(Vector3.Forward())` (caller passes this as `carForward`), NOT from world `-Z` (otherwise the trail ignores `CAR_GEOMETRY_YAW_OFFSET` and renders in the wrong world direction).
- Skid mark material: `StandardMaterial` with `diffuseColor = Color3(0.05, 0.05, 0.05)` (near-black, contrasts against the road's `Color3(0.18, 0.18, 0.2)` asphalt), `alpha = 0.8`, `specularColor = Color3.Black()` to avoid shiny reflections. Single material shared across all segments to save GPU state changes.

`tick(carPosition, carForward, lateralSpeed)` logic — dispose-and-recreate growth (KTD-3):
- Compute `emitting = Math.abs(lateralSpeed) > lateralSpeedThreshold` (uses the threshold passed at module init).
- Compute current rear position: `rearPos = carPosition - carForward * rearOffset` (the closure variable initialized from the bounding-box-derived value, falling back to REAR_OFFSET_FALLBACK) with `y += SKID_Y_OFFSET`.
- If `emitting && currentPath === null`: start a new segment. Initialize `currentPath = [rearPos]`; `lastEmitPos = rearPos.clone()`. (Mesh creation is deferred until the path has at least 2 points, since `MeshBuilder.ExtrudeShape` requires that minimum.)
- If `emitting && currentPath !== null`: if distance from `lastEmitPos` ≥ `MIN_VERTEX_DISTANCE`, append `rearPos.clone()` to `currentPath`, update `lastEmitPos`. Then, if the new path length ≥ 2: dispose the previous `currentMesh` (if present), and create a fresh `MeshBuilder.ExtrudeShape({ shape, path: currentPath, sideOrientation: DOUBLESIDE })` with `shape = [Vector3(-SEGMENT_WIDTH/2, 0, 0), Vector3(SEGMENT_WIDTH/2, 0, 0)]`. Assign the shared skid material. Save as new `currentMesh`.
- If `!emitting && currentPath !== null`: finalize. Push `currentMesh` to `segments` array (if non-null); clear `currentPath`, `currentMesh`, `lastEmitPos`. If `segments.length > MAX_SEGMENTS`, shift the oldest off and dispose it.

`reset()`: if `currentMesh` is set, dispose it. Dispose all entries in `segments`. Clear `currentPath`, `currentMesh`, `lastEmitPos`, and the segments array.

`dispose()`: same as `reset()`, then dispose `skidMat` (shared material).

In `racetrackScene.ts`:
- After ribbon material creation, `const skidMarks = createSkidMarks(scene, SKID_LATERAL_SPEED_THRESHOLD);`
- In the lap-state observer (the third `onBeforeRender` registered, the one that handles trigger checks), recompute `lateralSpeed` locally (per F-FEAS-003 decision — recompute over shared closure variable for divergence safety; the 5-line decomposition is cheap and avoids introducing a cross-observer mutable):
  ```
  const velocity = carBody.body.getLinearVelocity();
  const forwardLocal = carPivot.getDirection(Vector3.Forward());
  const lateralX = forwardLocal.z;
  const lateralZ = -forwardLocal.x;
  const lateralSpeedLocal = velocity.x * lateralX + velocity.z * lateralZ;
  skidMarks.tick(carPivot.position, forwardLocal, lateralSpeedLocal);
  ```
- In scene's `reset()`, call `skidMarks.reset()` before re-arming triggers.
- In scene's `dispose()`, call `skidMarks.dispose()` before `scene.dispose()`.

**Patterns to follow:**
- `frontend/src/track/oval.ts` for module shape (pure factory function returning closures).
- `frontend/src/track/lapState.ts` for module-local constants pattern.
- `racetrackScene.ts:~163-173` for `MeshBuilder.ExtrudeShape` usage on a ribbon mesh.

**Execution note:** Tune `SKID_LATERAL_SPEED_THRESHOLD` in-browser. The 3 u/s starting guess is calibrated against the arcade model's typical cornering speeds but may need a half-step in either direction.

**Test scenarios:**
- `tick` with `|lateralSpeed| < threshold`: no segments created, no current path, mesh count in scene unchanged.
- `tick` with `|lateralSpeed| > threshold` first time: a `currentPath` initializes; ribbon mesh creation deferred until 2nd above-threshold tick produces enough path points to extrude.
- Consecutive `tick`s with high lateral speed AND car moved > `MIN_VERTEX_DISTANCE`: ribbon mesh exists, path length grows; verify via mock `MeshBuilder.ExtrudeShape` call count or via reading the constructed mesh's `getTotalVertices()`.
- Consecutive `tick`s with high lateral speed AND car barely moved (< `MIN_VERTEX_DISTANCE` apart): path length unchanged across calls (the gate prevents duplicate-point bloat).
- Threshold crossing high → low → high: 2 separate `segments` entries (first ribbon finalized, second started).
- Emit cycles exceeding `MAX_SEGMENTS`: oldest mesh disposed (verify via mock dispose call); `segments.length` stays at cap.
- `reset()`: all `segments` disposed, `currentPath === null`, `currentMesh === null`. (**Covers AE6.**)
- `dispose()`: same as reset behavior plus no further ticks should fire (caller's responsibility but verify the module itself is safe to call dispose on twice).
- **Covers AE5.** Natural-drift emission test (no handbrake context): with lateral speed > threshold from cornering alone (no Space input simulated), ribbon emission identical to handbrake-induced emission. The test is essentially "skidMarks.tick doesn't care about handbrake state" — pass a high lateral speed without any handbrake involvement and verify a ribbon is created.

Wiring tests in `racetrackScene.test.ts`:
- `createSkidMarks` called once at scene init (mock the module; assert constructor invocation).
- `skidMarks.tick` called from the per-frame lap-state observer with the expected arguments (car position + forward + lateral speed).
- `scene.reset()` invokes `skidMarks.reset()` (mock spy on the returned object's reset method).
- `scene.dispose()` invokes `skidMarks.dispose()`.

**Verification:** Loading `/track`: drive a corner aggressively without handbrake — visible dark ribbons appear behind the car as it slides. Hold Space mid-corner: ribbons appear earlier and longer (because handbrake increases lateral velocity). Press R: all ribbons disappear immediately, car teleports back to spawn. Drive another corner: fresh ribbons. After ~12+ separate slides in one lap attempt: oldest ribbons disappear automatically (FIFO cap).

---

## Risks & Dependencies

### Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-r1 | ~~Babylon space-key character~~ — **RESOLVED** during doc-review: `KeyboardEvent.key` is `' '` for the space bar. U2 Approach now mandates the `if (k === ' ') k = 'space'` normalization as a required code change, not a runtime spike. |  |  |  |
| R-r2 | ~~`MeshBuilder.ExtrudeShape({updatable, instance})` path-length growth~~ — **RESOLVED** during doc-review: confirmed broken in `@babylonjs/core@9.7.0` (`shapeBuilder.d.ts:15` + `ribbonBuilder.js:277-314` reviewed). KTD-3 + U3 now use dispose-and-recreate as the primary path. No longer a risk. |  |  |  |
| R-r3 | Skid ribbons might z-fight with the road ribbon despite SKID_Y_OFFSET = 0.05 | Low | Visible flickering on the trail surface | Increase offset to 0.1 if 0.05 isn't enough; if still problematic, give the skid material `disableDepthWrite` or render-group priority. |
| R-r4 | Brake force tuning produces a "sticky" or "abrupt" feel; lateral-speed-threshold tuning needs in-browser iteration | High (but not blocking) | Two in-browser iteration cycles likely needed | **Time-box: 2 iterations.** If a value doesn't settle within 2 in-browser tuning rounds, ship the ratio-derived starting value (BRAKE_FORCE = 0.04 derived from FORWARD_IMPULSE / MAX_FORWARD_SPEED ratio; threshold = 3 u/s) and log a follow-up in `docs/open-questions.md` rather than burning more time. |
| R-r5 | `MAX_SEGMENTS = 12` cap may be too low (visible ribbons disappear during a single lap that has > 12 drift moments) or too high (perf bites on long sessions) | Low | Visual quality regression OR perf hit | Tunable constant; start at 12, raise if drift-heavy laps feel like they lose marks, lower if perf shows up in profiler. |
| R-r6 | Car bounding-box inspection at scene init returns degenerate extents for some Tripo outputs (rare — the U6 / Plan-004 fix that picks the vertex-bearing mesh should make this safe but isn't guaranteed across all future Tripo models) | Low | Trail origin falls back to REAR_OFFSET_FALLBACK = 1.5; may be slightly off for car length | Defensive check: if `boundingBox.extendSize.length() < 0.5`, log a warning and use the fallback constant. |

### Dependencies

| Dep | Status | Notes |
|---|---|---|
| `@babylonjs/core@^9.6.0` MeshBuilder + Mesh APIs | ✅ Already in deps | Provides ExtrudeShape, dispose, getTotalVertices. |
| Existing arcade-control model in `racetrackScene.ts` | ✅ Shipped commit `ab66427` | Provides velocity decomposition, lateral-grip baseline. All three units build on this — do not regress. |
| Existing `setLinearVelocity` / `getLinearVelocity` / `applyImpulse` on `carBody.body` | ✅ Already mocked in `racetrackScene.test.ts` | Used by U1's brake impulse + U2's handbrake-modified impulses. |
| `@babylonjs/havok@1.3.12` physics | ✅ Already in deps (D-022) | Reverse mode uses existing reverse impulse pattern. |

No external research needed — local primitives sufficient.

---

## Scope Boundaries

Based on origin doc, extended with two doc-review additions (DL-003 handbrake activation signal, DL-004 brake-state indicator) that explicitly accept design choices the origin didn't enumerate.

- **Boost-on-release** (hold Space → release → speed boost) — Mario Kart full experience, ~1 extra day for charge visual + timer + temporary speed cap raise. Excluded.
- **HUD additions** (speedometer, RPM, gear indicator). No gears or engine model; nothing meaningful to display.
- **Burnout / stationary handbrake tricks** (donuts, in-place spin). The R6 forward-speed gate explicitly disables this — simpler input semantics over expressive trick range.
- **Drift-aware lap timing** (faster lap credit for drift-heavy runs). Changes lap detection rules; out of plan-004's contract.
- **Chase camera response to drift** (camera lag offset, FOV pulse). Camera was tuned to 0.04 lerp in the recent fix batch — leave alone.
- **Damage / collision feedback** (visible damage decals, recovery time). Cars stay invulnerable; barriers retain current behavior.
- **Sound effects** for handbrake, tire screech, brake. No audio system in `/track` today; out of plan-005 scope.
- **Reverse + handbrake interaction** intentionally undefined (R6 gates handbrake on forward motion only). If the player reverses into a turn and holds Space, nothing happens — acceptable.
- **Handbrake activation visual signal** (chassis tilt, particle burst, opacity spike on segment start) deliberately omitted. Doc-review (DL-003) flagged this as a discoverability gap for demo viewers who aren't playing. Accepted: physics feel + skid marks are the sole signals. Viewers reading skid mark trails as drift technique is the demo legibility plan; an additional activation flash would compound visual noise without adding information for the playing user.
- **Brake-state visual feedback** (brake lights, "reverse-prep" indicator, reverse arrows). Deliberately omitted. Doc-review (DL-004) flagged the three S-key states (braking / brake-prep / reverse) are distinguishable only by motion direction. Accepted as deliberate product scope — brake-light meshes aren't reliably present in Tripo car GLB outputs (they vary per-model and lack a consistent naming convention), the demo arc doesn't require state visibility, and the existing no-HUD rule (R12) makes the HUD-style alternatives (on-screen indicators) also out of scope. Physics feel + skid marks are the sole signals.

### Deferred to Follow-Up Work

- **Per-wheel skid trails** (two parallel ribbons from rear-left + rear-right wheels) — visual upgrade for v1.1 if single-trail reads poorly. Per-wheel offsets are sensitive to the GLB's local axes and would need re-tuning per car model.
- **Skid-mark material variation by surface** (different colors / opacity on asphalt vs grass) — there's no grass surface today; revisit when track variety expands.
- **Solutions doc for the Babylon space-key character convention** — capture R-r1's resolution as a `docs/solutions/integration-issues/` entry during Phase 5 polish.

---

## Verification

- All 217 existing frontend tests continue to pass.
- New tests (~15-20) from U1, U2, U3 all pass.
- `pnpm typecheck` clean.
- Manual smoke on `/track` with the dev fixture (after each unit lands):
  - **After U1:** S decelerates smoothly at speed; tap S mid-corner does NOT reverse; full stop + 200ms hold begins reversing; W cancels reverse.
  - **After U2:** Hold D + Space at 12+ u/s → visible outward slide + sharper steering; release Space → grip returns immediately; Space at zero speed → no spin-in-place.
  - **After U3:** Hard cornering produces visible dark ribbons; Space drift produces longer/earlier ribbons; press R → all ribbons clear with the car teleport; 12+ drift moments in one lap → oldest ribbons disappear.
- Phase 4 (Sui Kiosk + mainnet redeploy) work unblocked — plan-005 stays scoped to `frontend/src/track/`.
