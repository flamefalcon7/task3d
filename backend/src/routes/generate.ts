import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { GenerateParams, GenerateResponse, Router, ShapeId } from '@overflow2026/shared';
import { generateParamsSchema, promptRequestSchema } from '../lib/schema.js';
import { buildLineageJson, buildLineageStub } from '../lib/lineage.js';
import { RouterFormatError, RouterParseError, TripoDisabledError } from '../agent/router.js';
import type { JwtSigner } from '../lib/jwt.js';

export interface GenerateRouteDeps {
  router: Router;
  // Optional so tests that don't exercise prompt-mode can omit. Prompt-mode
  // requests are rejected with 401 when jwt is absent — protects the
  // Anthropic budget from anonymous callers (review #2 P0).
  jwt?: JwtSigner;
}

export function buildGenerateRoute(deps: GenerateRouteDeps) {
  const route = new Hono();

  route.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (body === null || typeof body !== 'object') {
      return c.json({ error: 'invalid body' }, 400);
    }

    const promptParsed = promptRequestSchema.safeParse(body);
    const paramsParsed = generateParamsSchema.safeParse(body);

    if (!promptParsed.success && !paramsParsed.success) {
      return c.json({ error: 'invalid params', issues: paramsParsed.error.issues }, 400);
    }

    // Auth gate (review #2): prompt-mode hits Anthropic, which costs the
    // operator per call. Anonymous slider-mode (procedural compute) remains
    // open since procedural generators run local + free.
    if (promptParsed.success) {
      if (!deps.jwt) {
        return c.json({ error: 'auth_unavailable', message: 'Prompt-mode requires server-side JWT configuration' }, 503);
      }
      const authHeader = c.req.header('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null;
      if (!token) {
        return c.json({ error: 'auth_required', message: 'Prompt-mode requires Authorization: Bearer <jwt>' }, 401);
      }
      try {
        await deps.jwt.verifySession(token);
      } catch {
        return c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401);
      }
    }

    try {
      let routeResult;
      let finalParams: GenerateParams;
      let finalShape: ShapeId | 'tripo';
      let prompt: string | undefined;

      if (promptParsed.success) {
        prompt = promptParsed.data.prompt;
        routeResult = await deps.router.route({ prompt });
        const stubParams = routeResult.lineageStub.params;
        const stubShape = routeResult.lineageStub.shape;
        if (!stubParams || !stubShape) {
          return c.json({ error: 'router_no_params', message: 'router returned no params in prompt mode' }, 502);
        }
        finalParams = stubParams;
        finalShape = stubShape;
      } else if (paramsParsed.success) {
        finalParams = paramsParsed.data;
        finalShape = paramsParsed.data.shape;
        routeResult = await deps.router.route({ shape: paramsParsed.data.shape, params: paramsParsed.data });
      } else {
        return c.json({ error: 'invalid params' }, 400);
      }

      const { generator, lineageStub: routeStub } = routeResult;
      const { glbBytes, lineageStub: genStub } = await generator.generate(finalParams);

      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const generatorSource = routeStub.generatorSource ?? genStub.generatorSource ?? 'procedural';

      const lineageInput = {
        id,
        shape: finalShape,
        params: finalParams,
        generatorSource,
        createdAt,
        ...(prompt !== undefined ? { prompt } : {}),
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
      if (err instanceof RouterParseError || err instanceof RouterFormatError) {
        return c.json({ error: 'router_error', message: err.message }, 502);
      }
      throw err;
    }
  });

  return route;
}
