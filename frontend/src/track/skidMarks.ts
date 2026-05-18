// Plan-005 U3 — dispose-and-recreate ribbon trails behind the car when
// lateral velocity exceeds a threshold. Emission is gated by lateral speed
// (not handbrake state) so natural-drift hot corners produce marks too.
//
// Why dispose-and-recreate (KTD-3): `MeshBuilder.ExtrudeShape({updatable,
// instance})` in @babylonjs/core@9.7.0 only supports same-length path
// updates — `ribbonBuilder.js:277-314` loops over `min(oldLen, newLen)`,
// silently truncating new vertices. Growing a ribbon by appending points
// requires recreating the mesh each growth tick. At MIN_VERTEX_DISTANCE =
// 0.5 u and MAX_FORWARD_SPEED = 18 u/s, the gate fires at ~30 Hz per active
// segment — Babylon handles this trivially.

import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';

// FIFO cap; when finalizing would push the array past the cap, dispose
// the oldest. 12 segments comfortably covers a drift-heavy lap without
// accumulating mesh count.
const MAX_SEGMENTS = 12;

// Ribbon cross-section width (rear-axle approximation). 1.2 u over a 14 u
// road reads as a single rear-axle stripe rather than per-wheel trails.
// Per-wheel trails are deferred to v1.1 per plan-005 KTD-5.
const SEGMENT_WIDTH = 1.2;

// Minimum distance the car must move before a new vertex is appended to
// the active path. Prevents duplicate-point bloat when stationary at
// threshold AND bounds the dispose/recreate cadence — code-review #4
// (PERF-002) flagged the original 0.5 producing ~30 Hz GC churn during
// sustained drift; bumping to 1.0 halves it to ~15 Hz with no visible
// quality loss at chase-cam distance (the car still emits 4-5 vertices
// across a typical corner). At MAX_FORWARD_SPEED = 18 u/s and 60fps,
// car moves 0.3 u/frame → vertex every ~3 frames.
const MIN_VERTEX_DISTANCE = 1.0;

// Tiny lift above road surface to avoid z-fighting with the asphalt
// ribbon. The road sits at y=0; this lifts skid marks to y=0.05.
const SKID_Y_OFFSET = 0.05;

// Fallback rear-offset (distance behind car center where the trail
// originates) when bounding-box inspection fails or returns degenerate
// extents. ~1.5 u puts the trail behind a typical Tripo car's chassis.
const REAR_OFFSET_FALLBACK = 1.5;

export interface SkidMarks {
  tick(carPosition: Vector3, carForward: Vector3, lateralSpeed: number): void;
  reset(): void;
  dispose(): void;
}

export interface SkidMarksOptions {
  /**
   * If provided AND non-degenerate, this is used as the rear-offset
   * distance. The orchestrator computes it from the car's bounding box
   * at scene init (e.g., `~0.5 × carGeometry.getBoundingInfo().boundingBox.extendSize.z`)
   * and passes it in. Pass `null` or omit to use REAR_OFFSET_FALLBACK.
   */
  rearOffset?: number | null;
}

