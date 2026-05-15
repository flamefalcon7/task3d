import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { challengeRequestSchema, verifyRequestSchema } from '../lib/schema.js';
import type { JwtSigner } from '../lib/jwt.js';

const NONCE_BYTES = 32;
const NONCE_TTL_MS = 5 * 60 * 1000;

interface NonceEntry {
  address: string;
  expiresAt: number;
}

// Nonce-keyed (not address-keyed): per doc-review SEC, address-keyed would
// silently overwrite an in-flight challenge if the user clicks Sign In twice.
// Phase 2 in-memory only; backend restart between challenge and verify
// invalidates pending sign-ins (acceptable for hackathon scope; Phase 3 Redis).
//
// Lazy delete-on-read in `take` only evicts entries the client comes back
// for — abandoned challenges (closed tab, rejected wallet popup) leak. The
// sweep below evicts expired entries on a fixed interval so process memory
// stays bounded. See docs/solutions/best-practices/in-memory-nonce-store-
// needs-explicit-ttl-sweep for the rationale.
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000;

export interface NonceStore {
  put(nonce: string, entry: NonceEntry): void;
  take(nonce: string): NonceEntry | undefined;
  size(): number;
  stopSweep(): void;
}

export function createInMemoryNonceStore(
  now: () => number = Date.now,
  sweepIntervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
): NonceStore {
  const map = new Map<string, NonceEntry>();

  const sweep = (): void => {
    const t = now();
    for (const [nonce, entry] of map) {
      if (entry.expiresAt < t) map.delete(nonce);
    }
  };

  const handle = setInterval(sweep, sweepIntervalMs);
  // unref so the sweep timer doesn't keep Node alive on shutdown.
  if (typeof handle === 'object' && handle !== null && 'unref' in handle) {
    (handle as { unref: () => void }).unref();
  }

  return {
    put(nonce, entry) {
      map.set(nonce, entry);
    },
    take(nonce) {
      const entry = map.get(nonce);
      if (!entry) return undefined;
      map.delete(nonce);
      if (entry.expiresAt < now()) return undefined;
      return entry;
    },
    size: () => map.size,
    stopSweep: () => clearInterval(handle),
  };
}

// Personal-message envelope that wallets sign. Plain UTF-8; the wallet
// applies the BCS PersonalMessage wrapping internally before signing.
function challengeMessage(nonce: string): string {
  return `overflow2026 sign-in: ${nonce}`;
}

export interface AuthDeps {
  jwt: Pick<JwtSigner, 'signSession'>;
  nonces?: NonceStore;
  now?: () => number;
  generateNonce?: () => string;
  verifyMessage?: (
    message: Uint8Array,
    signature: string,
    options: { address: string },
  ) => Promise<unknown>;
}

export function buildAuthRoute(deps: AuthDeps) {
  const now = deps.now ?? Date.now;
  const nonces = deps.nonces ?? createInMemoryNonceStore(now);
  const generateNonce = deps.generateNonce ?? (() => randomBytes(NONCE_BYTES).toString('hex'));
  const verify = deps.verifyMessage ?? verifyPersonalMessageSignature;

  const app = new Hono();

  app.post('/challenge', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = challengeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', detail: parsed.error.flatten() }, 400);
    }
    const nonce = generateNonce();
    nonces.put(nonce, {
      address: parsed.data.address,
      expiresAt: now() + NONCE_TTL_MS,
    });
    return c.json({ nonce });
  });

  app.post('/verify', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = verifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', detail: parsed.error.flatten() }, 400);
    }
    const { address, nonce, signature } = parsed.data;

    const entry = nonces.take(nonce);
    if (!entry) {
      // Covers: unknown nonce, expired nonce, already-consumed nonce.
      return c.json({ error: 'unknown_or_expired_nonce' }, 401);
    }
    if (entry.address !== address) {
      return c.json({ error: 'address_mismatch' }, 401);
    }

    const message = new TextEncoder().encode(challengeMessage(nonce));
    try {
      // verifyPersonalMessageSignature reads the flag byte (0x00 Ed25519,
      // 0x01 Secp256k1, 0x02 Secp256r1, 0x05 zkLogin) from the signature
      // payload, picks the right scheme, validates against the embedded
      // public key, derives the Sui address, and (with options.address)
      // asserts equality — throws on any mismatch.
      await verify(message, signature, { address });
    } catch {
      return c.json({ error: 'invalid_signature' }, 401);
    }

    const jwt = await deps.jwt.signSession(address);
    return c.json({ jwt });
  });

  return app;
}
