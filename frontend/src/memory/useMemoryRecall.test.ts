import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createElement, StrictMode, type ReactNode } from 'react';

// Mutable session holder, shared with the mock factory (hoisted).
const h = vi.hoisted(() => ({
  session: null as null | { address: string; jwt: string },
  expired: false,
}));
vi.mock('../auth/useSession', () => ({
  useSession: () => ({ session: h.session }),
  isJwtExpired: () => h.expired,
}));

import { useMemoryRecall } from './useMemoryRecall';
import type { RecallChip } from '@overflow2026/shared';

function recallResponse(results: RecallChip[], degraded = false): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (degraded && k === 'x-memwal-degraded' ? '1' : null) },
    json: async () => ({ results }),
  } as unknown as Response;
}

const PERSONAL: RecallChip = { prompt: 'my red car', modelId: '0xa', distance: 0.4 };
const COMMUNITY: RecallChip = { prompt: 'their car', modelId: '0xz', distance: 0.3, creator: '0xc2' };

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

describe('useMemoryRecall', () => {
  it('personal recall omits scope, sends Bearer auth, populates personal lane', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([PERSONAL]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());

    act(() => result.current.personal.recall('red car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/memory/recall');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ query: 'red car', limit: 5 });
    expect(body.scope).toBeUndefined();
    expect(result.current.personal.chips).toEqual([PERSONAL]);
    expect(result.current.personal.status).toBe('ready');
  });

  it('global recall sends scope:global and populates the global lane', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([COMMUNITY]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());

    act(() => result.current.global.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({ scope: 'global', limit: 3 });
    expect(result.current.global.chips).toEqual([COMMUNITY]);
  });

  it('caller can override per-scope limits', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall({ personalLimit: 8, globalLimit: 6 }));

    act(() => { result.current.personal.recall('car'); result.current.global.recall('car'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies.find((b) => !b.scope)!.limit).toBe(8);
    expect(bodies.find((b) => b.scope === 'global')!.limit).toBe(6);
  });

  it('no session → NEITHER scope fetches, no Authorization header ever sent', async () => {
    h.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());

    act(() => { result.current.personal.recall('car'); result.current.global.recall('car'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.personal.chips).toEqual([]);
    expect(result.current.global.chips).toEqual([]);
  });

  it('expired JWT → no fetch', async () => {
    h.expired = true;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());
    act(() => result.current.personal.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('query shorter than 3 chars → no fetch, status idle', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([PERSONAL]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());
    for (const q of ['z', 'ca']) {
      act(() => result.current.personal.recall(q));
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.personal.status).toBe('idle');
  });

  it('debounces rapid calls — only the trailing query fetches once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([PERSONAL]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());
    act(() => {
      result.current.personal.recall('a');
      result.current.personal.recall('ab');
      result.current.personal.recall('abc');
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).query).toBe('abc');
  });

  it('drops an older response that resolves after a newer one (seq guard)', async () => {
    function deferred<T>() {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    }
    const d1 = deferred<Response>();
    const d2 = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());

    act(() => result.current.personal.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.personal.recall('cars'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    const A: RecallChip = { prompt: 'old', modelId: '0x1', distance: 0.1 };
    const B: RecallChip = { prompt: 'new', modelId: '0x2', distance: 0.2 };
    await act(async () => { d2.resolve(recallResponse([B])); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.personal.chips).toEqual([B]);
    await act(async () => { d1.resolve(recallResponse([A])); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.personal.chips).toEqual([B]);
  });

  it('personal and global lanes are independent (one erroring leaves the other)', async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.scope === 'global') return Promise.reject(new Error('global down'));
      return Promise.resolve(recallResponse([PERSONAL]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());
    act(() => { result.current.personal.recall('car'); result.current.global.recall('car'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personal.chips).toEqual([PERSONAL]);
    expect(result.current.global.chips).toEqual([]);
  });

  it('non-OK response keeps prior chips (stale-while-revalidate)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(recallResponse([PERSONAL]))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());
    act(() => result.current.personal.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.personal.recall('truck'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personal.chips).toEqual([PERSONAL]);
  });

  it('degraded (200 + x-memwal-degraded) is distinct from a clean empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([], /* degraded */ true));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());
    act(() => result.current.global.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.global.degraded).toBe(true);
    expect(result.current.global.status).toBe('empty');
  });

  it('a clean response clears a prior degraded flag', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(recallResponse([], true))
      .mockResolvedValueOnce(recallResponse([PERSONAL]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useMemoryRecall());
    act(() => result.current.personal.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personal.degraded).toBe(true);
    act(() => result.current.personal.recall('truck'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personal.degraded).toBe(false);
  });

  it('account switch clears chips AND a late response under the old token does not commit', async () => {
    function deferred<T>() {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    }
    const d1 = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(d1.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(() => useMemoryRecall());

    act(() => result.current.personal.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); }); // in flight under 'tok'

    // A different account signs in mid-flight.
    h.session = { address: '0x2', jwt: 'tok2' };
    await act(async () => { rerender(); });
    expect(result.current.personal.chips).toEqual([]);

    // The old-token response resolves late → must NOT populate the new account's view.
    await act(async () => { d1.resolve(recallResponse([PERSONAL])); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.personal.chips).toEqual([]);
  });

  it('commits async recall correctly under StrictMode (cleanup-effect false-green guard)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(recallResponse([PERSONAL]));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    const { result } = renderHook(() => useMemoryRecall(), { wrapper });
    act(() => result.current.personal.recall('car'));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.personal.chips).toEqual([PERSONAL]);
  });
});
