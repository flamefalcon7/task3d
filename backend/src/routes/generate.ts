import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { GenerateResponse, Router, TripoParams } from '@overflow2026/shared';
import { promptRequestSchema } from '../lib/schema.js';
import { buildLineageJson, buildLineageStub } from '../lib/lineage.js';
import { TripoDisabledError } from '../agent/router.js';
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
      throw err;
    }
  });

  return route;
}
