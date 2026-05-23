import { describe, it, expect } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder } from 'meshoptimizer';
import {
  swapMaterial,
  loadBundledTexture,
  TexturePathEscapeError,
  NoMaterialInBaseGlbError,
  PartCountMismatchError,
} from './gltf-material-swap.js';
import type { TextureId } from '@overflow2026/shared';

// Build a tiny single-triangle GLB with N materials. Each primitive is
// assigned its own material so that listMaterials() returns N entries
// regardless of insertion order (`createMaterial` alone doesn't attach the
// material to a primitive, but the underlying root listing returns it
// anyway — we attach to be defensive).
// plan-013 review pass S1 — minimal 1x1 PNG. Lets fixtures pre-seed materials
// with a baseColorTexture so TINT-mode preservation tests can actually
// distinguish "preserved" from "never set". This is a real PNG, not a stub,
// so the GLB writer's image-MIME-type check accepts it.
const STUB_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfa, 0xcf, 0x00, 0x00,
  0x00, 0x05, 0x00, 0x01, 0xa1, 0x69, 0x35, 0x91, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function makeFixtureGlb(opts: {
  materialColors?: Array<[number, number, number, number]>;
  noMaterial?: boolean;
  // plan-013 review pass S1 — when true, every material is seeded with a
  // baseColorTexture so swap-pipeline tests can assert "TINT mode preserved
  // the baked PBR texture" rather than the vacuous "no texture was added".
  seedBakedTextures?: boolean;
} = {}): Promise<Uint8Array> {
  const colors = opts.noMaterial ? [] : (opts.materialColors ?? [[1, 1, 1, 1]]);
  const doc = new Document();
  const buffer = doc.createBuffer();

  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2]);

  const positionAccessor = doc
    .createAccessor('POSITION')
    .setType('VEC3')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .setArray(positions as any)
    .setBuffer(buffer);
  const indexAccessor = doc
    .createAccessor('INDICES')
    .setType('SCALAR')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .setArray(indices as any)
    .setBuffer(buffer);

  const primitive = doc
    .createPrimitive()
    .setMode(4)
    .setAttribute('POSITION', positionAccessor)
    .setIndices(indexAccessor);

  if (colors.length > 0) {
    // Attach the first material to the primitive; create the rest as
    // dangling materials (they still appear in root.listMaterials()).
    const first = colors[0]!;
    const firstMat = doc.createMaterial('mat_0').setBaseColorFactor(first);
    primitive.setMaterial(firstMat);
    for (let i = 1; i < colors.length; i++) {
      doc.createMaterial(`mat_${i}`).setBaseColorFactor(colors[i]!);
    }
    if (opts.seedBakedTextures) {
      // plan-013 review pass S1 — seed every material with a pre-existing
      // baseColorTexture so TINT-mode preservation can be observed.
      const mats = doc.getRoot().listMaterials();
      for (let i = 0; i < mats.length; i++) {
        const tex = doc
          .createTexture(`baked_${i}`)
          .setImage(STUB_PNG)
          .setMimeType('image/png');
        mats[i]!.setBaseColorTexture(tex);
      }
    }
  }

  const mesh = doc.createMesh('fixture').addPrimitive(primitive);
  const node = doc.createNode('root').setMesh(mesh);
  const scene = doc.createScene('scene').addChild(node);
  doc.getRoot().setDefaultScene(scene);

  const io = new NodeIO();
  return io.writeBinary(doc);
}

async function readMaterialColors(glb: Uint8Array): Promise<Array<[number, number, number, number]>> {
  const io = new NodeIO();
  const doc = await io.readBinary(glb);
  return doc
    .getRoot()
    .listMaterials()
    .map((m) => Array.from(m.getBaseColorFactor()) as [number, number, number, number]);
}

async function readFirstMaterialHasTexture(glb: Uint8Array): Promise<boolean> {
  const io = new NodeIO();
  const doc = await io.readBinary(glb);
  const mats = doc.getRoot().listMaterials();
  if (mats.length === 0) return false;
  return mats[0]!.getBaseColorTexture() !== null;
}

async function readMaterialTextureFlags(glb: Uint8Array): Promise<boolean[]> {
  const io = new NodeIO();
  const doc = await io.readBinary(glb);
  return doc
    .getRoot()
    .listMaterials()
    .map((m) => m.getBaseColorTexture() !== null);
}

