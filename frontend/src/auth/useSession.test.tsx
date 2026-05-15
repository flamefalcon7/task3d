import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSession } from './useSession';

const ADDRESS = `0x${'a'.repeat(64)}`;

const mockSignPersonalMessage = vi.fn();
const mockDisconnect = vi.fn();
let mockAccount: { address: string } | null = { address: ADDRESS };

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mockAccount,
  useSignPersonalMessage: () => ({ mutateAsync: mockSignPersonalMessage }),
  useDisconnectWallet: () => ({ mutate: mockDisconnect }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  mockSignPersonalMessage.mockReset();
  mockDisconnect.mockReset();
  fetchMock.mockReset();
  mockAccount = { address: ADDRESS };
  vi.stubGlobal('fetch', fetchMock);
});

function mockChallengeThenVerify(nonce: string, jwt: string) {
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nonce }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ jwt }),
    } as Response);
}

describe('useSession', () => {
  it('returns null session by default', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.session).toBeNull();
    expect(result.current.address).toBe(ADDRESS);
  });

  it('happy path: signIn → challenge + verify → JWT stored in localStorage', async () => {
    mockChallengeThenVerify('nonce-abc', 'jwt-xyz');
    mockSignPersonalMessage.mockResolvedValue({ signature: 'AHN0dWI=' });

    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.session).toEqual({ address: ADDRESS, jwt: 'jwt-xyz' });
    expect(localStorage.getItem('overflow2026.session')).toBe(
      JSON.stringify({ address: ADDRESS, jwt: 'jwt-xyz' }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/auth/challenge',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/verify',
      expect.objectContaining({ method: 'POST' }),
    );

    // Verify the signed message contains the nonce.
    const [callArgs] = mockSignPersonalMessage.mock.calls[0] ?? [];
    expect(callArgs).toBeDefined();
    const decoded = new TextDecoder().decode(callArgs!.message);
    expect(decoded).toContain('nonce-abc');
  });

  it('signIn throws when no wallet is connected', async () => {
    mockAccount = null;
    const { result } = renderHook(() => useSession());
    await expect(result.current.signIn()).rejects.toThrow(/connect a wallet/i);
  });

  it('signIn throws on challenge failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const { result } = renderHook(() => useSession());
    await expect(result.current.signIn()).rejects.toThrow(/challenge failed/);
  });

  it('signIn throws on verify failure', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ nonce: 'n' }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    mockSignPersonalMessage.mockResolvedValue({ signature: 's' });
    const { result } = renderHook(() => useSession());
    await expect(result.current.signIn()).rejects.toThrow(/verify failed/);
  });

  it('disconnect clears session + invokes wallet disconnect', async () => {
    localStorage.setItem(
      'overflow2026.session',
      JSON.stringify({ address: ADDRESS, jwt: 'old-jwt' }),
    );
    const { result } = renderHook(() => useSession());
    expect(result.current.session).toEqual({ address: ADDRESS, jwt: 'old-jwt' });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.session).toBeNull();
    expect(localStorage.getItem('overflow2026.session')).toBeNull();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('clears cached session when connected wallet address changes', async () => {
    localStorage.setItem(
      'overflow2026.session',
      JSON.stringify({ address: ADDRESS, jwt: 'old-jwt' }),
    );
    mockAccount = { address: `0x${'b'.repeat(64)}` };
    const { result } = renderHook(() => useSession());
    await waitFor(() => {
      expect(result.current.session).toBeNull();
    });
    expect(localStorage.getItem('overflow2026.session')).toBeNull();
  });
});
