import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { Document, NodeIO } from '@gltf-transform/core';
import { buildCollectionRoute } from './collection.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';

// --- Test scaffolding ------------------------------------------------------

// Stub JwtSigner: accepts the literal token 'valid' as bound to a fake Sui
// address, rejects anything else. We never exercise signSession in these
// tests but keep the shape to satisfy the JwtSigner contract.
const stubJwt: JwtSigner = {
  async signSession() {
    return 'valid';
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token !== 'valid') throw new Error('bad token');
    return {
      sub: '0x0000000000000000000000000000000000000000000000000000000000000001',
      iat: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  },
};

let app: Hono;

async function buildBaseGlbBase64(): Promise<string> {
  // Produce a tiny valid GLB with ONE material — the production base for the
  // build endpoint. Production callers pass Tripo P1 output here.
  const doc = new Document();
  const buffer = doc.createBuffer();
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const positionAccessor = doc
    .createAccessor('POSITION')
    .setType('VEC3')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .setArray(positions as any)
    .setBuffer(buffer);
  const indexAccessor = doc
    .createAccessor('INDICES')
    .setType('SCALAR')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .setArray(indices as any)
    .setBuffer(buffer);
  const material = doc.createMaterial('base').setBaseColorFactor([1, 1, 1, 1]);
  const primitive = doc
    .createPrimitive()
    .setMode(4)
    .setAttribute('POSITION', positionAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);
  const mesh = doc.createMesh('m').addPrimitive(primitive);
  const node = doc.createNode('root').setMesh(mesh);
  const scene = doc.createScene('scene').addChild(node);
  doc.getRoot().setDefaultScene(scene);
  const io = new NodeIO();
  const bytes = await io.writeBinary(doc);
  return Buffer.from(bytes).toString('base64');
}

beforeAll(() => {
  app = new Hono();
  app.route('/api/collection', buildCollectionRoute({ jwt: stubJwt }));
});

// --- Auth gate -------------------------------------------------------------

describe('POST /api/collection/build — auth gate (KTD-7)', () => {
  it('rejects requests with no Authorization header (401)', async () => {
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseGlbBase64: 'AAA', variants: [] }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with an invalid bearer token (401)', async () => {
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-valid' },
      body: JSON.stringify({ baseGlbBase64: 'AAA', variants: [] }),
    });
    expect(res.status).toBe(401);
  });
});

// --- Body / schema validation ----------------------------------------------

describe('POST /api/collection/build — input validation', () => {
  it('rejects non-JSON body (400)', async () => {
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: 'this is not json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_json');
  });

  it('rejects 0 variants (zod min)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ baseGlbBase64, variants: [] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_params');
  });

  it('rejects 17 variants (zod max — AE5 enforcement)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const variants = Array.from({ length: 17 }, () => ({
      baseColorRgb: [1, 0, 0, 1],
      paramsJson: '{}',
    }));
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ baseGlbBase64, variants }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_params');
  });

  it('rejects invalid baseColorRgb (3-tuple instead of 4-tuple)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [{ baseColorRgb: [1, 0, 0], paramsJson: '{}' }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown textureId (not in TEXTURE_LIBRARY)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [{ baseColorRgb: [1, 0, 0, 1], textureId: 'velvet', paramsJson: '{}' }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects oversized baseGlbBase64 (past the 12 MiB-binary cap — SEC-001)', async () => {
    // 19 MiB string — past both the 18 MiB bodyLimit and zod's 16.8M field cap
    // (sized to a 12 MiB GLB binary). Use repeat to avoid allocating distinct
    // characters; the guards only care about length.
    const oversized = 'A'.repeat(19 * 1024 * 1024);
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64: oversized,
        variants: [{ baseColorRgb: [1, 0, 0, 1], paramsJson: '{}' }],
      }),
    });
    // Either the bodyLimit middleware fires (413) or zod field-cap fires
    // (400). Both close the OOM vector; either is acceptable per plan
    // SEC-001 test rubric.
    expect([400, 413]).toContain(res.status);
  });
});

// --- Happy path ------------------------------------------------------------

describe('POST /api/collection/build — happy path', () => {
  it('returns N variant GLBs for N valid variant specs', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const variants = [
      { baseColorRgb: [1, 0, 0, 1], paramsJson: '{}' },
      { baseColorRgb: [0, 1, 0, 1], textureId: 'gold', paramsJson: '{"v":1}' },
      { baseColorRgb: [0, 0, 1, 1], textureId: 'chrome', paramsJson: '{}' },
    ];
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ baseGlbBase64, variants }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variants: Array<{ glbBase64: string }> };
    expect(body.variants).toHaveLength(3);

    for (const v of body.variants) {
      const decoded = Buffer.from(v.glbBase64, 'base64');
      // GLB magic: 'glTF' = 0x67 0x6c 0x54 0x46
      expect(decoded[0]).toBe(0x67);
      expect(decoded[1]).toBe(0x6c);
      expect(decoded[2]).toBe(0x54);
      expect(decoded[3]).toBe(0x46);
    }
  });
});
