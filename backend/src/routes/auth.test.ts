import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildAuthRoute, createInMemoryNonceStore } from './auth.js';
import { buildJwt } from '../server.js';
import { createJwtSigner, JwtConfigError, assertJwtSecret } from '../lib/jwt.js';

const VALID_SECRET = 'a'.repeat(64);
const ADDRESS = `0x${'a'.repeat(64)}`;
const OTHER_ADDRESS = `0x${'b'.repeat(64)}`;

function mountAuth(opts: Parameters<typeof buildAuthRoute>[0]) {
  const app = new Hono();
  app.route('/api/auth', buildAuthRoute(opts));
  return app;
}

async function postJson(app: Hono, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/challenge', () => {
  it('returns a fresh nonce on happy path', async () => {
    const jwt = createJwtSigner(VALID_SECRET);
    const app = mountAuth({ jwt });
    const res = await postJson(app, '/api/auth/challenge', { address: ADDRESS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nonce: string };
    expect(typeof body.nonce).toBe('string');
    expect(body.nonce.length).toBeGreaterThanOrEqual(32);
  });

  it('returns unique nonces for repeated calls (nonce-keyed storage)', async () => {
    const app = mountAuth({ jwt: createJwtSigner(VALID_SECRET) });
    const a = (await (await postJson(app, '/api/auth/challenge', { address: ADDRESS })).json()) as { nonce: string };
    const b = (await (await postJson(app, '/api/auth/challenge', { address: ADDRESS })).json()) as { nonce: string };
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('rejects malformed address payload with 400', async () => {
    const app = mountAuth({ jwt: createJwtSigner(VALID_SECRET) });
    const res = await postJson(app, '/api/auth/challenge', { address: 'not-an-address' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify', () => {
  let issued: string | null;
  let verifyMessage: ReturnType<typeof vi.fn>;
  let jwt: ReturnType<typeof createJwtSigner>;

  beforeEach(() => {
    issued = null;
    verifyMessage = vi.fn().mockResolvedValue({ /* PublicKey stub */ });
    jwt = createJwtSigner(VALID_SECRET);
  });

  async function getNonce(app: Hono, address = ADDRESS) {
    const res = await postJson(app, '/api/auth/challenge', { address });
    return ((await res.json()) as { nonce: string }).nonce;
  }

  it('happy path: Ed25519 signature → returns JWT decoding to { sub: address }', async () => {
    const app = mountAuth({ jwt, verifyMessage });
    const nonce = await getNonce(app);
    const res = await postJson(app, '/api/auth/verify', {
      address: ADDRESS,
      nonce,
      signature: 'AHN0dWItZWQyNTUxOS1zaWc=', // 0x00 flag-prefixed stub
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jwt: string };
    issued = body.jwt;
    expect(typeof issued).toBe('string');
    const claims = await jwt.verifySession(issued);
    expect(claims.sub).toBe(ADDRESS);
    // verify was called with the right address option
    expect(verifyMessage).toHaveBeenCalledWith(expect.any(Uint8Array), expect.any(String), {
      address: ADDRESS,
    });
  });

  it('happy path: zkLogin signature (flag 0x05) → returns JWT', async () => {
    const app = mountAuth({ jwt, verifyMessage });
    const nonce = await getNonce(app);
    const res = await postJson(app, '/api/auth/verify', {
      address: ADDRESS,
      nonce,
      // Real zkLogin signatures start with 0x05; verifyPersonalMessageSignature
      // dispatches by reading the first byte. We mock the verify function so
      // the test only confirms the route doesn't pre-filter by scheme.
      signature: 'BXprbG9naW4tc2lnLXBheWxvYWQ=',
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { jwt: string }).jwt).toBeTruthy();
  });

  it('unknown nonce → 401', async () => {
    const app = mountAuth({ jwt, verifyMessage });
    const res = await postJson(app, '/api/auth/verify', {
      address: ADDRESS,
      nonce: 'never-issued',
      signature: 'AHN0dWI=',
    });
    expect(res.status).toBe(401);
    // verify must NOT have been called — short-circuit on unknown nonce.
    expect(verifyMessage).not.toHaveBeenCalled();
  });

  it('wrong signature (verify throws) → 401', async () => {
    verifyMessage.mockRejectedValueOnce(new Error('Signature is not valid'));
    const app = mountAuth({ jwt, verifyMessage });
    const nonce = await getNonce(app);
    const res = await postJson(app, '/api/auth/verify', {
      address: ADDRESS,
      nonce,
      signature: 'AHd1cnotc2ln',
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_signature');
  });

  it('address mismatch (claimed != stored against nonce) → 401', async () => {
    const app = mountAuth({ jwt, verifyMessage });
    const nonce = await getNonce(app, ADDRESS);
    const res = await postJson(app, '/api/auth/verify', {
      address: OTHER_ADDRESS, // doesn't match the address bound to the nonce
      nonce,
      signature: 'AHN0dWI=',
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('address_mismatch');
    expect(verifyMessage).not.toHaveBeenCalled();
  });

  it('expired nonce (>5min) → 401', async () => {
    let nowMs = 1_000_000_000_000;
    const nonces = createInMemoryNonceStore(() => nowMs);
    const app = mountAuth({ jwt, verifyMessage, nonces, now: () => nowMs });
    const nonce = await getNonce(app);
    nowMs += 5 * 60 * 1000 + 1; // tip past TTL
    const res = await postJson(app, '/api/auth/verify', {
      address: ADDRESS,
      nonce,
      signature: 'AHN0dWI=',
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unknown_or_expired_nonce');
    expect(verifyMessage).not.toHaveBeenCalled();
    nonces.stopSweep();
  });

  it('sweep evicts expired nonces in the background', async () => {
    // Tight sweep interval (real time, not now-injection) so the test runs
    // fast. The store's internal setInterval is real; the entries' TTLs are
    // checked against the injected `now`.
    let nowMs = 1_000_000_000_000;
    const store = createInMemoryNonceStore(() => nowMs, /* sweepIntervalMs */ 30);
    store.put('a', { address: ADDRESS, expiresAt: nowMs + 100 });  // valid for 100ms
    store.put('b', { address: ADDRESS, expiresAt: nowMs + 10_000 }); // valid for 10s
    expect(store.size()).toBe(2);

    nowMs += 200; // 'a' is now expired
    await new Promise((r) => setTimeout(r, 60)); // let two sweep ticks fire

    expect(store.size()).toBe(1);
    store.stopSweep();
  });

  it('nonce reuse → second call returns 401', async () => {
    const app = mountAuth({ jwt, verifyMessage });
    const nonce = await getNonce(app);
    const first = await postJson(app, '/api/auth/verify', {
      address: ADDRESS,
      nonce,
      signature: 'AHN0dWI=',
    });
    expect(first.status).toBe(200);
    const second = await postJson(app, '/api/auth/verify', {
      address: ADDRESS,
      nonce,
      signature: 'AHN0dWI=',
    });
    expect(second.status).toBe(401);
  });
});

describe('JWT lifecycle', () => {
  it('signSession → verifySession returns the address', async () => {
    const signer = createJwtSigner(VALID_SECRET);
    const token = await signer.signSession(ADDRESS);
    const claims = await signer.verifySession(token);
    expect(claims.sub).toBe(ADDRESS);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('expired token is rejected', async () => {
    const signer = createJwtSigner(VALID_SECRET);
    // Backdate iat/exp so the token is already expired. Use the underlying
    // hono/jwt to forge a payload directly so we don't have to wait 24h.
    const { sign } = await import('hono/jwt');
    const past = Math.floor(Date.now() / 1000) - 60 * 60;
    const expired = await sign({ sub: ADDRESS, iat: past - 10, exp: past }, VALID_SECRET, 'HS256');
    await expect(signer.verifySession(expired)).rejects.toThrow();
  });

  it('rejects a validly-signed token whose payload does not match SessionClaims', async () => {
    // Forge a token signed with the right secret but missing `sub` — defends
    // against a coding regression that would re-introduce the `as unknown as
    // SessionClaims` cast and silently accept malformed payloads.
    // iat must be ≤ now to pass Hono's iat-window check before our zod runs.
    const signer = createJwtSigner(VALID_SECRET);
    const { sign } = await import('hono/jwt');
    const now = Math.floor(Date.now() / 1000);
    const malformed = await sign({ iat: now - 60, exp: now + 3600 }, VALID_SECRET, 'HS256');
    await expect(signer.verifySession(malformed)).rejects.toThrow(/SessionClaims/);
  });

  it('rejects a token whose sub is not a 0x-prefixed Sui address', async () => {
    const signer = createJwtSigner(VALID_SECRET);
    const { sign } = await import('hono/jwt');
    const now = Math.floor(Date.now() / 1000);
    const malformed = await sign(
      { sub: 'not-an-address', iat: now - 60, exp: now + 3600 },
      VALID_SECRET,
      'HS256',
    );
    await expect(signer.verifySession(malformed)).rejects.toThrow(/SessionClaims/);
  });
});

describe('startup: JWT_SECRET validation', () => {
  it('assertJwtSecret throws when missing', () => {
    expect(() => assertJwtSecret(undefined)).toThrow(JwtConfigError);
  });

  it('assertJwtSecret throws when shorter than 32 bytes', () => {
    expect(() => assertJwtSecret('short')).toThrow(JwtConfigError);
  });

  it('buildJwt throws when JWT_SECRET missing from env', () => {
    expect(() => buildJwt({} as NodeJS.ProcessEnv)).toThrow(JwtConfigError);
  });

  it('buildJwt throws when JWT_SECRET is weak', () => {
    expect(() => buildJwt({ JWT_SECRET: 'too-short' } as NodeJS.ProcessEnv)).toThrow(JwtConfigError);
  });

  it('buildJwt succeeds with valid secret', () => {
    expect(() => buildJwt({ JWT_SECRET: VALID_SECRET } as NodeJS.ProcessEnv)).not.toThrow();
  });
});
