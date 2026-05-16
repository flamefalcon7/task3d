import { serve } from '@hono/node-server';
import type { Generator, GeneratorId, Router } from '@overflow2026/shared';
import { buildApp } from './app.js';
import { HardcodedRouter } from './agent/router.js';
import {
  BoxGenerator,
  ChestGenerator,
  CylinderGenerator,
  HammerGenerator,
  PlatformGenerator,
  SphereGenerator,
  SwordGenerator,
  TripoGenerator,
} from './generators/index.js';
import { TripoClient } from './lib/tripo-client.js';
import { assertJwtSecret, createJwtSigner, type JwtSigner } from './lib/jwt.js';
import { buildAuthRoute } from './routes/auth.js';

// D-023: LLM routing dropped. HardcodedRouter handles both slider mode
// (procedural shapes) and prompt mode (direct dispatch to Tripo). Tripo is
// wired in only when TRIPO_ENABLED=true; prompt mode throws TripoDisabledError
// otherwise, surfaced as 400 tripo_disabled by /api/generate.
export function buildRouter(env: NodeJS.ProcessEnv = process.env): Router {
  const tripoEnabled = env.TRIPO_ENABLED === 'true';
  const tripoApiKey = env.TRIPO_API_KEY?.trim();

  const generators = new Map<GeneratorId, Generator>([
    ['box', new BoxGenerator()],
    ['chest', new ChestGenerator()],
    ['cylinder', new CylinderGenerator()],
    ['sphere', new SphereGenerator()],
    ['sword', new SwordGenerator()],
    ['hammer', new HammerGenerator()],
    ['platform', new PlatformGenerator()],
  ]);

  // Register Tripo only when both env vars are set. tripoEnabled-without-key
  // is a misconfiguration we surface loudly at startup rather than at call
  // time — the dev should not see TripoDisabledError fire for a missing key.
  if (tripoEnabled) {
    if (!tripoApiKey) {
      throw new Error(
        'TRIPO_ENABLED=true but TRIPO_API_KEY missing — set the key in your env',
      );
    }
    generators.set('tripo', new TripoGenerator(new TripoClient(tripoApiKey)));
  }

  return new HardcodedRouter(generators);
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
  serve({ fetch: buildServerApp().fetch, port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(`backend listening on http://localhost:${info.port}`);
  });
}
