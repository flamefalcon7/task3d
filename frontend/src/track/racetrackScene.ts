// Phase 3 U6 — Tiny Racetrack scene (Havok rigid-body car + WASD + chase cam).
//
// Pure setup function — takes a canvas + GLB bytes, returns engine/scene
// handles plus a dispose() to tear everything down. TrackPage.tsx is the
// React wrapper that calls this, swaps cars on carousel selection, and owns
// the canvas ref.
//
// Why a pure function instead of a class: lets the test file mock
// @babylonjs/core + @babylonjs/havok at the module boundary and assert the
// wiring (engine constructed, physics enabled, car loaded, observers wired,
// dispose calls engine.dispose) without ever touching a real WebGL context.
//
// WASM serving: Havok ships ~2MB of WASM. The package's `exports` field
// only publishes `.` (no deep paths), so a Vite `?url` deep-import like
// `@babylonjs/havok/lib/esm/HavokPhysics.wasm?url` fails at resolve time.
// Instead we copy the .wasm into `frontend/public/HavokPhysics.wasm` (which
// Vite serves as a top-level static asset in dev AND copies to the build
// output) and tell the emscripten module loader to fetch from `/HavokPhysics
// .wasm` via the `locateFile` hook. Browser caching keeps this cheap on
// repeat loads even though we lose the per-build content-hash.
//
// (Phase 5 polish: switch to Vite's `assetsInclude` + a postinstall copy
// hook so the file is fingerprinted; out of scope for the hackathon MVP.)

