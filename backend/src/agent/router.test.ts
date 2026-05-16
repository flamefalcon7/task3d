import { describe, it, expect } from 'vitest';
import type { Generator, GeneratorId, GenerateResult } from '@overflow2026/shared';
import { HardcodedRouter, TripoDisabledError } from './router.js';
import {
  BoxGenerator,
  ChestGenerator,
  CylinderGenerator,
  HammerGenerator,
  PlatformGenerator,
  SphereGenerator,
  SwordGenerator,
} from '../generators/index.js';

// Minimal fake — we never actually invoke generate() in router tests, only
// check that the router returned the right generator instance.
class StubTripoGenerator implements Generator {
  async generate(): Promise<GenerateResult> {
    throw new Error('Stub Tripo should not be invoked in router tests');
  }
}

function buildGeneratorMap(opts: { withTripo: boolean }): Map<GeneratorId, Generator> {
  const map = new Map<GeneratorId, Generator>([
    ['box', new BoxGenerator()],
    ['chest', new ChestGenerator()],
    ['cylinder', new CylinderGenerator()],
    ['sphere', new SphereGenerator()],
    ['sword', new SwordGenerator()],
    ['hammer', new HammerGenerator()],
    ['platform', new PlatformGenerator()],
  ]);
  if (opts.withTripo) map.set('tripo', new StubTripoGenerator());
  return map;
}

describe('HardcodedRouter slider mode (procedural shapes)', () => {
  it('{ shape: "box" } returns BoxGenerator + procedural lineage marker', async () => {
    const router = new HardcodedRouter();
    const result = await router.route({
      shape: 'box',
      params: { shape: 'box', width: 1, height: 1, depth: 1 },
    });
    expect(result.generator).toBeInstanceOf(BoxGenerator);
    expect(result.lineageStub.generatorSource).toBe('procedural');
  });

  it('{ shape: "sword" } returns SwordGenerator', async () => {
    const router = new HardcodedRouter();
    const result = await router.route({
      shape: 'sword',
      params: { shape: 'sword', bladeLength: 1, bladeWidth: 0.1, gripLength: 0.2, pommelSize: 0.05 },
    });
    expect(result.generator).toBeInstanceOf(SwordGenerator);
  });

  it('throws when neither shape nor prompt is supplied', async () => {
    const router = new HardcodedRouter();
    await expect(router.route({})).rejects.toThrow(/prompt.*shape/i);
  });

  it('throws for unknown shape', async () => {
    const router = new HardcodedRouter();
    await expect(
      router.route({
        shape: 'unknown' as 'box',
        params: { shape: 'box', width: 1, height: 1, depth: 1 },
      }),
    ).rejects.toThrow(/No generator for shape/);
  });
});

describe('HardcodedRouter prompt mode (D-023 Tripo passthrough)', () => {
  it('dispatches { prompt } directly to Tripo when registered', async () => {
    const generators = buildGeneratorMap({ withTripo: true });
    const router = new HardcodedRouter(generators);

    const result = await router.route({ prompt: 'futuristic racing car, low-poly' });
    expect(result.generator).toBe(generators.get('tripo'));
    expect(result.lineageStub.generatorSource).toBe('tripo');
    expect(result.lineageStub.prompt).toBe('futuristic racing car, low-poly');
    expect(result.lineageStub.shape).toBe('tripo');
    expect(result.lineageStub.params).toEqual({ shape: 'tripo', prompt: 'futuristic racing car, low-poly' });
  });

  it('derives lineage tags from the prompt (lowercase, words >= 3 chars, dedup, cap 5)', async () => {
    const generators = buildGeneratorMap({ withTripo: true });
    const router = new HardcodedRouter(generators);

    const result = await router.route({ prompt: 'A red, RED, sleek racing car with neon accents' });
    const tags = (result.lineageStub.llmDecision as { tags: string[] }).tags;
    expect(tags).toEqual(['red', 'sleek', 'racing', 'car', 'with']);
    expect(tags).not.toContain('a');
    // dedup
    expect(tags.filter((t) => t === 'red')).toHaveLength(1);
  });

  it('throws TripoDisabledError when Tripo not in generators map', async () => {
    const generators = buildGeneratorMap({ withTripo: false });
    const router = new HardcodedRouter(generators);

    await expect(router.route({ prompt: 'racing car' })).rejects.toBeInstanceOf(TripoDisabledError);
  });

  it('truncates very long prompts to 1000 chars before dispatch', async () => {
    const generators = buildGeneratorMap({ withTripo: true });
    const router = new HardcodedRouter(generators);
    const long = 'red car '.repeat(1000);

    const result = await router.route({ prompt: long });
    expect(result.lineageStub.prompt).toHaveLength(1000);
  });
});

describe('server.buildRouter factory (D-023)', () => {
  it('returns HardcodedRouter with only procedural generators when Tripo disabled', async () => {
    const { buildRouter } = await import('../server.js');
    const router = buildRouter({ JWT_SECRET: 'x'.repeat(64) });
    expect(router).toBeInstanceOf(HardcodedRouter);

    // Prompt mode without Tripo registered → TripoDisabledError
    await expect(router.route({ prompt: 'anything' })).rejects.toBeInstanceOf(TripoDisabledError);
  });

  it('throws at startup when TRIPO_ENABLED=true but TRIPO_API_KEY missing', async () => {
    const { buildRouter } = await import('../server.js');
    expect(() => buildRouter({ TRIPO_ENABLED: 'true' })).toThrow(/TRIPO_API_KEY missing/);
  });
});

// Minimal JwtSigner double used to gate prompt-mode tests on auth (review P0 #2).
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

describe('/api/generate integration (D-023 Tripo passthrough)', () => {
  it('POST { prompt } with valid Authorization + Tripo registered returns 200', async () => {
    // Stub a Tripo generator that returns a minimal GLB so the route can
    // serialize a response. Real Tripo SDK is not invoked.
    const stubTripo: Generator = {
      async generate() {
        return {
          glbBytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]), // "glTF" magic
          lineageStub: { generatorSource: 'tripo' as const },
        };
      },
    };
    const generators = buildGeneratorMap({ withTripo: false });
    generators.set('tripo', stubTripo);
    const router = new HardcodedRouter(generators);
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER}` },
      body: JSON.stringify({ prompt: 'red car' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lineageStub: { prompt?: string; generatorSource?: string } };
    expect(body.lineageStub.generatorSource).toBe('tripo');
    expect(body.lineageStub.prompt).toBe('red car');
  });

  it('POST { prompt } when Tripo NOT registered returns 400 tripo_disabled', async () => {
    const router = new HardcodedRouter(buildGeneratorMap({ withTripo: false }));
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER}` },
      body: JSON.stringify({ prompt: 'red car' }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('tripo_disabled');
  });

  it('POST { prompt } without Authorization returns 401 auth_required', async () => {
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

  it('POST { prompt } with invalid Bearer token returns 401 auth_invalid', async () => {
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

  it('POST { shape, params } slider mode does NOT require auth', async () => {
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
