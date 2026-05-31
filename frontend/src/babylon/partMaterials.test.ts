import { describe, it, expect } from 'vitest';
import { MAX_PARTS_FE } from '@overflow2026/shared';
import {
  isRenderableMesh,
  renderableMaterialNames,
  allNamesUniqueNonEmpty,
  isUploadTaggable,
  type RenderableMeshLike,
} from './partMaterials';

const mesh = (verts: number, materialName?: string | null): RenderableMeshLike => ({
  getTotalVertices: () => verts,
  material: materialName === undefined ? null : { name: materialName },
});

describe('isRenderableMesh', () => {
  it('is true for a mesh with > 0 vertices', () => {
    expect(isRenderableMesh(mesh(296, 'a'))).toBe(true);
  });
  it('is false for an empty mesh (0 vertices — __root__/transform node)', () => {
    expect(isRenderableMesh(mesh(0, 'a'))).toBe(false);
  });
  it('is false when getTotalVertices is missing', () => {
    expect(isRenderableMesh({ material: { name: 'a' } })).toBe(false);
  });
});

describe('renderableMaterialNames', () => {
  it('drops empty meshes and maps material names in order', () => {
    const names = renderableMaterialNames([
      mesh(0, '__root__'), // dropped
      mesh(296, 'chassis'),
      mesh(304, 'wheels'),
      mesh(0, 'ghost'), // dropped
      mesh(98, 'spoiler'),
    ]);
    expect(names).toEqual(['chassis', 'wheels', 'spoiler']);
  });

  it('yields null for a renderable mesh with no material or an unnamed material', () => {
    const names = renderableMaterialNames([
      mesh(10, 'a'),
      mesh(10), // no material → null
      mesh(10, null), // unnamed → null
    ]);
    expect(names).toEqual(['a', null, null]);
  });
});

describe('allNamesUniqueNonEmpty', () => {
  it('is true for distinct non-empty names', () => {
    expect(allNamesUniqueNonEmpty(['a', 'b', 'c'])).toBe(true);
  });
  it('is false when any name is null', () => {
    expect(allNamesUniqueNonEmpty(['a', null, 'c'])).toBe(false);
  });
  it('is false when any name is empty', () => {
    expect(allNamesUniqueNonEmpty(['a', '', 'c'])).toBe(false);
  });
  it('is false when names collide (name-keying would be ambiguous)', () => {
    expect(allNamesUniqueNonEmpty(['a', 'b', 'a'])).toBe(false);
  });
});

describe('isUploadTaggable', () => {
  it('is false for a single-part base (nothing to segment)', () => {
    expect(isUploadTaggable(['only'])).toBe(false);
  });
  it('is true for a multi-part base with unique non-empty names', () => {
    expect(isUploadTaggable(['chassis', 'wheels', 'spoiler'])).toBe(true);
  });
  it('is true at exactly MAX_PARTS_FE parts', () => {
    const names = Array.from({ length: MAX_PARTS_FE }, (_, i) => `p${i}`);
    expect(isUploadTaggable(names)).toBe(true);
  });
  it('is false past the on-chain MAX_PARTS_FE cap', () => {
    const names = Array.from({ length: MAX_PARTS_FE + 1 }, (_, i) => `p${i}`);
    expect(isUploadTaggable(names)).toBe(false);
  });
  it('is false for duplicate material names', () => {
    expect(isUploadTaggable(['body', 'body'])).toBe(false);
  });
  it('is false when a part material is unnamed', () => {
    expect(isUploadTaggable(['body', null])).toBe(false);
  });
});
