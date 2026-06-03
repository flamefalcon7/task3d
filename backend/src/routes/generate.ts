import { Hono } from 'hono';
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

export interface GenerateRouteDeps {
  router: Router;
  // Prompt-mode hits the paid Tripo API, so requests require a valid session
  // (review #2 P0). Optional only so unit tests can construct the route without
  // a signer — the route returns 503 if it's absent at request time.
  jwt?: JwtSigner;
  // D-034: when wired, prompt-mode additionally requires a verified SUI
  // service-fee payment (paymentDigest) before Tripo runs.
  paymentVerifier?: PaymentVerifier;
}

export function buildGenerateRoute(deps: GenerateRouteDeps) {
  const route = new Hono();

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

    // Auth gate (review #2): prompt-mode hits Tripo, which costs the operator
    // per call (~60–120 credits per generation).
    if (!deps.jwt) {
      return c.json({ error: 'auth_unavailable', message: 'Prompt-mode requires server-side JWT configuration' }, 503);
    }
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
    if (!token) {
      return c.json({ error: 'auth_required', message: 'Prompt-mode requires Authorization: Bearer <jwt>' }, 401);
    }
    let claims;
    try {
      claims = await deps.jwt.verifySession(token);
    } catch {
      return c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401);
    }

    // D-034 pay-gate: when a verifier is wired, prompt-mode requires a
    // verified SUI service-fee payment before the paid Tripo call.
    if (deps.paymentVerifier) {
      const paymentDigest = promptParsed.data.paymentDigest;
      if (!paymentDigest) {
        return c.json(
          { error: 'payment_required', message: 'Prompt-mode requires a paymentDigest (SUI service fee)' },
          402,
        );
      }
      const result = await deps.paymentVerifier.verify(paymentDigest, claims.sub);
      if (!result.ok) {
        return c.json({ error: 'payment_invalid', reason: result.reason }, 402);
      }
    }

    try {
      const prompt = promptParsed.data.prompt;
      const routeResult = await deps.router.route({ prompt });
      const finalParams = routeResult.lineageStub.params;
      if (!finalParams) {
        return c.json({ error: 'router_no_params', message: 'router returned no params in prompt mode' }, 502);
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

      const response: GenerateResponse = {
        glbBytes: Buffer.from(glbBytes).toString('base64'),
        lineageJson: buildLineageJson(lineageInput),
        lineageStub: {
          ...routeStub,
          ...genStub,
          ...buildLineageStub(lineageInput),
        },
      };
      return c.json(response);
    } catch (err) {
      if (err instanceof TripoDisabledError) {
        return c.json({ error: 'tripo_disabled', message: err.message }, 400);
      }
      // Classify live-Tripo failures into typed codes + non-500 statuses (U5/R2) so
      // the frontend can render honest, branchable messages instead of a raw 500.
      // These all occur AFTER the pay-gate above, so when a payment was actually
      // charged (paymentVerifier wired) we mark the post-payment failures refundable
      // (R3) — the frontend shows the "fee may be refundable — contact us" copy. The
      // U4 pre-flight is meant to catch credit-dry BEFORE payment; this is the residual
      // safety net + covers any pre-flight bypass. NO automatic refund is issued here
      // (manual/contact path only; auto-refund deferred — D-083). Bodies stay small +
      // free of raw upstream HTML (the client already truncates upstream bodies).
      const paid = !!deps.paymentVerifier;
      if (err instanceof TripoAuthError) {
        // Operator-side (key / credit misconfig) — framed as a temporary outage, not
        // user-refundable. In practice the pre-flight's getBalance would also 401 and
        // fail closed, so the user rarely reaches payment in this state.
        return c.json({ error: 'tripo_unavailable' }, 503);
      }
      if (err instanceof TripoTimeoutError) {
        return c.json({ error: 'tripo_timeout', ...(paid ? { refundable: true } : {}) }, 504);
      }
      if (err instanceof TripoFailedError) {
        // Quota-out also arrives here (wrapped); treat as service-unavailable wording.
        return c.json({ error: 'tripo_failed', ...(paid ? { refundable: true } : {}) }, 502);
      }
      if (err instanceof TripoFormatError) {
        return c.json({ error: 'tripo_failed', ...(paid ? { refundable: true } : {}) }, 502);
      }
      throw err; // genuinely unknown (not a known Tripo class) — let it surface
    }
  });

  return route;
}
