import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildMemwalClient,
  type MemwalLike,
  type RecallMemory,
} from './memwal-client.js';

const ENV = { delegateKey: 'deadbeef', accountId: '0xacct' };

function fakeSdk(over: Partial<MemwalLike> = {}): MemwalLike {
  return {
    remember: vi.fn(async () => ({ job_id: 'j', status: 'pending' })),
    recall: vi.fn(async () => ({ results: [] as RecallMemory[], total: 0 })),
    ...over,
  };
}

describe('buildMemwalClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('missing env → inert stub: recall [], remember resolves', async () => {
    const c = buildMemwalClient({});
    expect(c.configured).toBe(false);
    await expect(c.remember('ns', 'hi')).resolves.toBeUndefined();
    expect(await c.recall('ns', 'q')).toEqual({ results: [], errored: false });
  });

  it('recall rejects → [] with errored=true', async () => {
    const sdk = fakeSdk({ recall: vi.fn(async () => { throw new Error('relayer down'); }) });
    const c = buildMemwalClient(ENV, { sdk });
    expect(await c.recall('ns', 'q')).toEqual({ results: [], errored: true });
  });

  it('recall times out → [] with errored=true within budget', async () => {
    const sdk = fakeSdk({ recall: vi.fn(() => new Promise(() => {})) }); // never resolves
    const c = buildMemwalClient(ENV, { sdk, recallTimeoutMs: 20 });
    const start = Date.now();
    const out = await c.recall('ns', 'q');
    expect(out).toEqual({ results: [], errored: true });
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('recall success returns results (errored=false)', async () => {
    const results: RecallMemory[] = [{ blob_id: 'b', text: 'a car', distance: 0.4 }];
    const sdk = fakeSdk({ recall: vi.fn(async () => ({ results, total: 1 })) });
    const c = buildMemwalClient(ENV, { sdk });
    expect(await c.recall('ns', 'car', { limit: 5 })).toEqual({ results, errored: false });
    expect(sdk.recall).toHaveBeenCalledWith({ query: 'car', namespace: 'ns', limit: 5, maxDistance: undefined });
  });

  it('remember is fire-and-forget: resolves even when the SDK rejects', async () => {
    const sdk = fakeSdk({ remember: vi.fn(async () => { throw new Error('boom'); }) });
    const c = buildMemwalClient(ENV, { sdk });
    await expect(c.remember('ns', 'a truck')).resolves.toBeUndefined();
    expect(sdk.remember).toHaveBeenCalledWith('a truck', 'ns');
  });

  it('remember does not await the background job (no rememberAndWait)', async () => {
    const sdk = fakeSdk();
    const c = buildMemwalClient(ENV, { sdk });
    await c.remember('ns', 'x');
    expect(sdk.remember).toHaveBeenCalledTimes(1);
    // the wrapper only calls the async-accepted `remember`, never a wait variant.
    expect((sdk as unknown as Record<string, unknown>).rememberAndWait).toBeUndefined();
  });
});

describe('default config (spike-corrected facts)', () => {
  it('defaults serverUrl to the testnet dev relayer and passes NO suiNetwork', async () => {
    const created: unknown[] = [];
    vi.resetModules();
    vi.doMock('@mysten-incubation/memwal', () => ({
      MemWal: { create: (cfg: unknown) => { created.push(cfg); return fakeSdk(); } },
    }));
    const { buildMemwalClient: build } = await import('./memwal-client.js');
    build({ delegateKey: 'k', accountId: '0xa' }); // no serverUrl
    expect(created).toHaveLength(1);
    const cfg = created[0] as Record<string, unknown>;
    expect(cfg.serverUrl).toBe('https://relayer.dev.memwal.ai');
    expect(cfg).not.toHaveProperty('suiNetwork');
    vi.doUnmock('@mysten-incubation/memwal');
    vi.resetModules();
  });
});

describe('dependency pin (R12)', () => {
  it('pins @mysten-incubation/memwal to an exact version (no range/wildcard)', () => {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@mysten-incubation/memwal']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
