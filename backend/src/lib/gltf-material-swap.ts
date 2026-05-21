import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
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

// Pure function (modulo the injected textureLoader). Reads `baseGlb`,
// mutates the FIRST material slot's baseColorFactor + (optionally)
// baseColorTexture, writes back to GLB bytes. R2 mitigation: if the base
// has multiple materials (rare for Tripo P1 output but possible for
// composed scenes), only the first is touched — others pass through.
export async function swapMaterial(
  baseGlb: Uint8Array,
  spec: VariantMaterialSpec,
  textureLoader: (id: TextureId) => Promise<Uint8Array> = loadBundledTexture,
): Promise<Uint8Array> {
  // Register KHR_mesh_quantization so quantized base GLBs (Tripo and many
  // exporters emit these to shrink files) parse instead of failing with
  // "Missing required extension". The extension needs no decoder — quantized
  // vertex data passes straight through the material-only edit, and Babylon
  // dequantizes it client-side at render time.
  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  const doc = await io.readBinary(baseGlb);
  const materials = doc.getRoot().listMaterials();
  if (materials.length === 0) {
    throw new NoMaterialInBaseGlbError();
  }
  const target = materials[0];
  if (!target) {
    // Unreachable given length check above; appeases noUncheckedIndexedAccess.
    throw new NoMaterialInBaseGlbError();
  }
  target.setBaseColorFactor(spec.baseColorRgb);
  if (spec.textureId) {
    const pngBytes = await textureLoader(spec.textureId);
    const tex = doc
      .createTexture(`variant_${spec.textureId}`)
      .setImage(pngBytes)
      .setMimeType('image/png');
    target.setBaseColorTexture(tex);
  }
  return io.writeBinary(doc);
}
