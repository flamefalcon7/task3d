// plan A2 (D-077) parity check: what does Babylon's material.name resolve to for
// a real Tripo-segmented GLB? gltf-transform (backend swap) sees
// Material_tripo_part_0..13 (confirmed). If Babylon's extractMaterialNames path
// returns the SAME names, name-keyed recolor is sound end-to-end.
import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/index.js';

const path = process.argv[2] ?? 'public/dev-glbs/pickup-truck.glb';
const bytes = new Uint8Array(readFileSync(path));
const engine = new NullEngine();
const scene = new Scene(engine);
const dataUrl = `data:model/gltf-binary;base64,${Buffer.from(bytes).toString('base64')}`;
try {
  const container = await LoadAssetContainerAsync(dataUrl, scene, { pluginExtension: '.glb' });
  const names = container.meshes
    .filter((m) => typeof m.getTotalVertices === 'function' && m.getTotalVertices() > 0)
    .map((m) => m.material?.name ?? null);
  container.dispose();
  console.log('babylon part count:', names.length);
  console.log('babylon material names:', JSON.stringify(names));
  const allTripo = names.every((n) => typeof n === 'string' && /^Material_tripo_part_\d+$/.test(n));
  const unique = new Set(names).size === names.length;
  console.log('all match Material_tripo_part_N:', allTripo, '| unique:', unique);
  process.exit(allTripo && unique ? 0 : 1);
} finally {
  scene.dispose();
  engine.dispose();
}