import {
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
  KeyboardEventTypes,
  LoadAssetContainerAsync,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/loaders/glTF/index.js';
import HavokPhysics from '@babylonjs/havok';

import {
  buildOvalControlPoints,
  sampleOvalCurve,
  tangentAt,
} from './oval';
import {
  initialLapState,
  lapReducer,
  type LapAction,
  type LapState,
} from './lapState';

const HAVOK_WASM_PATH = '/HavokPhysics.wasm';

export interface RacetrackSceneOptions {
  canvas: HTMLCanvasElement;
  carGlbBytes: Uint8Array;
  /**
   * U3 — invoked whenever the internal lap state machine transitions.
   * TrackPage (U4) mirrors this into React state for the HUD overlay.
   */
  onLapStateChange?: (state: LapState) => void;
}

export interface RacetrackSceneHandles {
  engine: Engine;
  scene: Scene;
  dispose: () => void;
  /**
   * U3 — called by TrackPage's Retry handler (U4). Teleports the car back
   * to the start line, zeroes velocity, and dispatches a reset action so
   * the lap state machine returns to `waiting`.
   */
  reset: () => void;
}

// Tunables — kept as named constants so future polish (Phase 5) can tweak
// without re-reading the body. Values picked to feel snappy but not arcadey
// for a hackathon demo recording (R1 fallback considered: if these need
// per-car tuning we drop back to Trophy Hall L1).
// U2 — procedural oval track tuned for ~150-unit perimeter, ~25s lap at
// the current FORWARD_IMPULSE. Adjust TRACK_* during physics-feel tuning.
const TRACK_WIDTH = 35; // along X
const TRACK_LENGTH = 50; // along Z (longer side)
const TRACK_CORNER_RADIUS = 10;
const TRACK_SAMPLES = 80;
const ROAD_WIDTH = 14;
const BARRIER_COUNT = 24;
// Perpendicular distance from road center to each barrier wall.
// Independent of TRIGGER_RADIUS below — equal values today are coincidental.
const BARRIER_OUTWARD_OFFSET = 8;
const SAFETY_GROUND_SIZE = 200; // wide invisible floor as fallback if car flies off
const WALL_HEIGHT = 4;
// U3 — trigger volume size. Generous enough that a fast car can't skip
// through between frames, narrow enough that finishCrossed only fires when
// the car is actually on the start/finish line.
// Independent of BARRIER_OUTWARD_OFFSET above — equal values are coincidental.
const TRIGGER_RADIUS = 8;
const CAR_MASS = 1500;
// Arcade-car control model (researched from NFS-style arcade racers + Mario
// Kart's handling). Four interlocking rules replace the old "constant
// impulse + free angular velocity + slight damping" ice-puck feel:
//
// 1. Top-speed cap on throttle: impulse tapers to zero as forwardSpeed
//    approaches MAX_FORWARD_SPEED. Prevents runaway acceleration.
// 2. Speed-dependent steering: turn rate scales with current forward speed.
//    Stationary cars barely turn (parking-spot factor only); fast cars get
//    full rate. Real cars need speed to steer; this matches intuition.
// 3. Lateral grip: each frame we cancel a fraction of the lateral velocity
//    (component perpendicular to facing). Without this, the car slides
//    sideways through corners like it's on ice.
// 4. Tight angular damping: when no steer key is held, the body decays
//    its yaw rate fast so the car doesn't keep spinning after the input
//    releases.
const FORWARD_IMPULSE = 60;
const REVERSE_IMPULSE = 32;
const MAX_FORWARD_SPEED = 18; // units/sec; ~25s lap at average ~6 u/s
const MAX_REVERSE_SPEED = 8;
// Plan-005 U1: brake state machine. S held while moving forward applies a
// velocity-proportional brake force (mirrors lateral-grip pattern); after
// the car comes to a near-stop, holding S for BRAKE_TO_REVERSE_HOLD_MS
// switches into reverse mode. W cancels brake/reverse state.
const BRAKE_FORCE = 0.04; // dimensionless multiplier — start here, tune in-browser
const BRAKE_REVERSE_SPEED_THRESHOLD = 0.5; // |forwardSpeed| u/s at which brake hands off to reverse-prep timer
const BRAKE_TO_REVERSE_HOLD_MS = 200; // S must be held this long below speed threshold before reverse engages
// Steering: rad/s at full effectiveness. Scaled per-frame by speed factor.
// 1.4 = about 1 full rotation per 4.5 seconds at top scale. Lower numbers
// = smoother, more car-like turns; higher numbers = arcade-snappy / kart.
const STEER_ANGULAR_VELOCITY = 1.4;
// Speed (units/sec) at which steering reaches its full rate. Below this,
// steering scales linearly from STEER_MIN_FACTOR up to 1.0.
const STEER_FULL_SPEED = 6;
// Minimum steering rate as a fraction of STEER_ANGULAR_VELOCITY, applied
// at zero speed. Prevents getting stuck against a wall — driver can still
// turn the car in place at 30% rate. Real cars can't, but arcade games do.
const STEER_MIN_FACTOR = 0.3;
// Fraction of lateral velocity removed each frame by the grip model.
// 0 = no grip (full ice), 1 = perfect grip (no sliding ever).
// 0.15 = realistic arcade feel — slight drift on hard corners.
const LATERAL_GRIP_PER_FRAME = 0.15;
// Linear damping kept low — top-speed cap + grip handle deceleration.
// Setting too high makes the car feel sticky.
const LINEAR_DAMPING = 0.05;
// Angular damping high — when no steer input, yaw rate decays in ~3 frames
// so the car doesn't keep spinning after key release.
const ANGULAR_DAMPING = 0.85;
const CHASE_RADIUS = 15;
// Chase camera azimuth lerp rate. 0 = camera angle doesn't follow car
// (locked to world axis — old behavior). 1 = camera snaps instantly behind
// the car each frame (no lag, can feel jittery on hard turns). 0.04 gives
// a ~250ms catch-up — slow enough that the car visibly rotates relative
// to the camera during turns (you see your turn-in), camera-swing isn't
// violent on corners.
const CHASE_ALPHA_LERP = 0.04;
// Yaw offset applied to the car geometry inside its physics pivot, in
// radians. Different GLB sources export with different local forward axes
// (Tripo, Sketchfab, manual exports all differ). Adjust per asset family:
//   0        = GLB already faces the pivot's +Z (drive direction)
//   Math.PI  = GLB faces -Z (rotate 180°)
//   Math.PI/2  = GLB faces +X (rotate 90° CCW)
//  -Math.PI/2 = GLB faces -X (rotate 90° CW)
// Currently -90° — Tripo outputs face -X locally; rotate CW so -X aligns
// with the pivot's +Z drive direction.
const CAR_GEOMETRY_YAW_OFFSET = -Math.PI / 2;

export async function createRacetrackScene(
  opts: RacetrackSceneOptions,
): Promise<RacetrackSceneHandles> {
  const engine = new Engine(opts.canvas, true);
  // Make the canvas focusable so scene.onKeyboardObservable receives WASD
  // events without requiring a manual click. Agents driving the page via
  // Playwright `page.keyboard.press('w')` will fail silently otherwise —
  // R-key works (it's window-scoped on TrackPage) but drive keys go through
  // Babylon's canvas pipeline. tabIndex=-1 makes it focusable programmatically
  // but keeps it out of the tab-order so keyboard nav isn't disrupted.
  opts.canvas.tabIndex = -1;
  opts.canvas.focus();
  const scene = new Scene(engine);
  scene.clearColor.set(0.55, 0.7, 0.85, 1);

  // 1. Physics — emscripten Module options. `locateFile` lets us redirect
  // the WASM fetch to our public-served copy at `/HavokPhysics.wasm`
  // (see the header comment for why this is preferable to a `?url` import).
  const havok = await HavokPhysics({
    locateFile: () => HAVOK_WASM_PATH,
  });
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

  // 2. Light
  new HemisphericLight('light', new Vector3(0, 1, 0), scene);

  // 3. Safety ground — wide flat invisible-ish floor under the track.
  // R-r4b: the road ribbon's MESH collider is the primary driving surface;
  // this floor catches the car if it ever bounces over a barrier so it
  // doesn't fall into the void. Sits 0.5 units below road level.
  const safetyGround = MeshBuilder.CreateGround(
    'safety-ground',
    { width: SAFETY_GROUND_SIZE, height: SAFETY_GROUND_SIZE },
    scene,
  );
  safetyGround.position = new Vector3(0, -0.5, 0);
  const grassMat = new StandardMaterial('grassMat', scene);
  grassMat.diffuseColor = new Color3(0.18, 0.32, 0.18);
  safetyGround.material = grassMat;
  new PhysicsAggregate(safetyGround, PhysicsShapeType.BOX, { mass: 0 }, scene);

  // 4. Procedural oval (KTD-7): build control points, sample the
  // Catmull-Rom curve, then extrude a road ribbon along it plus
  // tangent-aligned barrier boxes on both sides.
  const controlPoints = buildOvalControlPoints(
    TRACK_WIDTH,
    TRACK_LENGTH,
    TRACK_CORNER_RADIUS,
  );
  const samples = sampleOvalCurve(controlPoints, TRACK_SAMPLES);

  // Road ribbon: extrude a road-width line cross-section along the closed
  // sample path. Closing the path: push samples[0] at the end so the
  // ExtrudeShape wraps cleanly without a visible seam.
  const roadProfile = [
    new Vector3(-ROAD_WIDTH / 2, 0, 0),
    new Vector3(ROAD_WIDTH / 2, 0, 0),
  ];
  const closedPath = [...samples, samples[0]!];
  const roadRibbon = MeshBuilder.ExtrudeShape(
    'road-ribbon',
    { shape: roadProfile, path: closedPath, sideOrientation: 2 /* DOUBLESIDE */ },
    scene,
  );
  const asphaltMat = new StandardMaterial('asphaltMat', scene);
  asphaltMat.diffuseColor = new Color3(0.18, 0.18, 0.2);
  roadRibbon.material = asphaltMat;
  // MESH collider for the road. R-r4b mitigation: if this judders against
  // the car's BOX collider, the safety ground above still catches the car.
  new PhysicsAggregate(roadRibbon, PhysicsShapeType.MESH, { mass: 0 }, scene);

  // 5. Barrier walls — 24 outer + 24 inner, tangent-aligned. Replaces U6's
  // 4 perimeter walls; gives the track visible rails on both sides.
  const barrierMat = new StandardMaterial('barrierMat', scene);
  barrierMat.diffuseColor = new Color3(0.7, 0.55, 0.25);
  for (let i = 0; i < BARRIER_COUNT; i++) {
    const sampleIdx = Math.floor((i * TRACK_SAMPLES) / BARRIER_COUNT);
    const center = samples[sampleIdx]!;
    const tangent = tangentAt(samples, sampleIdx);
    // Perpendicular to tangent in the XZ plane (rotate 90° CW = outward
    // for CCW-traversed curve).
    const outwardX = tangent.z;
    const outwardZ = -tangent.x;
    const yaw = Math.atan2(tangent.x, tangent.z);

    const placeBarrier = (
      name: string,
      offsetX: number,
      offsetZ: number,
    ): void => {
      const box = MeshBuilder.CreateBox(
        name,
        { width: 1, height: WALL_HEIGHT, depth: 3 },
        scene,
      );
      box.position = new Vector3(
        center.x + offsetX,
        WALL_HEIGHT / 2,
        center.z + offsetZ,
      );
      box.rotation = new Vector3(0, yaw, 0);
      box.material = barrierMat;
      new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, scene);
    };

    placeBarrier(
      `barrier-outer-${i}`,
      outwardX * BARRIER_OUTWARD_OFFSET,
      outwardZ * BARRIER_OUTWARD_OFFSET,
    );
    placeBarrier(
      `barrier-inner-${i}`,
      -outwardX * BARRIER_OUTWARD_OFFSET,
      -outwardZ * BARRIER_OUTWARD_OFFSET,
    );
  }

  // 6. Start/finish line + checkpoint decals. Visual-only (no physics) —
  // U3 wires the lap-detection trigger volumes separately.
  const startFinish = MeshBuilder.CreatePlane(
    'start-finish',
    { width: ROAD_WIDTH, height: 2 },
    scene,
  );
  const startSample = samples[0]!;
  const startTangent = tangentAt(samples, 0);
  startFinish.position = new Vector3(startSample.x, 0.02, startSample.z);
  startFinish.rotation = new Vector3(
    Math.PI / 2,
    Math.atan2(startTangent.x, startTangent.z),
    0,
  );
  const startMat = new StandardMaterial('startMat', scene);
  startMat.diffuseColor = new Color3(0.95, 0.95, 0.95);
  startFinish.material = startMat;

  const checkpointIdx = Math.floor(TRACK_SAMPLES / 2);
  const checkpoint = MeshBuilder.CreatePlane(
    'checkpoint',
    { width: ROAD_WIDTH, height: 1 },
    scene,
  );
  const checkpointSample = samples[checkpointIdx]!;
  const checkpointTangent = tangentAt(samples, checkpointIdx);
  checkpoint.position = new Vector3(
    checkpointSample.x,
    0.02,
    checkpointSample.z,
  );
  checkpoint.rotation = new Vector3(
    Math.PI / 2,
    Math.atan2(checkpointTangent.x, checkpointTangent.z),
    0,
  );
  const checkpointMat = new StandardMaterial('checkpointMat', scene);
  checkpointMat.diffuseColor = new Color3(0.4, 0.6, 0.9);
  checkpointMat.alpha = 0.6;
  checkpoint.material = checkpointMat;

  // 7. Load car GLB from bytes. Wrap the Uint8Array in a Blob + object URL
  // so Babylon's loader (which expects a URL) can ingest it. .glb forces
  // the GLB pipeline rather than gltf-json.
  const blob = new Blob([opts.carGlbBytes as BlobPart], {
    type: 'model/gltf-binary',
  });
  const blobUrl = URL.createObjectURL(blob);
  const carContainer = await LoadAssetContainerAsync(blobUrl, scene, {
    pluginExtension: '.glb',
  });
  URL.revokeObjectURL(blobUrl);
  carContainer.addAllToScene();
  // KTD-2: `carContainer.meshes[0]` is typically Babylon's `__root__`
  // TransformNode (0 vertices), so binding the PhysicsAggregate to it gives
  // a degenerate bounding box and a useless box collider. Pick the first
  // mesh that actually carries geometry. Falls back to meshes[0] only for
  // single-mesh GLBs where the root IS the geometry.
  const carGeometry =
    carContainer.meshes.find(
      (m) => typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0,
    ) ?? carContainer.meshes[0]!;
  // KTD-2: parent the geometry to a TransformNode we own and aggregate
  // physics on the pivot, not the geometry. This isolates the physics
  // body's transform from any GLB-internal hierarchy (Tripo outputs nest
  // the mesh several nodes deep with arbitrary rotations).
  const carPivot = new TransformNode('car-pivot', scene);
  carGeometry.parent = carPivot;
  // Align the GLB's local forward axis with the pivot's +Z (the direction
  // FORWARD_IMPULSE pushes). Without this, the car drives backwards
  // visually — Tripo + most vehicle GLBs face -Z in their local frame.
  carGeometry.rotation = new Vector3(0, CAR_GEOMETRY_YAW_OFFSET, 0);
  // U2: spawn on the start/finish line, facing the curve tangent so the
  // first W keypress drives along the track instead of sideways.
  carPivot.position = new Vector3(startSample.x, 1, startSample.z);
  carPivot.rotation = new Vector3(
    0,
    Math.atan2(startTangent.x, startTangent.z),
    0,
  );
  const carBody = new PhysicsAggregate(
    carPivot,
    PhysicsShapeType.BOX,
    { mass: CAR_MASS },
    scene,
  );
  carBody.body.setLinearDamping(LINEAR_DAMPING);
  carBody.body.setAngularDamping(ANGULAR_DAMPING);
  // Allow Retry's transform-node assignment to actually teleport the body.
  // Havok v2's default `disablePreStep=true` means the body owns the
  // transform — assignments to carPivot.position are overwritten on the
  // next physics step, so reset() looked like it only reset the timer.
  // Setting false here costs one matrix read per frame for our single
  // dynamic body — negligible — and makes mesh-driven teleports work.
  carBody.body.disablePreStep = false;

  // 8. Chase camera — ArcRotateCamera tracks the pivot each frame AND
  // orbits to sit behind the car's facing direction. Without the alpha
  // tracking, the camera stays at a world-fixed orbit angle and the WASD
  // controls feel disconnected as the car turns away from the camera
  // (W = "screen forward" only at the start). Now the camera follows the
  // heading with a 120ms lag, classic racing-game chase-cam feel. Not
  // attaching control on purpose: we want WASD to drive, not orbit drag.
  const camera = new ArcRotateCamera(
    'chase',
    -Math.PI / 2,
    Math.PI / 3,
    CHASE_RADIUS,
    carPivot.position.clone(),
    scene,
  );
  scene.onBeforeRenderObservable.add(() => {
    camera.target.copyFrom(carPivot.position);

    // Compute the alpha that puts the camera directly behind the car.
    // ArcRotateCamera alpha: when car forward = (sin θ, 0, cos θ), the
    // "camera behind car" position requires alpha = -π/2 - θ (verified
    // for θ = 0, π/2, π — gives -π/2, -π, π/2 respectively, all of which
    // place the camera on the opposite side of the target from the car's
    // facing direction).
    const forward = carPivot.getDirection(Vector3.Forward());
    const theta = Math.atan2(forward.x, forward.z);
    const targetAlpha = -Math.PI / 2 - theta;

    // Shortest-arc lerp so we never take the long way around when the
    // current alpha and target are on opposite sides of the ±π wrap.
    let delta = targetAlpha - camera.alpha;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    camera.alpha += delta * CHASE_ALPHA_LERP;
  });

  // 9. WASD / arrow-key input. Accumulate held keys in a Set so multi-key
  // (W+A = forward-left) works without state machine. Forward/reverse stay
  // as impulses applied along the pivot's facing direction. Steer drives
  // the body's Y angular velocity directly (KTD-1) — never mesh.rotate,
  // which would fight Havok's own integration and accumulate spin.
  //
  // Agent-native note: scene.onKeyboardObservable receives events through
  // the canvas's focused-element pipeline. We set tabIndex + .focus() above
  // so the canvas can receive keyboard events without requiring the user
  // (or test agent) to click it first.
  const keys = new Set<string>();
  // Plan-005 U1: brake state machine closure state. brakeHoldStartMs arms
  // when the car is near-stopped AND S is held; after BRAKE_TO_REVERSE_HOLD_MS
  // elapses, reverseMode flips and S applies reverse impulse. W press clears
  // both. S release clears both.
  let brakeHoldStartMs: number | null = null;
  let reverseMode = false;
  scene.onKeyboardObservable.add((kbInfo) => {
    const k = kbInfo.event.key.toLowerCase();
    if (kbInfo.type === KeyboardEventTypes.KEYDOWN) keys.add(k);
    else if (kbInfo.type === KeyboardEventTypes.KEYUP) keys.delete(k);
  });
  scene.onBeforeRenderObservable.add(() => {
    const forward = carPivot.getDirection(Vector3.Forward());
    // "Right" axis = forward rotated 90° CW in XZ plane (Y up). Derived
    // inline so the mocked test surface doesn't need Vector3.Right() and
    // we don't depend on getDirection responding to multiple arguments.
    const rightX = forward.z;
    const rightZ = -forward.x;

    // Decompose current velocity into forward + lateral components.
    const velocity = carBody.body.getLinearVelocity();
    const forwardSpeed =
      velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;
    const lateralSpeed = velocity.x * rightX + velocity.z * rightZ;

    // Throttle — impulse tapers to zero as we approach MAX_FORWARD_SPEED.
    // Smooth top-speed cap; no hard clamp needed. Pressing W also cancels
    // any active brake-reverse state machine (R4 — pressing W exits both
    // reverse-prep and reverse mode instantly).
    if (keys.has('w') || keys.has('arrowup')) {
      const throttleScale = Math.max(0, 1 - Math.max(0, forwardSpeed) / MAX_FORWARD_SPEED);
      if (throttleScale > 0) {
        carBody.body.applyImpulse(
          forward.scale(FORWARD_IMPULSE * throttleScale),
          carPivot.absolutePosition,
        );
      }
      brakeHoldStartMs = null;
      reverseMode = false;
      // U3 — first W (or arrow-up) press kicks the lap timer off.
      // Reducer no-ops on subsequent throttle while already running.
      dispatch({ type: 'throttle', nowMs: performance.now() });
    }

    // Brake / reverse state machine (Plan-005 U1).
    // Branch A: still moving forward → velocity-proportional brake force.
    // Branch B: near-zero speed AND timer not yet armed → arm it.
    // Branch C: near-zero speed AND timer armed AND elapsed → flip reverseMode.
    // (The three branches are mutually exclusive via if/else-if so the timer
    // can't be both armed and consumed on the same tick — see plan KTD-1.)
    // If reverseMode is true, apply reverse impulse (tapered cap, same shape
    // as the prior reverse handler).
    // S released → clear both bits of state.
    if (keys.has('s') || keys.has('arrowdown')) {
      if (forwardSpeed > BRAKE_REVERSE_SPEED_THRESHOLD) {
        // Velocity-proportional brake, mirrors lateral-grip pattern below.
        // Asymptotically decelerates → no overshoot possible.
        const brakeMag = forwardSpeed * BRAKE_FORCE * CAR_MASS;
        carBody.body.applyImpulse(
          forward.scale(-brakeMag),
          carPivot.absolutePosition,
        );
        brakeHoldStartMs = null;
        reverseMode = false;
      } else if (brakeHoldStartMs === null) {
        brakeHoldStartMs = performance.now();
      } else if (
        !reverseMode &&
        performance.now() - brakeHoldStartMs > BRAKE_TO_REVERSE_HOLD_MS
      ) {
        reverseMode = true;
      }
      if (reverseMode) {
        const reverseScale = Math.max(
          0,
          1 - Math.max(0, -forwardSpeed) / MAX_REVERSE_SPEED,
        );
        if (reverseScale > 0) {
          carBody.body.applyImpulse(
            forward.scale(-REVERSE_IMPULSE * reverseScale),
            carPivot.absolutePosition,
          );
        }
      }
    } else {
      brakeHoldStartMs = null;
      reverseMode = false;
    }

    // Steering — yaw rate scales with current speed. STEER_MIN_FACTOR
    // floor keeps parking-spot turning possible at zero speed (so the
    // player can rotate after backing into a wall).
    let steerInput = 0;
    if (keys.has('a') || keys.has('arrowleft')) steerInput -= 1;
    if (keys.has('d') || keys.has('arrowright')) steerInput += 1;
    if (steerInput !== 0) {
      const speedFactor = Math.max(
        STEER_MIN_FACTOR,
        Math.min(1, Math.abs(forwardSpeed) / STEER_FULL_SPEED),
      );
      const angVel = carBody.body.getAngularVelocity();
      angVel.x = 0;
      angVel.z = 0;
      angVel.y = steerInput * STEER_ANGULAR_VELOCITY * speedFactor;
      carBody.body.setAngularVelocity(angVel);
    }

    // Lateral grip — cancel a fraction of sideways drift each frame.
    // Without this, the car slides like a hockey puck through corners.
    // Skip near zero forward speed (parking) to avoid fighting the
    // parking-rotation behaviour.
    if (Math.abs(forwardSpeed) > 0.5 && Math.abs(lateralSpeed) > 0.01) {
      const lateralImpulse = new Vector3(
        -rightX * lateralSpeed * LATERAL_GRIP_PER_FRAME * CAR_MASS,
        0,
        -rightZ * lateralSpeed * LATERAL_GRIP_PER_FRAME * CAR_MASS,
      );
      carBody.body.applyImpulse(lateralImpulse, carPivot.absolutePosition);
    }
  });

  // 10. U3 — lap state machine + per-frame trigger volume checks.
  // KTD-4 fallback (R-r4/AA-3): distance-based plane-intersection rather
  // than Havok trigger-volume observers. Cheaper to wire, deterministic,
  // works the same downstream.
  let lapState: LapState = initialLapState();
  // Car spawns ON the start line, so flag start trigger as "inside" from
  // the start — only fires when the car LEAVES and RE-ENTERS the zone.
  let insideStartTrigger = true;
  let insideCheckpointTrigger = false;

  function dispatch(action: LapAction): void {
    const next = lapReducer(lapState, action);
    if (next !== lapState) {
      lapState = next;
      opts.onLapStateChange?.(lapState);
    }
  }

  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    dispatch({ type: 'tick', nowMs: now });

    const carPos = carPivot.position;
    const dStart = Math.hypot(
      carPos.x - startSample.x,
      carPos.z - startSample.z,
    );
    const insideStartNow = dStart < TRIGGER_RADIUS;
    if (insideStartNow && !insideStartTrigger) {
      dispatch({ type: 'finishCrossed', nowMs: now });
    }
    insideStartTrigger = insideStartNow;

    const dCheckpoint = Math.hypot(
      carPos.x - checkpointSample.x,
      carPos.z - checkpointSample.z,
    );
    const insideCheckpointNow = dCheckpoint < TRIGGER_RADIUS;
    if (insideCheckpointNow && !insideCheckpointTrigger) {
      dispatch({ type: 'checkpoint' });
    }
    insideCheckpointTrigger = insideCheckpointNow;
  });

  const reset = (): void => {
    // Teleport car back to spawn + zero velocity. Works because we set
    // body.disablePreStep = false at init — Havok reads the pivot's
    // transform on the next pre-step and moves the body to match.
    // computeWorldMatrix(true) flushes the Euler rotation → quaternion
    // conversion synchronously so the body sees the new orientation,
    // not stale state from before the assignment.
    carPivot.position = new Vector3(startSample.x, 1, startSample.z);
    carPivot.rotation = new Vector3(
      0,
      Math.atan2(startTangent.x, startTangent.z),
      0,
    );
    if (typeof carPivot.computeWorldMatrix === 'function') {
      carPivot.computeWorldMatrix(true);
    }
    carBody.body.setLinearVelocity(new Vector3(0, 0, 0));
    carBody.body.setAngularVelocity(new Vector3(0, 0, 0));
    // Re-arm trigger flags: car is back on the start line so the start
    // trigger is treated as "already inside" — finishCrossed only fires
    // when the car LEAVES and RE-ENTERS the zone. This coupling means any
    // future change that teleports the car to a non-start spawn point must
    // ALSO recompute the trigger flags based on actual position rather
    // than assuming start-line entry.
    insideStartTrigger = true;
    insideCheckpointTrigger = false;
    dispatch({ type: 'reset' });
    // Re-focus the canvas after Retry so scene.onKeyboardObservable resumes
    // receiving WASD. Clicking the Retry button moves focus off the canvas;
    // without this re-focus, the player presses W and nothing happens until
    // they click the canvas back into focus. Defensive check because the
    // mock canvas in tests doesn't always have focus().
    if (typeof opts.canvas.focus === 'function') {
      opts.canvas.focus();
    }
  };

  engine.runRenderLoop(() => scene.render());
  const onResize = () => engine.resize();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
  }

  return {
    engine,
    scene,
    reset,
    dispose: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize);
      }
      carContainer.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
