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
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ messages: [{ role: 'user', content: 'a car' }], forceSynthesize: false });
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

    const lastBody = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(lastBody.forceSynthesize).toBe(true);
    expect(result.current.synthesizedPrompt).toBe('P');
  });

  it('available:false response → fail-soft (available=false, no throw) (AE7)', async () => {
    const fetchMock = vi.fn(async () => turnResponse({ available: false }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.synthesizedPrompt).toBeNull();
  });

  it('fetch rejection → fail-soft (available=false)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRiffCopilot());
    act(() => result.current.sendAnswer('a car'));
    await waitFor(() => expect(result.current.available).toBe(false));
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
});
