// MCP bearer auth + rate-limit tests (plan-2026-06-10-001 U3, KTD-4, D-104).
//
// `requireAgentSub` is the gate every tool (U4–U6) calls first, so the
// contract under test is: valid bearer → normalized sub; EVERY failure mode →
// a thrown McpToolError (which the SDK turns into an `isError: true` tool
// result) — never a silent empty/partial success.
import { describe, it, expect, beforeEach } from 'vitest';
import { sign } from 'hono/jwt';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  bearerAuthInfo,
  McpToolError,
  mcpRateLimited,
  mcpRateLimitSizeForTest,
  requireAgentSub,
  resetMcpRateLimitForTest,
  sweepMcpRateLimit,
} from './auth.js';
import { createJwtSigner, type JwtSigner, type SessionClaims } from '../lib/jwt.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';
const WALLET2 = '0x0000000000000000000000000000000000000000000000000000000000000002';
// Short-form address: passes RAW_ADDRESS_RE, must come back normalized.
const SHORT = '0xabc';
// 65 hex chars: passes jwt.ts's open-ended sub regex but fails RAW_ADDRESS_RE.
const TOO_LONG = `0x${'a'.repeat(65)}`;
const SECRET = 's'.repeat(32); // assertJwtSecret minimum

// token → claims stub (memory.test.ts idiom). 'valid' → WALLET; 'short' →
// short-form sub; 'toolong' → over-length sub; anything else throws.
const stubJwt: JwtSigner = {
  async signSession() {
    return 'valid';
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token === 'valid') return { sub: WALLET } as SessionClaims;
    if (token === 'valid2') return { sub: WALLET2 } as SessionClaims;
    if (token === 'short') return { sub: SHORT } as SessionClaims;
    if (token === 'toolong') return { sub: TOO_LONG } as SessionClaims;
    throw new Error('invalid');
  },
};

function extraFor(token: string | undefined) {
  return { authInfo: bearerAuthInfo(token === undefined ? undefined : `Bearer ${token}`) };
}

async function expectToolError(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected a McpToolError(${code}), got a resolved value`).toBeInstanceOf(McpToolError);
  expect((err as McpToolError).code).toBe(code);
  // The SDK surfaces only `error.message` as the isError text — the
  // machine-readable code must ride in the message prefix.
  expect((err as McpToolError).message.startsWith(`${code}:`)).toBe(true);
}

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('bearerAuthInfo', () => {
  it('parses a Bearer header into the SDK authInfo shape (token unverified)', () => {
    expect(bearerAuthInfo('Bearer abc.def.ghi')).toEqual({ token: 'abc.def.ghi', clientId: '', scopes: [] });
  });

  it('returns undefined for missing, empty, or non-Bearer headers', () => {
    expect(bearerAuthInfo(undefined)).toBeUndefined();
    expect(bearerAuthInfo('')).toBeUndefined();
    expect(bearerAuthInfo('Basic dXNlcjpwdw==')).toBeUndefined();
    expect(bearerAuthInfo('Bearer ')).toBeUndefined();
  });
});

describe('requireAgentSub — auth', () => {
  it('valid JWT → returns the normalized sub', async () => {
    await expect(requireAgentSub(extraFor('valid'), { jwt: stubJwt })).resolves.toBe(WALLET);
  });

  it('short-form sub is normalized to canonical 64-hex', async () => {
    await expect(requireAgentSub(extraFor('short'), { jwt: stubJwt })).resolves.toBe(normalizeSuiAddress(SHORT));
  });

  it('missing bearer → auth_required (no authInfo at all)', async () => {
    await expectToolError(requireAgentSub({}, { jwt: stubJwt }), 'auth_required');
    await expectToolError(requireAgentSub(extraFor(undefined), { jwt: stubJwt }), 'auth_required');
  });

  it('malformed JWT → auth_invalid', async () => {
    await expectToolError(requireAgentSub(extraFor('garbage'), { jwt: stubJwt }), 'auth_invalid');
  });

  it('expired JWT (real signer, exp in the past) → auth_invalid', async () => {
    const jwt = createJwtSigner(SECRET);
    const now = Math.floor(Date.now() / 1000);
    const expired = await sign({ sub: WALLET, iat: now - 7200, exp: now - 3600 }, SECRET, 'HS256');
    await expectToolError(requireAgentSub(extraFor(expired), { jwt }), 'auth_invalid');
  });

  it('sub failing RAW_ADDRESS_RE (65 hex chars) → auth_invalid, never a silent pass', async () => {
    await expectToolError(requireAgentSub(extraFor('toolong'), { jwt: stubJwt }), 'auth_invalid');
  });

  it('no JwtSigner configured → auth_unavailable (server misconfiguration is loud)', async () => {
    await expectToolError(requireAgentSub(extraFor('valid'), {}), 'auth_unavailable');
  });
});

describe('requireAgentSub — rate limit', () => {
  it('N+1th call within the window throttles one sub; a different sub is unaffected', async () => {
    const deps = { jwt: stubJwt, rateLimit: { maxPerWindow: 3 } };
    for (let i = 0; i < 3; i++) {
      await expect(requireAgentSub(extraFor('valid'), deps)).resolves.toBe(WALLET);
    }
    await expectToolError(requireAgentSub(extraFor('valid'), deps), 'rate_limited');
    // Different address: fresh window, unaffected by WALLET's exhaustion.
    await expect(requireAgentSub(extraFor('valid2'), deps)).resolves.toBe(WALLET2);
  });
});

describe('mcpRateLimited window mechanics', () => {
  const opts = { windowMs: 1000, maxPerWindow: 2 };

  it('resets the window after windowMs elapses', () => {
    const t0 = 1_000_000;
    expect(mcpRateLimited(WALLET, t0, opts)).toBe(false);
    expect(mcpRateLimited(WALLET, t0 + 1, opts)).toBe(false);
    expect(mcpRateLimited(WALLET, t0 + 2, opts)).toBe(true); // 3rd in-window call
    expect(mcpRateLimited(WALLET, t0 + 1000, opts)).toBe(false); // new window
  });

  it('caps the key map and evicts the oldest key', () => {
    const capped = { ...opts, maxKeys: 2 };
    const t0 = 1_000_000;
    mcpRateLimited('0x1', t0, capped);
    mcpRateLimited('0x2', t0, capped);
    expect(mcpRateLimitSizeForTest()).toBe(2);
    mcpRateLimited('0x3', t0, capped); // at ceiling → evicts oldest (0x1)
    expect(mcpRateLimitSizeForTest()).toBe(2);
    // 0x1 was evicted: it gets a brand-new window (count restarts at 1), while
    // 0x3 (still resident) keeps accumulating in its existing window.
    mcpRateLimited('0x3', t0 + 1, capped);
    expect(mcpRateLimited('0x3', t0 + 2, capped)).toBe(true);
    expect(mcpRateLimited('0x1', t0 + 3, { ...capped, maxKeys: 50 })).toBe(false);
  });

  it('sweep clears expired entries (and only expired entries)', () => {
    const t0 = 1_000_000;
    mcpRateLimited('0x1', t0, opts); // resetAt = t0 + 1000
    mcpRateLimited('0x2', t0 + 500, opts); // resetAt = t0 + 1500
    expect(mcpRateLimitSizeForTest()).toBe(2);
    sweepMcpRateLimit(t0 + 1000); // 0x1 expired, 0x2 still live
    expect(mcpRateLimitSizeForTest()).toBe(1);
    sweepMcpRateLimit(t0 + 1500);
    expect(mcpRateLimitSizeForTest()).toBe(0);
  });
});
