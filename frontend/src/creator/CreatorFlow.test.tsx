import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

// Mock dapp-kit hooks (no real wallet).
const useCurrentAccountMock = vi.fn();
const signTxMock = vi.fn();
const signAndExecuteMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignTransaction: () => ({ mutateAsync: signTxMock }),
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
}));

// Mock useSession.
const useSessionMock = vi.fn();
vi.mock('../auth/useSession', () => ({
  useSession: () => useSessionMock(),
}));

// Mock useWalrusUpload.
const uploadFilesMock = vi.fn();
vi.mock('../walrus/useWalrusUpload', () => ({
  useWalrusUpload: () => ({
    uploadFiles: uploadFilesMock,
    popupCount: 2,
    status: 'idle',
    error: null,
  }),
}));

// Mock Babylon PreviewCanvas — it needs a real GL context otherwise.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-mock">{glbUrl ?? 'no url'}</div>
  ),
}));

// ShapePicker fetches /api/shapes; for these tests we keep prompt mode mostly.
import { CreatorFlow } from './CreatorFlow';

function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function makeGenerateResponse(tags: string[] = ['fantasy', 'chest']) {
  // matches GenerateResponse on the wire (base64 GLB + JSON lineage)
  return {
    glbBytes: 'Z2xURg==', // 'glTF' base64
    lineageJson: '{}',
    lineageStub: { shape: 'box', llmDecision: { tags } },
  };
}

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  signTxMock.mockReset();
  signAndExecuteMock.mockReset();
  useSessionMock.mockReset();
  uploadFilesMock.mockReset();

  useCurrentAccountMock.mockReturnValue(null);
  useSessionMock.mockReturnValue({
    session: null,
    signIn: vi.fn(),
    disconnect: vi.fn(),
    address: null,
  });

  // jsdom doesn't implement Blob URL revocation.
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CreatorFlow', () => {
  it('renders prompt mode by default and mode toggle works', async () => {
    // Stub fetch so ShapePicker mount doesn't trigger an unhandled rejection.
    mockFetch(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );
    render(<CreatorFlow />);
    expect(screen.getByTestId('prompt-input')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('mode-slider'));
    });
    expect(screen.queryByTestId('prompt-input')).toBeNull();
  });

  it('generate happy path: preview renders, name auto-suggested from tags', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify(makeGenerateResponse(['fantasy', 'chest'])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<CreatorFlow />);
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a chest' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('preview-canvas-mock')).toBeTruthy();
    });
    // Name auto-suggested from tags
    expect(
      (screen.getByTestId('name-input') as HTMLInputElement).value,
    ).toBe('Fantasy Chest');
  });

  it('mint button is disabled when no session, even with preview rendered', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify(makeGenerateResponse()), { status: 200 }),
    );
    render(<CreatorFlow />);
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a chest' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('preview-canvas-mock')).toBeTruthy(),
    );

    expect(screen.getByTestId('signin-hint')).toBeTruthy();
    expect(
      (screen.getByTestId('mint-button') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('mint button enabled when session + glb + name present', async () => {
    useSessionMock.mockReturnValue({
      session: { address: '0xCAFE', jwt: 'jwt' },
      signIn: vi.fn(),
      disconnect: vi.fn(),
      address: '0xCAFE',
    });
    useCurrentAccountMock.mockReturnValue({ address: '0xCAFE' });

    mockFetch(async () =>
      new Response(JSON.stringify(makeGenerateResponse()), { status: 200 }),
    );
    render(<CreatorFlow />);
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a chest' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('preview-canvas-mock')).toBeTruthy(),
    );

    // Name auto-fills from tags so it's already non-empty → mint enabled.
    expect(
      (screen.getByTestId('mint-button') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('surfaces tripo_disabled inline as a friendly hint', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ error: 'tripo_disabled' }), {
        status: 400,
      }),
    );

    render(<CreatorFlow />);
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a dragon' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button'));
    });

    await waitFor(() => {
      const err = screen.getByTestId('generate-error');
      expect(err.textContent).toMatch(/creator-only generator/);
    });
  });
});
