// MCP bearer auth + per-address rate limit (plan-2026-06-10-001 U3, KTD-4, D-104).
//
// Every MCP tool (U4–U6) calls `requireAgentSub(extra, deps)` first: it
// verifies the JWT bearer that rode in on the HTTP request and yields the
// canonical (normalized) Sui address from `sub`, then applies a per-address
// fixed-window rate limit. Mirrors `routes/memory.ts:bindNamespace` — same
// hard-fail posture (a missing/invalid token or malformed sub is ALWAYS an
// explicit error, never a silent empty result) and the same address regexes.
//
// Header → tool threading (the "exposure mechanism" choice): route.ts parses
// `Authorization: Bearer` and passes the RAW token via the SDK's documented
// `transport.handleRequest(req, { authInfo })` seam, which surfaces it to tool
// handlers as `extra.authInfo`. The SDK's `AuthInfo` type requires `clientId`
// and `scopes`, which model an OAuth resource server we don't have — we
// satisfy them with placeholders (`clientId: ''`, `scopes: []`) and treat
// `token` as UNVERIFIED until this helper runs. Verification deliberately does
// NOT happen in route middleware: keeping it here means auth failures surface
// as tool-level results (`isError: true` with a structured message) that an
// agent can read and react to, instead of a bare transport 401 outside the
// JSON-RPC envelope.
//
// Error mechanism: handlers (and this helper) THROW `McpToolError`. The SDK's
// CallToolRequest dispatcher catches any thrown error and converts it to
// `{ content: [{ type:'text', text: error.message }], isError: true }`
// (verified in @modelcontextprotocol/sdk@1.29 server/mcp.js), so the
// machine-readable code is embedded as the `code: detail` message prefix.
// U4–U6 must use the same mechanism for their own domain errors.
import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { JwtSigner } from '../lib/jwt.js';

// Same shapes as routes/memory.ts: the auth layer mints JWTs for {1,64}-hex
// addresses; normalize to canonical 64-hex so short-form addresses rate-limit
// and namespace consistently with the memory route.
const RAW_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

export type McpToolErrorCode =
  // auth/limit (this module)
  | 'auth_unavailable'
  | 'auth_required'
  | 'auth_invalid'
  | 'rate_limited'
  // read tools (U4): id resolves to nothing / to a non-Model3D object
  | 'not_found'
  // read tools (U4): the upstream fullnode read itself failed
  | 'upstream_error';

/**
 * Tool-level error. Thrown from tool handlers; the SDK converts it into an
 * `isError: true` CallToolResult whose text is `"<code>: <detail>"`.
 */
export class McpToolError extends Error {
  readonly code: McpToolErrorCode;
  constructor(code: McpToolErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'McpToolError';
    this.code = code;
  }
}

/**
 * Parse an `Authorization` header into the SDK's `authInfo` shape for
 * `transport.handleRequest(req, { authInfo })`. Returns undefined when no
 * bearer is present (tools then fail with auth_required). Does NOT verify —
 * `requireAgentSub` owns verification so tools control the error shape.
 */
export function bearerAuthInfo(authHeader: string | undefined): AuthInfo | undefined {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : undefined;
  if (!token) return undefined;
  // clientId/scopes are required by the SDK type but model an OAuth setup we
  // don't run; placeholders only — nothing downstream reads them.
  return { token, clientId: '', scopes: [] };
}

// ---------------------------------------------------------------------------
// Per-address fixed-window rate limiter (in-memory; demo-grade). Mirrors the
// memory.ts limiter (re-keyed window per normalized sub) with two additions
// per project learnings: a hard key-map cap (audit W-2 — many cheap addresses
// must not grow the map unbounded) and an unref()'d periodic TTL sweep
// (docs/solutions/best-practices/in-memory-nonce-store-needs-explicit-ttl-
// sweep-2026-05-15.md — delete-on-touch alone leaks one-shot keys until cap
// pressure; the sweep keeps steady-state memory proportional to LIVE windows).
// ---------------------------------------------------------------------------

