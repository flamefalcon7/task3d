import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Router } from '@overflow2026/shared';
import { HardcodedRouter } from './agent/router.js';
import { buildCollectionRoute } from './routes/collection.js';
import { buildGenerateRoute } from './routes/generate.js';
import { buildMemoryRoute } from './routes/memory.js';
import { buildCollectionsRoute } from './api/collections.js';
import type { IntegrationIndexer } from './events/integrationIndexer.js';
import type { PaymentVerifier } from './sui/paymentVerifier.js';
import type { JwtSigner } from './lib/jwt.js';

export interface BuildAppDeps {
  router?: Router;
  jwt?: JwtSigner;
  // U7: provides the "Used by" read API. When omitted, the route is still
  // mounted but returns empty lists (server.ts injects the live indexer).
  integrationIndexer?: Pick<IntegrationIndexer, 'getIntegrations'>;
  // U10/D-034: when present, prompt-mode generate requires a verified SUI
  // service-fee payment. server.ts injects the live verifier.
  paymentVerifier?: PaymentVerifier;
}

export function buildApp(deps: BuildAppDeps = {}) {
  const app = new Hono();
  app.use('*', cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.get('/', (c) => c.text('overflow2026 backend ok'));

  const router = deps.router ?? new HardcodedRouter();
  app.route('/api/generate', buildGenerateRoute({ router, jwt: deps.jwt, paymentVerifier: deps.paymentVerifier }));
  app.route('/api/collection', buildCollectionRoute({ jwt: deps.jwt }));
  app.route('/api/memory', buildMemoryRoute({ jwt: deps.jwt }));
  app.route(
    '/api/collections',
    buildCollectionsRoute({ indexer: deps.integrationIndexer ?? { getIntegrations: () => [] } }),
  );

  return app;
}
