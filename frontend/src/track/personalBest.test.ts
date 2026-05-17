import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPb, setPb } from './personalBest';

describe('personalBest', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('returns null for a car with no stored PB', () => {
    expect(getPb('0xMISSING')).toBeNull();
  });

  it('roundtrips a PB through setPb + getPb', () => {
    setPb('0xCAR', 24310);
    expect(getPb('0xCAR')).toBe(24310);
  });

  it('keys PBs per car so different cars do not collide (AE6 foundation)', () => {
    setPb('0xCARA', 12345);
    setPb('0xCARB', 99999);
    expect(getPb('0xCARA')).toBe(12345);
    expect(getPb('0xCARB')).toBe(99999);
  });

  it('returns null when the stored value is non-numeric garbage', () => {
    localStorage.setItem('track-pb:0xJUNK', 'not-a-number');
    expect(getPb('0xJUNK')).toBeNull();
  });

  it('setPb does not throw when localStorage.setItem throws (R-r5)', () => {
    // Simulate private/incognito mode by stubbing setItem to throw.
    const throwingStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    vi.stubGlobal('localStorage', throwingStorage);
    expect(() => setPb('0xCAR', 1000)).not.toThrow();
  });

  it('getPb returns null when localStorage.getItem throws (R-r5)', () => {
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new DOMException('SecurityError', 'SecurityError');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    vi.stubGlobal('localStorage', throwingStorage);
    expect(getPb('0xCAR')).toBeNull();
  });
});
