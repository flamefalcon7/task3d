import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Router } from '@overflow2026/shared';
import { HardcodedRouter } from './agent/router.js';
import { buildCollectionRoute } from './routes/collection.js';
import { buildGenerateRoute } from './routes/generate.js';
import { buildMemoryRoute } from './routes/memory.js';
import { buildCopilotRoute } from './routes/copilot.js';
import { buildCaptionRoute } from './routes/caption.js';
import { buildCollectionsRoute } from './api/collections.js';
import { buildPreflightRoute } from './routes/preflight.js';
import type { IntegrationIndexer } from './events/integrationIndexer.js';
import type { PaymentVerifier } from './sui/paymentVerifier.js';
import type { BalanceProvider } from './events/tripoBalancePoller.js';
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
  // plan-002 U4/D-083: live Tripo balance source for the generate pre-flight.
  // When omitted, the pre-flight mounts but fails closed (available:false) on a
  // cold cache. server.ts injects the live TripoClient.
  balanceProvider?: BalanceProvider;
}

export function buildApp(deps: BuildAppDeps = {}) {
  const app = new Hono();
  app.use('*', cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.get('/', (c) => c.text('overflow2026 backend ok'));

  const router = deps.router ?? new HardcodedRouter();
  app.route('/api/generate', buildGenerateRoute({ router, jwt: deps.jwt, paymentVerifier: deps.paymentVerifier }));
  // Mounted at the deeper path so GET /api/generate/preflight resolves here (the
  // generate route only handles POST /). The store is resolved lazily at request
  // time inside the route, so mounting it never opens the DB (R12).
  app.route('/api/generate/preflight', buildPreflightRoute({ jwt: deps.jwt, balanceProvider: deps.balanceProvider }));
  app.route('/api/collection', buildCollectionRoute({ jwt: deps.jwt }));
  app.route('/api/memory', buildMemoryRoute({ jwt: deps.jwt }));
  app.route('/api/copilot', buildCopilotRoute({ jwt: deps.jwt }));
  app.route('/api/caption', buildCaptionRoute({ jwt: deps.jwt }));
  app.route(
    '/api/collections',
    buildCollectionsRoute({ indexer: deps.integrationIndexer ?? { getIntegrations: () => [] } }),
  );

  return app;
}
