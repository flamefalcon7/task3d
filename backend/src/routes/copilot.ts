// L2 Riff Copilot route (plan-002 U4, D-081).
//
// JWT-authed proxy in front of Gemini for the conversational prompt-authoring
// copilot. Mirrors `routes/memory.ts`: the Gemini key lives only in the backend;
// `namespace` is derived SERVER-SIDE from the verified token address (a
// client-supplied namespace is ignored). Namespace binding is a hard 401, never
// a silent fallback. Everything downstream is fail-soft: a recall failure
// degrades to an empty memory context (the copilot still works), and any copilot
// failure (no key, model error, timeout) returns a clean `{ available: false }`
// the frontend treats as "hide the toggle" — never a 5xx that breaks /create.
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { parseMemory } from '@overflow2026/shared';
import type { JwtSigner } from '../lib/jwt.js';
import { getMemwalClient, type MemwalClient } from '../lib/memwal-client.js';
import {
  getCopilotClient,
  CopilotDegradedError,
  MAX_TURNS,
  type CopilotClient,
  type CopilotMessage,
} from '../lib/copilot-client.js';
import { getQuotaStore, type QuotaStore } from '../lib/quota-store.js';
import { checkGeminiQuota, quotaStateAfterFailure, quotaExhaustedBody } from './geminiQuotaGate.js';

export interface CopilotRouteDeps {
  jwt?: JwtSigner;
  /** Defaults to the env-backed singletons; tests inject fakes. */
  client?: CopilotClient;
  memory?: MemwalClient;
  /** Durable quota store (U1); defaults to the shared singleton (single-connection
   *  invariant — same handle the client closure records into). */
  store?: QuotaStore;
}

// Mirror memory.ts: auth layer mints JWTs for {1,64} hex; normalize to canonical 64-hex.
const RAW_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

// How many of the creator's past prompts to fold into the copilot's context.
const RECALL_LIMIT = 5;

// Per-address fixed-window limiter. Each turn is an LLM hit, so this cap is far
// lower than memory recall's (a 3-turn convo = 3 calls; 30/min ≈ 10 convos/min).
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
export function resetCopilotRateLimitForTest(): void {
  hits.clear();
}

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});
const turnSchema = z.object({
  // Bounded: at most one user seed + (question+answer)×MAX_TURNS keeps payloads small
  // and the turn count honest. Server still derives the cap from assistant count.
  // Must contain at least one USER message — blocks role-spoofed / all-assistant
  // arrays that would feed an ungrounded conversation to Gemini (review: adversarial
  // role-spoof). NOT "must end with user": "Generate now" legitimately fires right
  // after a copilot question, so the array can end with an assistant turn.
  messages: z
    .array(messageSchema)
    .min(1)
    .max(2 * MAX_TURNS + 1)
    .refine((m) => m.some((x) => x.role === 'user'), { message: 'at least one user message required' }),
  forceSynthesize: z.boolean().optional(),
});

/** The number of copilot turns already taken = count of assistant messages. */
function deriveTurnIndex(messages: CopilotMessage[]): number {
  return messages.filter((m) => m.role === 'assistant').length;
}

/** The most recent user message drives memory recall (the current idea). */
function lastUserMessage(messages: CopilotMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user') return m.content;
  }
  return null;
}

export function buildCopilotRoute(deps: CopilotRouteDeps) {
  const route = new Hono();
  const getClient = () => deps.client ?? getCopilotClient();
  const getMemory = () => deps.memory ?? getMemwalClient();
  const getStore = () => deps.store ?? getQuotaStore();

  // Verify JWT → bound Sui address (the namespace). Returns the address or a 401
  // Response. NEVER fail-soft on binding (mirrors memory.ts).
  async function bindNamespace(c: Context): Promise<string | Response> {
    if (!deps.jwt) {
      return c.json({ error: 'auth_unavailable', message: 'Copilot requires server-side JWT configuration' }, 503);
    }
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
    if (!token) {
      return c.json({ error: 'auth_required', message: 'Copilot requires Authorization: Bearer <jwt>' }, 401);
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

  route.post('/turn', async (c) => {
    const ns = await bindNamespace(c);
    if (ns instanceof Response) return ns;
    if (rateLimited(ns)) return c.json({ error: 'rate_limited' }, 429);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const parsed = turnSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_params', issues: parsed.error.issues }, 400);
    }

    const { messages, forceSynthesize } = parsed.data;
    const client = getClient();

    // Short-circuit when the copilot is not configured — clean degraded signal,
    // no recall, no LLM attempt. THE ONE sanctioned hide (AE7/R10).
    if (!client.configured) {
      c.header('x-copilot-degraded', '1');
      return c.json({ available: false });
    }

    // Budget gate (R6/R8/R9): if the daily operator budget OR this address's daily
    // cap is spent, OR a 429 cooldown is active, report a VISIBLE quota state with a
    // reset hint — NOT available:false. The feature stays present and auto-recovers.
    const store = getStore();
    const budget = checkGeminiQuota('copilot', store, ns);
    if (!budget.ok) {
      c.header('x-copilot-degraded', '1');
      return c.json(quotaExhaustedBody(budget.retryAfterMs));
    }

    // Recall the caller's OWN past prompts (fail-soft: ANY failure — relayer error
    // OR a malformed record that throws in parseMemory — degrades to empty context;
    // the copilot still works. The route must never 500 here, per R10 (review).
    let memoryContext: string[] = [];
    const query = lastUserMessage(messages);
    if (query) {
      try {
        const outcome = await getMemory().recall(ns, query, { limit: RECALL_LIMIT });
        memoryContext = outcome.results.map((m) => parseMemory(m.text).prompt).filter(Boolean);
      } catch (e) {
        console.warn('[copilot] recall/parse failed (fail-soft → empty context):', e instanceof Error ? e.message : e);
        memoryContext = [];
      }
    }

    const turnIndex = deriveTurnIndex(messages);
    try {
      const result = await client.turn({ messages, memoryContext, turnIndex, forceSynthesize });
      // Per-address usage counter (R8) — the client closure already counted the
      // global budget + recorded any 429; here we advance only this address's bucket.
      store.recordGeminiUsage('copilot', { scope: ns });
      return c.json({ available: true, result, turnIndex });
    } catch (e) {
      // The copilot IS configured but this call failed. If the failure was a 429 the
      // client closure already recorded a cooldown — surface the VISIBLE quota state
      // (R6) so the client shows "retry ~X" and auto-recovers, instead of the generic
      // retryable shape. A non-429 hiccup/timeout stays generic-retryable. Either way
      // available:true (only `!client.configured` hides). Never leak the key.
      if (!(e instanceof CopilotDegradedError)) {
        console.warn('[copilot] unexpected route error (degraded):', e instanceof Error ? e.message : e);
      }
      c.header('x-copilot-degraded', '1');
      const q = quotaStateAfterFailure('copilot', store);
      if (q.quota) return c.json(quotaExhaustedBody(q.retryAfterMs));
      return c.json({ available: true, error: 'unavailable', retryable: true });
    }
  });

  return route;
}
