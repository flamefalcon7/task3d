import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { GenerateResponse, Router } from '@overflow2026/shared';
import { generateParamsSchema } from '../lib/schema.js';
import { buildLineageJson, buildLineageStub } from '../lib/lineage.js';

export interface GenerateRouteDeps {
  router: Router;
}

export function buildGenerateRoute(deps: GenerateRouteDeps) {
  const route = new Hono();

  route.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = generateParamsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid params', issues: parsed.error.issues }, 400);
    }
    const params = parsed.data;

    const { generator, lineageStub: routeStub } = await deps.router.route({
      shape: params.shape,
      params,
    });
    const { glbBytes, lineageStub: genStub } = await generator.generate(params);

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const generatorSource = routeStub.generatorSource ?? genStub.generatorSource ?? 'procedural';

    const lineageInput = {
      id,
      shape: params.shape,
      params,
      generatorSource,
      createdAt,
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
  });

  return route;
}
