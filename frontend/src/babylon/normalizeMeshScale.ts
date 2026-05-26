import { type AbstractMesh, Vector3 } from '@babylonjs/core';

// Safety bounds (plan-013 review, adversarial reviewer). A degenerate Tripo
// mesh (sub-millimeter or sub-nanometer extents from a broken segmentation
// pass) would produce target/longest = thousands → millions, which then
// feeds Havok's BOX collider as a scale of e.g. 2800 and either decomposes
// to NaN or makes a wafer collider with full car mass. Either breaks the
// game silently. The clamp range is generous — anything tighter starts
// reshaping legit meshes. Outside the range we return 1 (no scale) so the
// mesh renders at its native size and the user can SEE it's wrong instead
// of falling out of the world.
const MIN_SCALE = 0.01;
const MAX_SCALE = 100;

// Plan-013 UAT polish: Tripo-generated GLBs have non-deterministic native
// scale — a "small red sports car" prompt may come back as a 0.2m mesh or a
// 20m mesh. The racetrack scene was sized around procedural cars (~1.7m);
// without normalization, bought Tripo cars looked like ants or skyscrapers.
// Compute the union bounding box across all geometry-bearing meshes and
// return the uniform scalar that makes the longest axis match `target`.
// Caller decides what to apply the scale to (typically the geometry mesh
// itself, not the physics pivot).
export function computeUniformScale(
  meshes: AbstractMesh[],
  target: number,
): number {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() === 0) continue; // skip glTF __root__ / empty TransformNodes
    mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    min = min ? Vector3.Minimize(min, bb.minimumWorld) : bb.minimumWorld.clone();
    max = max ? Vector3.Maximize(max, bb.maximumWorld) : bb.maximumWorld.clone();
  }
  if (!min || !max) return 1;
  const extents = max.subtract(min);
  const longest = Math.max(extents.x, extents.y, extents.z);
  if (longest <= 0) return 1; // zero-extent (all points coincident) — silent
  if (!Number.isFinite(longest)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[normalizeMeshScale] non-finite extent (longest=${longest}); ` +
        `falling back to scale 1.0 — mesh will render at native size.`,
    );
    return 1;
  }
  const raw = target / longest;
  if (!Number.isFinite(raw) || raw < MIN_SCALE || raw > MAX_SCALE) {
    // eslint-disable-next-line no-console
    console.warn(
      `[normalizeMeshScale] computed scale ${raw} out of safety range ` +
        `[${MIN_SCALE}, ${MAX_SCALE}] (longest=${longest}, target=${target}); ` +
        `falling back to 1.0 — mesh will render at native size.`,
    );
    return 1;
  }
  return raw;
}
