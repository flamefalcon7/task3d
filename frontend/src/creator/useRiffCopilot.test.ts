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

import { useRiffCopilot } from './useRiffCopilot';

function turnResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

// vi.fn() infers an empty-tuple call signature, so reach the RequestInit via cast.
function requestBody(mock: { mock: { calls: unknown[] } }, callIndex: number): unknown {
  const call = mock.mock.calls[callIndex] as [unknown, RequestInit];
  return JSON.parse(call[1].body as string);
}

beforeEach(() => {
  h.session = { address: '0x1', jwt: 'tok' };
  h.expired = false;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useRiffCopilot', () => {
  it('no session → sendAnswer makes no fetch and marks unavailable', async () => {
    h.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.available).toBe(false));
  });

  it('first answer → question; appends user + assistant turns', async () => {
    const fetchMock = vi.fn(async () =>
      turnResponse({ available: true, result: { kind: 'question', text: 'What color?' }, turnIndex: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());

    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('asking'));

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'a car' },
      { role: 'assistant', content: 'What color?' },
    ]);
    // request carried the user message and force=false
    expect(requestBody(fetchMock, 0)).toEqual({
      messages: [{ role: 'user', content: 'a car' }],
      forceSynthesize: false,
    });
  });

  it('synthesis result surfaces synthesizedPrompt and ends the conversation (AE5 supply side)', async () => {
    const fetchMock = vi.fn(async () =>
      turnResponse({ available: true, result: { kind: 'prompt', text: 'low-poly red car' }, turnIndex: 2 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());

    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.synthesizedPrompt).toBe('low-poly red car');

    // further sends are ignored once finished
    act(() => result.current.sendAnswer('more'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('generateNow forces synthesis from current messages (AE1)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(turnResponse({ available: true, result: { kind: 'question', text: 'Q?' }, turnIndex: 0 }))
      .mockResolvedValueOnce(turnResponse({ available: true, result: { kind: 'prompt', text: 'P' }, turnIndex: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());

    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('asking'));
    act(() => result.current.generateNow());
    await waitFor(() => expect(result.current.status).toBe('done'));

    const lastBody = requestBody(fetchMock, 1) as { forceSynthesize: boolean };
    expect(lastBody.forceSynthesize).toBe(true);
    expect(result.current.synthesizedPrompt).toBe('P');
  });

  it('explicit available:false response → hides the feature (available=false) (AE7)', async () => {
    const fetchMock = vi.fn(async () => turnResponse({ available: false }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.synthesizedPrompt).toBeNull();
  });

  it('fetch rejection → TRANSIENT error, feature stays available (no permanent hide)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.available).toBe(true); // NOT hidden — user can retry
  });

  it('transient backend failure (available:true, no result) → error status, retry re-fires the same turn', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(turnResponse({ available: true, error: 'unavailable', retryable: true }))
      .mockResolvedValueOnce(turnResponse({ available: true, result: { kind: 'question', text: 'Q?' }, turnIndex: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a plane'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.available).toBe(true);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('asking'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 (rate limit) → transient error, not a permanent hide', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.available).toBe(true);
  });

  it('reset clears the conversation', async () => {
    const fetchMock = vi.fn(async () =>
      turnResponse({ available: true, result: { kind: 'question', text: 'Q?' }, turnIndex: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('asking'));
    act(() => result.current.reset());
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  it('clears conversation when the auth token changes (no cross-account leak)', async () => {
    const fetchMock = vi.fn(async () =>
      turnResponse({ available: true, result: { kind: 'question', text: 'Q?' }, turnIndex: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.messages.length).toBe(2));

    h.session = { address: '0x2', jwt: 'tok2' };
    rerender();
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  // ----- U7: visible quota state + auto-recovery (R6/R7/R10) -----

  it('AE4: quota_exhausted → status "quota", available stays true (NOT hidden), retryAfterMs carried', async () => {
    const fetchMock = vi.fn(async () => turnResponse({ available: true, error: 'quota_exhausted', retryAfterMs: 90_000 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('quota'));
    expect(result.current.available).toBe(true); // visible (R10)
    expect(result.current.retryAfterMs).toBe(90_000);
  });

  it('AE5/R7: auto-recovers to idle once the cooldown elapses — no manual step', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(async () => turnResponse({ available: true, error: 'quota_exhausted', retryAfterMs: 5_000 }));
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(() => useRiffCopilot());
      act(() => result.current.sendAnswer('a car'));
      await vi.waitFor(() => expect(result.current.status).toBe('quota'));
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(result.current.status).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('quota is distinct from a generic transient error', async () => {
    const fetchMock = vi.fn(async () => turnResponse({ available: true, error: 'unavailable', retryable: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.status).toBe('error')); // not 'quota'
    expect(result.current.available).toBe(true);
  });
});
