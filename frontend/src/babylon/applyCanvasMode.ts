import { Color3, type AbstractMesh } from '@babylonjs/core';
import { type CanvasMode, partsColor } from './modePalette';

// plan-015 U2 — pure-ish helper that bridges modePalette numerics into Babylon
// mesh-material mutation. Pulled out of the canvas components so the
// snapshot/restore/overlay algorithm is testable in isolation against fake
// mesh objects.
//
// Algorithm: snapshot original (PBR) material state on first apply per mesh
// (alpha, wireframe, albedoColor/diffuseColor); on every subsequent call
// (1) restore from snapshot, then (2) layer the mode-specific overlay. PBR
// mode restores + clears the snapshot, returning the mesh to its true
// out-of-the-box state. This avoids "left-over PARTS color survives a PBR
// trip" — a subtle bug class flagged in the plan-015 risks section.

// Snapshot lives on each AbstractMesh under a Symbol-keyed property so two
// canvases sharing the same scene (defensive — current code never does this)
// would not collide on snapshot ownership.
const SNAPSHOT_KEY = Symbol.for('plan-015.canvas-mode.snapshot');

interface MeshSnapshot {
  alpha: number;
  wireframe: boolean;
  albedoColor: Color3 | null;
  diffuseColor: Color3 | null;
}

// PBR meshes from Tripo expose `albedoColor` on their material; uploaded GLBs
// with non-PBR materials expose `diffuseColor`. Treat both. We do not snapshot
// `albedoTexture` etc. — those are not mutated by any of the four modes, only
// the scalar color and alpha/wireframe flags.
interface MaybeMaterial {
  alpha?: number;
  wireframe?: boolean;
  albedoColor?: Color3 | null;
  diffuseColor?: Color3 | null;
}

function getMaterial(mesh: AbstractMesh): MaybeMaterial | null {
  return (mesh.material as MaybeMaterial | null) ?? null;
}

function snapshotMesh(mesh: AbstractMesh): MeshSnapshot {
  const mat = getMaterial(mesh);
  return {
    alpha: typeof mat?.alpha === 'number' ? mat.alpha : 1,
    wireframe: !!mat?.wireframe,
    albedoColor: mat?.albedoColor ? mat.albedoColor.clone() : null,
    diffuseColor: mat?.diffuseColor ? mat.diffuseColor.clone() : null,
  };
}

type Tagged = AbstractMesh & { [SNAPSHOT_KEY]?: MeshSnapshot };

function getOrCaptureSnapshot(mesh: AbstractMesh): MeshSnapshot {
  const tagged = mesh as Tagged;
  if (!tagged[SNAPSHOT_KEY]) {
    tagged[SNAPSHOT_KEY] = snapshotMesh(mesh);
  }
  return tagged[SNAPSHOT_KEY]!;
}

function clearSnapshot(mesh: AbstractMesh): void {
  const tagged = mesh as Tagged;
  delete tagged[SNAPSHOT_KEY];
}

function restoreFromSnapshot(mesh: AbstractMesh, snap: MeshSnapshot): void {
  const mat = getMaterial(mesh);
  if (!mat) return;
  mat.alpha = snap.alpha;
  mat.wireframe = snap.wireframe;
  if (snap.albedoColor && mat.albedoColor) {
    mat.albedoColor.copyFrom(snap.albedoColor);
  }
  if (snap.diffuseColor && mat.diffuseColor) {
    mat.diffuseColor.copyFrom(snap.diffuseColor);
  }
}

function setMeshTint(mesh: AbstractMesh, color: Color3): void {
  const mat = getMaterial(mesh);
  if (!mat) return;
  if (mat.albedoColor) mat.albedoColor.copyFrom(color);
  else if (mat.diffuseColor) mat.diffuseColor.copyFrom(color);
}

export function applyCanvasMode(
  meshes: readonly AbstractMesh[],
  mode: CanvasMode,
  highlightedParts: readonly number[] = [],
): void {
  // Step 1 — restore every mesh to its baseline snapshot. Captures the
  // snapshot on first encounter (when no prior mode call has touched it).
  for (const mesh of meshes) {
    const snap = getOrCaptureSnapshot(mesh);
    restoreFromSnapshot(mesh, snap);
  }

  // Step 2 — layer the mode overlay.
  if (mode === 'pbr') {
    // PBR is the baseline. Drop the snapshot so a subsequent re-entry into
    // PARTS/etc. captures the CURRENT (possibly externally mutated) state
    // as the new baseline — important when VariantEditor live-recolor (U7)
    // mutates albedoColor between mode transitions.
    for (const mesh of meshes) clearSnapshot(mesh);
    return;
  }

  if (mode === 'parts') {
    meshes.forEach((mesh, i) => {
      const [r, g, b] = partsColor(i);
      setMeshTint(mesh, new Color3(r, g, b));
    });
    return;
  }

  if (mode === 'solo') {
    const set = new Set(highlightedParts);
    meshes.forEach((mesh, i) => {
      if (!set.has(i)) {
        const mat = getMaterial(mesh);
        if (mat) mat.alpha = 0.2;
      }
    });
    return;
  }

  if (mode === 'wireframe') {
    for (const mesh of meshes) {
      const mat = getMaterial(mesh);
      if (mat) mat.wireframe = true;
    }
    return;
  }
}

// Exposed for tests that need to verify the snapshot tag was cleaned up
// during a PBR transition. Not part of the production import surface
// outside test mocking.
export const __SNAPSHOT_KEY_FOR_TESTING = SNAPSHOT_KEY;
