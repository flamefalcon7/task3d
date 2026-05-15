import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { Generator, GeneratorId, GenerateResult } from '@overflow2026/shared';
import {
  AnthropicRouter,
  HardcodedRouter,
  RouterFormatError,
  RouterParseError,
  TripoDisabledError,
} from './router.js';
import {
  BoxGenerator,
  ChestGenerator,
  CylinderGenerator,
  HammerGenerator,
  PlatformGenerator,
  SphereGenerator,
  SwordGenerator,
} from '../generators/index.js';

// Minimal fake — we never actually generate in router tests, only check that
// the router returned the right generator. Concrete classes are also fine via
// instanceof, but a stub keeps tests fast and side-effect-free.
class StubTripoGenerator implements Generator {
  async generate(): Promise<GenerateResult> {
    throw new Error('Stub Tripo should not be invoked in router tests');
  }
}

function buildGeneratorMap(): Map<GeneratorId, Generator> {
  return new Map<GeneratorId, Generator>([
    ['box', new BoxGenerator()],
    ['chest', new ChestGenerator()],
    ['cylinder', new CylinderGenerator()],
    ['sphere', new SphereGenerator()],
    ['sword', new SwordGenerator()],
    ['hammer', new HammerGenerator()],
    ['platform', new PlatformGenerator()],
    ['tripo', new StubTripoGenerator()],
  ]);
}

function fakeClient(content: unknown[]): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content }),
    },
  } as unknown as Anthropic;
}

describe('HardcodedRouter', () => {
  it('slider mode: { shape: "box" } returns RouteResult with BoxGenerator', async () => {
    const router = new HardcodedRouter();
    const result = await router.route({
      shape: 'box',
      params: { shape: 'box', width: 1, height: 1, depth: 1 },
    });
    expect(result.generator).toBeInstanceOf(BoxGenerator);
    expect(result.lineageStub.generatorSource).toBe('procedural');
  });
});

describe('AnthropicRouter prompt mode', () => {
  let generators: Map<GeneratorId, Generator>;

  beforeEach(() => {
    generators = buildGeneratorMap();
  });

  it('happy path: routes "wooden chest" to ChestGenerator', async () => {
    const client = fakeClient([
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'route',
        input: {
          generator: 'chest',
          params: { shape: 'chest', width: 1, height: 1, depth: 1, lidOpenRadians: 0.3 },
          tags: ['fantasy', 'container'],
        },
      },
    ]);
    const router = new AnthropicRouter(client, generators, false);

    const result = await router.route({ prompt: 'wooden chest' });
    expect(result.generator).toBeInstanceOf(ChestGenerator);
    expect(result.lineageStub.generatorSource).toBe('procedural');
    expect(result.lineageStub.prompt).toBe('wooden chest');
    expect(result.lineageStub.llmDecision).toMatchObject({ generator: 'chest', tags: ['fantasy', 'container'] });
  });

  it('routes to tripo when TRIPO_ENABLED=true', async () => {
    const client = fakeClient([
      {
        type: 'tool_use',
        id: 'toolu_2',
        name: 'route',
        input: {
          generator: 'tripo',
          params: { shape: 'tripo', prompt: 'phoenix sculpture' },
          tags: ['mythical', 'sculpture'],
        },
      },
    ]);
    const router = new AnthropicRouter(client, generators, true);

    const result = await router.route({ prompt: 'ornate phoenix sculpture' });
    expect(result.generator).toBe(generators.get('tripo'));
    expect(result.lineageStub.generatorSource).toBe('tripo');
  });

  it('throws TripoDisabledError when TRIPO_ENABLED=false and LLM picks tripo', async () => {
    const client = fakeClient([
      {
        type: 'tool_use',
        id: 'toolu_3',
        name: 'route',
        input: {
          generator: 'tripo',
          params: { shape: 'tripo', prompt: 'dragon' },
          tags: ['mythical'],
        },
      },
    ]);
    const router = new AnthropicRouter(client, generators, false);

    await expect(router.route({ prompt: 'ornate dragon statue' })).rejects.toBeInstanceOf(TripoDisabledError);
  });

  it('throws RouterFormatError when SDK returns no tool_use block', async () => {
    const client = fakeClient([{ type: 'text', text: 'sorry, I cannot route this' }]);
    const router = new AnthropicRouter(client, generators, false);

    await expect(router.route({ prompt: 'something' })).rejects.toBeInstanceOf(RouterFormatError);
  });

  it('throws RouterParseError when params violate zod ranges (width=1000 for box, max=5)', async () => {
    const client = fakeClient([
      {
        type: 'tool_use',
        id: 'toolu_4',
        name: 'route',
        input: {
          generator: 'box',
          params: { shape: 'box', width: 1000, height: 1, depth: 1 },
          tags: ['huge'],
        },
      },
    ]);
    const router = new AnthropicRouter(client, generators, false);

    await expect(router.route({ prompt: 'enormous box' })).rejects.toBeInstanceOf(RouterParseError);
  });
});

