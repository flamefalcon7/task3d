import { serve } from '@hono/node-server';
import Anthropic from '@anthropic-ai/sdk';
import type { Generator, GeneratorId, Router } from '@overflow2026/shared';
import { buildApp } from './app.js';
import { AnthropicRouter, HardcodedRouter } from './agent/router.js';
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

export function buildRouter(env: NodeJS.ProcessEnv = process.env): Router {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const tripoEnabled = env.TRIPO_ENABLED === 'true';

  // A 16-char minimum is a coarse sanity check; real Anthropic keys are much
  // longer but we don't want to reject the test placeholder "test-key-1234567".
  if (!apiKey || apiKey.length < 16) {
    // eslint-disable-next-line no-console
    console.warn('[server] ANTHROPIC_API_KEY missing or too short — using HardcodedRouter (slider mode only)');
    return new HardcodedRouter();
  }

  const client = new Anthropic({ apiKey });
  const tripoApiKey = env.TRIPO_API_KEY?.trim();
  const tripoGenerator: Generator = tripoEnabled && tripoApiKey
    ? new TripoGenerator(new TripoClient(tripoApiKey))
    // tripoEnabled=false: TripoDisabledError fires in router before generators.get('tripo') runs.
    // tripoEnabled=true but no API key: throw on actual invocation (env-misconfig in seed phase).
    : { async generate() { throw new Error(tripoEnabled
        ? 'TRIPO_ENABLED=true but TRIPO_API_KEY missing — set the key in your env'
        : 'TripoGenerator gated off (TRIPO_ENABLED=false)'); } };

  const generators = new Map<GeneratorId, Generator>([
    ['box', new BoxGenerator()],
    ['chest', new ChestGenerator()],
    ['cylinder', new CylinderGenerator()],
    ['sphere', new SphereGenerator()],
    ['sword', new SwordGenerator()],
    ['hammer', new HammerGenerator()],
    ['platform', new PlatformGenerator()],
    ['tripo', tripoGenerator],
  ]);

  return new AnthropicRouter(client, generators, tripoEnabled);
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
