import { describe, it, expect } from 'vitest';
import type { Generator, GenerateResult } from '@overflow2026/shared';
import { HardcodedRouter, TripoDisabledError } from './router.js';

// Minimal fake — router tests only check the returned generator instance +
// lineage stub, never actually invoke generate().
class StubTripoGenerator implements Generator {
  async generate(): Promise<GenerateResult> {
    throw new Error('Stub Tripo should not be invoked in router tests');
  }
}

describe('HardcodedRouter prompt mode (D-023/D-033 Tripo-only)', () => {
  it('dispatches { prompt } directly to the injected Tripo generator', async () => {
    const tripo = new StubTripoGenerator();
    const router = new HardcodedRouter(tripo);

    const result = await router.route({ prompt: 'futuristic racing car, low-poly' });
    expect(result.generator).toBe(tripo);
    expect(result.lineageStub.generatorSource).toBe('tripo');
    expect(result.lineageStub.prompt).toBe('futuristic racing car, low-poly');
    expect(result.lineageStub.shape).toBe('tripo');
    expect(result.lineageStub.params).toEqual({ shape: 'tripo', prompt: 'futuristic racing car, low-poly' });
  });

  it('derives lineage tags from the prompt (lowercase, words >= 3 chars, dedup, cap 5)', async () => {
    const router = new HardcodedRouter(new StubTripoGenerator());

    const result = await router.route({ prompt: 'A red, RED, sleek racing car with neon accents' });
    const tags = (result.lineageStub.llmDecision as { tags: string[] }).tags;
    expect(tags).toEqual(['red', 'sleek', 'racing', 'car', 'with']);
    expect(tags).not.toContain('a');
    expect(tags.filter((t) => t === 'red')).toHaveLength(1);
  });

  it('throws TripoDisabledError when no Tripo generator is injected', async () => {
    const router = new HardcodedRouter();
    await expect(router.route({ prompt: 'racing car' })).rejects.toBeInstanceOf(TripoDisabledError);
  });

  it('throws when no prompt is supplied', async () => {
    const router = new HardcodedRouter(new StubTripoGenerator());
    await expect(router.route({})).rejects.toThrow(/prompt/i);
  });

  it('truncates very long prompts to 1000 chars before dispatch', async () => {
    const router = new HardcodedRouter(new StubTripoGenerator());
    const long = 'red car '.repeat(1000);

    const result = await router.route({ prompt: long });
    expect(result.lineageStub.prompt).toHaveLength(1000);
  });
});

describe('server.buildRouter factory (D-023/D-033)', () => {
  it('returns a HardcodedRouter that throws TripoDisabledError when Tripo disabled', async () => {
    const { buildRouter } = await import('../server.js');
    const router = buildRouter({ JWT_SECRET: 'x'.repeat(64) });
    expect(router).toBeInstanceOf(HardcodedRouter);
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

// D-106: generation is async — POST dispatches (202 { jobId }), the outcome is
// read from GET /api/generate/result/:jobId. Poll until the background job lands.
async function pollGenerateResult(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  jobId: string,
): Promise<Record<string, unknown>> {
  for (let i = 0; i < 100; i++) {
    const r = await app.request(`/api/generate/result/${jobId}`, {
      headers: { Authorization: `Bearer ${TEST_BEARER}` },
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (j.status !== 'pending') return j;
    await new Promise((res) => setImmediate(res));
  }
  throw new Error('generate job never reached a terminal state');
}

describe('/api/generate integration (D-023 Tripo passthrough)', () => {
  it('POST { prompt } with valid Authorization + Tripo registered dispatches, then resolves to a done result', async () => {
    const stubTripo: Generator = {
      async generate() {
        return {
          glbBytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]), // "glTF" magic
          lineageStub: { generatorSource: 'tripo' as const },
        };
      },
    };
    const router = new HardcodedRouter(stubTripo);
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER}` },
      body: JSON.stringify({ prompt: 'red car' }),
    });
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };
    const body = (await pollGenerateResult(app, jobId)) as {
      status: string;
      lineageStub: { prompt?: string; generatorSource?: string };
    };
    expect(body.status).toBe('done');
    expect(body.lineageStub.generatorSource).toBe('tripo');
    expect(body.lineageStub.prompt).toBe('red car');
  });

  it('POST { prompt } when Tripo NOT registered → job resolves to tripo_disabled error', async () => {
    const router = new HardcodedRouter();
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_BEARER}` },
      body: JSON.stringify({ prompt: 'red car' }),
    });
    expect(res.status).toBe(202);
    const { jobId } = (await res.json()) as { jobId: string };
    const body = (await pollGenerateResult(app, jobId)) as { status: string; error: string };
    expect(body.status).toBe('error');
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

  it('POST a non-prompt body returns 400 (slider mode removed in U9)', async () => {
    const router = new HardcodedRouter();
    const { buildApp } = await import('../app.js');
    const app = buildApp({ router, jwt: fakeJwt });

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: 1, height: 1, depth: 1 }),
    });
    expect(res.status).toBe(400);
  });
});
