import { describe, expect, it, vi } from 'vitest';
import type { TripoParams } from '@overflow2026/shared';
import type { TripoClient } from '../lib/tripo-client.js';
import { TripoGenerator } from './tripo.js';

const makeStubClient = (overrides: Partial<TripoClient> = {}): TripoClient =>
  ({
    submitTask: vi.fn().mockResolvedValue('task-1'),
    submitMeshSegmentation: vi.fn().mockResolvedValue('seg-task-1'),
    pollTask: vi.fn().mockResolvedValue({ url: 'https://cdn/x.glb' }),
    downloadGlb: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    ...overrides,
  }) as unknown as TripoClient;

describe('TripoGenerator', () => {
  it('plan-013 happy path — chains text_to_model → mesh_segmentation in order', async () => {
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
    // Step 1: text_to_model + first poll.
    expect(client.submitTask).toHaveBeenCalledWith('a tiny dragon');
    // Step 2: segmentation references the upstream task.
    expect(client.submitMeshSegmentation).toHaveBeenCalledWith('task-1');
    // Both poll calls happened; assert call order via vi mock state.
    const pollMock = vi.mocked(client.pollTask);
    expect(pollMock).toHaveBeenCalledTimes(2);
    expect(pollMock.mock.calls[0]?.[0]).toBe('task-1');
    expect(pollMock.mock.calls[1]?.[0]).toBe('seg-task-1');
    // Step 2 carries the longer timeout per plan-013.
    expect(pollMock.mock.calls[0]?.[1]).toEqual({ maxWaitMs: 90_000 });
    expect(pollMock.mock.calls[1]?.[1]).toEqual({ maxWaitMs: 180_000 });
    expect(client.downloadGlb).toHaveBeenCalledWith('https://cdn/x.glb');
  });

  it('plan-013 — step-2 segmentation timeout surfaces as TripoTimeoutError; step-1 bytes are not returned', async () => {
    // Step 1 succeeds, step 2 times out on the second poll. The generator
    // must surface the timeout (never the partial step-1 output) so callers
    // know they got an unsegmented base they cannot publish.
    const { TripoTimeoutError } = await import('../lib/tripo-client.js');
    const pollTask = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://cdn/step1.glb' })
      .mockRejectedValueOnce(new TripoTimeoutError('seg poll timed out'));
    const client = makeStubClient({
      pollTask,
    });
    const gen = new TripoGenerator(client);
    await expect(
      gen.generate({ shape: 'tripo', prompt: 'a tiny dragon' }),
    ).rejects.toBeInstanceOf(TripoTimeoutError);
    expect(client.downloadGlb).not.toHaveBeenCalled();
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
