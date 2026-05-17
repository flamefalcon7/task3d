import { Document, NodeIO } from '@gltf-transform/core';

const io = new NodeIO();

export interface MeshData {
  positions: Float32Array;
  indices: Uint16Array;
  name?: string;
}

// Translate a mesh's vertices in-place by (dx, dy, dz) and return a new mesh.
// Component meshes are built at origin then placed; the sword/hammer/platform
// generators call this before mergeMeshes.
export function translateMesh(mesh: MeshData, dx: number, dy: number, dz: number): MeshData {
  const out = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    out[i]     = mesh.positions[i]!     + dx;
    out[i + 1] = mesh.positions[i + 1]! + dy;
    out[i + 2] = mesh.positions[i + 2]! + dz;
  }
  return { positions: out, indices: mesh.indices };
}

// Concatenate N meshes into a single mesh, offsetting index buffers by the
// running vertex count. Composed shapes (sword, hammer, platform) build their
// sub-primitives with this — one GLB primitive per final shape keeps the GLB
// builder simple.
export function mergeMeshes(meshes: MeshData[]): MeshData {
  let totalVerts = 0;
  let totalIndices = 0;
  for (const m of meshes) {
    totalVerts += m.positions.length / 3;
    totalIndices += m.indices.length;
  }
  const positions = new Float32Array(totalVerts * 3);
  const indices = new Uint16Array(totalIndices);
  let vOff = 0;
  let iOff = 0;
  for (const m of meshes) {
    positions.set(m.positions, vOff * 3);
    for (let i = 0; i < m.indices.length; i++) {
      indices[iOff + i] = m.indices[i]! + vOff;
    }
    vOff += m.positions.length / 3;
    iOff += m.indices.length;
  }
  return { positions, indices };
}

// True iff every edge in the mesh is shared by exactly 2 triangles. Used in
// generator tests to assert manifoldness (Phase 1 cylinder-bug lesson — caps
// were inverted in early Phase 1; manifold check alone wouldn't have caught
// that, so we pair this with normal-direction tests).
export function isManifold(positions: Float32Array, indices: Uint16Array): boolean {
  const edgeCount = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!;
    const i1 = indices[t + 1]!;
    const i2 = indices[t + 2]!;
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }
  for (const count of edgeCount.values()) {
    if (count !== 2) return false;
  }
  return true;
}

// Serialize a single-mesh, single-node, single-scene glTF document to GLB bytes.
// @gltf-transform/core handles min/max bounds + buffer layout that Babylon needs.
export async function meshToGlb(mesh: MeshData): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();

  // TS 5.7 made TypedArray generic (Float32Array<ArrayBufferLike>) while
  // @gltf-transform/core's setArray() signature pins the parameter to
  // Float32Array<ArrayBuffer>. Cast explicitly to the narrow form so both
  // backend tsc (TS 5.5 at the workspace pin) and TS 5.7+ accept it.
  const positionAccessor = doc
    .createAccessor('POSITION')
    .setType('VEC3')
    .setArray(mesh.positions as Float32Array<ArrayBuffer>)
    .setBuffer(buffer);

  const indexAccessor = doc
    .createAccessor('INDICES')
    .setType('SCALAR')
    .setArray(mesh.indices as Uint16Array<ArrayBuffer>)
    .setBuffer(buffer);

  const primitive = doc
    .createPrimitive()
    .setMode(4 /* TRIANGLES */)
    .setAttribute('POSITION', positionAccessor)
    .setIndices(indexAccessor);

  const meshNode = doc.createMesh(mesh.name ?? 'mesh').addPrimitive(primitive);
  const node = doc.createNode('root').setMesh(meshNode);
  const scene = doc.createScene('scene').addChild(node);
  doc.getRoot().setDefaultScene(scene);

  return io.writeBinary(doc);
}