describe('server.buildRouter factory', () => {
  it('returns AnthropicRouter when ANTHROPIC_API_KEY is set (>= 16 chars)', async () => {
    const { buildRouter } = await import('../server.js');
    const router = buildRouter({ ANTHROPIC_API_KEY: 'sk-ant-test-12345678', TRIPO_ENABLED: 'false' });
    expect(router).toBeInstanceOf(AnthropicRouter);
  });

  it('returns HardcodedRouter when ANTHROPIC_API_KEY missing', async () => {
    const { buildRouter } = await import('../server.js');
    const router = buildRouter({});
    expect(router).toBeInstanceOf(HardcodedRouter);
  });
});

// Minimal JwtSigner double used to gate prompt-mode tests on auth (review P0 #2).
// signSession returns a fixed token; verifySession resolves only for that token.
const TEST_BEARER = 'test-bearer-token';
const fakeJwt = {
  async signSession() {
    return TEST_BEARER;
  },
  async verifySession(token: string) {
    if (token !== TEST_BEARER) throw new Error('invalid');
    return { sub: '0xdeadbeef', iat: 0, exp: 9_999_999_999 };
  },
};

describe('/api/generate integration with AnthropicRouter', () => {
  it('POST { prompt: "box" } with valid Authorization + mocked AnthropicRouter returns 200', async () => {
    const client = fakeClient([
      {
        type: 'tool_use',
        id: 'toolu_5',
        name: 'route',
        input: {
          generator: 'box',
          params: { shape: 'box', width: 1, height: 1, depth: 1 },
          tags: ['primitive'],
        },
      },
    ]);
    const router = new AnthropicRouter(client, buildGeneratorMap(), false);
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER}` },
      body: JSON.stringify({ prompt: 'simple box' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lineageStub: { prompt?: string; generatorSource?: string } };
    expect(body.lineageStub.generatorSource).toBe('procedural');
    expect(body.lineageStub.prompt).toBe('simple box');
  });

  it('POST { prompt: "dragon" } with valid auth + TRIPO_ENABLED=false returns 400 tripo_disabled', async () => {
    const client = fakeClient([
      {
        type: 'tool_use',
        id: 'toolu_6',
        name: 'route',
        input: {
          generator: 'tripo',
          params: { shape: 'tripo', prompt: 'dragon' },
          tags: ['mythical'],
        },
      },
    ]);
    const router = new AnthropicRouter(client, buildGeneratorMap(), false);
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER}` },
      body: JSON.stringify({ prompt: 'ornate dragon statue' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('tripo_disabled');
  });

  it('POST { prompt: ... } without Authorization header returns 401', async () => {
    const router = new HardcodedRouter();
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'simple box' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('auth_required');
  });

  it('POST { prompt: ... } with invalid Bearer token returns 401 auth_invalid', async () => {
    const router = new HardcodedRouter();
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-the-right-token' },
      body: JSON.stringify({ prompt: 'simple box' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('auth_invalid');
  });

  it('POST { shape, params } (slider mode) does NOT require auth — returns 200 anonymously', async () => {
    const router = new HardcodedRouter();
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router }); // no jwt — slider mode is open

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: 1, height: 1, depth: 1 }),
    });
    expect(res.status).toBe(200);
  });
});
