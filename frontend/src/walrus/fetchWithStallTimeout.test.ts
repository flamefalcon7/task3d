import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchBytesWithStallTimeout,
  WalrusStallTimeoutError,
} from './fetchWithStallTimeout';

// Build a Response whose body streams `chunks` one at a time. Used to exercise
// the reader path (the production code streams to catch mid-download stalls).
function streamingResponse(chunks: Uint8Array[], ok = true, status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return { ok, status, body } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchBytesWithStallTimeout', () => {
  it('concatenates streamed chunks into the full byte array', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        streamingResponse([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchBytesWithStallTimeout('https://agg/x');
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to arrayBuffer when the response has no streamable body', async () => {
    const res = {
      ok: true,
      status: 200,
      body: null,
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));

    const out = await fetchBytesWithStallTimeout('https://agg/x');
    expect(Array.from(out)).toEqual([9, 8, 7]);
  });

  it('does NOT retry a 4xx (permanent) — surfaces it immediately', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamingResponse([], false, 404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchBytesWithStallTimeout('https://agg/x', { maxRetries: 2 }),
    ).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(streamingResponse([new Uint8Array([42])]));
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchBytesWithStallTimeout('https://agg/x', {
      maxRetries: 2,
      retryBackoffMs: 1,
    });
    expect(Array.from(out)).toEqual([42]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a wedged (never-responding) connection with a stall timeout', async () => {
    // Connection opens but never resolves — the http_code=000 wedge. The stall
    // timer (here 30ms) must abort it. The retries also stall, so the call
    // rejects with the user-facing stall error.
    const fetchMock = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchBytesWithStallTimeout('https://agg/x', {
        stallMs: 30,
        maxRetries: 1,
        retryBackoffMs: 1,
      }),
    ).rejects.toBeInstanceOf(WalrusStallTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // first + 1 retry
  });

  it('aborts a MID-STREAM stall (bytes arrive, then the stream goes silent)', async () => {
    // The distinctive behavior: one chunk arrives (resetting the stall timer),
    // then nothing — the re-armed stall timer must fire. Connect-stall alone
    // wouldn't exercise the reset()-then-refire path.
    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2])); // progress, then silence
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          );
        },
      });
      return Promise.resolve({ ok: true, status: 200, body } as unknown as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchBytesWithStallTimeout('https://agg/x', {
        stallMs: 40,
        hardCapMs: 5000,
        maxRetries: 0,
      }),
    ).rejects.toBeInstanceOf(WalrusStallTimeoutError);
  });

  it('aborts a TRICKLE that never stalls but never finishes (hard cap)', async () => {
    // 1 byte every 15ms keeps the 40ms stall timer perpetually reset, so only
    // the absolute hard cap can stop it. This is the regression guard for the
    // trickle hang that a stall-only timer misses.
    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      let iv: ReturnType<typeof setInterval>;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          iv = setInterval(() => controller.enqueue(new Uint8Array([1])), 15);
          init?.signal?.addEventListener('abort', () => {
            clearInterval(iv);
            controller.error(new DOMException('aborted', 'AbortError'));
          });
        },
        cancel() {
          clearInterval(iv);
        },
      });
      return Promise.resolve({ ok: true, status: 200, body } as unknown as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchBytesWithStallTimeout('https://agg/x', {
        stallMs: 40,
        hardCapMs: 120,
        maxRetries: 0,
      }),
    ).rejects.toBeInstanceOf(WalrusStallTimeoutError);
  });

  it('retries a 5xx (transient) then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamingResponse([], false, 503))
      .mockResolvedValueOnce(streamingResponse([new Uint8Array([7])]));
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchBytesWithStallTimeout('https://agg/x', {
      maxRetries: 2,
      retryBackoffMs: 1,
    });
    expect(Array.from(out)).toEqual([7]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maxRetries=0 makes exactly one attempt then throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamingResponse([], false, 503));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchBytesWithStallTimeout('https://agg/x', { maxRetries: 0 }),
    ).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
