// clipPlane strategy: b — chose because `clipPlaneMaterialHelper.BindClipPlane`
// resolves `primaryHolder.clipPlane ?? secondaryHolder.clipPlane`, so per-material
// overrides cleanly express "this mesh clips with THIS plane" without touching
// scene state (which would otherwise bleed into the edges clone's PBR shader).
//
// plan-019 U2 — reusable Babylon scene primitive for the Tusk3D landing lede
// (S1) and the surrounding S3 identity-mark / S4 panel-2 design-time SVG
// exports. Mounts an EdgesRenderer clone of each source mesh, then sweeps a
// vertical clipPlane across the union bounding box on X. Auto-loops every
// 6 seconds; `setProgress(t)` freezes at a fixed point; `setProgress(null)`
// resumes the auto-loop.
//
// Babylon API surprise risk (learnings #3): the EdgesRenderer augmentation
// `enableEdgesRendering` only attaches when `@babylonjs/core/Rendering/edgesRenderer`
// has been imported. The side-effect import at the top of this file is load-bearing.

import '@babylonjs/core/Rendering/edgesRenderer';

import { Plane, type AbstractMesh, type Scene } from '@babylonjs/core';

// Sweep convention (worked out from clipPlaneFragment.js: `discard if fClipDistance > 0`):
//   - Original mesh keeps PBR; visible at x ≤ sweepX. Plane normal=(+1,0,0), d=-sweepX.
//   - Clone shows edges; visible at x ≥ sweepX. Plane normal=(-1,0,0), d=+sweepX.
// The two halves meet at sweepX, producing the mirror cut.

const SWEEP_PERIOD_MS = 6000;
const DEFAULT_EDGES_EPSILON = 0.95;

// Loose mesh type — production AbstractMesh carries `.clone()` and `.material`;
// jsdom tests inject a minimal stub that matches this shape so we don't have to
// hand-craft a full Babylon mesh in the test mocks.
type MeshLike = AbstractMesh & {
  clone: (name?: string, newParent?: unknown) => MeshLike | null;
  enableEdgesRendering: (epsilon?: number) => MeshLike;
  material: {
    clone?: (name: string) => unknown;
    clipPlane?: Plane | null;
    alpha?: number;
    disableLighting?: boolean;
  } | null;
  getBoundingInfo: () => {
    boundingBox: {
      minimumWorld: { x: number; y: number; z: number };
      maximumWorld: { x: number; y: number; z: number };
    };
  };
  computeWorldMatrix: (force?: boolean) => unknown;
  getTotalVertices: () => number;
  dispose: () => void;
};

export interface EdgesGradientSweepControl {
  /**
   * Freeze the sweep at a specific progress (0..1) along the union-bbox X axis,
   * or pass null to resume the 6-second auto-loop. Numbers outside 0..1 are
   * passed through verbatim (callers are expected to clamp; the sweep math is
   * linear and benign on extrapolation).
   */
  setProgress: (t: number | null) => void;
  /**
   * Tear down the primitive: removes the onBeforeRender observer, disposes the
   * cloned meshes and their cloned materials, and clears the clipPlane override
   * we wrote onto each source material so the originals are returned to their
   * pre-mount state. Idempotent — calling twice is a no-op.
   */
  dispose: () => void;
}

interface SourceRecord {
  original: MeshLike;
  // Material we cloned for the edges-side mesh. Disposed in dispose().
  edgesClone: MeshLike;
  edgesMaterial: { clipPlane?: Plane | null; dispose?: () => void } | null;
  // The original material we wrote clipPlane onto. Tracked so we can null it
  // out on dispose (we don't otherwise mutate this material).
  originalMaterial: { clipPlane?: Plane | null } | null;
}

function computeUnionBbox(meshes: readonly MeshLike[]): {
  minX: number;
  maxX: number;
} | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const mesh of meshes) {
    if (typeof mesh.getTotalVertices === 'function' && mesh.getTotalVertices() === 0) {
      // Skip __root__ / empty nodes — matches frameCameraToMeshes precedent.
      continue;
    }
    if (typeof mesh.computeWorldMatrix === 'function') {
      mesh.computeWorldMatrix(true);
    }
    const bb = mesh.getBoundingInfo().boundingBox;
    const lo = bb.minimumWorld.x;
    const hi = bb.maximumWorld.x;
    if (lo < minX) minX = lo;
    if (hi > maxX) maxX = hi;
    found = true;
  }
  if (!found) return null;
  // Degenerate case (all meshes at same X) — return a thin slab so we don't
  // divide by zero later. Callers tolerate maxX === minX (sweep just stays put).
  return { minX, maxX };
}

const NOOP_CONTROL: EdgesGradientSweepControl = {
  setProgress: () => {},
  dispose: () => {},
};

