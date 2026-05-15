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
} from './generators/index.js';

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
  const generators = new Map<GeneratorId, Generator>([
    ['box', new BoxGenerator()],
    ['chest', new ChestGenerator()],
    ['cylinder', new CylinderGenerator()],
    ['sphere', new SphereGenerator()],
    ['sword', new SwordGenerator()],
    ['hammer', new HammerGenerator()],
    ['platform', new PlatformGenerator()],
    // U6 will replace this throwing stub with TripoGenerator; until then the
    // tripoEnabled gate is the safety net.
    ['tripo', {
      async generate() {
        throw new Error('TripoGenerator not yet implemented (U6)');
      },
    }],
  ]);

  return new AnthropicRouter(client, generators, tripoEnabled);
}

const port = Number(process.env.PORT ?? 3001);

// Only bind a port when run directly (e.g. `tsx src/server.ts`), not when
// router.test.ts imports buildRouter — otherwise Vitest crashes on EADDRINUSE
// against the dev server.
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  serve({ fetch: buildApp({ router: buildRouter() }).fetch, port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(`backend listening on http://localhost:${info.port}`);
  });
}
