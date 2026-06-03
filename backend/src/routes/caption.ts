// Upload Captioning route (plan 2026-06-03-001 U2, D-082).
//
// JWT-authed proxy in front of Gemini vision. Mirrors `routes/copilot.ts`: the
// Gemini key lives only in the backend; the namespace is derived SERVER-SIDE from
// the verified token address and used only for auth + rate-limit keying (this
// route reads no memory). Binding is a hard 401, never a silent fallback. The
// call is fail-soft: a not-configured client returns a clean `{ available: false }`
// (frontend hides the button) and a transient model failure returns
// `{ available: true, error, retryable }` — never a 5xx that breaks /create.
//
// Per R6 the request carries IMAGES ONLY — the schema has no filename / mesh /
// text-hint field, so no misleading text can reach the model.
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { JwtSigner } from '../lib/jwt.js';
import { getCaptionClient, CaptionDegradedError, type CaptionClient } from '../lib/caption-client.js';
import { getQuotaStore, type QuotaStore } from '../lib/quota-store.js';
import { checkGeminiQuota, quotaStateAfterFailure, quotaExhaustedBody } from './geminiQuotaGate.js';

export interface CaptionRouteDeps {
  jwt?: JwtSigner;
  /** Defaults to the env-backed singleton; tests inject a fake. */
  client?: CaptionClient;
  /** Durable quota store (U1); defaults to the shared singleton (single-connection
   *  invariant — same handle the client closure records into). */
  store?: QuotaStore;
}

// Mirror memory.ts/copilot.ts: auth layer mints JWTs for {1,64} hex; normalize to canonical 64-hex.
const RAW_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

// Per-address fixed-window limiter. Each call is a vision LLM hit; 30/min is
// generous for a manual "Describe with AI" button.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
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
export function resetCaptionRateLimitForTest(): void {
  hits.clear();
}

/** At most this many turntable frames per request (R13 — bound the payload). */
export const MAX_FRAMES = 6;
// A 512px WebP frame is a few KB → ~tens of KB base64. Cap generously but bounded
// so a single request can't ship multi-MB blobs (R13). 400k chars ≈ 300 KB binary.
const BASE64_MAX = 400_000;
// Hard request-body ceiling, enforced BEFORE the body is buffered/parsed (review:
// adversarial — c.req.json() buffers the whole body first, so the zod caps alone
// can't stop an oversized payload from being allocated). Sized to cover the worst
// in-spec body (MAX_FRAMES × BASE64_MAX + JSON overhead ≈ 2.4 MB) with headroom.
// Mirrors collection.ts's bodyLimit posture.
const MAX_BODY_BYTES = 3 * 1024 * 1024;

const frameSchema = z.object({
  base64: z.string().min(1).max(BASE64_MAX),
  mediaType: z.literal('image/webp'),
});
const captionSchema = z.object({
  frames: z.array(frameSchema).min(1).max(MAX_FRAMES),
});

export function buildCaptionRoute(deps: CaptionRouteDeps) {
  const route = new Hono();
  const getClient = () => deps.client ?? getCaptionClient();
  const getStore = () => deps.store ?? getQuotaStore();

  // Verify JWT → bound Sui address. Returns the address or a 401 Response. NEVER
  // fail-soft on binding (mirrors memory.ts/copilot.ts).
  async function bindNamespace(c: Context): Promise<string | Response> {
    if (!deps.jwt) {
      return c.json({ error: 'auth_unavailable', message: 'Captioning requires server-side JWT configuration' }, 503);
    }
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
    if (!token) {
      return c.json({ error: 'auth_required', message: 'Captioning requires Authorization: Bearer <jwt>' }, 401);
    }
    let sub: string;
    try {
      const claims = await deps.jwt.verifySession(token);
      sub = claims.sub;
    } catch {
      return c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401);
    }
    if (!RAW_ADDRESS_RE.test(sub)) {
      return c.json({ error: 'auth_invalid', message: 'Token subject is not a valid address' }, 401);
    }
    return normalizeSuiAddress(sub);
  }

  route.post(
    '/',
    // Reject oversized bodies before buffering/parsing (review: adversarial OOM).
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ error: 'payload_too_large' }, 413) }),
    async (c) => {
    const ns = await bindNamespace(c);
    if (ns instanceof Response) return ns;
    if (rateLimited(ns)) return c.json({ error: 'rate_limited' }, 429);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = captionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_params', issues: parsed.error.issues }, 400);
    }

    const client = getClient();
    // Not configured (no key) → clean degraded signal; the frontend hides the button.
    // THE ONE sanctioned hide (AE7/R10).
    if (!client.configured) {
      c.header('x-caption-degraded', '1');
      return c.json({ available: false });
    }

    // Budget gate (R6/R8/R9): spent budget / address cap / active 429 cooldown →
    // VISIBLE quota state with a reset hint, NOT available:false.
    const store = getStore();
    const budget = checkGeminiQuota('caption', store, ns);
    if (!budget.ok) {
      c.header('x-caption-degraded', '1');
      return c.json(quotaExhaustedBody(budget.retryAfterMs));
    }

    try {
      const caption = await client.caption({ frames: parsed.data.frames });
      store.recordGeminiUsage('caption', { scope: ns }); // per-address counter (R8)
      return c.json({ available: true, caption });
    } catch (e) {
      // Configured but this call failed. A recorded 429 (by the client closure) →
      // VISIBLE quota state (R6); a non-429 hiccup/timeout stays generic-retryable.
      // Either way available:true — never a 5xx, never the key.
      if (!(e instanceof CaptionDegradedError)) {
        console.warn('[caption] unexpected route error (degraded):', e instanceof Error ? e.message : e);
      }
      c.header('x-caption-degraded', '1');
      const q = quotaStateAfterFailure('caption', store);
      if (q.quota) return c.json(quotaExhaustedBody(q.retryAfterMs));
      return c.json({ available: true, error: 'unavailable', retryable: true });
    }
    },
  );

  return route;
}
