import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { LineageRecord } from '@overflow2026/shared';
import { HardcodedRouter } from '../agent/router.js';
import { buildGenerateRoute } from './generate.js';
import { shapesRoute } from './shapes.js';

let app: Hono;

beforeAll(() => {
  app = new Hono();
  const router = new HardcodedRouter();
  app.route('/api/shapes', shapesRoute);
  app.route('/api/generate', buildGenerateRoute({ router }));
});

describe('GET /api/shapes', () => {
  it('returns all seven shapes', async () => {
    const res = await app.request('/api/shapes');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body.map((s) => s.id).sort()).toEqual(
      ['box', 'chest', 'cylinder', 'hammer', 'platform', 'sphere', 'sword'],
    );
  });
});

describe('POST /api/generate', () => {
  it('returns glbBytes (base64) + lineageJson + lineageStub for a valid box', async () => {
    const post = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: 1, height: 1, depth: 1 }),
    });
    expect(post.status).toBe(200);
    const body = (await post.json()) as {
      glbBytes: string;
      lineageJson: string;
      lineageStub: Partial<LineageRecord>;
    };
    expect(typeof body.glbBytes).toBe('string');
    expect(typeof body.lineageJson).toBe('string');
    expect(body.lineageStub.shape).toBe('box');
    expect(body.lineageStub.generatorSource).toBe('procedural');
    expect(body.lineageStub.id).toMatch(/^[a-f0-9-]{36}$/);

    const lineage = JSON.parse(body.lineageJson) as LineageRecord;
    expect(lineage.id).toBe(body.lineageStub.id);
    expect(lineage.shape).toBe('box');
    expect(lineage.generatorSource).toBe('procedural');
    expect(lineage.params).toEqual({ shape: 'box', width: 1, height: 1, depth: 1 });
  });

  it('base64 glbBytes decodes to a valid GLB starting with magic "glTF"', async () => {
    const post = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: 1, height: 1, depth: 1 }),
    });
    expect(post.status).toBe(200);
    const { glbBytes } = (await post.json()) as { glbBytes: string };
    const decoded = Buffer.from(glbBytes, 'base64');
    expect(decoded[0]).toBe(0x67);
    expect(decoded[1]).toBe(0x6c);
    expect(decoded[2]).toBe(0x54);
    expect(decoded[3]).toBe(0x46);
  });

  it('rejects invalid shape with 400', async () => {
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'cube', width: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects negative dimensions with 400', async () => {
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: -1, height: 1, depth: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects dimensions above catalog cap with 400', async () => {
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: 99, height: 1, depth: 1 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('removed preview endpoint', () => {
  it('GET /api/preview/:id returns 404 (route removed in U1)', async () => {
    const res = await app.request('/api/preview/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(res.status).toBe(404);
  });
});
