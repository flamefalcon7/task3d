import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HardcodedRouter } from './agent/router.js';
import { buildGenerateRoute } from './routes/generate.js';
import { buildPreviewRoute } from './routes/preview.js';
import { shapesRoute } from './routes/shapes.js';

const tmpDir = join(fileURLToPath(new URL('../tmp', import.meta.url)));

export function buildApp() {
  const app = new Hono();
  app.use('*', cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.get('/', (c) => c.text('overflow2026 backend ok'));

  const router = new HardcodedRouter();
  app.route('/api/shapes', shapesRoute);
  app.route('/api/generate', buildGenerateRoute({ router, tmpDir }));
  app.route('/api/preview', buildPreviewRoute({ tmpDir }));

  return app;
}

export { tmpDir };
