import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Router } from '@overflow2026/shared';
import { HardcodedRouter } from './agent/router.js';
import { buildGenerateRoute } from './routes/generate.js';
import { shapesRoute } from './routes/shapes.js';

export interface BuildAppDeps {
  router?: Router;
}

export function buildApp(deps: BuildAppDeps = {}) {
  const app = new Hono();
  app.use('*', cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.get('/', (c) => c.text('overflow2026 backend ok'));

  const router = deps.router ?? new HardcodedRouter();
  app.route('/api/shapes', shapesRoute);
  app.route('/api/generate', buildGenerateRoute({ router }));

  return app;
}
