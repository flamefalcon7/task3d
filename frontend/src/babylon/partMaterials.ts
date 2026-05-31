// plan A2 (upload segmentation) — the single definition of "what is a part" and
// "is this base name-keyable", shared by the browser tagging canvas (TaggingCanvas),
// the headless material-name extractor (extractMaterialNames), and the forge build
// payload (LaunchCollectionPage). Pure + Babylon-free so it unit-tests in jsdom
// without a WebGL/NullEngine dependency.
//
// A "part" is a renderable mesh: a Babylon mesh with > 0 vertices (drops the
// __root__ / empty transform nodes the glTF loader emits). This mirrors
// TaggingCanvas's historical filter exactly so the browser part index, the
// on-chain part_labels order, and the forge's per-part material name all line up.

import { MAX_PARTS_FE } from '@overflow2026/shared';

/** Structural shape of a Babylon mesh — avoids importing the Babylon runtime here. */
export interface RenderableMeshLike {
  getTotalVertices?: () => number;
  material?: { name?: string | null } | null;
}

/** A mesh is a "part" iff it has renderable geometry (> 0 vertices). */
export function isRenderableMesh(m: RenderableMeshLike): boolean {
  return typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0;
}

/**
 * The per-part material names, in renderable-mesh order. `null` for a part whose
 * mesh has no material or an unnamed material. Order matches TaggingCanvas's
 * `meshesRef` (so index i ↔ part_labels[i]).
 */
export function renderableMaterialNames(
  meshes: ReadonlyArray<RenderableMeshLike>,
): (string | null)[] {
  return meshes.filter(isRenderableMesh).map((m) => m.material?.name ?? null);
}

/**
 * True iff every name is a non-empty string AND all names are distinct — the
 * precondition for name-keyed recoloring to be unambiguous. Narrows the array to
 * `string[]` on success.
 */
export function allNamesUniqueNonEmpty(
  names: ReadonlyArray<string | null>,
): names is string[] {
  if (names.some((n) => typeof n !== 'string' || n.length === 0)) return false;
  return new Set(names).size === names.length;
}

/**
 * Taggability gate for an UPLOADED base (U3). A base is taggable iff it has more
 * than one part (nothing to segment otherwise), stays within the on-chain part
 * ceiling (MAX_PARTS_FE = Move MAX_PARTS), and its part material names are unique
 * + non-empty (so the A2 name-keyed swap is unambiguous). Single-part / dup-name /
 * over-cap uploads fall back to the legacy single-color path.
 */
export function isUploadTaggable(names: ReadonlyArray<string | null>): boolean {
  return names.length >= 2 && names.length <= MAX_PARTS_FE && allNamesUniqueNonEmpty(names);
}