export function setupEdgesGradientSweep(
  scene: Scene,
  sourceMeshes: readonly AbstractMesh[],
  options?: { edgesEpsilon?: number },
): EdgesGradientSweepControl {
  // Empty input → no scene mutation, no observer registered. Returned control
  // is a no-op so consumers don't need to null-check before driving it.
  if (!sourceMeshes || sourceMeshes.length === 0) {
    return NOOP_CONTROL;
  }

  const edgesEpsilon = options?.edgesEpsilon ?? DEFAULT_EDGES_EPSILON;
  const sources = sourceMeshes as readonly MeshLike[];
  const records: SourceRecord[] = [];

  for (let i = 0; i < sources.length; i++) {
    const original = sources[i]!;

    // Independent clone so we can configure the edges side without touching
    // the original (alpha + clipPlane on the clone-side won't leak back).
    // Pass the original's parent so the clone inherits __root__ / asset
    // transforms — without this, GLBs that live under a non-identity root
    // would render the edges clone in a different world position than the
    // PBR original, and the mirror cut would misalign.
    const cloneParent = (original as unknown as { parent: unknown }).parent ?? null;
    const clone = original.clone(
      `${original.name ?? 'mesh'}__edgesSweepClone_${i}`,
      cloneParent,
    );
    if (!clone) {
      // Babylon returns null for non-cloneable nodes — skip silently to match
      // PreviewCanvas precedent of "best-effort iteration over a mesh array."
      continue;
    }

    // Clone shares its material reference with the original by default; cloning
    // the material gives us an independent slot to drop alpha + write clipPlane
    // onto without bleeding back into the original PBR render.
    let edgesMat: { clipPlane?: Plane | null; alpha?: number; disableLighting?: boolean; dispose?: () => void } | null = null;
    if (original.material && typeof original.material.clone === 'function') {
      edgesMat = original.material.clone(`${original.name ?? 'mesh'}__edgesMat_${i}`) as typeof edgesMat;
    }
    if (!edgesMat) {
      // Without an independent material, the clone would still reference the
      // original's material — writing the edges-side clipPlane onto it would
      // collide with the PBR-side write and the edges layer would never
      // render. Drop the clone for this mesh; we'd rather show a missing
      // edges layer than corrupt the original.
      clone.dispose();
      continue;
    }
    // Hide the clone's PBR pass — only its EdgesRenderer line layer should
    // contribute pixels. Alpha 0 is enough; disableLighting saves an unused
    // shader path on materials that respect it.
    edgesMat.alpha = 0;
    if ('disableLighting' in edgesMat) {
      edgesMat.disableLighting = true;
    }
    (clone as MeshLike).material = edgesMat as MeshLike['material'];

    // Enable the edge line layer on the clone. Epsilon 0.95 is Babylon's
    // documented default; the call returns the mesh itself (per .d.ts), but
    // we only need the side effect of attaching an EdgesRenderer.
    if (typeof clone.enableEdgesRendering === 'function') {
      clone.enableEdgesRendering(edgesEpsilon);
    }

    records.push({
      original,
      edgesClone: clone,
      edgesMaterial: edgesMat ?? null,
      originalMaterial: (original.material as { clipPlane?: Plane | null } | null) ?? null,
    });
  }

  // After the clone+material loop, if nothing was actually pushed (e.g. every
  // clone() returned null), behave like the empty-input case.
  if (records.length === 0) {
    return NOOP_CONTROL;
  }

  // null => auto-loop; number => frozen at that progress.
  let frozenProgress: number | null = null;
  let disposed = false;

  function currentProgress(): number {
    if (frozenProgress !== null) return frozenProgress;
    return (Date.now() % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS;
  }

  function tick(): void {
    if (disposed) return;
    const bbox = computeUnionBbox(records.map((r) => r.original));
    if (!bbox) return;
    const t = currentProgress();
    const sweepX = bbox.minX + t * (bbox.maxX - bbox.minX);

    // PBR (original): visible at x ≤ sweepX → discard when (+1)·x + (-sweepX) > 0.
    const pbrPlane = new Plane(1, 0, 0, -sweepX);
    // Edges (clone): visible at x ≥ sweepX → discard when (-1)·x + (+sweepX) > 0.
    const edgesPlane = new Plane(-1, 0, 0, sweepX);

    for (const rec of records) {
      if (rec.originalMaterial) rec.originalMaterial.clipPlane = pbrPlane;
      if (rec.edgesMaterial) rec.edgesMaterial.clipPlane = edgesPlane;
    }
  }

  const observer = scene.onBeforeRenderObservable.add(tick);

  return {
    setProgress(t: number | null): void {
      if (disposed) return;
      frozenProgress = t;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Remove the per-frame observer first so a render pass mid-teardown
      // doesn't run against half-disposed materials.
      scene.onBeforeRenderObservable.remove(observer);
      for (const rec of records) {
        // Clear the clipPlane override we wrote on the original's material —
        // returns the source mesh to its pre-sweep render state.
        if (rec.originalMaterial) {
          rec.originalMaterial.clipPlane = null;
        }
        // Dispose the mesh FIRST so its renderer detaches from the material
        // cleanly; then dispose the cloned material. Reverse order risks the
        // mesh's internal renderer dereferencing a disposed material.
        if (typeof rec.edgesClone.dispose === 'function') {
          rec.edgesClone.dispose();
        }
        if (rec.edgesMaterial && typeof rec.edgesMaterial.dispose === 'function') {
          rec.edgesMaterial.dispose();
        }
      }
      // This primitive uses strategy (b) — per-material clipPlane override.
      // It never writes scene.clipPlane / clipPlane2, so we don't null them
      // on dispose either; doing so would stomp host effects that legitimately
      // use scene-level clipping for their own features.
    },
  };
}
