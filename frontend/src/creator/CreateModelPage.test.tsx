import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const useCurrentAccountMock = vi.fn();
const signAndExecuteMock = vi.fn();
const signTxMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignTransaction: () => ({ mutateAsync: signTxMock }),
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
}));

const useSessionMock = vi.fn();
const clearSessionMock = vi.fn();
const isJwtExpiredMock = vi.fn((_jwt?: string) => false);
vi.mock('../auth/useSession', () => ({
  useSession: () => useSessionMock(),
  isJwtExpired: (jwt: string) => isJwtExpiredMock(jwt),
}));

const uploadBlobMock = vi.fn();
vi.mock('../walrus/useWalrusUpload', () => ({
  useWalrusUpload: () => ({ uploadBlob: uploadBlobMock, stage: 'idle', status: 'idle', error: null }),
}));

vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-mock">{glbUrl ?? 'no url'}</div>
  ),
}));

import { CreateModelPage } from './CreateModelPage';

const ADDR = '0x' + '3'.repeat(64);

beforeEach(() => {
  useCurrentAccountMock.mockReturnValue({ address: ADDR });
  clearSessionMock.mockReset();
  isJwtExpiredMock.mockReset();
  isJwtExpiredMock.mockReturnValue(false);
  useSessionMock.mockReturnValue({ session: { address: ADDR, jwt: 'jwt-token' }, clearSession: clearSessionMock });
  signAndExecuteMock.mockReset();
  vi.unstubAllGlobals();
  // jsdom lacks createObjectURL.
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => cleanup());

describe('CreateModelPage', () => {
  it('gates on sign-in when there is no session', () => {
    useSessionMock.mockReturnValue({ session: null });
    render(<CreateModelPage />);
    expect(screen.getByTestId('create-page')).toBeTruthy();
    expect(screen.queryByTestId('prompt-input')).toBeNull();
  });

  it('shows the Tripo prompt input by default when signed in', () => {
    render(<CreateModelPage />);
    expect(screen.getByTestId('prompt-input')).toBeTruthy();
    expect(screen.getByTestId('generate-button')).toBeTruthy();
  });

  it('switches to the GLB upload input', () => {
    render(<CreateModelPage />);
    fireEvent.click(screen.getByLabelText('Upload my own .glb'));
    expect(screen.getByTestId('glb-file-input')).toBeTruthy();
  });

  it('pays then generates, showing a preview + confirm step (Tripo path)', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'PAYDIGEST123' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ glbBytes: 'Z2xURg==', lineageJson: '{}', lineageStub: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    render(<CreateModelPage />);
    fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'a sword' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button'));
    });

    await waitFor(() => expect(screen.getByTestId('preview-canvas-mock')).toBeTruthy());
    // The pay tx was signed, and /api/generate was called with the digest.
    expect(signAndExecuteMock).toHaveBeenCalledTimes(1);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const firstCall = fetchMock.mock.calls[0]!;
    const body = JSON.parse((firstCall[1] as RequestInit).body as string);
    expect(body).toMatchObject({ prompt: 'a sword', paymentDigest: 'PAYDIGEST123' });
    expect(screen.getByTestId('confirm-model')).toBeTruthy();
  });

  it('does NOT pay when the session is expired — clears it and prompts re-sign-in', async () => {
    isJwtExpiredMock.mockReturnValue(true);
    signAndExecuteMock.mockResolvedValue({ digest: 'SHOULD_NOT_BE_CALLED' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<CreateModelPage />);
    fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'a sword' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button'));
    });

    // Critical: no SUI charged, no backend call — bailed before payment.
    expect(signAndExecuteMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clearSessionMock).toHaveBeenCalledOnce();
    expect(screen.getByTestId('gen-error').textContent).toMatch(/session expired/i);
  });

  it('offers only Open/Restricted policy options (no allow-list), defaulting to Open (D-040)', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'PAYDIGEST123' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ glbBytes: 'Z2xURg==', lineageJson: '{}', lineageStub: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    render(<CreateModelPage />);
    fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'a sword' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button'));
    });
    await waitFor(() => expect(screen.getByTestId('confirm-model')).toBeTruthy());
    fireEvent.click(screen.getByTestId('confirm-model'));

    // Open (2) and Restricted (0) are offered; allow-list (1) is gone.
    const open = screen.getByTestId('policy-2') as HTMLInputElement;
    const restricted = screen.getByTestId('policy-0') as HTMLInputElement;
    expect(screen.queryByTestId('policy-1')).toBeNull();

    // Default is Open (permissionless).
    expect(open.checked).toBe(true);
    expect(restricted.checked).toBe(false);

    // Selecting Restricted updates the choice.
    fireEvent.click(restricted);
    expect(restricted.checked).toBe(true);
    expect(open.checked).toBe(false);
  });
});
