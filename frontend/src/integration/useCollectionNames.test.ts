import { describe, it, expect } from 'vitest';
import { stripTokenSuffix, buildNameMap } from './useCollectionNames';

const cid = (ch: string) => '0x' + ch.repeat(64);

describe('stripTokenSuffix', () => {
  it('strips the per-token mint suffix', () => {
    expect(stripTokenSuffix('Neon drift #1')).toBe('Neon drift');
    expect(stripTokenSuffix('Neon drift #12')).toBe('Neon drift');
  });

  it('passes through names without a suffix', () => {
    expect(stripTokenSuffix('Neon drift')).toBe('Neon drift');
  });

  it('only strips a trailing suffix, not an interior hash', () => {
    expect(stripTokenSuffix('Lot #5 Racer #3')).toBe('Lot #5 Racer');
  });

  it('trims surrounding whitespace', () => {
    expect(stripTokenSuffix('  Neon drift  #4  ')).toBe('Neon drift');
  });
});

describe('buildNameMap', () => {
  it('maps collectionId to the stripped name, first token wins', () => {
    const map = buildNameMap([
      { collectionId: cid('a'), name: 'Neon drift #1' },
      { collectionId: cid('a'), name: 'Neon drift #2' },
      { collectionId: cid('b'), name: 'Tusk racer #1' },
    ]);
    expect(map.get(cid('a'))).toBe('Neon drift');
    expect(map.get(cid('b'))).toBe('Tusk racer');
    expect(map.size).toBe(2);
  });

  it('skips tokens with an empty collection id or empty stripped name', () => {
    const map = buildNameMap([
      { collectionId: '', name: 'Orphan #1' },
      { collectionId: cid('c'), name: '#1' }, // strips to '' → skipped
    ]);
    expect(map.size).toBe(0);
  });

  it('does not let a later empty-named token shadow an earlier real name', () => {
    const map = buildNameMap([
      { collectionId: cid('a'), name: 'Neon drift #1' },
      { collectionId: cid('a'), name: '' },
    ]);
    expect(map.get(cid('a'))).toBe('Neon drift');
  });
});
