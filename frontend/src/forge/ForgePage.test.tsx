// U4 — ForgePage integration tests. Mocks dapp-kit, useSession, useWalrusUpload,
// Babylon PreviewCanvas (no real GL), and fetch. Mirrors CreatorFlow.test.tsx
// patterns.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks (must be hoisted before component import) ---
const useCurrentAccountMock = vi.fn();
const signTxMock = vi.fn();
const signAndExecuteMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignTransaction: () => ({ mutateAsync: signTxMock }),
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
}));

const useSessionMock = vi.fn();
vi.mock('../auth/useSession', () => ({
  useSession: () => useSessionMock(),
}));

const uploadFilesMock = vi.fn();
const uploadStageRef = { current: 'idle' as string };
vi.mock('../walrus/useWalrusUpload', () => ({
  useWalrusUpload: () => ({
    uploadFiles: uploadFilesMock,
    popupCount: 2,
    status: 'idle',
    stage: uploadStageRef.current,
    error: null,
  }),
}));

// Babylon needs a real GL context — stub the canvas wrapper.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-mock">{glbUrl ?? 'no url'}</div>
  ),
}));

import { ForgePage } from './ForgePage';

function renderForge() {
  return render(
    <MemoryRouter>
      <ForgePage />
    </MemoryRouter>,
  );
}

function mockFetch(impl: (input: RequestInfo | URL) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

// matches GenerateResponse on the wire
function makeGenerateResponse(tags: string[] = ['neon', 'car']) {
  return {
    glbBytes: 'Z2xURg==', // 'glTF' base64
    lineageJson: '{}',
    lineageStub: { shape: 'tripo', llmDecision: { tags } },
  };
}

function makeCollectionBuildResponse(n: number) {
  return {
    variants: Array.from({ length: n }, () => ({ glbBase64: 'Z2xURg==' })),
  };
}

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  signTxMock.mockReset();
  signAndExecuteMock.mockReset();
  useSessionMock.mockReset();
  uploadFilesMock.mockReset();
  uploadStageRef.current = 'idle';

  useCurrentAccountMock.mockReturnValue(null);
  useSessionMock.mockReturnValue({
    session: null,
    signIn: vi.fn(),
    disconnect: vi.fn(),
    address: null,
  });

  // jsdom lacks Blob URL helpers
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

describe('ForgePage', () => {
  it('renders_prompt_input_initially', () => {
    renderForge();
    expect(screen.getByTestId('forge-prompt-stage')).toBeTruthy();
    expect(screen.getByTestId('prompt-input')).toBeTruthy();
    // Variant editor not yet visible
    expect(screen.queryByTestId('variant-editor')).toBeNull();
  });

  it('shows_variant_editor_after_base_glb_resolves', async () => {
    // Session required — backend /api/generate prompt mode is JWT-gated,
    // and ForgePage now gates the Generate button on session too.
    useSessionMock.mockReturnValue({
      session: { address: '0xCAFE', jwt: 'jwt' },
      signIn: vi.fn(),
      disconnect: vi.fn(),
      address: '0xCAFE',
    });
    mockFetch(async (input) => {
      if (String(input).includes('/api/generate')) {
        return new Response(JSON.stringify(makeGenerateResponse()), {
          status: 200,
        });
      }
      return new Response('', { status: 404 });
    });

    renderForge();
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a neon car' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('forge-generate-base'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('forge-editor-stage')).toBeTruthy();
      expect(screen.getByTestId('variant-editor')).toBeTruthy();
    });
  });

  it('no_session_blocks_generate_and_shows_signin_hint', () => {
    // Default useSessionMock returns session=null (per beforeEach). The
    // Generate button must be disabled and the inline sign-in hint must
    // be visible — otherwise the user clicks and silently 401s against
    // /api/generate prompt mode.
    renderForge();
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a car' },
    });
    const btn = screen.getByTestId('forge-generate-base') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/sign in/i);
    expect(screen.getByTestId('forge-prompt-signin-hint')).toBeTruthy();
  });

  it('mint_button_label_says_sign_3_transactions_for_collection_mode', async () => {
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
    renderForge();
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a car' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('forge-generate-base'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('forge-editor-stage')).toBeTruthy(),
    );

    const btn = screen.getByTestId('forge-mint-button');
    // popup count is 3 regardless of N — copy says "(1 variants)" for default
    // 1-row state. We assert the "3 transactions" + "variants" tokens are
    // present so the copy is correct even if the numeric formatting tweaks.
    expect(btn.textContent).toMatch(/3 transactions/);
    expect(btn.textContent).toMatch(/variants?\)/);
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('mint_success_navigates_to_collection_detail_link', async () => {
    useSessionMock.mockReturnValue({
      session: { address: '0xCAFE', jwt: 'jwt' },
      signIn: vi.fn(),
      disconnect: vi.fn(),
      address: '0xCAFE',
    });
    useCurrentAccountMock.mockReturnValue({ address: '0xCAFE' });

    uploadFilesMock.mockResolvedValue({
      blobIds: ['BLOB_ID'],
      blobObjects: [{ blobId: 'BLOB_ID', blobObjectId: '0xBLOBOBJ' }],
      patchIds: ['patch-0'],
    });
    signAndExecuteMock.mockResolvedValue({ digest: '0xDIGEST' });

    mockFetch(async (input) => {
      const url = String(input);
      if (url.includes('/api/generate')) {
        return new Response(JSON.stringify(makeGenerateResponse()), {
          status: 200,
        });
      }
      if (url.includes('/api/collection/build')) {
        return new Response(JSON.stringify(makeCollectionBuildResponse(1)), {
          status: 200,
        });
      }
      return new Response('', { status: 404 });
    });

    renderForge();
    fireEvent.change(screen.getByTestId('prompt-input'), {
      target: { value: 'a car' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('forge-generate-base'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('forge-editor-stage')).toBeTruthy(),
    );
    // Default collection name 'Neon Drift Series' → slug 'neon-drift-series'
    await act(async () => {
      fireEvent.click(screen.getByTestId('forge-mint-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('forge-success')).toBeTruthy();
    });
    const link = screen.getByTestId(
      'forge-collection-link',
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/collection/neon-drift-series');
  });
});
