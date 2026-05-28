import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchBlobWithTimeout,
  WalrusFetchAbortedError,
  WalrusFetchTimeoutError,
} from './fetchWithTimeout';

const URL = 'https://aggregator.testnet.example/blob/abc123';

// Build a stub `fetch` that returns a Response whose arrayBuffer() resolves
// with the supplied bytes. ok defaults to true / status 200.
function okResponse(bytes: ArrayBuffer = new ArrayBuffer(8)): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes,
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

// Stub fetch with a controllable promise: it inspects the incoming signal and
// rejects with an AbortError DOMException when the signal aborts. This mirrors
// real fetch behavior — including the fact that fetch does NOT differentiate
// "timeout abort" from "external abort"; both surface as AbortError.
function makeHangingFetch(): {
  fetchSpy: ReturnType<typeof vi.fn>;
  /** call to manually resolve in-flight fetches with a success payload */
  resolveAll: (bytes?: ArrayBuffer) => void;
  pendingCount: () => number;
} {
  const pending: Array<{
    resolve: (r: Response) => void;
    reject: (e: unknown) => void;
  }> = [];

  const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
    return await new Promise<Response>((resolve, reject) => {
      pending.push({ resolve, reject });
      const signal = init?.signal;
      if (signal) {
        const onAbort = () => {
          const err = new DOMException('The user aborted a request.', 'AbortError');
          reject(err);
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  });

  return {
    fetchSpy,
    resolveAll(bytes = new ArrayBuffer(4)) {
      for (const p of pending.splice(0)) p.resolve(okResponse(bytes));
    },
    pendingCount: () => pending.length,
  };
}

describe('fetchBlobWithTimeout', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves with the response ArrayBuffer on the happy path', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchSpy = vi.fn(async () => okResponse(bytes));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await fetchBlobWithTimeout(URL, { timeoutMs: 3000 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(URL);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(4);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('resolves normally when an external signal is provided but never aborts', async () => {
    const bytes = new Uint8Array([9, 9]).buffer;
    const fetchSpy = vi.fn(async () => okResponse(bytes));
    vi.stubGlobal('fetch', fetchSpy);

    const controller = new AbortController();
    const result = await fetchBlobWithTimeout(URL, {
      timeoutMs: 3000,
      signal: controller.signal,
    });

    expect(result.byteLength).toBe(2);
    // controller was never aborted; the fetch effectively still received a
    // signal (the merged one) but it didn't fire.
    expect(controller.signal.aborted).toBe(false);
  });

  it('rejects with WalrusFetchTimeoutError when the timeout fires before fetch resolves', async () => {
    vi.useFakeTimers();
    const { fetchSpy } = makeHangingFetch();
    vi.stubGlobal('fetch', fetchSpy);

    const promise = fetchBlobWithTimeout(URL, { timeoutMs: 3000 });
    // Surface unhandled rejection until we await it.
    promise.catch(() => undefined);

    // Advance past the timeout — AbortSignal.timeout is scheduled on the
    // fake-timer queue and will fire here.
    await vi.advanceTimersByTimeAsync(3001);

    await expect(promise).rejects.toBeInstanceOf(WalrusFetchTimeoutError);
    await expect(promise).rejects.toMatchObject({
      name: 'WalrusFetchTimeoutError',
      timeoutMs: 3000,
      url: URL,
    });
    // Error message names the duration.
    await expect(promise).rejects.toThrowError(/3000ms/);
    await expect(promise).rejects.toThrowError(new RegExp(URL));
  });

  it('rejects with WalrusFetchAbortedError when the external signal aborts mid-flight', async () => {
    const { fetchSpy } = makeHangingFetch();
    vi.stubGlobal('fetch', fetchSpy);

    const controller = new AbortController();
    const promise = fetchBlobWithTimeout(URL, {
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    promise.catch(() => undefined);

    // Abort externally before the timeout would fire.
    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(WalrusFetchAbortedError);
    await expect(promise).rejects.toMatchObject({ name: 'WalrusFetchAbortedError' });
    await expect(promise).rejects.toThrowError(new RegExp(URL));
  });

  it('rejects with a generic Error containing status + URL on non-2xx', async () => {
    const fetchSpy = vi.fn(async () => errorResponse(503));
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      fetchBlobWithTimeout(URL, { timeoutMs: 3000 }),
    ).rejects.toThrowError(/503/);
    await expect(
      fetchBlobWithTimeout(URL, { timeoutMs: 3000 }),
    ).rejects.toThrowError(new RegExp(URL));
    // Should NOT be a typed abort error — it's a server failure, not a cancel.
    await expect(
      fetchBlobWithTimeout(URL, { timeoutMs: 3000 }),
    ).rejects.not.toBeInstanceOf(WalrusFetchTimeoutError);
    await expect(
      fetchBlobWithTimeout(URL, { timeoutMs: 3000 }),
    ).rejects.not.toBeInstanceOf(WalrusFetchAbortedError);
  });

  describe('jsdom fallback (AbortSignal.any unavailable)', () => {
    let originalAny: unknown;

    beforeEach(() => {
      // Force the manual-merge fallback path. We can't `delete` directly on
      // the AbortSignal constructor in all runtimes (Node 22 exposes `any` as
      // a non-configurable own property in some builds), so we stash and set
      // to undefined; the production helper's `typeof anyFn === 'function'`
      // guard takes the fallback branch.
      const ctor = AbortSignal as unknown as { any?: unknown };
      originalAny = ctor.any;
      try {
        Object.defineProperty(AbortSignal, 'any', {
          value: undefined,
          configurable: true,
          writable: true,
        });
      } catch {
        // If the property is locked down, fall back to assignment which the
        // helper's `typeof` guard still catches as undefined.
        (ctor as { any?: unknown }).any = undefined;
      }
    });

    afterEach(() => {
      const ctor = AbortSignal as unknown as { any?: unknown };
      try {
        Object.defineProperty(AbortSignal, 'any', {
          value: originalAny,
          configurable: true,
          writable: true,
        });
      } catch {
        ctor.any = originalAny;
      }
    });

    it('still distinguishes timeout from external abort under the fallback', async () => {
      vi.useFakeTimers();
      const { fetchSpy } = makeHangingFetch();
      vi.stubGlobal('fetch', fetchSpy);

      // Fallback + timeout fires → WalrusFetchTimeoutError.
      const timeoutPromise = fetchBlobWithTimeout(URL, { timeoutMs: 1500 });
      timeoutPromise.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(1600);
      await expect(timeoutPromise).rejects.toBeInstanceOf(WalrusFetchTimeoutError);

      // Fallback + external abort → WalrusFetchAbortedError.
      const controller = new AbortController();
      const abortPromise = fetchBlobWithTimeout(URL, {
        timeoutMs: 10_000,
        signal: controller.signal,
      });
      abortPromise.catch(() => undefined);
      controller.abort();
      await expect(abortPromise).rejects.toBeInstanceOf(WalrusFetchAbortedError);
    });
  });
});
