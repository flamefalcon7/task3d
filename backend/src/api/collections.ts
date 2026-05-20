// plan-008 U7 — public "Used by" read API.
//
// GET /api/collections/:id/integrations → the integrations the indexer has
// validated for one collection. Public (no auth): it's published trust-signal
// data. `:id` is validated against the object-ID shape before any lookup, and
// a coarse per-IP fixed-window limiter caps abuse of the unauthenticated read.

import { Hono } from 'hono';
import type { IntegrationIndexer } from '../events/integrationIndexer.js';

export interface CollectionsRouteDeps {
  indexer: Pick<IntegrationIndexer, 'getIntegrations'>;
}

const OBJECT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

// Coarse per-IP fixed-window limiter (in-memory). Demo-grade; a shared store
// would be needed behind multiple instances.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string, now = Date.now()): boolean {
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export function buildCollectionsRoute(deps: CollectionsRouteDeps) {
  const route = new Hono();

  route.get('/:id/integrations', (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (rateLimited(ip)) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    const id = c.req.param('id');
    if (!OBJECT_ID_RE.test(id)) {
      return c.json({ error: 'invalid_collection_id' }, 400);
    }

    const integrations = deps.indexer.getIntegrations(id).map((r) => ({
      name: r.name,
      url: r.url,
      integrator: r.integrator,
      registered_at_ms: r.registeredAtMs,
    }));
    return c.json({ integrations });
  });

  return route;
}