export function createSkidMarks(
  scene: Scene,
  lateralSpeedThreshold: number,
  options: SkidMarksOptions = {},
): SkidMarks {
  // Validate the optional rear-offset against degenerate extents (R-r6).
  const rearOffset =
    options.rearOffset != null &&
    Number.isFinite(options.rearOffset) &&
    options.rearOffset > 0.1
      ? options.rearOffset
      : REAR_OFFSET_FALLBACK;

  // Shared material so finalized segments don't churn GPU state.
  const skidMat = new StandardMaterial('skidMat', scene);
  skidMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
  skidMat.specularColor = new Color3(0, 0, 0);
  skidMat.alpha = 0.8;

  // Cross-section for the ribbon: a horizontal 2-point line in local X.
  // Extruded along the dynamic path, this gives us a flat ribbon SEGMENT_WIDTH
  // wide hugging the road surface.
  const shape = [
    new Vector3(-SEGMENT_WIDTH / 2, 0, 0),
    new Vector3(SEGMENT_WIDTH / 2, 0, 0),
  ];

  const segments: Mesh[] = [];
  let currentPath: Vector3[] | null = null;
  let currentMesh: Mesh | null = null;
  let lastEmitPos: Vector3 | null = null;
  let segmentCounter = 0; // monotonic id for mesh names (debugging aid)
  let disposed = false;

  function rearPoint(carPosition: Vector3, carForward: Vector3): Vector3 {
    return new Vector3(
      carPosition.x - carForward.x * rearOffset,
      SKID_Y_OFFSET,
      carPosition.z - carForward.z * rearOffset,
    );
  }

  // Discards the in-flight mesh (typically right before rebuilding it with a
  // longer path). Does NOT save to segments — caller wants the mesh gone.
  function discardCurrentMesh(): void {
    if (currentMesh) {
      currentMesh.dispose();
      currentMesh = null;
    }
  }

  // Commits the in-flight mesh to the segments array (preserving it for the
  // remainder of the lap) and clears all in-flight state. Enforces FIFO cap.
  function commitCurrentSegment(): void {
    if (currentMesh) {
      segments.push(currentMesh);
      currentMesh = null;
      // FIFO cap — if pushing put us past MAX_SEGMENTS, dispose the oldest.
      if (segments.length > MAX_SEGMENTS) {
        const oldest = segments.shift();
        if (oldest) oldest.dispose();
      }
    }
    currentPath = null;
    lastEmitPos = null;
  }

  // Tear down the in-flight mesh (if any) and recreate it from the current
  // path. "Rebuild" not "regrow" — the previous mesh is destroyed; Babylon
  // 9.7.0's `MeshBuilder.ExtrudeShape({updatable, instance})` silently
  // truncates path growth (see header comment). Per-tick churn is bounded
  // at ~30 Hz per active segment by MIN_VERTEX_DISTANCE.
  function rebuildCurrentMesh(): void {
    if (!currentPath || currentPath.length < 2) return;
    discardCurrentMesh();
    segmentCounter += 1;
    const mesh = MeshBuilder.ExtrudeShape(
      `skid-segment-${segmentCounter}`,
      {
        shape,
        path: currentPath,
        sideOrientation: 2 /* DOUBLESIDE */,
      },
      scene,
    );
    mesh.material = skidMat;
    currentMesh = mesh;
  }

  function tick(
    carPosition: Vector3,
    carForward: Vector3,
    lateralSpeed: number,
  ): void {
    if (disposed) return;
    const emitting = Math.abs(lateralSpeed) > lateralSpeedThreshold;
    const rear = rearPoint(carPosition, carForward);

    if (emitting) {
      if (currentPath === null) {
        // Start a new segment. Mesh creation defers until path has 2 points.
        currentPath = [rear];
        lastEmitPos = rear;
      } else {
        // Code-review #10 defensive assert: currentPath and lastEmitPos are
        // set + cleared as a pair (here, in commitCurrentSegment, and in
        // reset). If they ever desync, distance-gate math breaks silently.
        // Throw loudly instead of falling through to a `return` branch.
        if (lastEmitPos === null) {
          throw new Error(
            'skidMarks invariant violation: currentPath set but lastEmitPos is null',
          );
        }
        const dx = rear.x - lastEmitPos.x;
        const dz = rear.z - lastEmitPos.z;
        if (Math.hypot(dx, dz) >= MIN_VERTEX_DISTANCE) {
          currentPath.push(rear);
          lastEmitPos = rear;
          rebuildCurrentMesh();
        }
      }
    } else if (currentPath !== null) {
      commitCurrentSegment();
    }
  }

  function reset(): void {
    // Discard the in-flight segment (don't commit — Retry shouldn't keep
    // half-formed trails) and all committed segments.
    discardCurrentMesh();
    currentPath = null;
    lastEmitPos = null;
    for (const seg of segments) seg.dispose();
    segments.length = 0;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    reset();
    skidMat.dispose();
  }

  return { tick, reset, dispose };
}
