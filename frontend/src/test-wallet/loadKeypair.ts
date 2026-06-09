// plan-016 U1 — load a Sui Ed25519Keypair from VITE_TEST_WALLET_KEY in
// .env.local. The keypair instance IS the Signer the rest of the dapp
// needs — @mysten/sui's Ed25519Keypair extends the Signer abstract class
// with toSuiAddress / signTransaction / signAndExecuteTransaction /
// signPersonalMessage, matching dapp-kit's hook outputs.
//
// This file is import-gated behind the VITE_TEST_WALLET flag in wrapper
// hooks (frontend/src/wallet/*) — production code never reaches here
// when the flag is unset, and ESLint blocks accidental imports from
// outside frontend/src/wallet/* (see eslint.config.js, plan-016 U6).

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// D-103 production guard. The test wallet is dev-only. This guard was
// originally a MODULE-TOP `throw` (D-061) meant to fire on import as a belt
// against accidental ship. But the wrapper hooks (useAppSigner /
// useAppAccount) STATICALLY import this module, and a top-level throw is a
// side effect tree-shaking can't eliminate — so EVERY production build
// evaluated it and blanked the app (React root unmounts; the error goes to
// window.onerror, not the console, so it was invisible). The guard now lives
// inside the entry functions: it still fails loudly if anything actually
// CALLS the test wallet in a prod build, without the import-time side effect.
// In a normal prod build TEST_WALLET_ENABLED is false, so neither is called.
function assertNotProductionBuild(): void {
  if (import.meta.env.PROD) {
    throw new Error(
      'test-wallet/loadKeypair used in a production build — refusing. ' +
        'The test wallet is dev-only; build with VITE_TEST_WALLET unset.',
    );
  }
}

export class MissingTestWalletKeyError extends Error {
  override name = 'MissingTestWalletKey';
  constructor() {
    super(
      // plan-016 code-review hotfix — append the Vite restart hint. Vite
      // reads .env files only at server start; a dev who adds the key
      // while pnpm dev is running will see the banner persist until they
      // restart. The hint avoids the most common first-use friction.
      'TEST_WALLET enabled but VITE_TEST_WALLET_KEY is missing — set it in .env.local, then restart Vite (env vars are loaded at server start)',
    );
  }
}

export class InvalidTestWalletKeyError extends Error {
  override name = 'InvalidTestWalletKey';
  constructor(reason: string) {
    super(`VITE_TEST_WALLET_KEY is invalid: ${reason}`);
  }
}

let cached: Ed25519Keypair | null = null;

// why: read from import.meta.env so Vite replaces the value at build time;
// in unit tests, vitest's environment exposes it via the same hook.
function readKeyFromEnv(): string | undefined {
  const raw = import.meta.env?.VITE_TEST_WALLET_KEY;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// why: pure factory used by the test suite to probe error paths without
// fighting import.meta.env globals — the production loadKeypair() just
// reads the env var and delegates here.
export function keypairFromBech32(bech32: string): Ed25519Keypair {
  assertNotProductionBuild();
  try {
    return Ed25519Keypair.fromSecretKey(bech32);
  } catch (err) {
    throw new InvalidTestWalletKeyError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function loadKeypair(): Ed25519Keypair {
  assertNotProductionBuild();
  if (cached) return cached;
  const bech32 = readKeyFromEnv();
  if (!bech32) throw new MissingTestWalletKeyError();
  cached = keypairFromBech32(bech32);
  return cached;
}

// why: vitest resets module state between test files but the cached
// keypair survives within a single file's runs — expose a reset hook so
// negative-path tests (missing key, invalid key) don't read a stale
// happy-path cache.
export function __resetCacheForTests(): void {
  cached = null;
}
