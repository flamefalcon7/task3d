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
  /** On-chain read slice for the global-mirror verification (review SEC-1).
   *  Defaults to the live `getSuiClient()` at call time; tests inject a fake. */
  suiClient?: { getObject(params: { id: string; options?: { showContent?: boolean } }): Promise<unknown> };
  /** Deployed model3d package id; defaults to `NETWORK.packageId` at call time. */
  packageId?: string;
}

// model3d.move LicenseTerms policy int for RESTRICTED (never mirrored).
const CHAIN_POLICY_RESTRICTED = 0;

/**
 * Review SEC-1 — the GLOBAL community mirror must not trust client-supplied
 * claims: before mirroring, verify on-chain that `modelId` is OUR package's
 * Model3D, that its `creator` is the authenticated wallet, and read the
 * POLICY from the object (the client-sent `policy` is only the trigger to
 * attempt mirroring). Fail-CLOSED: any read error or mismatch skips the
 * mirror (the personal write is unaffected — a user can only pollute their
 * own namespace).
 */
async function verifyGlobalMirror(
  deps: MemoryRouteDeps,
  modelId: string,
  creator: string,
): Promise<{ ok: boolean; chainPolicy?: number }> {
  try {
    let client = deps.suiClient;
    let packageId = deps.packageId;
    if (!client || !packageId) {
      // Dynamic import on purpose: sui/client.ts reads testnet.json at module
      // load; importing this route must not trigger that (mirrors mcp/tools).
      const live = await import('../sui/client.js');
      client = client ?? live.getSuiClient();
      packageId = packageId ?? live.NETWORK.packageId;
    }
    const resp = (await client.getObject({ id: modelId, options: { showContent: true } })) as {
      data?: { content?: { dataType?: string; type?: string; fields?: Record<string, unknown> | null } | null } | null;
    };
    const content = resp.data?.content;
    if (!content || content.dataType !== 'moveObject' || content.type !== `${packageId}::model3d::Model3D`) {
      return { ok: false };
    }
    const fields = (content.fields ?? {}) as Record<string, unknown>;
    const chainCreator = String(fields.creator ?? '');
    if (!chainCreator || normalizeSuiAddress(chainCreator) !== creator) return { ok: false };
    // JSON-RPC renders nested structs as { type, fields }.
    const license = fields.license as { fields?: Record<string, unknown> } | undefined;
    const chainPolicy = Number(license?.fields?.policy ?? CHAIN_POLICY_RESTRICTED);
    return { ok: true, chainPolicy };
  } catch {
    return { ok: false };
  }
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
// The auth layer mints JWTs for addresses matching {1,64} hex; normalize the
// derived sub to canonical 64-hex so a valid-but-short address can't dead-feature
// a user (review). Read and write both normalize → namespaces stay consistent.
const RAW_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

// Shared memory config moved to lib/memoryConfig.ts (review M-004) so the MCP
// search_models tool shares it without importing this route module. Re-exported
// here for existing importers (tests, seeds).
export {
  GLOBAL_NAMESPACE,
  GLOBAL_OVERFETCH,
  RECALL_MAX_DISTANCE,
  isDenylistedCreator,
  setMemoryDenylistForTest,
} from '../lib/memoryConfig.js';
import {
  GLOBAL_NAMESPACE,
  GLOBAL_OVERFETCH,
  RECALL_MAX_DISTANCE,
  isDenylistedCreator,
} from '../lib/memoryConfig.js';
// model3d.move policy ints (CreateModelPage): RESTRICTED=0, ALLOW_LIST=1, PERMISSIONLESS=2.
const POLICY_RESTRICTED = 0;


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


// Per-address fixed-window limiter (in-memory; demo-grade). Protects the shared
// sponsored relayer account from a single user's abuse. Mirrors the
// fixed-window shape in api/collections.ts, re-keyed from IP to address.
const WINDOW_MS = 60_000;
// Generous: /create fires TWO recalls per debounced keystroke (personal +
// community), so sustained typing must not self-throttle the demo. Recall is
// debounced + cheap; the denylist is the real spam lever (review).
const MAX_PER_WINDOW = 600;
// Cap the limiter map (audit W-2): an attacker controlling many distinct (cheaply
// generated) addresses would otherwise grow it unbounded — a slow memory-
// exhaustion DoS. Evict the oldest key when at the ceiling.
const MAX_KEYS = 50_000;
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(address: string, now = Date.now()): boolean {
  const entry = hits.get(address);
  if (!entry || now >= entry.resetAt) {
    if (hits.size >= MAX_KEYS) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
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
    // Personal write: fire-and-forget, all policies (a user can only pollute
    // their own namespace). Format parity with the U7 seed via encodeMemory.
    void client.remember(ns, encodeMemory(prompt, { m: modelId }));
    // Global mirror: only after on-chain verification (review SEC-1) — the
    // client-sent `policy` merely triggers the attempt; type, creator, and
    // the mirrored-or-not decision come from the chain. Awaited (one fullnode
    // read at publish time), the write itself stays fire-and-forget.
    let globalMirror: 'written' | 'skipped' = 'skipped';
    if (policy !== undefined && policy !== CHAIN_POLICY_RESTRICTED) {
      const verdict = await verifyGlobalMirror(deps, modelId, ns);
      if (verdict.ok && verdict.chainPolicy !== CHAIN_POLICY_RESTRICTED) {
        void client.remember(GLOBAL_NAMESPACE, encodeMemory(prompt, { m: modelId, c: ns }));
        globalMirror = 'written';
      }
    }
    return c.json({ status: 'accepted', globalMirror }, 202);
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
        .filter((r) => r.ref?.c && r.ref.c !== ns && !isDenylistedCreator(r.ref.c))
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
