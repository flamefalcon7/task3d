import { describe, it, expect, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createIntegrationIndexer, type IndexerClient } from './integrationIndexer.js';

const PKG = '0x' + '9'.repeat(64);
const COLL = '0x' + 'a'.repeat(64);
const TABLE = '0x' + 'b'.repeat(64);
const INTG = '0x' + 'c'.repeat(64);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

interface MockOpts {
  events: Array<{ parsedJson: unknown }>;
  appMetadata: unknown; // value placed at content.fields.value.fields.app_metadata
}

function mockClient(opts: MockOpts): IndexerClient {
  return {
    queryEvents: vi.fn().mockResolvedValue({
      data: opts.events,
      nextCursor: { txDigest: 'd', eventSeq: '0' },
      hasNextPage: false,
    }),
    getObject: vi.fn().mockResolvedValue({
      data: { content: { fields: { integrations: { fields: { id: { id: TABLE } } } } } },
    }),
    getDynamicFieldObject: vi.fn().mockResolvedValue({
      data: { content: { fields: { value: { fields: { app_metadata: opts.appMetadata } } } } },
    }),
  } as unknown as IndexerClient;
}

const validEvent = {
  parsedJson: { collection_id: COLL, integrator: INTG, registered_at_ms: '1716200000000' },
};

describe('integrationIndexer', () => {
  it('ingests a valid event and exposes the resolved record', async () => {
    const client = mockClient({
      events: [validEvent],
      appMetadata: b64({ name: 'CoolGame', url: 'https://coolgame.example' }),
    });
    const indexer = createIntegrationIndexer({ client, packageId: PKG });
    await indexer.pollOnce();

    expect(indexer.getIntegrations(COLL)).toEqual([
      {
        name: 'CoolGame',
        url: 'https://coolgame.example',
        integrator: INTG,
        registeredAtMs: 1716200000000,
      },
    ]);
  });

  it('decodes app_metadata supplied as a number[] (vector<u8>)', async () => {
    const bytes = Array.from(
      new TextEncoder().encode(JSON.stringify({ name: 'NumGame', url: 'https://num.example' })),
    );
    const client = mockClient({ events: [validEvent], appMetadata: bytes });
    const indexer = createIntegrationIndexer({ client, packageId: PKG });
    await indexer.pollOnce();
    expect(indexer.getIntegrations(COLL)[0]?.name).toBe('NumGame');
  });

  it('drops a record whose app_metadata fails schema validation (non-https)', async () => {
    const client = mockClient({
      events: [validEvent],
      appMetadata: b64({ name: 'Evil', url: 'http://evil.example' }),
    });
    const indexer = createIntegrationIndexer({ client, packageId: PKG });
    await indexer.pollOnce();
    expect(indexer.getIntegrations(COLL)).toEqual([]);
  });

  it('queries the package-qualified IntegrationRegistered event type', async () => {
    const client = mockClient({
      events: [],
      appMetadata: b64({ name: 'X', url: 'https://x.io' }),
    });
    const indexer = createIntegrationIndexer({ client, packageId: PKG });
    await indexer.pollOnce();
    expect(client.queryEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { MoveEventType: `${PKG}::model3d::IntegrationRegistered` },
      }),
    );
  });

  it('dedupes repeated registrations from the same integrator', async () => {
    const client = mockClient({
      events: [validEvent, validEvent],
      appMetadata: b64({ name: 'CoolGame', url: 'https://coolgame.example' }),
    });
    const indexer = createIntegrationIndexer({ client, packageId: PKG });
    await indexer.pollOnce();
    expect(indexer.getIntegrations(COLL)).toHaveLength(1);
  });

  it('returns [] for an unknown collection', async () => {
    const client = mockClient({ events: [], appMetadata: b64({ name: 'X', url: 'https://x.io' }) });
    const indexer = createIntegrationIndexer({ client, packageId: PKG });
    await indexer.pollOnce();
    expect(indexer.getIntegrations('0x' + 'f'.repeat(64))).toEqual([]);
  });
});