async function readMeshTopology(glb: Uint8Array): Promise<{ verts: number; indices: number }> {
  const io = new NodeIO();
  const doc = await io.readBinary(glb);
  const meshes = doc.getRoot().listMeshes();
  let verts = 0;
  let indices = 0;
  for (const m of meshes) {
    for (const prim of m.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      if (pos) verts += pos.getCount();
      if (idx) indices += idx.getCount();
    }
  }
  return { verts, indices };
}

// A GLB that declares KHR_mesh_quantization in `extensionsRequired`. A reader
// without the extension registered throws "Missing required extension" — this
// is the Tripo-output failure mode the route surfaced as 422 glb_parse_failed.
async function makeQuantizedFixtureGlb(): Promise<Uint8Array> {
  const base = await makeFixtureGlb({ materialColors: [[1, 1, 1, 1]] });
  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  const doc = await io.readBinary(base);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  return io.writeBinary(doc);
}

// A GLB compressed with EXT_meshopt_compression — the real Tripo failure mode
// (needs the meshopt wasm decoder, not just extension registration).
async function makeMeshoptFixtureGlb(): Promise<Uint8Array> {
  const base = await makeFixtureGlb({ materialColors: [[1, 1, 1, 1]] });
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.readBinary(base);
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  return io.writeBinary(doc);
}

