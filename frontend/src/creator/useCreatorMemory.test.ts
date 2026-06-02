import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Mutable session holder, shared with the mock factory (hoisted).
const h = vi.hoisted(() => ({
  session: null as null | { address: string; jwt: string },
  expired: false,
}));
vi.mock('../auth/useSession', () => ({
  useSession: () => ({ session: h.session }),
  isJwtExpired: () => h.expired,
}));

import { useCreatorMemory, type MemoryChip } from './useCreatorMemory';

function recallResponse(results: MemoryChip[]): Response {
  return { ok: true, status: 200, json: async () => ({ results }) } as unknown as Response;
}

const CHIP_A: MemoryChip = { prompt: 'a red car', modelId: '0xa', distance: 0.4 };

beforeEach(() => {
  vi.useFakeTimers();
  h.session = { address: '0x1', jwt: 'tok' };
  h.expired = false;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCreatorMemory', () => {
  it('no session → recall/remember make no fetch, chips empty', async () => {
    h.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());

    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => { await result.current.rememberCreation({ prompt: 'p', modelId: '0xm' }); });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.chips).toEqual([]);
  });

  it('expired JWT → no fetch', async () => {
    h.expired = true;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('debounces rapid recall calls — only the trailing query fetches once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([CHIP_A]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());

    act(() => {
      result.current.recallSimilar('a');
      result.current.recallSimilar('ab');
      result.current.recallSimilar('abc');
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.query).toBe('abc');
    expect(result.current.chips).toEqual([CHIP_A]);
  });

  it('recall success populates chips', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([CHIP_A]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([CHIP_A]);
  });

  it('fetch rejection → no throw, chips unchanged (stale-while-revalidate)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(recallResponse([CHIP_A])) // first recall succeeds
      .mockRejectedValueOnce(new Error('network')); // second fails
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());

    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([CHIP_A]);

    act(() => result.current.recallSimilar('truck'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([CHIP_A]); // prior chips remain
  });

  it('non-200 → chips unchanged', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(recallResponse([CHIP_A]))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.recallSimilar('truck'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([CHIP_A]);
  });

  it('empty query clears chips and makes no request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([CHIP_A]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([CHIP_A]);

    fetchMock.mockClear();
    act(() => result.current.recallSimilar('   '));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('status goes loading (immediately on a valid query) → ready when results land', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([CHIP_A]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    // loading is set synchronously, before the debounce/fetch even fires.
    expect(result.current.personalStatus).toBe('loading');
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personalStatus).toBe('ready');
  });

  it('status settles to empty when recall returns nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('zzz'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personalStatus).toBe('empty');
  });

  it('status returns to idle on an empty query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([CHIP_A]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.recallSimilar('  '));
    expect(result.current.personalStatus).toBe('idle');
  });

  it('status does not get stuck on loading when the recall errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('relayer down'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personalStatus).toBe('empty'); // no prior chips → empty, not stuck loading
  });

  it('recallCommunity fetches the global scope and populates community', async () => {
    const COMMUNITY: MemoryChip = { prompt: 'their car', modelId: '0xz', distance: 0.3, creator: '0xc2' };
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([COMMUNITY]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallCommunity('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.scope).toBe('global');
    expect(result.current.community).toEqual([COMMUNITY]);
  });

  it('personal and community recall are independent (one erroring leaves the other intact)', async () => {
    const PERSONAL: MemoryChip = { prompt: 'my car', modelId: '0xa', distance: 0.4 };
    // Route the mock by scope: personal succeeds, global rejects.
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.scope === 'global') return Promise.reject(new Error('global down'));
      return Promise.resolve(recallResponse([PERSONAL]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    act(() => {
      result.current.recallSimilar('car');
      result.current.recallCommunity('car');
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([PERSONAL]);
    expect(result.current.community).toEqual([]);
  });

  it('drops an older recall response that resolves after a newer one (seq guard)', async () => {
    function deferred<T>() {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    }
    const d1 = deferred<Response>();
    const d2 = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());

    act(() => result.current.recallSimilar('a'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); }); // fetch1 in flight (seq 1)
    act(() => result.current.recallSimilar('ab'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); }); // fetch2 in flight (seq 2)

    const A: MemoryChip = { prompt: 'old', modelId: '0x1', distance: 0.1 };
    const B: MemoryChip = { prompt: 'new', modelId: '0x2', distance: 0.2 };
    // Newer (seq 2) resolves first and wins.
    await act(async () => { d2.resolve(recallResponse([B])); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.chips).toEqual([B]);
    // Older (seq 1) resolves later and is dropped — newer result stays.
    await act(async () => { d1.resolve(recallResponse([A])); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.chips).toEqual([B]);
  });

  it('clears chips when the session changes (no cross-account leak)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([CHIP_A]));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(() => useCreatorMemory());
    act(() => result.current.recallSimilar('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.chips).toEqual([CHIP_A]);

    // A different account signs in → chips must not leak across the switch.
    h.session = { address: '0x2', jwt: 'tok2' };
    await act(async () => { rerender(); });
    expect(result.current.chips).toEqual([]);
  });

  it('rememberCreation posts prompt+modelId and never throws on failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCreatorMemory());
    await act(async () => {
      await expect(result.current.rememberCreation({ prompt: 'a truck', modelId: '0xm' })).resolves.toBeUndefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/memory/remember');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: 'a truck', modelId: '0xm' });
  });
});
