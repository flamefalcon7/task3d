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
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { encodeMemory, parseMemory, type RecallChip } from '@overflow2026/shared';
import type { JwtSigner } from '../lib/jwt.js';
import { getMemwalClient, type MemwalClient } from '../lib/memwal-client.js';

export type { RecallChip };

export interface MemoryRouteDeps {
  jwt?: JwtSigner;
  /** Defaults to the env-backed singleton; tests inject a fake. */
  client?: MemwalClient;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
// The auth layer mints JWTs for addresses matching {1,64} hex; normalize the
// derived sub to canonical 64-hex so a valid-but-short address can't dead-feature
// a user (review). Read and write both normalize → namespaces stay consistent.
const RAW_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

// Shared community namespace (D-080 Global Recall). Personal records live under
// `namespace = wallet address`; non-RESTRICTED publishes are ALSO mirrored here.
export const GLOBAL_NAMESPACE = 'global';
// model3d.move policy ints (CreateModelPage): RESTRICTED=0, ALLOW_LIST=1, PERMISSIONLESS=2.
const POLICY_RESTRICTED = 0;
// Global recall over-fetches (exclude-self filters post-recall, so the page
// isn't silently short).
const GLOBAL_OVERFETCH = 4;
// Relevance gate: vector recall always returns nearest neighbours, so without a
// distance ceiling a junk/short query surfaces the whole pool. Probe data
// (text-embedding-3-small): real top matches ≤ ~0.71, junk/unrelated ≥ ~0.745.
// Drop results at/above this cosine distance. Env-tunable for the demo.
const RECALL_MAX_DISTANCE = Number(process.env.MEMORY_MAX_DISTANCE ?? '0.73');

const rememberSchema = z.object({
  prompt: z.string().min(1).max(2000),
  modelId: z.string().regex(ADDRESS_RE),
  // Gates the global dual-write. Optional for back-compat; absent → personal only.
  policy: z.number().int().min(0).max(2).optional(),
});
const recallSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(20).optional(),
  scope: z.enum(['personal', 'global']).optional(),
});

export interface MemoryWrite {
  namespace: string;
  text: string;
}

/**
 * The set of MemWal writes a single publish produces (D-080 dual-write). Shared
 * by the live /remember route AND the demo-seed script (U7) so seeded records
 * are byte-identical to live ones. `address` is the creator (= JWT sub = the
 * personal namespace, and the `c` in the global trailer).
 *   - personal namespace: ALL policies, trailer { m } (no creator).
 *   - global namespace: only policy ≠ RESTRICTED, trailer { m, c }.
 */
export function memoryWrites(address: string, prompt: string, modelId: string, policy?: number): MemoryWrite[] {
  const writes: MemoryWrite[] = [{ namespace: address, text: encodeMemory(prompt, { m: modelId }) }];
  if (policy !== undefined && policy !== POLICY_RESTRICTED) {
    writes.push({ namespace: GLOBAL_NAMESPACE, text: encodeMemory(prompt, { m: modelId, c: address }) });
  }
  return writes;
}

// Operator break-glass: addresses suppressed from global recall. Testnet's free
// publish fee is no spam deterrent, so this denylist — not the fee — is the real
// lever for the demo window. Seeded from env (comma-separated), mutable in tests.
const denylist = new Set<string>(
  (process.env.MEMORY_DENYLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
/** Test-only: replace the denylist contents. */
export function setMemoryDenylistForTest(addresses: string[]): void {
  denylist.clear();
  for (const a of addresses) denylist.add(a);
}

// Per-address fixed-window limiter (in-memory; demo-grade). Protects the shared
// sponsored relayer account from a single user's abuse. Mirrors the
// fixed-window shape in api/collections.ts, re-keyed from IP to address.
const WINDOW_MS = 60_000;
// Generous: /create fires TWO recalls per debounced keystroke (personal +
// community), so sustained typing must not self-throttle the demo. Recall is
// debounced + cheap; the denylist is the real spam lever (review).
const MAX_PER_WINDOW = 600;
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
    let sub: string;
    try {
      const claims = await deps.jwt.verifySession(token);
      sub = claims.sub;
    } catch {
      return c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401);
    }
    // Hard-fail (NOT empty 200) on a malformed derived namespace.
    if (!RAW_ADDRESS_RE.test(sub)) {
      return c.json({ error: 'auth_invalid', message: 'Token subject is not a valid address' }, 401);
    }
    const address = normalizeSuiAddress(sub); // canonical 0x + 64 hex
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

    const { prompt, modelId, policy } = parsed.data;
    const client = getClient();
    // Dual-write (best-effort, non-atomic — fire-and-forget; divergence tolerated,
    // consistent with fail-soft). Personal: all policies. Global: non-RESTRICTED
    // only. See memoryWrites — shared with the U7 seed for format parity.
    for (const w of memoryWrites(ns, prompt, modelId, policy)) {
      void client.remember(w.namespace, w.text);
    }
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

    const { query, limit, scope } = parsed.data;

    if (scope === 'global') {
      const n = limit ?? 10;
      // Over-fetch: exclude-self + denylist filter post-recall, so request more.
      const outcome = await getClient().recall(GLOBAL_NAMESPACE, query, {
        limit: n * GLOBAL_OVERFETCH,
        maxDistance: RECALL_MAX_DISTANCE,
      });
      const results: RecallChip[] = outcome.results
        .map((m) => ({ ...parseMemory(m.text), distance: m.distance }))
        // Drop unverifiable authorship; exclude the caller's own; honor denylist.
        .filter((r) => r.ref?.c && r.ref.c !== ns && !denylist.has(r.ref.c))
        .slice(0, n)
        .map((r) => ({ prompt: r.prompt, modelId: r.ref!.m, creator: r.ref!.c, distance: r.distance }));
      if (outcome.errored) c.header('x-memwal-degraded', '1');
      return c.json({ results });
    }

    const outcome = await getClient().recall(ns, query, { limit, maxDistance: RECALL_MAX_DISTANCE });
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
