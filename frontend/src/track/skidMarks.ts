// Plan-005 U3 — twin rear-tire ribbons. Two narrow parallel stripes (left and
// right rear wheel) behind the car when lateral velocity exceeds a threshold.
//
// Why dispose-and-recreate (KTD-3): `MeshBuilder.ExtrudeShape({updatable,
// instance})` in @babylonjs/core@9.7.0 only supports same-length path updates
// (`ribbonBuilder.js:277-314` loops over `min(oldLen, newLen)`, silently
// truncating new vertices). Growing a ribbon by appending points requires
// recreating the mesh each growth tick.
//
// SIZING — single source of truth. Adjust these three constants to dial in
// the look; no BB derivation, no fallback layer, no options struct. Tripo
// GLB bounding boxes were unreliable in practice (sub-meshes returned tiny
// extents that didn't match the visual chassis), so we hardcode values
// matched to the typical visual car size at this scene scale.
const TIRE_WIDTH = 0.10;
const REAR_AXLE_HALF_TRACK = 0.35;
// Distance from pivot center where the trail is emitted, measured along the
// car's forward direction. POSITIVE = in front of pivot, NEGATIVE = behind.
// User-requested: positive value to emit in front of the car (under "front
// wheels"); flip to negative if rear-wheel trails are wanted.
const WHEEL_OFFSET = 0.5;

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

// FIFO cap on segment PAIRS (each pair = one left + one right ribbon).
const MAX_SEGMENT_PAIRS = 12;

// Min distance the car must move before appending a new locked vertex.
// Tracked at the axle CENTER so both stripes get vertices in lockstep and
// stay visually parallel. 0.3 u keeps the trail-end within ~7% of car
// length of the current rear wheel position.
const MIN_VERTEX_DISTANCE = 0.3;

// Tiny lift above road surface to avoid z-fighting with the asphalt ribbon.
const SKID_Y_OFFSET = 0.05;

export interface SkidMarks {
  tick(carPosition: Vector3, carForward: Vector3, lateralSpeed: number): void;
  reset(): void;
  dispose(): void;
}

export function createSkidMarks(
  scene: Scene,
  lateralSpeedThreshold: number,
): SkidMarks {
  // Flat black for tire-rubber realism, fully opaque for chase-cam visibility.
  const skidMat = new StandardMaterial('skidMat', scene);
  skidMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
  skidMat.specularColor = new Color3(0, 0, 0);
  skidMat.alpha = 1.0;

  // Cross-section for each tire ribbon: a 2-point line in local X.
  const shape = [
    new Vector3(-TIRE_WIDTH / 2, 0, 0),
    new Vector3(TIRE_WIDTH / 2, 0, 0),
  ];

  // Committed pairs. Each entry is [leftMesh, rightMesh] so FIFO disposes
  // both at once — they're visually coupled and never live half-alive.
  const segmentPairs: Array<[Mesh, Mesh]> = [];
  let currentPaths: [Vector3[], Vector3[]] | null = null;
  let currentMeshes: [Mesh, Mesh] | null = null;
  let lastEmitPos: Vector3 | null = null; // axle center, not per-tire
  let segmentCounter = 0;
  let disposed = false;

  function axleCenter(carPosition: Vector3, carForward: Vector3): Vector3 {
    // Positive WHEEL_OFFSET emits in front of pivot; negative emits behind.
    return new Vector3(
      carPosition.x + carForward.x * WHEEL_OFFSET,
      SKID_Y_OFFSET,
      carPosition.z + carForward.z * WHEEL_OFFSET,
    );
  }

  function rearPoints(
    carPosition: Vector3,
    carForward: Vector3,
  ): [Vector3, Vector3] {
    const center = axleCenter(carPosition, carForward);
    // Right vector in XZ (Babylon left-handed, +X right, +Z forward).
    // forward=(0,0,1) → right=(1,0,0).
    const rightX = carForward.z;
    const rightZ = -carForward.x;
    return [
      new Vector3(
        center.x - rightX * REAR_AXLE_HALF_TRACK,
        SKID_Y_OFFSET,
        center.z - rightZ * REAR_AXLE_HALF_TRACK,
      ),
      new Vector3(
        center.x + rightX * REAR_AXLE_HALF_TRACK,
        SKID_Y_OFFSET,
        center.z + rightZ * REAR_AXLE_HALF_TRACK,
      ),
    ];
  }

  function discardCurrentMeshes(): void {
    if (currentMeshes) {
      currentMeshes[0].dispose();
      currentMeshes[1].dispose();
      currentMeshes = null;
    }
  }

  function commitCurrentSegment(): void {
    if (currentMeshes) {
      segmentPairs.push(currentMeshes);
      currentMeshes = null;
      if (segmentPairs.length > MAX_SEGMENT_PAIRS) {
        const oldest = segmentPairs.shift();
        if (oldest) {
          oldest[0].dispose();
          oldest[1].dispose();
        }
      }
    }
    currentPaths = null;
    lastEmitPos = null;
  }

  function rebuildCurrentMeshes(): void {
    if (!currentPaths || currentPaths[0].length < 2) return;
    discardCurrentMeshes();
    segmentCounter += 1;
    const left = MeshBuilder.ExtrudeShape(
      `skid-segment-${segmentCounter}-L`,
      { shape, path: currentPaths[0], sideOrientation: 2 /* DOUBLESIDE */ },
      scene,
    );
    const right = MeshBuilder.ExtrudeShape(
      `skid-segment-${segmentCounter}-R`,
      { shape, path: currentPaths[1], sideOrientation: 2 /* DOUBLESIDE */ },
      scene,
    );
    left.material = skidMat;
    right.material = skidMat;
    currentMeshes = [left, right];
  }

  function tick(
    carPosition: Vector3,
    carForward: Vector3,
    lateralSpeed: number,
  ): void {
    if (disposed) return;
    const emitting = Math.abs(lateralSpeed) > lateralSpeedThreshold;

    if (emitting) {
      const [leftRear, rightRear] = rearPoints(carPosition, carForward);
      const center = axleCenter(carPosition, carForward);
      if (currentPaths === null) {
        currentPaths = [[leftRear], [rightRear]];
        lastEmitPos = center;
      } else {
        if (lastEmitPos === null) {
          throw new Error(
            'skidMarks invariant violation: currentPaths set but lastEmitPos is null',
          );
        }
        const dx = center.x - lastEmitPos.x;
        const dz = center.z - lastEmitPos.z;
        if (Math.hypot(dx, dz) >= MIN_VERTEX_DISTANCE) {
          currentPaths[0].push(leftRear);
          currentPaths[1].push(rightRear);
          lastEmitPos = center;
          rebuildCurrentMeshes();
        }
      }
    } else if (currentPaths !== null) {
      commitCurrentSegment();
    }
  }

  function reset(): void {
    discardCurrentMeshes();
    currentPaths = null;
    lastEmitPos = null;
    for (const [l, r] of segmentPairs) {
      l.dispose();
      r.dispose();
    }
    segmentPairs.length = 0;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    reset();
    skidMat.dispose();
  }

  return { tick, reset, dispose };
}
