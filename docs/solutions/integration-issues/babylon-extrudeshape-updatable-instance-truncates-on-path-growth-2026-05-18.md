---
title: Babylon's MeshBuilder.ExtrudeShape({updatable, instance}) silently truncates on path-length growth
date: 2026-05-18
category: integration-issues
module: babylon-rendering
problem_type: integration_issue
component: tooling
symptoms:
  - "Dynamic ribbon trails (e.g., skid marks) stop visually growing after the first instance update"
  - "Passing a longer path array to MeshBuilder.ExtrudeShape({updatable: true, instance: prevMesh}) returns a mesh with the original vertex count"
  - "No error thrown, no warning logged — just a stuck-length mesh"
tags:
  - babylon
  - meshbuilder
  - extrudeshape
  - updatable
  - vertex-buffer
  - dispose-recreate
  - dynamic-geometry
versions:
  - "@babylonjs/core@9.7.0 (verified)"
  - "@babylonjs/core@9.6.0 (also affected, per ribbonBuilder.js source)"
---

## TL;DR

`MeshBuilder.ExtrudeShape({updatable: true, instance: previousMesh})` in
`@babylonjs/core@9.7.0` is a **fixed-vertex-count update fast-path**. Passing a
longer `path` array silently writes only the first N points where N is the
original vertex count, and returns the same mesh with the same number of
vertices. No exception, no warning.

If you need a ribbon that grows over time (skid marks, drawing trail, expanding
flame), you MUST dispose the previous mesh and call `ExtrudeShape` without
`instance` to create a fresh mesh with the correct vertex count.

## Source-of-truth

From `node_modules/@babylonjs/core/Meshes/Builders/shapeBuilder.d.ts:15`:

> Remember you can only change the shape or path point positions, not their
> number when updating an extruded shape.

The runtime path in `ribbonBuilder.js:277-314` confirms the mechanism: the
instance-update branch calls `instance.getVerticesData(VertexBuffer.PositionKind)`
to fetch the existing fixed-size buffer, then writes into it using
`minlg = min(oldPathLen, newPathLen)` as the loop bound. The extra path
points are dropped.

## Symptom (real-world)

Plan-005 (`/track` skid marks) first attempted to grow ribbon trails via
`{updatable: true, instance: currentMesh}`. The trail behind the car appeared
correctly on the first emit but never extended past the initial 2-point
segment — sustained drift produced a trail that looked frozen at its starting
length. Doc-review (`ce-doc-review` F-FEAS-001) caught the issue by reading the
type declaration before implementation began.

## Workaround

Dispose-and-recreate per growth tick:

```ts
// pseudo-shape, not implementation
function rebuildCurrentMesh(currentPath: Vector3[]): Mesh {
  if (currentMesh) currentMesh.dispose();
  const fresh = MeshBuilder.ExtrudeShape(
    'segment',
    { shape, path: currentPath, sideOrientation: 2 /* DOUBLESIDE */ },
    scene,
  );
  fresh.material = sharedMat;
  return fresh;
}
```

Bound the per-tick churn with a vertex-emission gate (e.g., minimum distance
moved since last vertex) so the dispose+create rate stays bounded at the GC
budget the target hardware can absorb. Plan-005's skidMarks module fires at
~15 Hz per active segment at MAX_FORWARD_SPEED — Babylon handles this
trivially on a single dynamic body.

## Alternative — `Mesh.updateMeshPositions` on a pre-allocated fixed-size buffer

For trails with a known maximum length, allocate a fixed `Float32Array` at
segment start (e.g., MAX_VERTICES × 3 floats), populate as the path grows,
and call `mesh.updateMeshPositions((positions) => { ... })`. This sidesteps
the dispose+recreate churn entirely. More LOC, but suitable for trails that
need to grow at >30 Hz or last for minutes.

## Why this matters

Any future plan that needs to dynamically grow a Babylon mesh (camera trail,
particle ribbon, road widening, decal projection) will hit this. The
counter-intuitive part is that the API name (`updatable: true, instance: ...`)
strongly implies "update in place including growth"; only the type declaration
and the runtime source reveal the truncation behavior.

## See also

- Plan-005's KTD-3 (skid mark primitive choice) discusses the alternatives
- `frontend/src/track/skidMarks.ts` is the canonical example of the
  dispose-and-recreate pattern in this codebase
