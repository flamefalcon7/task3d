import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { Document, NodeIO } from '@gltf-transform/core';
import { buildCollectionRoute } from './collection.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';
import type { CapVerifier } from '../sui/capVerifier.js';

const JWT_WALLET =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

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
      sub: JWT_WALLET,
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
      partColors: [{ baseColorRgb: [1, 0, 0, 1] }],
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

  it('rejects invalid baseColorRgb (3-tuple instead of 4-tuple) inside partColors', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [{ partColors: [{ baseColorRgb: [1, 0, 0] }], paramsJson: '{}' }],
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
        variants: [
          { partColors: [{ baseColorRgb: [1, 0, 0, 1], textureId: 'velvet' }], paramsJson: '{}' },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects 0 partColors (zod min — plan-013)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [{ partColors: [], paramsJson: '{}' }],
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
        variants: [{ partColors: [{ baseColorRgb: [1, 0, 0, 1] }], paramsJson: '{}' }],
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
  it('returns N variant GLBs for N valid variant specs (AE3 — TINT-mode loop)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    // The fixture base has 1 material, so each variant supplies a length-1
    // partColors array (the legacy single-material UX form). Length-N
    // segmented bases are exercised by gltf-material-swap.test.ts.
    const variants = [
      { partColors: [{ baseColorRgb: [1, 0, 0, 1] }], paramsJson: '{}' },
      {
        partColors: [{ baseColorRgb: [0, 1, 0, 1], textureId: 'gold' }],
        paramsJson: '{"v":1}',
      },
      {
        partColors: [{ baseColorRgb: [0, 0, 1, 1], textureId: 'chrome' }],
        paramsJson: '{}',
      },
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

// --- plan-013 — part_count_mismatch envelope ------------------------------

describe('POST /api/collection/build — plan-013 part_count_mismatch', () => {
  it('returns 422 part_count_mismatch with material + supplied counts when partColors.length != base materials', async () => {
    // 1-material fixture; variant supplies 3 partColors entries — drift surfaces
    // as a distinct 422 envelope so the L2 editor can show "your base has 1
    // part; you sent 3" instead of the generic glb_parse_failed.
    const baseGlbBase64 = await buildBaseGlbBase64();
    const variants = [
      {
        partColors: [
          { baseColorRgb: [1, 0, 0, 1] },
          { baseColorRgb: [0, 1, 0, 1] },
          { baseColorRgb: [0, 0, 1, 1] },
        ],
        paramsJson: '{}',
      },
    ];
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ baseGlbBase64, variants }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: string;
      materialCount: number;
      partColorsCount: number;
    };
    expect(body.error).toBe('part_count_mismatch');
    expect(body.materialCount).toBe(1);
    expect(body.partColorsCount).toBe(3);
  });
});

// --- plan A2 — name-keyed swap envelope ------------------------------------

describe('POST /api/collection/build — plan A2 material_name_not_found', () => {
  it('returns 422 material_name_not_found (with the name) when a name-keyed entry does not resolve', async () => {
    // The fixture base has ONE material named 'base'. A name-keyed partColors
    // entry that names a non-existent material must fail loudly (422) rather
    // than silently miscolor — the whole point of name-keying.
    const baseGlbBase64 = await buildBaseGlbBase64();
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [
          {
            partColors: [{ baseColorRgb: [1, 0, 0, 1], materialName: 'ghost' }],
            paramsJson: '{}',
          },
        ],
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; materialName?: string };
    expect(body.error).toBe('material_name_not_found');
    // Public base → the offending name is echoed for debugging.
    expect(body.materialName).toBe('ghost');
  });

  it('bakes by material name regardless of array order (public path)', async () => {
    // 1-material base named 'base'; name-keying it succeeds and returns a GLB.
    const baseGlbBase64 = await buildBaseGlbBase64();
    const res = await app.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [
          {
            partColors: [{ baseColorRgb: [0, 1, 0, 1], materialName: 'base' }],
            paramsJson: '{}',
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { variants: Array<{ glbBase64: string }> };
    expect(body.variants).toHaveLength(1);
  });
});

// --- plan-026 U5 — encrypted-base hardening (JWT-owns-cap) -----------------

describe('POST /api/collection/build — encrypted-base hardening', () => {
  const CAP_ID = '0xca9000000000000000000000000000000000000000000000000000000000001';
  const COLLECTION_ID =
    '0xc011000000000000000000000000000000000000000000000000000000000001';

  function appWith(verifier: CapVerifier): Hono {
    const a = new Hono();
    a.route('/api/collection', buildCollectionRoute({ jwt: stubJwt, capVerifier: verifier }));
    return a;
  }

  it('bakes when the JWT wallet owns the in-flight cap (AE2 — paid forker)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const verify = vi.fn().mockResolvedValue(true);
    const a = appWith({ verifyCapOwnership: verify });
    const res = await a.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [{ partColors: [{ baseColorRgb: [1, 0, 0, 1] }], paramsJson: '{}' }],
        encryptedBase: { capId: CAP_ID, collectionId: COLLECTION_ID },
      }),
    });
    expect(res.status).toBe(200);
    // The verifier was called with the JWT wallet as the expected owner.
    expect(verify).toHaveBeenCalledWith({
      capId: CAP_ID,
      ownerAddress: JWT_WALLET,
      collectionId: COLLECTION_ID,
    });
    const body = (await res.json()) as { variants: Array<{ glbBase64: string }> };
    expect(body.variants).toHaveLength(1);
  });

  it('rejects when the JWT wallet does NOT own the cap (403 cap_not_owned)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const verify = vi.fn().mockResolvedValue(false);
    const a = appWith({ verifyCapOwnership: verify });
    const res = await a.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [{ partColors: [{ baseColorRgb: [1, 0, 0, 1] }], paramsJson: '{}' }],
        encryptedBase: { capId: CAP_ID, collectionId: COLLECTION_ID },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('cap_not_owned');
  });

  it('does NOT consult the cap verifier on the unencrypted path (regression)', async () => {
    const baseGlbBase64 = await buildBaseGlbBase64();
    const verify = vi.fn().mockResolvedValue(false); // would reject if called
    const a = appWith({ verifyCapOwnership: verify });
    const res = await a.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64,
        variants: [{ partColors: [{ baseColorRgb: [1, 0, 0, 1] }], paramsJson: '{}' }],
        // no encryptedBase
      }),
    });
    expect(res.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });

  it('suppresses the raw parse-error message for an encrypted base (no plaintext leak)', async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const a = appWith({ verifyCapOwnership: verify });
    // A malformed (non-GLB) base triggers the gltf-transform parse failure path.
    const garbage = Buffer.from('not a glb at all').toString('base64');
    const res = await a.request('/api/collection/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        baseGlbBase64: garbage,
        variants: [{ partColors: [{ baseColorRgb: [1, 0, 0, 1] }], paramsJson: '{}' }],
        encryptedBase: { capId: CAP_ID, collectionId: COLLECTION_ID },
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; message?: string };
    expect(body.error).toBe('glb_parse_failed');
    // The verbose `message` (which could echo decrypted bytes) is omitted.
    expect(body.message).toBeUndefined();
  });
});
