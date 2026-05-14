import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenerateResponse, Router } from '@overflow2026/shared';
import { generateParamsSchema } from '../lib/schema.js';

export interface GenerateRouteDeps {
  router: Router;
  tmpDir: string;
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
    await writeFile(join(deps.tmpDir, `${id}.glb`), glbBytes);

    const response: GenerateResponse = {
      id,
      lineageStub: {
        ...routeStub,
        ...genStub,
        id,
        shape: params.shape,
        params,
        createdAt: new Date().toISOString(),
      },
    };
    return c.json(response);
  });

  return route;
}
