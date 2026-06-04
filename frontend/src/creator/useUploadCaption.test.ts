import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  session: null as null | { address: string; jwt: string },
  expired: false,
}));
vi.mock('../auth/useSession', () => ({
  useSession: () => ({ session: h.session }),
  isJwtExpired: () => h.expired,
}));

import { useUploadCaption } from './useUploadCaption';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}
function requestBody(mock: { mock: { calls: unknown[] } }, callIndex: number): unknown {
  const call = mock.mock.calls[callIndex] as [unknown, RequestInit];
  return JSON.parse(call[1].body as string);
}
const frames = (n: number): Uint8Array[] => Array.from({ length: n }, (_, i) => new Uint8Array([i, i + 1, i + 2]));

beforeEach(() => {
  h.session = { address: '0x1', jwt: 'tok' };
  h.expired = false;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useUploadCaption', () => {
  it('no session → describe makes no fetch and marks unavailable (AE6)', async () => {
    h.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());
    let out: string | null = 'x';
    await act(async () => {
      out = await result.current.describe(frames(4));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toBeNull();
    await waitFor(() => expect(result.current.available).toBe(false));
  });

  it('happy path → posts base64 webp frames and resolves the caption (AE1)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ available: true, caption: 'low-poly red truck' }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());

    let out: string | null = null;
    await act(async () => {
      out = await result.current.describe(frames(4));
    });
    expect(out).toBe('low-poly red truck');
    await waitFor(() => expect(result.current.status).toBe('done'));

    const body = requestBody(fetchMock, 0) as { frames: { base64: string; mediaType: string }[] };
    expect(body.frames).toHaveLength(4);
    expect(body.frames.every((f) => f.mediaType === 'image/webp')).toBe(true);
    expect(body.frames.every((f) => typeof f.base64 === 'string' && f.base64.length > 0)).toBe(true);
    // posted to the caption endpoint with a bearer token
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/caption');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('available:false response → status "unavailable" (visible, never hidden — D-084)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ available: false }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());
    let out: string | null = 'x';
    await act(async () => {
      out = await result.current.describe(frames(4));
    });
    expect(out).toBeNull();
    // `available` stays informational (configured:false), but the feature is NOT
    // hidden — the page renders it disabled via status 'unavailable'.
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.available).toBe(false);
  });

  it('transient failure keeps available, sets error, and retry() re-posts (AE6)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ available: true, error: 'unavailable', retryable: true }))
      .mockResolvedValueOnce(jsonResponse({ available: true, caption: 'low-poly chair' }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());

    await act(async () => {
      await result.current.describe(frames(3));
    });
    expect(result.current.status).toBe('error');
    expect(result.current.available).toBe(true); // NOT hidden

    let out: string | null = null;
    await act(async () => {
      out = await result.current.retry();
    });
    expect(out).toBe('low-poly chair');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('network !ok → transient error, available stays true', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 500));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());
    await act(async () => {
      await result.current.describe(frames(4));
    });
    expect(result.current.status).toBe('error');
    expect(result.current.available).toBe(true);
  });

  it('latest-wins: a slow earlier describe never overwrites a newer result', async () => {
    let resolveFirst!: (r: Response) => void;
    const first = new Promise<Response>((r) => {
      resolveFirst = r;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(first) // first call: pending
      .mockResolvedValueOnce(jsonResponse({ available: true, caption: 'NEWER' }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());

    let firstOut: string | null = 'unset';
    let secondOut: string | null = 'unset';
    await act(async () => {
      const p1 = result.current.describe(frames(3)); // in flight (pending)
      const p2 = result.current.describe(frames(2)); // newer, supersedes p1
      secondOut = await p2;
      resolveFirst(jsonResponse({ available: true, caption: 'STALE' }));
      firstOut = await p1;
    });
    expect(secondOut).toBe('NEWER');
    expect(firstOut).toBeNull(); // stale response dropped by the seq guard
    expect(result.current.status).toBe('done');
  });

  it('empty frames → error, no fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());
    let out: string | null = 'x';
    await act(async () => {
      out = await result.current.describe([]);
    });
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
  });

  // ----- U7: visible quota state + auto-recovery (R6/R7/R10) -----

  it('AE4: quota_exhausted → status "quota", available stays true (NOT hidden), retryAfterMs carried', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ available: true, error: 'quota_exhausted', retryAfterMs: 90_000 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());
    await act(async () => {
      await result.current.describe(frames(3));
    });
    expect(result.current.status).toBe('quota');
    expect(result.current.available).toBe(true); // visible (R10)
    expect(result.current.retryAfterMs).toBe(90_000);
  });

  it('AE5/R7: auto-recovers to idle once the cooldown elapses — no manual step', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ available: true, error: 'quota_exhausted', retryAfterMs: 5_000 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useUploadCaption());
      await act(async () => {
        await result.current.describe(frames(3));
      });
      expect(result.current.status).toBe('quota');
      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });
      expect(result.current.status).toBe('idle'); // recovered, no retry() called
    } finally {
      vi.useRealTimers();
    }
  });

  it('quota is distinct from a generic transient error', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ available: true, error: 'unavailable', retryable: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUploadCaption());
    await act(async () => {
      await result.current.describe(frames(3));
    });
    expect(result.current.status).toBe('error'); // not 'quota'
  });
});
