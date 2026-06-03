import { serve } from '@hono/node-server';
import type { Router } from '@overflow2026/shared';
import { buildApp } from './app.js';
import { HardcodedRouter } from './agent/router.js';
import { TripoGenerator } from './generators/index.js';
import { TripoClient } from './lib/tripo-client.js';
import { assertJwtSecret, createJwtSigner, type JwtSigner } from './lib/jwt.js';
import { buildAuthRoute } from './routes/auth.js';
import { createIntegrationIndexer } from './events/integrationIndexer.js';
import { createTripoBalancePoller } from './events/tripoBalancePoller.js';
import { createPaymentVerifier } from './sui/paymentVerifier.js';
import { getQuotaStore } from './lib/quota-store.js';
import { getSuiClient, TRIPO_FEE_TREASURY, TRIPO_FEE_MIST } from './sui/client.js';

// D-023/D-033: the only content the backend generates is Tripo prompt-mode.
// Tripo is wired in only when TRIPO_ENABLED=true; otherwise prompt requests
// throw TripoDisabledError, surfaced as 400 tripo_disabled by /api/generate.
export function buildRouter(env: NodeJS.ProcessEnv = process.env): Router {
  const tripoEnabled = env.TRIPO_ENABLED === 'true';
  const tripoApiKey = env.TRIPO_API_KEY?.trim();

  if (!tripoEnabled) return new HardcodedRouter();

  // tripoEnabled-without-key is a misconfiguration we surface loudly at startup
  // rather than at call time.
  if (!tripoApiKey) {
    throw new Error('TRIPO_ENABLED=true but TRIPO_API_KEY missing — set the key in your env');
  }
  return new HardcodedRouter(new TripoGenerator(new TripoClient(tripoApiKey)));
}

// Startup hard-fail: a weak or absent JWT secret silently degrades sign-in
// security (per doc-review SEC-002). assertJwtSecret throws JwtConfigError
// which propagates out of buildJwt and aborts before serve() binds a port.
export function buildJwt(env: NodeJS.ProcessEnv = process.env): JwtSigner {
  const secret = env.JWT_SECRET;
  assertJwtSecret(secret);
  return createJwtSigner(secret);
}

export function buildServerApp(env: NodeJS.ProcessEnv = process.env) {
  const jwt = buildJwt(env);
  const app = buildApp({ router: buildRouter(env), jwt });
  app.route('/api/auth', buildAuthRoute({ jwt }));
  return app;
}

const port = Number(process.env.PORT ?? 3001);

// Only bind a port when run directly (e.g. `tsx src/server.ts`), not when
// router.test.ts imports buildRouter — otherwise Vitest crashes on EADDRINUSE
// against the dev server.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  // U7: start the single-topic IntegrationRegistered poller and wire its
  // "Used by" reads into the app. Only here (not in buildServerApp) so test
  // imports don't kick off live polling.
  const indexer = createIntegrationIndexer({ client: getSuiClient() });
  indexer.start();
  const paymentVerifier = createPaymentVerifier({
    client: getSuiClient(),
    treasury: TRIPO_FEE_TREASURY,
    feeMist: TRIPO_FEE_MIST,
  });
  // plan-002 U4/D-083: Tripo balance poller (warms the durable quota store) + the
  // pre-flight's live balance source. Only when Tripo is enabled + keyed; otherwise
  // the pre-flight fails closed. The poller's interval is unref'd + lives only here
  // (R12) so test imports never poll and a clean exit isn't blocked.
  let balanceProvider: TripoClient | undefined;
  const tripoApiKey = process.env.TRIPO_API_KEY?.trim();
  if (process.env.TRIPO_ENABLED === 'true' && tripoApiKey) {
    balanceProvider = new TripoClient(tripoApiKey);
    createTripoBalancePoller({ client: balanceProvider, store: getQuotaStore() }).start();
  }
  const jwt = buildJwt();
  const app = buildApp({
    router: buildRouter(),
    jwt,
    integrationIndexer: indexer,
    paymentVerifier,
    balanceProvider,
  });
  app.route('/api/auth', buildAuthRoute({ jwt }));
  serve({ fetch: app.fetch, port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(`backend listening on http://localhost:${info.port}`);
  });
}
