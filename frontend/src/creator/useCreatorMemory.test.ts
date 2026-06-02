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
