import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { HardcodedRouter } from '../agent/router.js';
import { buildGenerateRoute } from './generate.js';
import { buildPreviewRoute } from './preview.js';
import { shapesRoute } from './shapes.js';

let app: Hono;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'overflow-test-'));
  app = new Hono();
  const router = new HardcodedRouter();
  app.route('/api/shapes', shapesRoute);
  app.route('/api/generate', buildGenerateRoute({ router, tmpDir }));
  app.route('/api/preview', buildPreviewRoute({ tmpDir }));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('GET /api/shapes', () => {
  it('returns all four shapes', async () => {
    const res = await app.request('/api/shapes');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body.map((s) => s.id).sort()).toEqual(['box', 'chest', 'cylinder', 'sphere']);
  });
});

describe('POST /api/generate + GET /api/preview/:id', () => {
  it('round-trip box: valid params returns id, preview serves GLB bytes', async () => {
    const post = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shape: 'box', width: 1, height: 1, depth: 1 }),
    });
    expect(post.status).toBe(200);
    const { id } = (await post.json()) as { id: string };
    expect(id).toMatch(/^[a-f0-9-]{36}$/);

    const get = await app.request(`/api/preview/${id}`);
    expect(get.status).toBe(200);
    expect(get.headers.get('Content-Type')).toBe('model/gltf-binary');
    const buf = new Uint8Array(await get.arrayBuffer());
    // GLB magic = "glTF" in little-endian
    expect(buf[0]).toBe(0x67);
    expect(buf[1]).toBe(0x6c);
    expect(buf[2]).toBe(0x54);
    expect(buf[3]).toBe(0x46);
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

  it('missing preview id returns 404', async () => {
    const res = await app.request('/api/preview/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(res.status).toBe(404);
  });

  it('malformed preview id returns 400', async () => {
    const res = await app.request('/api/preview/..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
  });
});
