import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { HardcodedRouter } from '../agent/router.js';
import { buildGenerateRoute } from './generate.js';

let app: Hono;

beforeAll(() => {
  app = new Hono();
  const router = new HardcodedRouter();
  app.route('/api/generate', buildGenerateRoute({ router }));
});

describe('POST /api/generate', () => {
  it('rejects a non-prompt body with 400 (D-033: slider mode removed)', async () => {
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: 1, height: 1, depth: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an empty prompt with 400', async () => {
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('removed endpoints', () => {
  it('GET /api/shapes returns 404 (procedural catalog removed in U9)', async () => {
    const res = await app.request('/api/shapes');
    expect(res.status).toBe(404);
  });

  it('GET /api/preview/:id returns 404 (route removed in U1)', async () => {
    const res = await app.request('/api/preview/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(res.status).toBe(404);
  });
});
