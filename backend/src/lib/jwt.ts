import { sign, verify } from 'hono/jwt';
import type { JWTPayload } from 'hono/utils/jwt/types';
import { z } from 'zod';

// HS256, 24h expiry (plan P5). Symmetric secret is fine for Phase 2; rotate to
// asymmetric (RS256) in Phase 4 when a second service consumes these JWTs.
const ALG = 'HS256';
const TTL_SECONDS = 24 * 60 * 60;

// Validates the claims shape Hono's verify() returns. Catches forged tokens
// signed with the right secret but carrying garbage payloads (defense in depth
// against `as unknown as SessionClaims` casts trusting upstream too far).
const SessionClaimsSchema = z.object({
  sub: z.string().regex(/^0x[0-9a-fA-F]+$/, 'sub must be a 0x-prefixed Sui address'),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});

export interface SessionClaims extends JWTPayload {
  sub: string; // Sui address (0x-prefixed)
  iat: number;
  exp: number;
}

export class JwtConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtConfigError';
  }
}

export class JwtMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtMalformedError';
  }
}

// Per plan + doc-review SEC-002: refuse to start with a missing/weak secret.
// 32 bytes is the HS256 minimum-strength threshold (matches the hash output
// width — anything shorter is a guessable secret).
export function assertJwtSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < 32) {
    throw new JwtConfigError(
      'JWT_SECRET must be set and at least 32 bytes long (cryptographic strength requirement)',
    );
  }
}

export interface JwtSigner {
  signSession(address: string): Promise<string>;
  verifySession(token: string): Promise<SessionClaims>;
}

export function createJwtSigner(secret: string): JwtSigner {
  assertJwtSecret(secret);
  return {
    async signSession(address: string): Promise<string> {
      const now = Math.floor(Date.now() / 1000);
      const payload: SessionClaims = {
        sub: address,
        iat: now,
        exp: now + TTL_SECONDS,
      };
      return sign(payload, secret, ALG);
    },
    async verifySession(token: string): Promise<SessionClaims> {
      const raw = await verify(token, secret, ALG);
      const parsed = SessionClaimsSchema.safeParse(raw);
      if (!parsed.success) {
        throw new JwtMalformedError(
          `JWT payload does not match SessionClaims schema: ${parsed.error.message}`,
        );
      }
      // SessionClaims extends JWTPayload (open); spread keeps any extra JWT-standard
      // fields (iss, aud, etc.) Hono may have populated while guaranteeing the three
      // we depend on are valid.
      return { ...(raw as JWTPayload), ...parsed.data };
    },
  };
}
