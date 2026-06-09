import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { encodeSuiPrivateKey } from '@mysten/sui/cryptography';
import {
  InvalidTestWalletKeyError,
  MissingTestWalletKeyError,
  __resetCacheForTests,
  keypairFromBech32,
  loadKeypair,
} from './loadKeypair';

// why: vitest's vi.stubEnv writes to import.meta.env at runtime so the
// readKeyFromEnv() helper picks up per-test values; unstub restores the
// real env between cases so they don't leak.
describe('loadKeypair (plan-016 U1)', () => {
  let validBech32: string;
  let validAddress: string;

  beforeEach(() => {
    __resetCacheForTests();
    const kp = Ed25519Keypair.generate();
    validBech32 = kp.getSecretKey();
    validAddress = kp.toSuiAddress();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetCacheForTests();
  });

  it('returns an Ed25519Keypair whose address matches the loaded key', () => {
    vi.stubEnv('VITE_TEST_WALLET_KEY', validBech32);
    const kp = loadKeypair();
    expect(kp).toBeInstanceOf(Ed25519Keypair);
    expect(kp.toSuiAddress()).toBe(validAddress);
  });

  it('caches the keypair across calls (singleton)', () => {
    vi.stubEnv('VITE_TEST_WALLET_KEY', validBech32);
    const first = loadKeypair();
    const second = loadKeypair();
    expect(second).toBe(first);
  });

  it('throws MissingTestWalletKeyError when VITE_TEST_WALLET_KEY is unset', () => {
    vi.stubEnv('VITE_TEST_WALLET_KEY', '');
    expect(() => loadKeypair()).toThrow(MissingTestWalletKeyError);
    expect(() => loadKeypair()).toThrow(/VITE_TEST_WALLET_KEY is missing/);
  });

  it('throws MissingTestWalletKeyError on whitespace-only key', () => {
    vi.stubEnv('VITE_TEST_WALLET_KEY', '   \t\n  ');
    expect(() => loadKeypair()).toThrow(MissingTestWalletKeyError);
  });

  it('throws InvalidTestWalletKeyError on garbage bech32', () => {
    expect(() => keypairFromBech32('not-a-key')).toThrow(InvalidTestWalletKeyError);
  });

  it('throws InvalidTestWalletKeyError on a Secp256k1-scheme bech32 key', () => {
    // why: encode a 32-byte secret with the Secp256k1 flag (0x01) so the
    // bech32 envelope is syntactically valid but fromSecretKey rejects it
    // for scheme mismatch ('Expected a ED25519 keypair, got Secp256k1').
    // We wrap as InvalidTestWalletKeyError so the wrapper hook can render
    // the same banner copy regardless of which validation failed.
    const bytes = new Uint8Array(32).fill(7);
    const secpBech32 = encodeSuiPrivateKey(bytes, 'Secp256k1');
    expect(() => keypairFromBech32(secpBech32)).toThrow(InvalidTestWalletKeyError);
  });

  it('production guard: CALLING loadKeypair/keypairFromBech32 under PROD throws (importing is side-effect-free — D-103)', () => {
    // D-103 — the guard moved from a module-top throw (which blanked every
    // prod build, since the wrapper hooks statically import this module) into
    // the entry functions. Importing must now be harmless; only an actual
    // CALL in a production build fails loudly. In a real prod build
    // TEST_WALLET_ENABLED is false so neither is ever called.
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_TEST_WALLET_KEY', validBech32);
    expect(() => loadKeypair()).toThrow(/used in a production build/);
    expect(() => keypairFromBech32(validBech32)).toThrow(/used in a production build/);
    vi.unstubAllEnvs();
  });
});
