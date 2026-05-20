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
vi.mock('../auth/useSession', () => ({ useSession: () => useSessionMock() }));

const uploadFilesMock = vi.fn();
vi.mock('../walrus/useWalrusUpload', () => ({
  useWalrusUpload: () => ({ uploadFiles: uploadFilesMock, stage: 'idle', status: 'idle', error: null }),
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
  useSessionMock.mockReturnValue({ session: { address: ADDR, jwt: 'jwt-token' } });
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
});
