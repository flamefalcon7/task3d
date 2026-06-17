// plan-2026-06-17-002 U2 — public cross-collection integration leaderboard.
//
// GET /api/integrations/leaderboard → collections ranked by integration count.
// Public (no auth): published trust-signal data, no metered upstream — the
// handler reads from the in-memory indexer store only (zero-cost). A separate
// per-IP fixed-window limiter (its own instance, same shape as collections.ts)
// caps abuse of the unauthenticated read. Response is implicitly bounded by
// integration-event volume (the store only holds collections with >=1 event);
// a defensive slice makes the bound explicit.

import { Hono } from 'hono';
import type { IntegrationIndexer } from '../events/integrationIndexer.js';

export interface IntegrationsRouteDeps {
  indexer: Pick<IntegrationIndexer, 'getLeaderboard'>;
}

// Defensive payload ceiling (security review): the store is already bounded by
// event volume, but cap the serialized rows so a future persisted indexer can't
// turn one request into an unbounded response.
const MAX_ENTRIES = 500;

// Coarse per-IP fixed-window limiter (in-memory) — own instance, not shared with
// the collections route, so the two endpoints don't drain each other's budget.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const MAX_KEYS = 50_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string, now = Date.now()): boolean {
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    if (hits.size >= MAX_KEYS) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export function buildIntegrationsRoute(deps: IntegrationsRouteDeps) {
  const route = new Hono();

  route.get('/leaderboard', (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (rateLimited(ip)) {
      return c.json({ error: 'rate_limited' }, 429);
    }

    // Sort here (the route owns ordering; the accessor returns unsorted):
    // count desc, then most-recent integration desc, then collectionId for a
    // stable final key.
    const leaderboard = deps.indexer
      .getLeaderboard()
      .sort(
        (a, b) =>
          b.count - a.count ||
          b.latestRegisteredAtMs - a.latestRegisteredAtMs ||
          a.collectionId.localeCompare(b.collectionId),
      )
      .slice(0, MAX_ENTRIES)
      .map((r) => ({
        collection_id: r.collectionId,
        count: r.count,
        latest_registered_at_ms: r.latestRegisteredAtMs,
      }));

    return c.json({ leaderboard });
  });

  return route;
}
