import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { collectionBuildRequestSchema } from '@overflow2026/shared';
import type { CollectionBuildResponse } from '@overflow2026/shared';
import { Buffer } from 'node:buffer';
import {
  swapMaterial,
  loadBundledTexture,
  PartCountMismatchError,
} from '../lib/gltf-material-swap.js';
import type { JwtSigner } from '../lib/jwt.js';

export interface CollectionRouteDeps {
  // JWT is REQUIRED for this route (KTD-7). Unlike /api/generate's prompt
  // mode, every Forge build call is creator-attributable so we always
  // demand an authenticated session. Tests can inject a stub signer.
  jwt?: JwtSigner;
}

// SEC-001: reject oversized requests BEFORE @gltf-transform/core allocates
// anything. Sized to the SAME 12 MiB GLB-binary ceiling /create enforces on
// upload (CreateModelPage MAX_GLB_BYTES) so any publishable model can also be
// forked: 12 MiB binary base64-encodes to ~16.78 MB, plus the JSON envelope
// (variants + paramsJson), so the body cap is 18 MiB. Zod's
// max(16_800_000) on baseGlbBase64 is the second line of defense at field-level.
const MAX_BODY_BYTES = 18 * 1024 * 1024;

export function buildCollectionRoute(deps: CollectionRouteDeps) {
  const route = new Hono();

  route.use(
    '/build',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
  );

  route.post('/build', async (c) => {
    // KTD-7: JWT required. Mirror /api/generate prompt-mode auth ladder.
    if (!deps.jwt) {
      return c.json(
        { error: 'auth_unavailable', message: 'Collection build requires server-side JWT configuration' },
        503,
      );
    }
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;
    if (!token) {
      return c.json(
        { error: 'auth_required', message: 'Collection build requires Authorization: Bearer <jwt>' },
        401,
      );
    }
    try {
      await deps.jwt.verifySession(token);
    } catch {
      return c.json({ error: 'auth_invalid', message: 'Invalid or expired session token' }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }

    const parsed = collectionBuildRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid_params', issues: parsed.error.issues }, 400);
    }

    const { baseGlbBase64, variants } = parsed.data;
    const baseGlb = Uint8Array.from(Buffer.from(baseGlbBase64, 'base64'));

    try {
      const swapped = await Promise.all(
        variants.map((v) => swapMaterial(baseGlb, v, loadBundledTexture)),
      );
      const response: CollectionBuildResponse = {
        variants: swapped.map((g) => ({ glbBase64: Buffer.from(g).toString('base64') })),
      };
      return c.json(response);
    } catch (err) {
      // plan-013 — surface a distinct 422 envelope when the per-variant
      // partColors array length disagrees with the base GLB's material count.
      // Frontend uses materialCount + partColorsCount to show "your base has
      // N parts; you sent M" so the L2 creator can regenerate or pick a
      // different base. Distinct from `no_material_in_base_glb` (no materials
      // at all) and `glb_parse_failed` (malformed bytes).
      if (err instanceof PartCountMismatchError) {
        return c.json(
          {
            error: 'part_count_mismatch',
            materialCount: err.materialCount,
            partColorsCount: err.partColorsCount,
          },
          422,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'no_material_in_base_glb') {
        return c.json({ error: 'no_material_in_base_glb' }, 422);
      }
      // Treat anything else from gltf-transform as a malformed base GLB.
      return c.json({ error: 'glb_parse_failed', message }, 422);
    }
  });

  return route;
}
