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
  DefaultRenderingPipeline,
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
// Tree-shaken subpath import keeps bundle delta small — the @babylonjs/materials
// library has dozens of materials we don't use (water, fire, fur, etc.).
// See D-027 for adoption rationale.
import { SkyMaterial } from '@babylonjs/materials/sky/skyMaterial';

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
// Plan-006 U8 — cinematic intro: camera orbits while React countdown plays.
import { createSkidMarks, type SkidMarks } from './skidMarks';
import { createTireSmoke, type TireSmoke } from './tireSmoke';

const HAVOK_WASM_PATH = '/HavokPhysics.wasm';

export interface RacetrackSceneOptions {
  canvas: HTMLCanvasElement;
  carGlbBytes: Uint8Array;
  /**
   * U3 — invoked whenever the internal lap state machine transitions.
   * TrackPage (U4) mirrors this into React state for the HUD overlay.
   */
  onLapStateChange?: (state: LapState) => void;
  /**
   * Plan-006 U8 — fired once when the intro camera orbit completes.
   * TrackPage uses this to show the countdown overlay.
   */
  onOrbitComplete?: () => void;
  /**
   * Plan-006 U8 — fired when the player holds W/up-arrow for longer than
   * INTRO_HOLD_W_SKIP_MS during the intro phase. TrackPage responds by
   * dispatching introSkip (which TrackPage routes back via handles.dispatchIntroSkip).
   */
  onIntroSkipRequested?: () => void;
  /**
   * Test/dev convenience: when true, the scene mounts already in the
   * `waiting` state — no orbit, no countdown wait, input is immediately
   * enabled. Production paths leave this false. The `dev_` prefix makes
   * accidental production use visible at a glance.
   */
  dev_skipIntro?: boolean;
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
  /**
   * Plan-006 U8 — TrackPage calls this when the countdown overlay's GO
   * step finishes. Dispatches introComplete into the scene's reducer so
   * input unblocks.
   */
  dispatchIntroComplete: () => void;
  /**
   * Plan-006 U8 — TrackPage calls this in response to onIntroSkipRequested.
   * Dispatches introSkip into the scene's reducer.
   */
  dispatchIntroSkip: () => void;
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
// Speed tuned so corner radius EXCEEDS the road's outside line, forcing
// the player to brake or drift through corners rather than steering through
// at full throttle. At MAX_FORWARD_SPEED / STEER_ANGULAR_VELOCITY = 28/1.4
// = 20 u turning radius, vs ~14 u outside-line corner radius. Drift becomes
// the high-skill option to maintain pace through corners.
// FORWARD_IMPULSE scaled ~1.8× alongside the cap so 0→top still feels
// brisk (~3-4 s on a straight) rather than asymptotic.
const FORWARD_IMPULSE = 110;
const REVERSE_IMPULSE = 32;
const MAX_FORWARD_SPEED = 28; // units/sec — see comment above for drift-requires-speed math
const MAX_REVERSE_SPEED = 8;
// Plan-005 U1: brake state machine. S held while moving forward applies a
// velocity-proportional brake force (mirrors lateral-grip pattern); after
// the car comes to a near-stop, holding S for BRAKE_TO_REVERSE_HOLD_MS
// switches into reverse mode. W cancels brake/reverse state.
// Manual smoke surfaced that 0.04 was too weak — brake decelerated
// asymptotically and the car hovered just above the 0.5 threshold, so
// Branch B (reverse-prep timer) never armed. 0.12 (3×) makes the brake
// reach the threshold within ~1 second from MAX_FORWARD_SPEED. Also bumped
// the threshold 0.5 → 1.0 to widen the "near stopped" band against
// physics noise — the car frequently has 0.6-0.8 residual velocity from
// Havok damping that previously kept Branch A firing forever.
const BRAKE_FORCE = 0.12; // dimensionless multiplier — tune in-browser
const BRAKE_REVERSE_SPEED_THRESHOLD = 1.0; // |forwardSpeed| u/s at which brake hands off to reverse-prep timer
const BRAKE_TO_REVERSE_HOLD_MS = 200; // S must be held this long below speed threshold before reverse engages
// Plan-005 U2: handbrake mode. Holding Space at speed drops lateral grip
// (slide into corners) AND boosts the steering coefficient (Mario Kart
// power slide). Throttle and brake stay active during handbrake (R7).
const HANDBRAKE_GRIP_MULTIPLIER = 0.13; // applied to LATERAL_GRIP_PER_FRAME (0.15 * 0.13 ≈ 0.02)
const HANDBRAKE_STEER_MULTIPLIER = 1.5; // applied to final steering angular-velocity magnitude
const HANDBRAKE_SPEED_THRESHOLD = 1.5; // |forwardSpeed| u/s below which handbrake stays disengaged
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
// Plan-005 U3: |lateralSpeed| u/s above which skid marks are emitted.
// Manual smoke revealed 3 was too high for the arcade-grip model — natural
// drifts rarely sustain >3 u/s of lateral velocity (LATERAL_GRIP_PER_FRAME=
// 0.15 kills sideways motion in 6-7 frames). 1.5 catches medium-aggressive
// corners AND handbrake slides; lower if even gentle turn-in should paint.
const SKID_LATERAL_SPEED_THRESHOLD = 1.5;
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
// Plan-006 U2 — DefaultRenderingPipeline tunables. Ships first within
// Batch 1 so subsequent visual units (SkyMaterial, kerb colors, emissive
// stripe) land against the post-processed pipeline rather than raw WebGL.
// Bloom threshold/weight/kernel + FXAA + ACES tonemap are intentionally
// untested per plan KTDs — visual feel is judged on the dev server.
const BLOOM_THRESHOLD = 0.7;
const BLOOM_WEIGHT = 0.3;
const BLOOM_KERNEL = 64;
// Plan-006 U3 — SkyMaterial Preetham atmospheric-scattering tunables.
// Golden-hour preset: warm low sun, slightly hazy atmosphere. Inclination
// 0.45 puts the sun just above the horizon for visible directional warmth;
// azimuth 0.25 places it forward-right of the chase camera at spawn so the
// car's GLB picks up rim light from the same angle the player sees.
// Tunables for in-browser tweaking; not asserted in tests (KTD).
const SKY_TURBIDITY = 3;
const SKY_LUMINANCE = 0.5;
const SKY_INCLINATION = 0.45;
const SKY_AZIMUTH = 0.25;
const SKY_RAYLEIGH = 2;
const SKYBOX_SIZE = 1000;
// Plan-006 U4 — kerb stripe colors. Alternate per-segment so barriers
// read as racetrack kerbs rather than abstract walls. Outer kerbs red/
// white (classic F1 kerb pattern); inner kerbs green/white so the player
// can distinguish left/right at speed. Materials are shared instances
// (one per band-color) so 48 barriers allocate exactly 4 StandardMaterial
// objects rather than 48.
const KERB_OUTER_PRIMARY: [number, number, number] = [0.85, 0.15, 0.15];   // red
const KERB_OUTER_SECONDARY: [number, number, number] = [0.95, 0.95, 0.95]; // white
const KERB_INNER_PRIMARY: [number, number, number] = [0.2, 0.7, 0.25];     // green
const KERB_INNER_SECONDARY: [number, number, number] = [0.95, 0.95, 0.95]; // white
// Plan-006 U5 — FOV pump tunables. Camera's field-of-view lerps toward
// FOV_BASE + (forwardSpeed / MAX_FORWARD_SPEED) * FOV_PUMP_DELTA each
// frame. Delta of 0.14 rad (~8°) is the cap recommended by the source
// (threejs-speedup-effect) — wider feels nauseating; narrower is
// imperceptible. Lerp rate 0.05 means the FOV catches up with ~95% of
// the target over ~60 frames (1s @ 60fps), slow enough that the camera
// "leans into" speed gradually instead of snapping. Babylon default FOV
// is 0.8 rad (Math.PI/4 ≈ 45°); capturing the live value at camera
// creation lets a future per-car FOV tweak work without re-tuning here.
const FOV_PUMP_DELTA = 0.14; // radians; added on top of base FOV at MAX_FORWARD_SPEED
const FOV_LERP_RATE = 0.05;  // per-frame catch-up factor
// Plan-006 U6 — emissive center stripe + checker start line.
// Stripe is a single continuous ribbon along the road centerline (not a
// dashed pattern). Reasoning: a continuous emissive yellow line under
// U2's bloom reads more sharply at race speed than alternating dashes
// (dashes would strobe at the player's eye-traversal frequency), and
// single-mesh keeps the draw-call count down. Stripe is offset 0.02u
// above the road to avoid z-fight; KTD-2 in the plan documents that this
// is a parallel mesh, not UV-segmented into the road material.
const STRIPE_SAMPLES = 160; // 2× road samples for smooth centerline
const STRIPE_WIDTH = 0.3;
const STRIPE_HEIGHT_OFFSET = 0.02;
const STRIPE_EMISSIVE: [number, number, number] = [1.0, 0.85, 0.15]; // warm yellow
// Checker start line: 4 columns × 2 rows of small alternating black/white
// cells covering the same footprint the single white plane previously had
// (ROAD_WIDTH × 2u). Cell width = ROAD_WIDTH / 4, cell height = 1u.
const CHECKER_COLS = 4;
const CHECKER_ROWS = 2;
const CHECKER_LIGHT: [number, number, number] = [0.95, 0.95, 0.95];
const CHECKER_DARK: [number, number, number] = [0.08, 0.08, 0.08];
// Plan-006 U8 — intro orbit + countdown timing. Camera revolves once
// around the car over INTRO_ORBIT_DURATION_MS; React countdown then plays
// before input enables. Hold-W >INTRO_HOLD_W_SKIP_MS dispatches introSkip
// (dev/agent shortcut). Pure lerp-per-frame in the chase observer keeps
// the test mock surface flat — no Babylon Animation API to stub.
const INTRO_ORBIT_DURATION_MS = 2000;
const INTRO_HOLD_W_SKIP_MS = 200;

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

