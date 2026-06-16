import { Hono } from 'hono';
import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import type { GenerateResponse, Router, TripoParams } from '@overflow2026/shared';
import { promptRequestSchema } from '../lib/schema.js';
import { buildLineageJson, buildLineageStub } from '../lib/lineage.js';
import { TripoDisabledError } from '../agent/router.js';
import {
  TripoAuthError,
  TripoTimeoutError,
  TripoFailedError,
  TripoFormatError,
} from '../lib/tripo-client.js';
import type { JwtSigner } from '../lib/jwt.js';
import type { PaymentVerifier } from '../sui/paymentVerifier.js';
import { createGenerateJobStore, type GenerateJobStore } from '../lib/generate-jobs.js';

export interface GenerateRouteDeps {
  router: Router;
  // Prompt-mode hits the paid Tripo API, so requests require a valid session
  // (review #2 P0). Optional only so unit tests can construct the route without
  // a signer — the route returns 503 if it's absent at request time.
  jwt?: JwtSigner;
  // D-034: when wired, prompt-mode additionally requires a verified SUI
  // service-fee payment (paymentDigest) before Tripo runs.
  paymentVerifier?: PaymentVerifier;
  // D-106: async job store. Injectable for tests; one is created per route
  // otherwise (POST writes, GET /result reads the same instance).
  jobStore?: GenerateJobStore;
}

interface ClassifiedError {
  code: string;
  httpStatus: number;
  refundable: boolean;
}

// Map a live-Tripo failure to a typed code + status (D-083/U5) so the frontend
// renders honest, branchable copy. `paid` marks post-payment failures refundable
// (R3) — the page shows "fee may be refundable — contact us"; no auto-refund here.
function classifyTripoError(err: unknown, paid: boolean): ClassifiedError {
  if (err instanceof TripoDisabledError) return { code: 'tripo_disabled', httpStatus: 400, refundable: false };
  // Operator-side (key/credit misconfig) — temporary outage, not user-refundable.
  if (err instanceof TripoAuthError) return { code: 'tripo_unavailable', httpStatus: 503, refundable: false };
  if (err instanceof TripoTimeoutError) return { code: 'tripo_timeout', httpStatus: 504, refundable: paid };
  if (err instanceof TripoFailedError) return { code: 'tripo_failed', httpStatus: 502, refundable: paid };
  if (err instanceof TripoFormatError) return { code: 'tripo_failed', httpStatus: 502, refundable: paid };
  return { code: 'internal', httpStatus: 500, refundable: paid };
}

export function buildGenerateRoute(deps: GenerateRouteDeps) {
  const route = new Hono();
  const jobs = deps.jobStore ?? createGenerateJobStore();

  // Shared bearer-JWT gate. Returns the verified subject, or a Response to return.
  async function authSub(c: Context): Promise<{ ok: true; sub: string } | { ok: false; res: Response }> {
    if (!deps.jwt) {
      return { ok: false, res: c.json({ error: 'auth_unavailable', message: 'Prompt-mode requires server-side JWT configuration' }, 503) };
    }
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
    if (!token) {
      return { ok: false, res: c.json({ error: 'auth_required', message: 'Prompt-mode requires Authorization: Bearer <jwt>' }, 401) };
    }
    try {
      const claims = await deps.jwt.verifySession(token);
      return { ok: true, sub: claims.sub };
    } catch {
      return { ok: false, res: c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401) };
    }
  }

  // The long part — runs in the background (fire-and-forget); writes the terminal
  // state into the job store. NEVER throws out (would be an unhandledRejection).
  async function runJob(jobId: string, prompt: string, paid: boolean): Promise<void> {
    try {
      const routeResult = await deps.router.route({ prompt });
      const finalParams = routeResult.lineageStub.params;
      if (!finalParams) {
        jobs.setError(jobId, 'router_no_params', 502, false);
        return;
      }
      const { generator, lineageStub: routeStub } = routeResult;
      const { glbBytes, lineageStub: genStub } = await generator.generate(finalParams as TripoParams);

      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const lineageInput = {
        id,
        shape: 'tripo' as const,
        params: finalParams as TripoParams,
        generatorSource: 'tripo' as const,
        createdAt,
        prompt,
        ...(routeStub.llmDecision !== undefined ? { llmDecision: routeStub.llmDecision } : {}),
      };
      const result: GenerateResponse = {
        glbBytes: Buffer.from(glbBytes).toString('base64'),
        lineageJson: buildLineageJson(lineageInput),
        lineageStub: { ...routeStub, ...genStub, ...buildLineageStub(lineageInput) },
      };
      jobs.setDone(jobId, result);
    } catch (err) {
      const { code, httpStatus, refundable } = classifyTripoError(err, paid);
      // Log EVERY terminal failure (not just unknown) with the full error — the
      // stack pinpoints which Tripo call threw and TripoFailedError carries the
      // upstream status + body snippet. Without this the VM journal showed nothing
      // for a classified error (the deploy blind-spot that cost us a debugging round).
      console.error(`[generate] job ${jobId} → ${code} (${httpStatus}):`, err);
      jobs.setError(jobId, code, httpStatus, refundable);
    }
  }

  // D-106: dispatch. Validate + auth + verify payment SYNCHRONOUSLY (pay-gate
  // unchanged), then kick off the background job and return 202 { jobId }.
  route.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== 'object') {
      return c.json({ error: 'invalid body' }, 400);
    }

    // D-033: only Tripo prompt-mode remains.
    const promptParsed = promptRequestSchema.safeParse(body);
    if (!promptParsed.success) {
      return c.json({ error: 'invalid params', issues: promptParsed.error.issues }, 400);
    }

    const auth = await authSub(c);
    if (!auth.ok) return auth.res;

    // D-034 pay-gate: when a verifier is wired, prompt-mode requires a verified
    // SUI service-fee payment before the paid Tripo call is dispatched.
    if (deps.paymentVerifier) {
      const paymentDigest = promptParsed.data.paymentDigest;
      if (!paymentDigest) {
        return c.json({ error: 'payment_required', message: 'Prompt-mode requires a paymentDigest (SUI service fee)' }, 402);
      }
      const result = await deps.paymentVerifier.verify(paymentDigest, auth.sub);
      if (!result.ok) {
        return c.json({ error: 'payment_invalid', reason: result.reason }, 402);
      }
    }

    const jobId = randomUUID();
    jobs.create(jobId, auth.sub);
    // Fire-and-forget; runJob catches everything and writes terminal state.
    void runJob(jobId, promptParsed.data.prompt, !!deps.paymentVerifier);
    return c.json({ jobId }, 202);
  });

  // D-106: poll. Owner-scoped; a terminal read deletes the record (delete-on-fetch).
  route.get('/result/:jobId', async (c) => {
    const auth = await authSub(c);
    if (!auth.ok) return auth.res;

    const lookup = jobs.take(c.req.param('jobId'), auth.sub);
    if (lookup.kind === 'not_found') return c.json({ error: 'job_not_found' }, 404);
    if (lookup.kind === 'forbidden') return c.json({ error: 'forbidden' }, 403);

    const st = lookup.state;
    if (st.status === 'pending') return c.json({ status: 'pending' });
    if (st.status === 'done') return c.json({ status: 'done', ...st.result });
    return c.json({ status: 'error', error: st.code, ...(st.refundable ? { refundable: true } : {}) });
  });

  return route;
}
