// MemWal memory proxy (plan-001 U3, D-080).
//
// JWT-authed proxy in front of the MemWal relayer. The delegate key lives only
// in the backend; the browser never sees it. `namespace` is derived SERVER-SIDE
// from the verified token address — a client-supplied namespace is ignored
// (R7). Network calls are fail-soft (recall failure → 200 + []), but namespace
// binding is NOT: a missing/invalid JWT or a malformed derived namespace is a
// hard 401, never a silent empty result (review P1 — prevents a derivation bug
// from silently crossing user boundaries).
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { encodeMemory, parseMemory } from '@overflow2026/shared';
import type { JwtSigner } from '../lib/jwt.js';
import { getMemwalClient, type MemwalClient } from '../lib/memwal-client.js';

export interface MemoryRouteDeps {
  jwt?: JwtSigner;
  /** Defaults to the env-backed singleton; tests inject a fake. */
  client?: MemwalClient;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

const rememberSchema = z.object({
  prompt: z.string().min(1).max(2000),
  modelId: z.string().regex(ADDRESS_RE),
});
const recallSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(20).optional(),
});

/** A recalled memory mapped for the client (no blob_id, no raw trailer). */
export interface RecallChip {
  prompt: string;
  modelId: string | null;
  distance: number;
}

// Per-address fixed-window limiter (in-memory; demo-grade). Protects the shared
// sponsored relayer account from a single user's abuse. Mirrors the
// fixed-window shape in api/collections.ts, re-keyed from IP to address.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(address: string, now = Date.now()): boolean {
  const entry = hits.get(address);
  if (!entry || now >= entry.resetAt) {
    hits.set(address, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

/** Test-only: clear the rate-limit window. */
export function resetMemoryRateLimitForTest(): void {
  hits.clear();
}

export function buildMemoryRoute(deps: MemoryRouteDeps) {
  const route = new Hono();
  const getClient = () => deps.client ?? getMemwalClient();

  // Verify JWT → bound Sui address (the namespace). Returns the address or a
  // 401 Response. NEVER fail-soft: the caller must hard-fail on a Response.
  async function bindNamespace(c: Context): Promise<string | Response> {
    if (!deps.jwt) {
      return c.json({ error: 'auth_unavailable', message: 'Memory requires server-side JWT configuration' }, 503);
    }
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
    if (!token) {
      return c.json({ error: 'auth_required', message: 'Memory requires Authorization: Bearer <jwt>' }, 401);
    }
    let address: string;
    try {
      const claims = await deps.jwt.verifySession(token);
      address = claims.sub;
    } catch {
      return c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401);
    }
    // Hard-fail (NOT empty 200) on a malformed derived namespace.
    if (!ADDRESS_RE.test(address)) {
      return c.json({ error: 'auth_invalid', message: 'Token subject is not a valid address' }, 401);
    }
    return address;
  }

  route.post('/remember', async (c) => {
    const ns = await bindNamespace(c);
    if (ns instanceof Response) return ns;
    if (rateLimited(ns)) return c.json({ error: 'rate_limited' }, 429);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = rememberSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_params', issues: parsed.error.issues }, 400);
    }

    const text = encodeMemory(parsed.data.prompt, { m: parsed.data.modelId });
    // Fire-and-forget: do NOT await the relayer job — respond 202 immediately.
    void getClient().remember(ns, text);
    return c.json({ status: 'accepted' }, 202);
  });

  route.post('/recall', async (c) => {
    const ns = await bindNamespace(c);
    if (ns instanceof Response) return ns;
    if (rateLimited(ns)) return c.json({ error: 'rate_limited' }, 429);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = recallSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_params', issues: parsed.error.issues }, 400);
    }

    const outcome = await getClient().recall(ns, parsed.data.query, { limit: parsed.data.limit });
    const results: RecallChip[] = outcome.results.map((m) => {
      const { prompt, ref } = parseMemory(m.text);
      return { prompt, modelId: ref?.m ?? null, distance: m.distance };
    });
    // Operator-only degraded signal; clients still get a clean 200 + [].
    if (outcome.errored) c.header('x-memwal-degraded', '1');
    return c.json({ results });
  });

  return route;
}
