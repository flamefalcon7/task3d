import { describe, it, expect } from 'vitest';
import { extractCreatedModelId } from './extractModelId';

const PKG = '0xpkg';

describe('extractCreatedModelId', () => {
  it('returns the created Model3D object id', () => {
    const id = extractCreatedModelId([
      { type: 'mutated', objectType: '0x2::coin::Coin', objectId: '0xgas' },
      { type: 'created', objectType: `${PKG}::model3d::Model3D`, objectId: '0xmodel' },
    ]);
    expect(id).toBe('0xmodel');
  });

  it('ignores created objects of other types', () => {
    const id = extractCreatedModelId([
      { type: 'created', objectType: `${PKG}::model3d::AccessEntitlement`, objectId: '0xent' },
      { type: 'created', objectType: `${PKG}::model3d::NftCollection`, objectId: '0xcol' },
    ]);
    expect(id).toBeNull();
  });

  it('returns null when objectChanges has no created Model3D', () => {
    expect(extractCreatedModelId([])).toBeNull();
    expect(extractCreatedModelId([{ type: 'mutated', objectType: `${PKG}::model3d::Model3D`, objectId: '0xm' }])).toBeNull();
  });
});
