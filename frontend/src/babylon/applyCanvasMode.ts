import { Color3, type AbstractMesh } from '@babylonjs/core';
import { type CanvasMode, partsColor } from './modePalette';

// plan-015 U2 / U7 — pure-ish helper that bridges modePalette numerics into
// Babylon mesh-material mutation. Pulled out of the canvas components so the
// snapshot/restore/overlay algorithm is testable in isolation against fake
// mesh objects.
//
// Algorithm:
//   1. Snapshot the ORIGINAL (post-load, PBR) material state on first apply
//      per mesh — alpha, wireframe, albedoColor/diffuseColor. Snapshot is
//      durable across mode transitions; it is the immutable "true baseline".
//   2. On every call: restore the snapshot first (resets back to baseline).
//   3. If `partColors` is provided AND mode is not PARTS, apply them as a
//      user-defined color overlay on top of the restored baseline (R9 live
//      recolor — VariantEditor color picks pass through here).
//   4. Apply the mode-specific overlay: PARTS tints with the diagnostic
//      rainbow (and overrides partColors — it's a diagnostic), SOLO dims
//      non-highlighted meshes' alpha, WIREFRAME flips the wireframe flag.
//
// PBR mode is a no-op past steps 1-3: the restore + optional partColors
// overlay IS the PBR render. Because the snapshot is never cleared, a
// round-trip from PBR+partColors → PARTS → PBR (no partColors) reliably
// returns to the original baseline.

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

// Parse "#rrggbb" hex strings into a Color3 (RGB in 0..1). Returns null
// for unparseable input so the caller can skip without crashing on a
// malformed user-supplied color.
function hexToColor3(hex: string): Color3 | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return new Color3(
    ((n >> 16) & 0xff) / 255,
    ((n >> 8) & 0xff) / 255,
    (n & 0xff) / 255,
  );
}

export function applyCanvasMode(
  meshes: readonly AbstractMesh[],
  mode: CanvasMode,
  highlightedParts: readonly number[] = [],
  partColors?: readonly string[],
): void {
  // Step 1 — restore every mesh to its baseline snapshot. Captures the
  // snapshot on first encounter (when no prior mode call has touched it).
  // Snapshot is never cleared — it's the durable baseline for the lifetime
  // of this mesh in the scene.
  for (const mesh of meshes) {
    const snap = getOrCaptureSnapshot(mesh);
    restoreFromSnapshot(mesh, snap);
  }

  // Step 2 — partColors overlay (R9 live recolor). User-defined colors
  // override the snapshot baseline for non-PARTS modes. PARTS mode's
  // diagnostic rainbow always wins so the segmentation visualization is
  // never blocked by a user color choice.
  if (mode !== 'parts' && partColors !== undefined) {
    meshes.forEach((mesh, i) => {
      const hex = partColors[i];
      if (!hex) return;
      const c = hexToColor3(hex);
      if (c) setMeshTint(mesh, c);
    });
  }

  // Step 3 — layer the mode-specific overlay.
  if (mode === 'pbr') {
    // No overlay — the (restore + partColors) above IS the PBR render.
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
