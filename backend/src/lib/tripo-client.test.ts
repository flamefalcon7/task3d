import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TripoAuthError,
  TripoClient,
  TripoFailedError,
  TripoFormatError,
  TripoTimeoutError,
} from './tripo-client.js';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('TripoClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('constructor throws when apiKey missing', () => {
    expect(() => new TripoClient('')).toThrow(/TRIPO_API_KEY required/);
  });

  describe('submitTask', () => {
    it('returns task_id on success', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { task_id: 'abc-123' } }));
      const client = new TripoClient('key');
      const id = await client.submitTask('a dragon');
      expect(id).toBe('abc-123');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.tripo3d.ai/v2/openapi/task',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer key' }),
        }),
      );
    });

    it('throws TripoAuthError on 401', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }));
      const client = new TripoClient('bad');
      await expect(client.submitTask('x')).rejects.toBeInstanceOf(TripoAuthError);
    });

    it('throws TripoFailedError on 500', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));
      const client = new TripoClient('key');
      await expect(client.submitTask('x')).rejects.toBeInstanceOf(TripoFailedError);
    });

    it('throws TripoFormatError when task_id missing', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
      const client = new TripoClient('key');
      await expect(client.submitTask('x')).rejects.toBeInstanceOf(TripoFormatError);
    });

    it('throws TripoTimeoutError when the HTTP request is aborted by AbortSignal', async () => {
      // AbortSignal.timeout aborts with a DOMException(name='TimeoutError').
      // fetch surfaces it as a thrown DOMException; simulate that here.
      const abortErr = new DOMException('aborted', 'TimeoutError');
      fetchMock.mockRejectedValueOnce(abortErr);
      const client = new TripoClient('key', { requestTimeoutMs: 50 });
      await expect(client.submitTask('x')).rejects.toBeInstanceOf(TripoTimeoutError);
    });
  });

  describe('submitMeshSegmentation (plan-013 step 2)', () => {
    it('returns the segmentation task_id and sends the documented body shape', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { task_id: 'seg-xyz' } }));
      const client = new TripoClient('key');
      const id = await client.submitMeshSegmentation('task-abc');
      expect(id).toBe('seg-xyz');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.tripo3d.ai/v2/openapi/task',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer key' }),
          body: JSON.stringify({
            type: 'mesh_segmentation',
            original_model_task_id: 'task-abc',
          }),
        }),
      );
    });

    it('throws TripoAuthError on 401', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }));
      const client = new TripoClient('bad');
      await expect(client.submitMeshSegmentation('task-abc')).rejects.toBeInstanceOf(
        TripoAuthError,
      );
    });

    it('throws TripoFormatError when task_id missing', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
      const client = new TripoClient('key');
      await expect(client.submitMeshSegmentation('task-abc')).rejects.toBeInstanceOf(
        TripoFormatError,
      );
    });

    it('throws TripoTimeoutError when the HTTP request is aborted by AbortSignal', async () => {
      const abortErr = new DOMException('aborted', 'TimeoutError');
      fetchMock.mockRejectedValueOnce(abortErr);
      const client = new TripoClient('key', { requestTimeoutMs: 50 });
      await expect(client.submitMeshSegmentation('task-abc')).rejects.toBeInstanceOf(
        TripoTimeoutError,
      );
    });
  });

  describe('pollTask', () => {
    const noSleep = () => Promise.resolve();

    it('returns url after several polls (success status)', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { data: { status: 'queued' } }))
        .mockResolvedValueOnce(jsonResponse(200, { data: { status: 'running' } }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            data: { status: 'success', output: { pbr_model: 'https://cdn/x.glb' } },
          }),
        );
      const client = new TripoClient('key');
      const result = await client.pollTask('t1', { sleep: noSleep });
      expect(result.url).toBe('https://cdn/x.glb');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('falls back to glb_url field when pbr_model missing', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { data: { status: 'done', output: { glb_url: 'https://cdn/y.glb' } } }),
      );
      const client = new TripoClient('key');
      const result = await client.pollTask('t1', { sleep: noSleep });
      expect(result.url).toBe('https://cdn/y.glb');
    });

    it('throws TripoFailedError on failed status', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { status: 'failed' } }));
      const client = new TripoClient('key');
      await expect(client.pollTask('t1', { sleep: noSleep })).rejects.toBeInstanceOf(
        TripoFailedError,
      );
    });

    it('throws TripoTimeoutError when never finishes', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { data: { status: 'running' } })),
      );
      const client = new TripoClient('key');
      await expect(
        client.pollTask('t1', { sleep: noSleep, maxWaitMs: 5000 }),
      ).rejects.toBeInstanceOf(TripoTimeoutError);
    });

    it('throws TripoFormatError when done but no url field', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { data: { status: 'success', output: {} } }),
      );
      const client = new TripoClient('key');
      await expect(client.pollTask('t1', { sleep: noSleep })).rejects.toBeInstanceOf(
        TripoFormatError,
      );
    });

    it('throws TripoTimeoutError when an individual poll fetch is aborted', async () => {
      const abortErr = new DOMException('aborted', 'TimeoutError');
      fetchMock.mockRejectedValueOnce(abortErr);
      const client = new TripoClient('key', { requestTimeoutMs: 50 });
      await expect(client.pollTask('t1', { sleep: noSleep })).rejects.toBeInstanceOf(
        TripoTimeoutError,
      );
    });
  });

  describe('downloadGlb', () => {
    it('returns Uint8Array on 200', async () => {
      const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      fetchMock.mockResolvedValueOnce(new Response(bytes, { status: 200 }));
      const client = new TripoClient('key');
      const result = await client.downloadGlb('https://cdn/x.glb');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([0x67, 0x6c, 0x54, 0x46]);
    });

    it('throws TripoFailedError on non-2xx', async () => {
      fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
      const client = new TripoClient('key');
      await expect(client.downloadGlb('https://cdn/x.glb')).rejects.toBeInstanceOf(
        TripoFailedError,
      );
    });

    it('throws TripoTimeoutError when downloadGlb is aborted', async () => {
      const abortErr = new DOMException('aborted', 'TimeoutError');
      fetchMock.mockRejectedValueOnce(abortErr);
      const client = new TripoClient('key', { requestTimeoutMs: 50 });
      await expect(client.downloadGlb('https://cdn/x.glb')).rejects.toBeInstanceOf(
        TripoTimeoutError,
      );
    });
  });
});
