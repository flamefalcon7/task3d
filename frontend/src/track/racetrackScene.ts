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

const HAVOK_WASM_PATH = '/HavokPhysics.wasm';

export interface RacetrackSceneOptions {
  canvas: HTMLCanvasElement;
  carGlbBytes: Uint8Array;
}

export interface RacetrackSceneHandles {
  engine: Engine;
  scene: Scene;
  dispose: () => void;
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
const BARRIER_OUTWARD_OFFSET = 8; // perpendicular distance from road center
const SAFETY_GROUND_SIZE = 200; // wide invisible floor as fallback if car flies off
const WALL_HEIGHT = 4;
const CAR_MASS = 1500;
const FORWARD_IMPULSE = 50;
const REVERSE_IMPULSE = 30;
// KTD-1: steer drives the body's Y angular velocity directly (rad/s when
// keys held). Replaces U6's mesh.rotate(STEER_RATE) which fought Havok's
// own angular velocity and accumulated runaway spin.
const STEER_ANGULAR_VELOCITY = 2.2;
// KTD-1: damping so the car coasts to a stop after key release instead of
// sliding/spinning forever on a frictionless plane.
const LINEAR_DAMPING = 0.2;
const ANGULAR_DAMPING = 0.6;
const CHASE_RADIUS = 15;

export async function createRacetrackScene(
  opts: RacetrackSceneOptions,
): Promise<RacetrackSceneHandles> {
  const engine = new Engine(opts.canvas, true);
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

  // 5. Load car GLB from bytes. Wrap the Uint8Array in a Blob + object URL
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

  // 6. Chase camera — ArcRotateCamera tracks the pivot each frame. Not
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
  });

  // 7. WASD / arrow-key input. Accumulate held keys in a Set so multi-key
  // (W+A = forward-left) works without state machine. Forward/reverse stay
  // as impulses applied along the pivot's facing direction. Steer drives
  // the body's Y angular velocity directly (KTD-1) — never mesh.rotate,
  // which would fight Havok's own integration and accumulate spin.
  const keys = new Set<string>();
  scene.onKeyboardObservable.add((kbInfo) => {
    const k = kbInfo.event.key.toLowerCase();
    if (kbInfo.type === KeyboardEventTypes.KEYDOWN) keys.add(k);
    else if (kbInfo.type === KeyboardEventTypes.KEYUP) keys.delete(k);
  });
  scene.onBeforeRenderObservable.add(() => {
    const forward = carPivot.getDirection(Vector3.Forward());
    if (keys.has('w') || keys.has('arrowup')) {
      carBody.body.applyImpulse(
        forward.scale(FORWARD_IMPULSE),
        carPivot.absolutePosition,
      );
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      carBody.body.applyImpulse(
        forward.scale(-REVERSE_IMPULSE),
        carPivot.absolutePosition,
      );
    }
    let steerInput = 0;
    if (keys.has('a') || keys.has('arrowleft')) steerInput -= 1;
    if (keys.has('d') || keys.has('arrowright')) steerInput += 1;
    if (steerInput !== 0) {
      // KTD-1: drive Y angular velocity directly. Held key = constant turn
      // rate; release = angular damping decays the spin.
      const angVel = carBody.body.getAngularVelocity();
      angVel.x = 0;
      angVel.z = 0;
      angVel.y = steerInput * STEER_ANGULAR_VELOCITY;
      carBody.body.setAngularVelocity(angVel);
    }
  });

  engine.runRenderLoop(() => scene.render());
  const onResize = () => engine.resize();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onResize);
  }

  return {
    engine,
    scene,
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
