// plan A2 (upload segmentation) — headless GLB → per-part material names.
//
// Used by the forge build (LaunchCollectionPage.runBuildVariants) to derive the
// material name for each part of the base GLB, in the SAME order the tagging step
// used, so the A2 name-keyed swap can map part_labels[i] → its material by name
// (order-independent at the backend). Loading via the SAME Babylon loader + filter
// as TaggingCanvas is what guarantees the order parity — a hand-rolled glTF JSON
// walk could diverge from Babylon's node traversal.

import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF/index.js';
import { renderableMaterialNames } from './partMaterials';

/**
 * Parse `glbBytes` headlessly (no canvas/WebGL) and return the per-part material
 * names in renderable-mesh order. Disposes all Babylon resources before
 * returning. Throws if the bytes don't parse as a GLB.
 */
export async function extractMaterialNames(glbBytes: Uint8Array): Promise<(string | null)[]> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const blob = new Blob([glbBytes as BlobPart], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    try {
      const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
      const names = renderableMaterialNames(container.meshes);
      container.dispose();
      return names;
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
}
