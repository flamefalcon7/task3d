import { Document, NodeIO } from '@gltf-transform/core';

const io = new NodeIO();

export interface MeshData {
  positions: Float32Array;
  indices: Uint16Array;
  name?: string;
}

// Serialize a single-mesh, single-node, single-scene glTF document to GLB bytes.
// @gltf-transform/core handles min/max bounds + buffer layout that Babylon needs.
export async function meshToGlb(mesh: MeshData): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();

  // TS 5.7 tightened TypedArray generics; @gltf-transform/core types expect
  // <ArrayBuffer> but new Float32Array(...) returns <ArrayBufferLike>.
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
