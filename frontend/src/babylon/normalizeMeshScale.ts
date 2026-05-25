import { type AbstractMesh, Vector3 } from '@babylonjs/core';

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
  if (longest <= 0) return 1;
  return target / longest;
}