  // Plan-006 U3 — SkyMaterial atmospheric sky on a large skybox cube.
  // Replaces the flat clearColor (kept as fallback for the frame before
  // the material's shader compiles). infiniteDistance=true makes the
  // skybox track the camera so it appears infinitely far regardless of
  // where the car drives. backFaceCulling=false renders the inside of
  // the cube, which is the surface the camera sees from within.
  // See D-027 for the @babylonjs/materials adoption rationale.
  const skybox = MeshBuilder.CreateBox(
    'skybox',
    { size: SKYBOX_SIZE },
    scene,
  );
  skybox.infiniteDistance = true;
  const skyMaterial = new SkyMaterial('skyMaterial', scene);
  skyMaterial.backFaceCulling = false;
  skyMaterial.turbidity = SKY_TURBIDITY;
  skyMaterial.luminance = SKY_LUMINANCE;
  skyMaterial.inclination = SKY_INCLINATION;
  skyMaterial.azimuth = SKY_AZIMUTH;
  skyMaterial.rayleigh = SKY_RAYLEIGH;
  skybox.material = skyMaterial;

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

  // Plan-006 U6 — center stripe. Sample the same oval at 2× density so
  // the stripe path curves smoothly between road samples, then extrude
  // a thin profile along it. No physics aggregate (visual only). The
  // stripe relies on U2's bloom to glow — the emissive color stays high
  // (1.0, 0.85, 0.15) so the bloom threshold (0.7) catches it cleanly.
  const stripeSamples = sampleOvalCurve(controlPoints, STRIPE_SAMPLES);
  const stripeProfile = [
    new Vector3(-STRIPE_WIDTH / 2, 0, 0),
    new Vector3(STRIPE_WIDTH / 2, 0, 0),
  ];
  const stripeClosedPath = [...stripeSamples, stripeSamples[0]!];
  const centerStripe = MeshBuilder.ExtrudeShape(
    'center-stripe',
    {
      shape: stripeProfile,
      path: stripeClosedPath,
      sideOrientation: 2 /* DOUBLESIDE */,
    },
    scene,
  );
  centerStripe.position = new Vector3(0, STRIPE_HEIGHT_OFFSET, 0);
  const stripeMat = new StandardMaterial('center-stripe-mat', scene);
  stripeMat.diffuseColor = new Color3(
    STRIPE_EMISSIVE[0] * 0.5,
    STRIPE_EMISSIVE[1] * 0.5,
    STRIPE_EMISSIVE[2] * 0.5,
  );
  stripeMat.emissiveColor = new Color3(...STRIPE_EMISSIVE);
  centerStripe.material = stripeMat;

