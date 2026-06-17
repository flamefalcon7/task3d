import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';
import type { LeaderboardEntry } from '../events/integrationIndexer.js';

const id = (ch: string) => '0x' + ch.repeat(64);

function appWith(entries: LeaderboardEntry[]) {
  return buildApp({
    integrationIndexer: { getIntegrations: () => [], getLeaderboard: () => entries },
  });
}

describe('GET /api/integrations/leaderboard', () => {
  it('returns an empty leaderboard when the indexer is empty', async () => {
    const res = await appWith([]).request('/api/integrations/leaderboard');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ leaderboard: [] });
  });

  it('sorts by count desc and emits snake_case fields', async () => {
    const app = appWith([
      { collectionId: id('a'), count: 1, latestRegisteredAtMs: 100 },
      { collectionId: id('b'), count: 3, latestRegisteredAtMs: 100 },
      { collectionId: id('c'), count: 2, latestRegisteredAtMs: 100 },
    ]);
    const res = await app.request('/api/integrations/leaderboard');
    const body = (await res.json()) as {
      leaderboard: Array<{ collection_id: string; count: number; latest_registered_at_ms: number }>;
    };
    expect(body.leaderboard.map((r) => r.count)).toEqual([3, 2, 1]);
    expect(body.leaderboard[0]).toEqual({
      collection_id: id('b'),
      count: 3,
      latest_registered_at_ms: 100,
    });
  });

  it('breaks count ties by most-recent integration timestamp desc (R3)', async () => {
    const app = appWith([
      { collectionId: id('a'), count: 2, latestRegisteredAtMs: 1000 },
      { collectionId: id('b'), count: 2, latestRegisteredAtMs: 5000 },
    ]);
    const res = await app.request('/api/integrations/leaderboard');
    const body = (await res.json()) as { leaderboard: Array<{ collection_id: string }> };
    expect(body.leaderboard.map((r) => r.collection_id)).toEqual([id('b'), id('a')]);
  });

  it('rate-limits a single IP after the window cap (429)', async () => {
    const app = appWith([]);
    const ip = '203.0.113.9';
    let lastStatus = 0;
    for (let i = 0; i < 62; i++) {
      const res = await app.request('/api/integrations/leaderboard', {
        headers: { 'x-forwarded-for': ip },
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
