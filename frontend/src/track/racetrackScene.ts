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
  Vector3,
} from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/loaders/glTF/index.js';
import HavokPhysics from '@babylonjs/havok';

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
const TRACK_SIZE = 200;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 1;
const CAR_MASS = 1500;
const FORWARD_IMPULSE = 50;
const REVERSE_IMPULSE = 30;
const STEER_RATE = 0.03;
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

  // 3. Track ground (200×200 unit plane, static box collider).
  const ground = MeshBuilder.CreateGround(
    'ground',
    { width: TRACK_SIZE, height: TRACK_SIZE },
    scene,
  );
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = new Color3(0.25, 0.45, 0.25);
  ground.material = groundMat;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

  // 4. Four perimeter walls — mass:0 = static so the car bounces off them.
  // Positioned with their inner face flush against the ±TRACK_SIZE/2 edges.
  const half = TRACK_SIZE / 2;
  const wallSpecs: Array<{
    name: string;
    size: { width: number; height: number; depth: number };
    position: Vector3;
  }> = [
    {
      name: 'wall-north',
      size: { width: TRACK_SIZE, height: WALL_HEIGHT, depth: WALL_THICKNESS },
      position: new Vector3(0, WALL_HEIGHT / 2, half),
    },
    {
      name: 'wall-south',
      size: { width: TRACK_SIZE, height: WALL_HEIGHT, depth: WALL_THICKNESS },
      position: new Vector3(0, WALL_HEIGHT / 2, -half),
    },
    {
      name: 'wall-east',
      size: { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: TRACK_SIZE },
      position: new Vector3(half, WALL_HEIGHT / 2, 0),
    },
    {
      name: 'wall-west',
      size: { width: WALL_THICKNESS, height: WALL_HEIGHT, depth: TRACK_SIZE },
      position: new Vector3(-half, WALL_HEIGHT / 2, 0),
    },
  ];
  const wallMat = new StandardMaterial('wallMat', scene);
  wallMat.diffuseColor = new Color3(0.6, 0.6, 0.65);
  for (const spec of wallSpecs) {
    const wall = MeshBuilder.CreateBox(spec.name, spec.size, scene);
    wall.position.copyFrom(spec.position);
    wall.material = wallMat;
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }

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
  const car = carContainer.meshes[0]!;
  car.position = new Vector3(0, 1, 0);
  const carBody = new PhysicsAggregate(
    car,
    PhysicsShapeType.BOX,
    { mass: CAR_MASS },
    scene,
  );

  // 6. Chase camera — ArcRotateCamera tracks car.position each frame. Not
  // attaching control on purpose: we want WASD to drive, not orbit drag.
  const camera = new ArcRotateCamera(
    'chase',
    -Math.PI / 2,
    Math.PI / 3,
    CHASE_RADIUS,
    car.position.clone(),
    scene,
  );
  scene.onBeforeRenderObservable.add(() => {
    camera.target.copyFrom(car.position);
  });

  // 7. WASD / arrow-key input. Accumulate held keys in a Set so multi-key
  // (W+A = forward-left) works without state machine. Apply impulses each
  // frame; steer by yaw-rotating the mesh (the body follows because the
  // aggregate is bound to the mesh's transform node).
  const keys = new Set<string>();
  scene.onKeyboardObservable.add((kbInfo) => {
    const k = kbInfo.event.key.toLowerCase();
    if (kbInfo.type === KeyboardEventTypes.KEYDOWN) keys.add(k);
    else if (kbInfo.type === KeyboardEventTypes.KEYUP) keys.delete(k);
  });
  scene.onBeforeRenderObservable.add(() => {
    const forward = car.getDirection(Vector3.Forward());
    if (keys.has('w') || keys.has('arrowup')) {
      carBody.body.applyImpulse(
        forward.scale(FORWARD_IMPULSE),
        car.absolutePosition,
      );
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      carBody.body.applyImpulse(
        forward.scale(-REVERSE_IMPULSE),
        car.absolutePosition,
      );
    }
    if (keys.has('a') || keys.has('arrowleft')) {
      car.rotate(Vector3.Up(), -STEER_RATE);
    }
    if (keys.has('d') || keys.has('arrowright')) {
      car.rotate(Vector3.Up(), STEER_RATE);
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