// Env convention follows memory.ts (RECALL_MAX_DISTANCE): module-load read
// with a sane default. MCP tool calls are deliberate agent RPCs (no debounced
// keystroke fan-out like /create recall), so the budget is tighter than
// memory.ts's 600/min.
const WINDOW_MS = Number(process.env.MCP_RATE_WINDOW_MS ?? '60000');
const MAX_PER_WINDOW = Number(process.env.MCP_RATE_MAX_PER_WINDOW ?? '120');
// Cap the limiter map (audit W-2 shape): evict the oldest key at the ceiling.
const MAX_KEYS = 50_000;
const SWEEP_INTERVAL_MS = 60_000;

export interface McpRateLimitOptions {
  windowMs?: number;
  maxPerWindow?: number;
  maxKeys?: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

const hits = new Map<string, WindowEntry>();

/** True when `address` has exhausted its fixed window. Exported for tests. */
export function mcpRateLimited(address: string, now = Date.now(), opts: McpRateLimitOptions = {}): boolean {
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const maxPerWindow = opts.maxPerWindow ?? MAX_PER_WINDOW;
  const maxKeys = opts.maxKeys ?? MAX_KEYS;
  const entry = hits.get(address);
  if (!entry || now >= entry.resetAt) {
    if (!entry && hits.size >= maxKeys) {
      // At the ceiling: sweep expired windows first (cheap), then evict the
      // oldest live key by insertion order (memory.ts / nonce-store idiom).
      sweepMcpRateLimit(now);
      while (hits.size >= maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
    }
    hits.set(address, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maxPerWindow;
}

/** Evict expired windows. Runs on the interval below; exported for tests. */
export function sweepMcpRateLimit(now = Date.now()): void {
  for (const [address, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(address);
  }
}

/** Test-only: clear all rate-limit windows. */
export function resetMcpRateLimitForTest(): void {
  hits.clear();
}

/** Test-only: current key-map size (cap/sweep assertions). */
export function mcpRateLimitSizeForTest(): number {
  return hits.size;
}

// unref so the sweep timer never keeps Node alive on shutdown (same guard as
// routes/auth.ts — typeof check because some runtimes return a number).
const sweepHandle = setInterval(() => sweepMcpRateLimit(), SWEEP_INTERVAL_MS);
if (typeof sweepHandle === 'object' && sweepHandle !== null && 'unref' in sweepHandle) {
  (sweepHandle as { unref: () => void }).unref();
}

// ---------------------------------------------------------------------------
// Bearer → canonical sub
// ---------------------------------------------------------------------------

export interface RequireAgentSubDeps {
  /** Verifies the bearer JWT. Absent (server misconfigured) → auth_unavailable. */
  jwt?: JwtSigner;
  /** Test/ops override of the rate-limit window; prod uses the env-backed defaults. */
  rateLimit?: McpRateLimitOptions;
}

/**
 * Verify the tool call's bearer JWT and return the canonical (normalized)
 * `sub` address, after charging the caller's rate-limit window.
 *
 * Throws `McpToolError` (→ `isError: true` tool result) on every failure —
 * NEVER returns a partial/empty success:
 *  - auth_unavailable — no JwtSigner configured (server misconfiguration)
 *  - auth_required    — no bearer token on the request
 *  - auth_invalid     — bad signature / expired / malformed claims / bad sub
 *  - rate_limited     — fixed window exhausted for this address
 */
export async function requireAgentSub(
  extra: { authInfo?: AuthInfo },
  deps: RequireAgentSubDeps,
): Promise<string> {
  if (!deps.jwt) {
    throw new McpToolError('auth_unavailable', 'MCP tools require server-side JWT configuration');
  }
  const token = extra.authInfo?.token;
  if (!token) {
    throw new McpToolError('auth_required', 'MCP tools require Authorization: Bearer <jwt>');
  }
  let sub: string;
  try {
    const claims = await deps.jwt.verifySession(token);
    sub = claims.sub;
  } catch {
    throw new McpToolError('auth_invalid', 'Invalid or expired session token');
  }
  // Hard-fail (NOT empty success) on a malformed derived address — a
  // derivation bug must never silently cross user boundaries (memory.ts P1).
  if (!RAW_ADDRESS_RE.test(sub)) {
    throw new McpToolError('auth_invalid', 'Token subject is not a valid address');
  }
  const address = normalizeSuiAddress(sub); // canonical 0x + 64 hex
  if (mcpRateLimited(address, Date.now(), deps.rateLimit)) {
    throw new McpToolError('rate_limited', 'Too many MCP tool calls for this address; retry after the window resets');
  }
  return address;
}
