import { describe, expect, it, vi } from 'vitest';

// Mock just Vector3 — the math module is otherwise Babylon-free, so we
// avoid pulling in the whole Babylon mock surface from racetrackScene.test.
vi.mock('@babylonjs/core', () => ({
  Vector3: class {
    constructor(public x = 0, public y = 0, public z = 0) {}
  },
}));

// Import AFTER vi.mock so the SUT picks up the mock.
import {
  buildOvalControlPoints,
  perimeter,
  sampleOvalCurve,
  tangentAt,
} from './oval';

describe('buildOvalControlPoints', () => {
  it('returns 8 control points laid out as a rounded rectangle', () => {
    const points = buildOvalControlPoints(80, 50, 12);
    expect(points).toHaveLength(8);
    // All points lie in the XZ plane (Y = 0).
    for (const p of points) {
      expect(p.y).toBe(0);
    }
  });

  it('places points symmetrically around the origin', () => {
    const points = buildOvalControlPoints(80, 50, 12);
    const xSum = points.reduce((acc, p) => acc + p.x, 0);
    const zSum = points.reduce((acc, p) => acc + p.z, 0);
    // Rounded rectangle is symmetric — centroid should sit at origin.
    expect(Math.abs(xSum)).toBeLessThan(1e-9);
    expect(Math.abs(zSum)).toBeLessThan(1e-9);
  });

  it('first and last points differ but both sit on the east straight', () => {
    // The plan calls out the closed-loop semantics — first and last control
    // points are distinct (no duplication), but cyclically adjacent.
    const points = buildOvalControlPoints(80, 50, 12);
    expect(points[0]).not.toEqual(points[7]);
    // Both p0 and p7 are on the east-side wall, just at opposite Z extents.
    // p0 is the bottom-east corner exit; p7 is the south-east straight end.
    expect(points[0]!.x).toBe(40);
    expect(points[7]!.x).toBeLessThan(40);
  });
});

describe('sampleOvalCurve', () => {
  it('returns the requested sample count for an 8-point control polygon', () => {
    const points = buildOvalControlPoints(80, 50, 12);
    const samples = sampleOvalCurve(points, 80);
    expect(samples).toHaveLength(80);
  });

  it('every sample lies in the XZ plane', () => {
    const points = buildOvalControlPoints(80, 50, 12);
    const samples = sampleOvalCurve(points, 80);
    for (const s of samples) {
      expect(s.y).toBe(0);
    }
  });

  it('perimeter is in the target range for the track config (35×50, r=10 → ~150 units)', () => {
    // Track dims chosen so a lap is ~25s at U6's FORWARD_IMPULSE tuning,
    // mirroring the plan's target lap-length budget. Bounds intentionally
    // wide enough to absorb Catmull-Rom curvature variance.
    const points = buildOvalControlPoints(35, 50, 10);
    const samples = sampleOvalCurve(points, 80);
    const p = perimeter(samples);
    expect(p).toBeGreaterThan(120);
    expect(p).toBeLessThan(180);
  });
});

describe('tangentAt', () => {
  it('tangent vectors have unit length', () => {
    const points = buildOvalControlPoints(80, 50, 12);
    const samples = sampleOvalCurve(points, 80);
    const t = tangentAt(samples, 10);
    expect(Math.hypot(t.x, t.z)).toBeCloseTo(1.0, 5);
  });

  it('tangent at quarter-arc is approximately perpendicular to tangent at start (square track)', () => {
    // Square (width === length) makes the quarter-arc rotation exactly 90°
    // around the curve, so the dot product between the two tangents should
    // be near zero. Elongated ovals weaken this assertion — we use square.
    const points = buildOvalControlPoints(50, 50, 12);
    const samples = sampleOvalCurve(points, 80);
    const t0 = tangentAt(samples, 0);
    const tQuarter = tangentAt(samples, 20);
    const dot = t0.x * tQuarter.x + t0.z * tQuarter.z;
    expect(Math.abs(dot)).toBeLessThan(0.3);
  });

  it('tangent direction stays continuous (no sign flips between adjacent samples)', () => {
    // Adjacent tangents should be nearly parallel since the curve is smooth.
    const points = buildOvalControlPoints(80, 50, 12);
    const samples = sampleOvalCurve(points, 80);
    const t0 = tangentAt(samples, 5);
    const t1 = tangentAt(samples, 6);
    const dot = t0.x * t1.x + t0.z * t1.z;
    expect(dot).toBeGreaterThan(0.9);
  });
});