describe('swapMaterial', () => {
  it('parses a base GLB that requires KHR_mesh_quantization (Tripo-style)', async () => {
    const base = await makeQuantizedFixtureGlb();
    // Before registering the extension this threw "Missing required extension"
    // and the route returned 422 glb_parse_failed. Now it parses + edits.
    const out = await swapMaterial(
      base,
      { partColors: [{ baseColorRgb: [0, 1, 0, 1] }] },
      async () => new Uint8Array(),
    );
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBeGreaterThan(0);
  });

  it('parses a base GLB compressed with EXT_meshopt_compression (Tripo-style)', async () => {
    const base = await makeMeshoptFixtureGlb();
    const out = await swapMaterial(
      base,
      { partColors: [{ baseColorRgb: [0, 0, 1, 1] }] },
      async () => new Uint8Array(),
    );
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBeGreaterThan(0);
  });

  it('happy path swaps baseColor on the single material (legacy 1-material base)', async () => {
    const base = await makeFixtureGlb({ materialColors: [[1, 1, 1, 1]] });
    const out = await swapMaterial(
      base,
      { partColors: [{ baseColorRgb: [1, 0, 0, 1] }] },
      async () => new Uint8Array(),
    );
    const colors = await readMaterialColors(out);
    expect(colors).toHaveLength(1);
    expect(colors[0]).toEqual([1, 0, 0, 1]);
  });

  it('adds baseColorTexture when textureId is provided on a part', async () => {
    const base = await makeFixtureGlb({ materialColors: [[1, 1, 1, 1]] });
    // Bundled PNG so the GLB writer accepts the image MIME type.
    const tex: TextureId = 'gold';
    const out = await swapMaterial(base, {
      partColors: [{ baseColorRgb: [1, 1, 1, 1], textureId: tex }],
    });
    expect(await readFirstMaterialHasTexture(out)).toBe(true);
  });

  it('preserves mesh topology (vertex + index counts unchanged)', async () => {
    const base = await makeFixtureGlb({ materialColors: [[1, 1, 1, 1]] });
    const before = await readMeshTopology(base);
    const out = await swapMaterial(
      base,
      { partColors: [{ baseColorRgb: [0.2, 0.4, 0.6, 1] }] },
      async () => new Uint8Array(),
    );
    const after = await readMeshTopology(out);
    expect(after.verts).toBe(before.verts);
    expect(after.indices).toBe(before.indices);
  });

  it('throws NoMaterialInBaseGlbError on input GLB without any materials', async () => {
    const base = await makeFixtureGlb({ noMaterial: true });
    await expect(
      swapMaterial(
        base,
        { partColors: [{ baseColorRgb: [1, 0, 0, 1] }] },
        async () => new Uint8Array(),
      ),
    ).rejects.toBeInstanceOf(NoMaterialInBaseGlbError);
  });

  it('plan-013 — loops over N materials, applies a distinct color to each part', async () => {
    // 4-material fixture (≈ a 4-part segmented mesh) gets a distinct color per
    // part. Replaces the pre-plan-013 "only swaps the first material" test —
    // that R2-era defensive behavior is the boundary this plan reverses.
    const base = await makeFixtureGlb({
      materialColors: [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
      ],
    });
    const out = await swapMaterial(
      base,
      {
        partColors: [
          { baseColorRgb: [1, 0, 0, 1] }, // red
          { baseColorRgb: [0, 1, 0, 1] }, // green
          { baseColorRgb: [0, 0, 1, 1] }, // blue
          { baseColorRgb: [1, 1, 0, 1] }, // yellow
        ],
      },
      async () => new Uint8Array(),
    );
    const colors = await readMaterialColors(out);
    expect(colors).toHaveLength(4);
    expect(colors[0]).toEqual([1, 0, 0, 1]);
    expect(colors[1]).toEqual([0, 1, 0, 1]);
    expect(colors[2]).toEqual([0, 0, 1, 1]);
    expect(colors[3]).toEqual([1, 1, 0, 1]);
  });

  it('plan-013 — TINT mode preserves the baked baseColorTexture on parts without an override', async () => {
    // 4-material fixture WITH baseColorTexture pre-seeded on every material
    // (review pass S1 — the production case is "Tripo's mesh_segmentation
    // emits per-part PBR-baked textures"). The TINT contract: setting only
    // `baseColorFactor` per part must leave each material's existing
    // baseColorTexture intact. partColors[2] overrides its texture as well —
    // that override IS expected to replace the baked texture for material 2.
    // Materials 0, 1, 3 must keep their baked textures.
    //
    // This is the headline visual boundary between TINT and FLAT. A regression
    // that ever stripped baseColorTexture in the no-textureId branch (e.g.,
    // `target.setBaseColorTexture(null)`) would flip material 0/1/3 to false
    // and fail this test.
    const base = await makeFixtureGlb({
      materialColors: [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
      ],
      seedBakedTextures: true,
    });
    const out = await swapMaterial(base, {
      partColors: [
        { baseColorRgb: [1, 0, 0, 1] },
        { baseColorRgb: [0, 1, 0, 1] },
        { baseColorRgb: [0, 0, 1, 1], textureId: 'gold' },
        { baseColorRgb: [1, 1, 0, 1] },
      ],
    });
    const flags = await readMaterialTextureFlags(out);
    // All four materials have a baseColorTexture: 0/1/3 the baked one,
    // 2 the variant-override one. The discriminator that distinguishes TINT
    // from FLAT is "did 0/1/3 stay true", not just "did 2 become true".
    expect(flags).toEqual([true, true, true, true]);
  });

  it('plan-013 — throws PartCountMismatchError when partColors.length !== materials.length', async () => {
    const base = await makeFixtureGlb({
      materialColors: [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
      ],
    });
    await expect(
      swapMaterial(
        base,
        {
          partColors: [
            { baseColorRgb: [1, 0, 0, 1] },
            { baseColorRgb: [0, 1, 0, 1] },
            { baseColorRgb: [0, 0, 1, 1] },
          ],
        },
        async () => new Uint8Array(),
      ),
    ).rejects.toBeInstanceOf(PartCountMismatchError);
  });

  it('round-trips base64 without corrupting bytes', async () => {
    const base = await makeFixtureGlb({ materialColors: [[1, 1, 1, 1]] });
    const out = await swapMaterial(
      base,
      { partColors: [{ baseColorRgb: [0, 1, 0, 1] }] },
      async () => new Uint8Array(),
    );
    const roundtripped = Uint8Array.from(Buffer.from(Buffer.from(out).toString('base64'), 'base64'));
    expect(roundtripped.length).toBe(out.length);
    const colors = await readMaterialColors(roundtripped);
    expect(colors[0]).toEqual([0, 1, 0, 1]);
  });
});

describe('loadBundledTexture (SEC-002 path-escape defense-in-depth)', () => {
  it('loads a real bundled texture', async () => {
    const bytes = await loadBundledTexture('gold');
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes.length).toBeGreaterThan(8);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it('rejects path-escape attempts', async () => {
    // Cast through unknown because the type system bars '../etc/passwd'
    // from being assigned to TextureId. The defense exists precisely
    // because zod's enum could be bypassed in an internal call site.
    await expect(loadBundledTexture('../../etc/passwd' as unknown as TextureId)).rejects.toBeInstanceOf(
      TexturePathEscapeError,
    );
  });
});
