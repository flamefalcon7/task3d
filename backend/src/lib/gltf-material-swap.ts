import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { VariantMaterialSpec, TextureId } from '@overflow2026/shared';

// NodeNext / ESM has no built-in __dirname; reconstruct it. Resolves to
// backend/src/lib at runtime; assets dir is two levels up.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SEC-002: defense-in-depth. Even though zod's z.enum(TEXTURE_LIBRARY)
// guards the textureId at the route layer, the loader independently rejects
// any value that would resolve outside TEXTURES_DIR. Keeps the loader safe
// to call from internal contexts too.
export const TEXTURES_DIR = path.resolve(__dirname, '../../assets/textures');

export class TexturePathEscapeError extends Error {
  constructor(id: string) {
    super(`texture_path_escape: refusing to load '${id}' — resolved path escapes textures dir`);
    this.name = 'TexturePathEscapeError';
  }
}

export class NoMaterialInBaseGlbError extends Error {
  constructor() {
    super('no_material_in_base_glb');
    this.name = 'NoMaterialInBaseGlbError';
  }
}

// plan-013 — surfaces when the per-variant `partColors` array length does not
// match the base GLB's material count. The route layer turns this into a 422
// `part_count_mismatch` envelope. Distinct from `NoMaterialInBaseGlbError`
// (which fires only when the base has zero materials) so the frontend can
// give a specific "your base has 9 parts; the variant editor sent 12" hint.
export class PartCountMismatchError extends Error {
  readonly materialCount: number;
  readonly partColorsCount: number;
  constructor(materialCount: number, partColorsCount: number) {
    super(
      `part_count_mismatch: base GLB has ${materialCount} material(s) but ` +
        `variant spec supplied ${partColorsCount} partColors entries`,
    );
    this.name = 'PartCountMismatchError';
    this.materialCount = materialCount;
    this.partColorsCount = partColorsCount;
  }
}

export async function loadBundledTexture(id: TextureId): Promise<Uint8Array> {
  const candidate = path.join(TEXTURES_DIR, `${id}.png`);
  const resolved = path.resolve(candidate);
  // path.resolve normalizes any '..' segments — startsWith catches both
  // path-escape attempts AND symlink-prefix tricks at this layer.
  if (resolved !== candidate || !resolved.startsWith(TEXTURES_DIR + path.sep)) {
    throw new TexturePathEscapeError(id);
  }
  return fs.promises.readFile(resolved);
}

// Pure function (modulo the injected textureLoader). Reads `baseGlb`, loops
// over ALL materials in the segmented base, sets each material's
// `baseColorFactor` from the matching `partColors[i]` entry, and optionally
// overrides that material's `baseColorTexture` if its `partColors[i].textureId`
// is supplied. plan-013 TINT mode: when no `textureId` is provided for a part,
// the material's existing (Tripo-baked PBR) `baseColorTexture` is preserved —
// the factor multiplies it. This is the visual difference that reads as
// "tinted red car" instead of "flat-color plastic": baked PBR detail (normals,
// metallic-roughness) is untouched, only the diffuse base color is shifted.
//
// Length contract: `spec.partColors.length === materials.length`. Drift
// surfaces as `PartCountMismatchError` (route layer → 422 part_count_mismatch).
// Legacy single-material bases pass `partColors: [{...}]` (length-1) and run
// the same loop unchanged.
export async function swapMaterial(
  baseGlb: Uint8Array,
  spec: VariantMaterialSpec,
  textureLoader: (id: TextureId) => Promise<Uint8Array> = loadBundledTexture,
): Promise<Uint8Array> {
  // Tripo (and many exporters) ship compressed GLBs: KHR_mesh_quantization
  // and/or EXT_meshopt_compression listed in `extensionsRequired`. Without
  // these registered, gltf-transform throws "Missing required extension" and
  // the route returned 422 glb_parse_failed. Quantization is decoder-free, but
  // meshopt needs the wasm codec wired in as a dependency (decoder to read,
  // encoder to re-serialize the geometry after the material-only edit).
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const io = new NodeIO()
    .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  const doc = await io.readBinary(baseGlb);
  const materials = doc.getRoot().listMaterials();
  if (materials.length === 0) {
    throw new NoMaterialInBaseGlbError();
  }
  if (spec.partColors.length !== materials.length) {
    throw new PartCountMismatchError(materials.length, spec.partColors.length);
  }
  for (let i = 0; i < materials.length; i++) {
    const target = materials[i];
    const partSpec = spec.partColors[i];
    if (!target || !partSpec) {
      // Unreachable given the length-equality check above; appeases
      // noUncheckedIndexedAccess.
      throw new PartCountMismatchError(materials.length, spec.partColors.length);
    }
    target.setBaseColorFactor(partSpec.baseColorRgb);
    if (partSpec.textureId) {
      const pngBytes = await textureLoader(partSpec.textureId);
      const tex = doc
        .createTexture(`variant_${i}_${partSpec.textureId}`)
        .setImage(pngBytes)
        .setMimeType('image/png');
      target.setBaseColorTexture(tex);
    }
    // No `else` branch — preserving the material's existing baseColorTexture
    // is the TINT-mode contract. Setting it to null would strip baked PBR.
  }
  return io.writeBinary(doc);
}
