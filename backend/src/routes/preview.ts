import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PreviewRouteDeps {
  tmpDir: string;
}

export function buildPreviewRoute(deps: PreviewRouteDeps) {
  const route = new Hono();

  route.get('/:id', async (c) => {
    const id = c.req.param('id');
    // Guard against path traversal — uuid format only.
    if (!/^[a-z0-9-]{8,}$/i.test(id)) {
      return c.json({ error: 'invalid id' }, 400);
    }
    try {
      const bytes = await readFile(join(deps.tmpDir, `${id}.glb`));
      return new Response(bytes, {
        headers: {
          'Content-Type': 'model/gltf-binary',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return c.json({ error: 'not found' }, 404);
    }
  });

  return route;
}
