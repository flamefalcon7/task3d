import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';
import type { UsedByRecord } from '../events/integrationIndexer.js';

const VALID_ID = '0x' + 'a'.repeat(64);

function appWith(records: UsedByRecord[]) {
  return buildApp({
    integrationIndexer: { getIntegrations: () => records, getLeaderboard: () => [] },
  });
}

describe('GET /api/collections/:id/integrations', () => {
  it('returns the indexer records as snake_case "Used by" entries', async () => {
    const app = appWith([
      { name: 'CoolGame', url: 'https://coolgame.example', integrator: '0x' + '1'.repeat(64), registeredAtMs: 123 },
    ]);
    const res = await app.request(`/api/collections/${VALID_ID}/integrations`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      integrations: [
        {
          name: 'CoolGame',
          url: 'https://coolgame.example',
          integrator: '0x' + '1'.repeat(64),
          registered_at_ms: 123,
        },
      ],
    });
  });

  it('returns an empty list for a collection with no integrations', async () => {
    const res = await appWith([]).request(`/api/collections/${VALID_ID}/integrations`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ integrations: [] });
  });

  it('rejects a malformed collection id with 400', async () => {
    const res = await appWith([]).request('/api/collections/not-an-id/integrations');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_collection_id' });
  });

  it('rate-limits a single IP after the window cap (429)', async () => {
    const app = appWith([]);
    const ip = '203.0.113.7';
    let lastStatus = 0;
    for (let i = 0; i < 62; i++) {
      const res = await app.request(`/api/collections/${VALID_ID}/integrations`, {
        headers: { 'x-forwarded-for': ip },
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
