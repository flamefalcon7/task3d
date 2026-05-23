// Spike B: visualize three per-segment coloring strategies on the segmented
// GLB from spike-tripo-segmentation. All transforms use the same gltf-transform
// stack as production swapMaterial so what we see here is what backend will ship.
//
//   1. tint-red:    keep baked textures, set baseColorFactor=[1,0,0,1] on every
//                   material → factor multiplies the texture (PBR tint look).
//   2. flat-red:    strip baseColorTexture from every material, set the same
//                   baseColorFactor → pure flat color, no PBR detail.
//   3. multi-flat:  strip textures, give each part a distinct palette color →
//                   illustrates the (b) palette-per-segment product UX.
//
// Reads:  frontend/public/dev-glbs/spike-seg-2026-05-23T12-05-45.glb
// Writes: frontend/public/dev-glbs/spike-seg-{tint,flat,multi}.glb
//
// Run: ./node_modules/.bin/tsx scripts/spike-seg-color-modes.ts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEV_GLBS = path.resolve(__dirname, '../../frontend/public/dev-glbs');

const sources = fs
  .readdirSync(DEV_GLBS)
  .filter((f) => f.startsWith('spike-seg-2026') && f.endsWith('.glb'))
  .sort()
  .reverse();
if (sources.length === 0) throw new Error('No spike-seg-*.glb source found');
const SRC = path.join(DEV_GLBS, sources[0]!);
console.log(`— source: ${path.basename(SRC)}`);

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
function newIO() {
  return new NodeIO()
    .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}

const srcBytes = fs.readFileSync(SRC);

// 12-color palette for the multi-segment variant. Deliberately chunked into
// a body-color (warm red) and accent zone (cool/neutral) just to make the
// per-part separation visually obvious in the comparison shot.
const PALETTE: Array<[number, number, number]> = [
  [0.86, 0.16, 0.16], // 0  body  — red
  [0.18, 0.18, 0.2],  // 1  trim  — near-black
  [0.18, 0.18, 0.2],  // 2  trim
  [0.95, 0.83, 0.2],  // 3  accent — yellow
  [0.18, 0.18, 0.2],  // 4  trim
  [0.86, 0.16, 0.16], // 5  body
  [0.6, 0.6, 0.65],   // 6  metal — light grey
  [0.86, 0.16, 0.16], // 7  body
  [0.18, 0.18, 0.2],  // 8  trim
  [0.95, 0.83, 0.2],  // 9  accent
  [0.6, 0.6, 0.65],   // 10 metal
  [0.86, 0.16, 0.16], // 11 body
];

async function variant(
  label: string,
  outPath: string,
  apply: (m: import('@gltf-transform/core').Material, index: number) => void,
  stripTexture: boolean,
): Promise<void> {
  const io = newIO();
  const doc = await io.readBinary(new Uint8Array(srcBytes));
  const materials = doc.getRoot().listMaterials();
  console.log(`\n— ${label}: ${materials.length} materials`);
  materials.forEach((m, i) => {
    if (stripTexture) m.setBaseColorTexture(null);
    apply(m, i);
  });
  if (stripTexture) {
    // Manual prune — @gltf-transform/functions isn't a project dep. After
    // setBaseColorTexture(null) on every material, textures with only the Root
    // as parent are orphans; dispose so output size reflects real storage cost.
    doc
      .getRoot()
      .listTextures()
      .filter((t) => t.listParents().length === 1)
      .forEach((t) => t.dispose());
  }
  const out = await io.writeBinary(doc);
  fs.writeFileSync(outPath, out);
  console.log(`  ✓ wrote ${(out.length / 1024).toFixed(0)} KB → ${path.basename(outPath)}`);
}

const RED: [number, number, number, number] = [0.86, 0.16, 0.16, 1];

// 1. Tint over baked texture (factor × texture).
await variant(
  'tint-red',
  path.join(DEV_GLBS, 'spike-seg-tint-red.glb'),
  (m) => m.setBaseColorFactor(RED),
  false,
);

// 2. Flat color (texture removed, factor only).
await variant(
  'flat-red',
  path.join(DEV_GLBS, 'spike-seg-flat-red.glb'),
  (m) => m.setBaseColorFactor(RED),
  true,
);

// 3. Per-segment palette (illustrates b's product UX).
await variant(
  'multi-flat',
  path.join(DEV_GLBS, 'spike-seg-multi-flat.glb'),
  (m, i) => {
    const c = PALETTE[i] ?? [0.5, 0.5, 0.5];
    m.setBaseColorFactor([c[0], c[1], c[2], 1]);
  },
  true,
);

console.log('\n— DONE');
