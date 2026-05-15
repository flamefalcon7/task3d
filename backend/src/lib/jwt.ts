import { sign, verify } from 'hono/jwt';
import type { JWTPayload } from 'hono/utils/jwt/types';

// HS256, 24h expiry (plan P5). Symmetric secret is fine for Phase 2; rotate to
// asymmetric (RS256) in Phase 4 when a second service consumes these JWTs.
const ALG = 'HS256';
const TTL_SECONDS = 24 * 60 * 60;

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
      const decoded = (await verify(token, secret, ALG)) as unknown as SessionClaims;
      return decoded;
    },
  };
}
