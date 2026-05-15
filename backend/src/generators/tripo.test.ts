import { describe, expect, it, vi } from 'vitest';
import type { TripoParams } from '@overflow2026/shared';
import type { TripoClient } from '../lib/tripo-client.js';
import { TripoGenerator } from './tripo.js';

const makeStubClient = (overrides: Partial<TripoClient> = {}): TripoClient =>
  ({
    submitTask: vi.fn().mockResolvedValue('task-1'),
    pollTask: vi.fn().mockResolvedValue({ url: 'https://cdn/x.glb' }),
    downloadGlb: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    ...overrides,
  }) as unknown as TripoClient;

describe('TripoGenerator', () => {
  it('happy path returns glbBytes + lineageStub with generatorSource=tripo', async () => {
    const client = makeStubClient();
    const gen = new TripoGenerator(client);
    const params: TripoParams = { shape: 'tripo', prompt: 'a tiny dragon' };
    const result = await gen.generate(params);

    expect(Array.from(result.glbBytes)).toEqual([1, 2, 3, 4]);
    expect(result.lineageStub).toEqual({
      shape: 'tripo',
      params,
      prompt: 'a tiny dragon',
      generatorSource: 'tripo',
    });
    expect(client.submitTask).toHaveBeenCalledWith('a tiny dragon');
    expect(client.pollTask).toHaveBeenCalledWith('task-1');
    expect(client.downloadGlb).toHaveBeenCalledWith('https://cdn/x.glb');
  });

  it('throws on empty prompt', async () => {
    const gen = new TripoGenerator(makeStubClient());
    await expect(
      gen.generate({ shape: 'tripo', prompt: '' } as TripoParams),
    ).rejects.toThrow(/non-empty prompt/);
  });

  it('throws when shape is not tripo', async () => {
    const gen = new TripoGenerator(makeStubClient());
    await expect(
      gen.generate({ shape: 'box', prompt: 'x' } as unknown as TripoParams),
    ).rejects.toThrow(/shape=tripo/);
  });
});
