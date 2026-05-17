// Plan-004 U2 — pure-math helpers for the procedural oval track.
//
// Kept Babylon-free except for using Vector3 as a value type, so the math
// stays unit-testable without a WebGL context or full Babylon mock.
// racetrackScene.ts owns the integration: feeds the sampled curve into
// MeshBuilder.ExtrudeShape for the road ribbon and uses the tangent
// helpers to orient barrier boxes along the curve.

import { Vector3 } from '@babylonjs/core';

/**
 * 8 control points laid out as a rounded rectangle in the XZ plane (Y=0).
 * Two control points per corner mark the entry and exit of each rounded
 * transition. Going counter-clockwise viewed from +Y (Babylon's default).
 *
 *                z+
 *          p3 ───── p2
 *        /             \
 *       p4              p1
 *       │                │
 *       │   (origin)     │
 *       │                │
 *       p5              p0
 *        \             /
 *          p6 ───── p7
 *                z-
 */
export function buildOvalControlPoints(
  width: number,
  length: number,
  cornerRadius: number,
): Vector3[] {
  const halfW = width / 2;
  const halfL = length / 2;
  const r = cornerRadius;
  return [
    new Vector3(halfW, 0, -(halfL - r)), // p0: east straight, bottom
    new Vector3(halfW, 0, halfL - r), // p1: east straight, top
    new Vector3(halfW - r, 0, halfL), // p2: north straight, right
    new Vector3(-(halfW - r), 0, halfL), // p3: north straight, left
    new Vector3(-halfW, 0, halfL - r), // p4: west straight, top
    new Vector3(-halfW, 0, -(halfL - r)), // p5: west straight, bottom
    new Vector3(-(halfW - r), 0, -halfL), // p6: south straight, left
    new Vector3(halfW - r, 0, -halfL), // p7: south straight, right
  ];
}

/**
 * Sample a closed Catmull-Rom spline through the given control points.
 * Returns `samples` Vector3s in order along the curve, closing back to
 * start (sample[samples-1] connects to sample[0]).
 *
 * We do the math inline rather than calling `Curve3.CreateCatmullRomSpline`
 * so this stays a pure module — no Babylon runtime needed in tests, no
 * dependency on Babylon's spline behavior staying stable across versions.
 */
export function sampleOvalCurve(
  controlPoints: Vector3[],
  samples: number,
): Vector3[] {
  const n = controlPoints.length;
  const segmentSamples = Math.floor(samples / n);
  const result: Vector3[] = [];
  for (let seg = 0; seg < n; seg++) {
    const p0 = controlPoints[(seg - 1 + n) % n]!;
    const p1 = controlPoints[seg]!;
    const p2 = controlPoints[(seg + 1) % n]!;
    const p3 = controlPoints[(seg + 2) % n]!;
    for (let i = 0; i < segmentSamples; i++) {
      const t = i / segmentSamples;
      result.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }
  return result;
}

function catmullRomPoint(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  t: number,
): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  // Standard uniform Catmull-Rom basis (tension 0.5).
  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const z =
    0.5 *
    (2 * p1.z +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
  return new Vector3(x, 0, z);
}

/**
 * Unit tangent at the given sample index, computed via central difference
 * between neighboring samples. Loops cyclically at boundaries.
 * Tangent points in the direction of travel along the curve (CCW).
 */
export function tangentAt(samples: Vector3[], index: number): Vector3 {
  const n = samples.length;
  const next = samples[(index + 1) % n]!;
  const prev = samples[(index - 1 + n) % n]!;
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return new Vector3(0, 0, 1);
  return new Vector3(dx / len, 0, dz / len);
}

/**
 * Sum of segment lengths around the closed sampled curve. Useful for
 * sizing test bounds and tuning track perimeter for target lap time.
 */
export function perimeter(samples: Vector3[]): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i]!;
    const b = samples[(i + 1) % samples.length]!;
    p += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return p;
}
