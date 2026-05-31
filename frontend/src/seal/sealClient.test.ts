import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// --- Mock the @mysten/seal SessionKey at the boundary -----------------------
// SessionKey.create hits the network (suiClient.core.getObject) and
// setPersonalMessageSignature runs real signature verification. The cache /
// TTL logic under test is ours, so we stub ONLY the SessionKey class with a
// controllable fake, preserving every other real @mysten/seal export
// (SealClient etc.) so sealClient.ts still imports them. This is the only
// mocked layer in sessionKey.ts. vi.hoisted lets the fake be referenced inside
// the hoisted vi.mock factory.
const { FakeSessionKey } = vi.hoisted(() => {
  class FakeSessionKey {
    static lastCreateArgs: unknown = null;
    static expiredFlag = false;
    #address: string;
    #signature: string | null = null;
    constructor(address: string) {
      this.#address = address;
    }
    static async create(args: { address: string }) {
      FakeSessionKey.lastCreateArgs = args;
      return new FakeSessionKey(args.address);
    }
    getAddress() {
      return this.#address;
    }
    getPersonalMessage() {
      return new TextEncoder().encode(`personal-message:${this.#address}`);
    }
    async setPersonalMessageSignature(sig: string) {
      this.#signature = sig;
    }
    isExpired() {
      return FakeSessionKey.expiredFlag;
    }
    signature() {
      return this.#signature;
    }
  }
  return { FakeSessionKey };
});

let nowMs = 0;

vi.mock('@mysten/seal', async (importActual) => {
  const actual = await importActual<typeof import('@mysten/seal')>();
  return { ...actual, SessionKey: FakeSessionKey };
});

// Module under test is imported after the mock is registered.
import {
  SEAL_THRESHOLD,
  SESSION_KEY_TTL_MIN,
  SESSION_KEY_TTL_MS,
  getSealKeyServerConfigs,
} from './sealClient';
import {
  createSession,
  activateSession,
  getCachedSession,
  clearSession,
  clearAllSessions,
} from './sessionKey';

const ADDRESS = `0x${'a'.repeat(64)}`;
const PACKAGE = `0x${'b'.repeat(64)}`;
const stubSuiClient = {} as never;

beforeEach(() => {
  nowMs = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
  FakeSessionKey.expiredFlag = false;
  FakeSessionKey.lastCreateArgs = null;
  clearAllSessions();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sealClient config', () => {
  it('exposes exactly the two Mysten testnet key servers, weight 1, structured for a third', () => {
    const cfgs = getSealKeyServerConfigs('testnet');
    expect(cfgs).toHaveLength(2);
    expect(cfgs.map((c) => c.objectId)).toEqual([
      '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
      '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
    ]);
    expect(cfgs.every((c) => c.weight === 1)).toBe(true);
  });

  it('returns a defensive copy (callers cannot mutate the shared config)', () => {
    const a = getSealKeyServerConfigs('testnet');
    a[0]!.objectId = '0xdeadbeef';
    const b = getSealKeyServerConfigs('testnet');
    expect(b[0]!.objectId).not.toBe('0xdeadbeef');
  });

  it('threshold is 2 (2-of-2 today, 2-of-3 once a third server is added)', () => {
    expect(SEAL_THRESHOLD).toBe(2);
  });

  it('SESSION_KEY_TTL_MS is derived from the minute constant', () => {
    expect(SESSION_KEY_TTL_MIN).toBe(3);
    expect(SESSION_KEY_TTL_MS).toBe(SESSION_KEY_TTL_MIN * 60 * 1000);
  });
});

describe('sessionKey lifecycle', () => {
  it('createSession returns the personal-message bytes to sign and does not cache yet', async () => {
    const pending = await createSession(ADDRESS, PACKAGE, stubSuiClient);
    // Realm-agnostic Uint8Array check (jsdom vs Node constructors differ).
    expect(ArrayBuffer.isView(pending.personalMessage)).toBe(true);
    expect(pending.personalMessage.length).toBeGreaterThan(0);
    // Un-activated → not cached.
    expect(getCachedSession(ADDRESS, PACKAGE)).toBeNull();
    // TTL passed to the SDK in minutes.
    expect((FakeSessionKey.lastCreateArgs as { ttlMin: number }).ttlMin).toBe(
      SESSION_KEY_TTL_MIN,
    );
  });

  it('caches within the TTL after activation; same instance returned', async () => {
    const pending = await createSession(ADDRESS, PACKAGE, stubSuiClient);
    const activated = await activateSession(pending, PACKAGE, 'sig-123');
    // Within TTL window → cache hit, identical instance.
    nowMs += SESSION_KEY_TTL_MS - 1;
    expect(getCachedSession(ADDRESS, PACKAGE)).toBe(activated);
  });

  it('expires once the wall-clock TTL passes → forces a fresh signature', async () => {
    const pending = await createSession(ADDRESS, PACKAGE, stubSuiClient);
    await activateSession(pending, PACKAGE, 'sig-123');
    // Advance past the TTL window.
    nowMs += SESSION_KEY_TTL_MS;
    expect(getCachedSession(ADDRESS, PACKAGE)).toBeNull();
    // And a fresh create yields a brand-new pending session needing a new sign.
    const next = await createSession(ADDRESS, PACKAGE, stubSuiClient);
    expect(next.personalMessage.length).toBeGreaterThan(0);
    expect(getCachedSession(ADDRESS, PACKAGE)).toBeNull();
  });

  it('honors the SDK isExpired() flag even before the wall-clock TTL', async () => {
    const pending = await createSession(ADDRESS, PACKAGE, stubSuiClient);
    await activateSession(pending, PACKAGE, 'sig-123');
    FakeSessionKey.expiredFlag = true; // SDK considers it expired
    expect(getCachedSession(ADDRESS, PACKAGE)).toBeNull();
  });

  it('caches per (address, packageId) — no cross-address / cross-package reuse', async () => {
    const otherAddress = `0x${'c'.repeat(64)}`;
    const otherPackage = `0x${'d'.repeat(64)}`;
    const p1 = await createSession(ADDRESS, PACKAGE, stubSuiClient);
    await activateSession(p1, PACKAGE, 'sig');
    expect(getCachedSession(ADDRESS, PACKAGE)).not.toBeNull();
    // Different address, same package → miss.
    expect(getCachedSession(otherAddress, PACKAGE)).toBeNull();
    // Same address, different package → miss.
    expect(getCachedSession(ADDRESS, otherPackage)).toBeNull();
  });

  it('clearSession evicts a single entry', async () => {
    const pending = await createSession(ADDRESS, PACKAGE, stubSuiClient);
    await activateSession(pending, PACKAGE, 'sig');
    clearSession(ADDRESS, PACKAGE);
    expect(getCachedSession(ADDRESS, PACKAGE)).toBeNull();
  });
});