  // 5. Barrier walls — 24 outer + 24 inner, tangent-aligned. Replaces U6's
  // 4 perimeter walls; gives the track visible rails on both sides.
  // Plan-006 U4 — alternate primary/secondary band colors per segment so
  // barriers read as racetrack kerbs. Materials are shared across all
  // 48 barriers (one per band-color = 4 total StandardMaterial objects).
  const makeKerbMat = (
    name: string,
    rgb: [number, number, number],
  ): StandardMaterial => {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
    return mat;
  };
  const kerbOuterPrimaryMat = makeKerbMat('kerb-outer-primary', KERB_OUTER_PRIMARY);
  const kerbOuterSecondaryMat = makeKerbMat('kerb-outer-secondary', KERB_OUTER_SECONDARY);
  const kerbInnerPrimaryMat = makeKerbMat('kerb-inner-primary', KERB_INNER_PRIMARY);
  const kerbInnerSecondaryMat = makeKerbMat('kerb-inner-secondary', KERB_INNER_SECONDARY);
  for (let i = 0; i < BARRIER_COUNT; i++) {
    const sampleIdx = Math.floor((i * TRACK_SAMPLES) / BARRIER_COUNT);
    const center = samples[sampleIdx]!;
    const tangent = tangentAt(samples, sampleIdx);
    // Perpendicular to tangent in the XZ plane (rotate 90° CW = outward
    // for CCW-traversed curve).
    const outwardX = tangent.z;
    const outwardZ = -tangent.x;
    const yaw = Math.atan2(tangent.x, tangent.z);
    const isPrimaryBand = i % 2 === 0;

    const placeBarrier = (
      name: string,
      offsetX: number,
      offsetZ: number,
      material: StandardMaterial,
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
      box.material = material;
      new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0 }, scene);
    };

    placeBarrier(
      `barrier-outer-${i}`,
      outwardX * BARRIER_OUTWARD_OFFSET,
      outwardZ * BARRIER_OUTWARD_OFFSET,
      isPrimaryBand ? kerbOuterPrimaryMat : kerbOuterSecondaryMat,
    );
    placeBarrier(
      `barrier-inner-${i}`,
      -outwardX * BARRIER_OUTWARD_OFFSET,
      -outwardZ * BARRIER_OUTWARD_OFFSET,
      isPrimaryBand ? kerbInnerPrimaryMat : kerbInnerSecondaryMat,
    );
  }

  // 6. Start/finish line + checkpoint decals. Visual-only (no physics) —
  // U3 wires the lap-detection trigger volumes separately.
  // Plan-006 U6 — checker start line: 4×2 grid of alternating black/white
  // planes covering the original ROAD_WIDTH × 2u footprint. Two shared
  // materials (light/dark) keep allocation flat. Cells are placed in
  // local-space offsets relative to the start sample, then rotated together
  // by yaw so the grid stays aligned with the road tangent.
  const startSample = samples[0]!;
  const startTangent = tangentAt(samples, 0);
  const startYaw = Math.atan2(startTangent.x, startTangent.z);
  const checkerLightMat = new StandardMaterial('checker-light-mat', scene);
  checkerLightMat.diffuseColor = new Color3(...CHECKER_LIGHT);
  const checkerDarkMat = new StandardMaterial('checker-dark-mat', scene);
  checkerDarkMat.diffuseColor = new Color3(...CHECKER_DARK);
  const cellWidth = ROAD_WIDTH / CHECKER_COLS;
  const cellHeight = 2 / CHECKER_ROWS; // total band depth = 2u, like original plane
  // Place each cell relative to the road tangent: stripeAxisX/Z is the
  // road's "across" direction (perpendicular to tangent), and depthAxisX/Z
  // is along the tangent. Cell index → (col, row) offset in local space.
  const acrossX = startTangent.z;
  const acrossZ = -startTangent.x;
  const depthX = startTangent.x;
  const depthZ = startTangent.z;
  for (let row = 0; row < CHECKER_ROWS; row++) {
    for (let col = 0; col < CHECKER_COLS; col++) {
      const cellIdx = row * CHECKER_COLS + col;
      // Standard checkerboard parity: dark when (col + row) is even.
      const isDark = (col + row) % 2 === 0;
      const localAcross = (col - (CHECKER_COLS - 1) / 2) * cellWidth;
      const localDepth = (row - (CHECKER_ROWS - 1) / 2) * cellHeight;
      const cell = MeshBuilder.CreatePlane(
        `start-checker-${cellIdx}`,
        { width: cellWidth, height: cellHeight },
        scene,
      );
      cell.position = new Vector3(
        startSample.x + acrossX * localAcross + depthX * localDepth,
        0.02,
        startSample.z + acrossZ * localAcross + depthZ * localDepth,
      );
      cell.rotation = new Vector3(Math.PI / 2, startYaw, 0);
      cell.material = isDark ? checkerDarkMat : checkerLightMat;
    }
  }

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
  // Visual + physics scale-up. Applied BEFORE PhysicsAggregate so the BOX
  // collider is computed from the scaled bounding box. Skid mark constants
  // in skidMarks.ts are intentionally NOT scaled — adjust there separately
  // if their proportion to the car needs tuning.
  carGeometry.scaling = new Vector3(1.728, 1.728, 1.728);
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

  // Plan-005 U3: skid marks. Sizing (TIRE_WIDTH, REAR_AXLE_HALF_TRACK,
  // REAR_OFFSET) lives in skidMarks.ts — single source of truth. BB
  // derivation was removed after Tripo GLBs returned unreliable extents
  // (sub-meshes registered tiny BBs that didn't match the visual chassis).
  const skidMarks: SkidMarks = createSkidMarks(scene, SKID_LATERAL_SPEED_THRESHOLD);
  // Plan-006 U7: GPU tire-smoke plume. Shares the skid lateral-speed
  // threshold so smoke and skid marks appear together — single visual
  // signal "the player is drifting." Sizing lives in tireSmoke.ts (same
  // top-of-file hardcoded-constant convention as skidMarks; no BB
  // derivation per project memory).
  const tireSmoke: TireSmoke = createTireSmoke(scene, SKID_LATERAL_SPEED_THRESHOLD);

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
  // Plan-006 U5 — capture base FOV so the per-frame pump lerps relative
  // to whatever Babylon (or a future per-car override) set at creation.
  const fovBase = camera.fov ?? Math.PI / 4;

  // Plan-006 U2 — DefaultRenderingPipeline (bloom + FXAA + ACES tonemap).
  // Wired AFTER the camera exists so it can attach to the render path.
  // Pipeline name is unique per scene; HDR enabled so bloom samples the
  // float buffer (bloom on LDR makes the cutoff visibly hard).
  const renderPipeline = new DefaultRenderingPipeline(
    'racetrack-rendering',
    true, // HDR — bloom needs the float buffer to look right
    scene,
    [camera],
  );
  renderPipeline.bloomEnabled = true;
  renderPipeline.bloomThreshold = BLOOM_THRESHOLD;
  renderPipeline.bloomWeight = BLOOM_WEIGHT;
  renderPipeline.bloomKernel = BLOOM_KERNEL;
  renderPipeline.fxaaEnabled = true;
  // ACES Filmic tonemap. ImageProcessingConfiguration in @babylonjs/core
  // exposes TONEMAPPING_ACES = 1 as a static const; using the numeric
  // literal here so the test mock can stay shape-only (no enum import).
  renderPipeline.imageProcessing.toneMappingEnabled = true;
  renderPipeline.imageProcessing.toneMappingType = 1; // ImageProcessingConfiguration.TONEMAPPING_ACES

  // Plan-006 U8 — intro orbit observer state. introOrbitDone fires the
  // onOrbitComplete callback exactly once when the elapsed orbit time
  // exceeds the configured duration. introOrbitStartAlpha snapshots the
  // camera's initial alpha so the orbit rotates relative to the framing
  // chosen at scene init (rather than a hardcoded baseline).
  let introOrbitDone = opts.dev_skipIntro === true;
  const introOrbitStartAlpha = camera.alpha;

  scene.onBeforeRenderObservable.add(() => {
    camera.target.copyFrom(carPivot.position);

    // Intro phase: orbit the camera once around the car, then notify TrackPage.
    // During intro the chase-cam tracking is suspended — the car is
    // stationary anyway (input gated below).
    if (lapState.status === 'intro') {
      const elapsed = performance.now() - introStartMs;
      const progress = Math.min(elapsed / INTRO_ORBIT_DURATION_MS, 1);
      camera.alpha = introOrbitStartAlpha + progress * Math.PI * 2;
      if (progress >= 1 && !introOrbitDone) {
        introOrbitDone = true;
        opts.onOrbitComplete?.();
      }
      return;
    }

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
  // Plan-005 U1: brake state machine closure state. brakeHeldMs accumulates
  // FRAME-DELTA time (engine.getDeltaTime()) while S is held and the car is
  // near-stopped; after BRAKE_TO_REVERSE_HOLD_MS accumulates, reverseMode
  // flips and S applies reverse impulse.
  //
  // Why frame-delta and not wall-clock: code-review #2 caught that
  // performance.now() advances while the browser pauses RAF for a
  // backgrounded tab. With a wall-clock snapshot, alt-tabbing while S is
  // held caused brakeHeldMs to "elapse" during the hidden interval and
  // flip reverseMode on the first post-return tick. Engine getDeltaTime is
  // zero during throttled RAF, so hidden time contributes nothing.
  //
  // W press clears both. S release clears both.
  let brakeHeldMs = 0;
  let reverseMode = false;
  // Plan-006 U8 — hold-W detection during intro. Accumulates frame-delta
  // ONLY while status === 'intro' AND the player holds W/up. Crossing
  // INTRO_HOLD_W_SKIP_MS fires onIntroSkipRequested once; the flag
  // introSkipRequested prevents repeated fires within the same hold.
  let introWHeldMs = 0;
  let introSkipRequested = false;
  scene.onKeyboardObservable.add((kbInfo) => {
    let k = kbInfo.event.key.toLowerCase();
    // Plan-005 U2: KeyboardEvent.key for the space bar is the literal ' '
    // (single space character), not the string 'space'. Without this shim
    // `keys.has('space')` in the per-frame observer never matches and the
    // handbrake feature silently fails. Verified via the UI Events spec.
    if (k === ' ') k = 'space';
    if (kbInfo.type === KeyboardEventTypes.KEYDOWN) keys.add(k);
    else if (kbInfo.type === KeyboardEventTypes.KEYUP) keys.delete(k);
  });
  scene.onBeforeRenderObservable.add(() => {
    // Plan-006 U8 — intro input gate. While the camera is orbiting and
    // the countdown is playing, all driving actions are suppressed.
    // Hold-W detection runs HERE (not in the keyboard observer) so we
    // accumulate per-frame delta rather than wall-clock; matches the
    // brake-state-machine posture documented in plan-005 code-review #2.
    if (lapState.status === 'intro') {
      if (keys.has('w') || keys.has('arrowup')) {
        introWHeldMs += engine.getDeltaTime();
        if (!introSkipRequested && introWHeldMs >= INTRO_HOLD_W_SKIP_MS) {
          introSkipRequested = true;
          opts.onIntroSkipRequested?.();
        }
      } else {
        introWHeldMs = 0;
        introSkipRequested = false;
      }
      return; // no driving impulses, no FOV pump, no grip — car is parked.
    }

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
      brakeHeldMs = 0;
      reverseMode = false;
      // U3 — first W (or arrow-up) press kicks the lap timer off.
      // Reducer no-ops on subsequent throttle while already running.
      dispatch({ type: 'throttle', nowMs: performance.now() });
    }

    // Brake / reverse state machine (Plan-005 U1).
    // Branch A: still moving forward → velocity-proportional brake force.
    // Branch B: near-zero speed → accumulate frame-delta into brakeHeldMs;
    //           when it crosses BRAKE_TO_REVERSE_HOLD_MS, flip reverseMode.
    // If reverseMode is true, apply reverse impulse (tapered cap, same shape
    // as the prior reverse handler).
    // S released → clear both bits of state.
    const frameDeltaMs = engine.getDeltaTime();
    if (keys.has('s') || keys.has('arrowdown')) {
      if (forwardSpeed > BRAKE_REVERSE_SPEED_THRESHOLD) {
        // Velocity-proportional brake, mirrors lateral-grip pattern below.
        // Asymptotically decelerates → no overshoot possible.
        const brakeMag = forwardSpeed * BRAKE_FORCE * CAR_MASS;
        carBody.body.applyImpulse(
          forward.scale(-brakeMag),
          carPivot.absolutePosition,
        );
        brakeHeldMs = 0;
        reverseMode = false;
      } else {
        // Branch B: near-zero speed AND S held — accumulate hold time.
        // Use engine.getDeltaTime() (frame-delta) NOT performance.now()
        // (wall-clock) so a backgrounded tab can't "elapse" the hold
        // during throttled RAF (code-review #2).
        brakeHeldMs += frameDeltaMs;
        if (!reverseMode && brakeHeldMs > BRAKE_TO_REVERSE_HOLD_MS) {
          reverseMode = true;
        }
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
      brakeHeldMs = 0;
      reverseMode = false;
    }

    // Plan-005 U2: handbrake gate. Active when Space is held AND the car
    // is actually moving forward (or backward) above the MIN_SPEED floor.
    // Gating on speed prevents Space + A from spinning the car in place
    // (would conflict with the parking-spot rotation behaviour at zero
    // speed). Derived ONCE here for use in both steering and grip branches.
    const handbrakeActive =
      keys.has('space') && Math.abs(forwardSpeed) > HANDBRAKE_SPEED_THRESHOLD;

    // Steering — yaw rate scales with current speed. STEER_MIN_FACTOR
    // floor keeps parking-spot turning possible at zero speed (so the
    // player can rotate after backing into a wall). Handbrake mode
    // multiplies the final angular velocity by HANDBRAKE_STEER_MULTIPLIER
    // for Mario Kart-style sharper turn-in.
    let steerInput = 0;
    if (keys.has('a') || keys.has('arrowleft')) steerInput -= 1;
    if (keys.has('d') || keys.has('arrowright')) steerInput += 1;
    if (steerInput !== 0) {
      const speedFactor = Math.max(
        STEER_MIN_FACTOR,
        Math.min(1, Math.abs(forwardSpeed) / STEER_FULL_SPEED),
      );
      const handbrakeBoost = handbrakeActive ? HANDBRAKE_STEER_MULTIPLIER : 1;
      const angVel = carBody.body.getAngularVelocity();
      angVel.x = 0;
      angVel.z = 0;
      angVel.y =
        steerInput * STEER_ANGULAR_VELOCITY * speedFactor * handbrakeBoost;
      carBody.body.setAngularVelocity(angVel);
    }

    // Lateral grip — cancel a fraction of sideways drift each frame.
    // Without this, the car slides like a hockey puck through corners.
    // Skip near zero forward speed (parking) to avoid fighting the
    // parking-rotation behaviour. Handbrake mode multiplies the grip
    // coefficient by HANDBRAKE_GRIP_MULTIPLIER (~0.13) so the car
    // actually slides sideways instead of staying glued to its facing.
    if (Math.abs(forwardSpeed) > 0.5 && Math.abs(lateralSpeed) > 0.01) {
      const gripCoeff =
        LATERAL_GRIP_PER_FRAME * (handbrakeActive ? HANDBRAKE_GRIP_MULTIPLIER : 1);
      const lateralImpulse = new Vector3(
        -rightX * lateralSpeed * gripCoeff * CAR_MASS,
        0,
        -rightZ * lateralSpeed * gripCoeff * CAR_MASS,
      );
      carBody.body.applyImpulse(lateralImpulse, carPivot.absolutePosition);
    }

    // Plan-006 U5 — FOV pump. Lerp camera FOV toward base + (speedRatio *
    // delta) so the camera kinetically "leans into" speed. clamp(speedRatio)
    // keeps reverse contribution out of the pump (negative speeds reduce
    // FOV which feels wrong). Sits at the tail of this observer so it
    // shares the already-computed forwardSpeed; no second velocity read.
    if (camera.fov !== undefined) {
      const speedRatio = Math.min(Math.max(forwardSpeed / MAX_FORWARD_SPEED, 0), 1);
      const targetFov = fovBase + speedRatio * FOV_PUMP_DELTA;
      camera.fov = camera.fov + (targetFov - camera.fov) * FOV_LERP_RATE;
    }
  });

  // 10. U3 — lap state machine + per-frame trigger volume checks.
  // KTD-4 fallback (R-r4/AA-3): distance-based plane-intersection rather
  // than Havok trigger-volume observers. Cheaper to wire, deterministic,
  // works the same downstream.
  // Plan-006 U8: mount in `intro` state (or skip to `waiting` for tests
  // that pass dev_skipIntro). introStartedAtMs is set so the React layer
  // can display elapsed time.
  const introStartMs = performance.now();
  let lapState: LapState = opts.dev_skipIntro
    ? lapReducer(initialLapState(introStartMs), { type: 'introComplete' })
    : initialLapState(introStartMs);
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

  // Plan-006 review — hoisted scratch buffer to avoid 60 allocs/sec.
  const skidPredictedPos = new Vector3(0, 0, 0);
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

    // Plan-005 U3: skid mark emission. Same velocity decomposition as the
    // input observer above — recomputed locally rather than sharing a
    // closure variable so one observer can be removed or refactored without
    // breaking the other (the 5-line cost is cheap). Variable names match
    // the input observer for visual parallel. Code-review #11.
    const velocity = carBody.body.getLinearVelocity();
    const forward = carPivot.getDirection(Vector3.Forward());
    const rightX = forward.z;
    const rightZ = -forward.x;
    const lateralSpeed = velocity.x * rightX + velocity.z * rightZ;
    // Velocity compensation: predict the car's position one frame ahead so
    // the trail vertex lands where the rear wheel WILL be when render fires,
    // not where it WAS when the physics step finished. At 60fps, dt = 1/60s.
    // Without this, the trail visibly lags by one frame's worth of motion
    // (~0.47 u at MAX_FORWARD_SPEED=28) — the trail emits "behind" the car
    // instead of "from" the wheels.
    const FRAME_DT = 1 / 60;
    skidPredictedPos.x = carPivot.position.x + velocity.x * FRAME_DT;
    skidPredictedPos.y = carPivot.position.y;
    skidPredictedPos.z = carPivot.position.z + velocity.z * FRAME_DT;
    skidMarks.tick(skidPredictedPos, forward, lateralSpeed);
    // Plan-006 U7 — tire smoke shares the same anchor + lateral-speed
    // signal as the skid marks above. Uses the predicted position so the
    // smoke origin tracks the wheel rather than lagging one frame behind.
    // The 4th arg is the "intentional drift" gate: Space pressed AND
    // moving. Without this, smoke kept spawning for ~1s after the player
    // released Space because the car's physical lateralSpeed takes time
    // to settle below threshold. Skid marks intentionally don't share this
    // gate — physical tire scrub is exactly when marks SHOULD appear.
    const intentionalDrift = keys.has('space');
    tireSmoke.tick(skidPredictedPos, forward, lateralSpeed, intentionalDrift);
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
    // Plan-005 U3 — clear all skid trails on Retry (R10 / AE6). Done before
    // the lap-state dispatch so a downstream consumer that responds to the
    // reset can rely on the visual state being clean.
    skidMarks.reset();
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
  // Code-review #1: clear the `keys` Set when the canvas loses focus.
  // Without this, holding any drive key (especially Space → handbrake)
  // and alt-tabbing leaves the key string in the Set indefinitely —
  // Babylon's onKeyboardObservable never fires KEYUP for blur-cancelled
  // keys, so the car stays in handbrake/throttle/brake state until the
  // player manually re-presses + releases the key. Clearing on blur is
  // safe because no keys are physically being held when focus is lost.
  const onBlur = () => keys.clear();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
  }
  if (typeof opts.canvas.addEventListener === 'function') {
    opts.canvas.addEventListener('blur', onBlur);
  }

  return {
    engine,
    scene,
    reset,
    // Plan-006 U8 — TrackPage dispatches these in response to the React
    // countdown's onComplete and to onIntroSkipRequested. The scene owns
    // the reducer; TrackPage is just relaying user/timer events into it.
    dispatchIntroComplete: () => {
      dispatch({ type: 'introComplete' });
    },
    dispatchIntroSkip: () => {
      dispatch({ type: 'introSkip' });
    },
    dispose: () => {
      // Plan-006 review fix — stop the render loop FIRST so no frame fires
      // against a half-disposed pipeline / particle system / scene. The
      // implicit stop inside engine.dispose() at the end of this block
      // happens too late.
      engine.stopRenderLoop();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize);
      }
      if (typeof opts.canvas.removeEventListener === 'function') {
        opts.canvas.removeEventListener('blur', onBlur);
      }
      // Dispose skidMarks before scene.dispose() so its material + meshes
      // unregister cleanly from the still-live scene rather than fighting
      // the scene teardown. Same posture for the render pipeline: detach
      // it from the camera explicitly so a carousel switch doesn't leak
      // the post-process render targets onto the next scene.
      renderPipeline.dispose();
      skidMarks.dispose();
      tireSmoke.dispose();
      carContainer.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
