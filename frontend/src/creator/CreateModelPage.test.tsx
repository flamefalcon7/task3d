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

// plan-013 — capture buildPublishPtb args so we can assert partLabels reach
// the PTB boundary in the right position. Pay-for-API is also mocked since
// signAndExecute is mocked and we don't need a real Transaction.
const buildPublishPtbMock = vi.hoisted(() => vi.fn());
const buildPayForApiCallPtbMock = vi.hoisted(() => vi.fn());
vi.mock('../sui/modelTxBuilders', async () => {
  const actual = await vi.importActual<typeof import('../sui/modelTxBuilders')>('../sui/modelTxBuilders');
  return {
    ...actual,
    buildPublishPtb: buildPublishPtbMock,
    buildPayForApiCallPtb: buildPayForApiCallPtbMock,
  };
});

// plan-013 — TaggingCanvas uses Babylon imperative APIs (no WebGL in jsdom).
// Mock surfaces a `pick-part-N` button per part so tests can drive selection,
// plus an `onLoaded(count)` trigger via the parts-count probe. Default part
// count is 12 (matches plan-013 U6 happy-path scenario).
const TAGGING_PART_COUNT_REF = { current: 12 };
vi.mock('../babylon/TaggingCanvas', () => {
  const React = require('react') as typeof import('react');
  return {
    TaggingCanvas: ({
      onPartSelect,
      onLoaded,
    }: {
      glbUrl: string | null;
      selectedIndex: number | null;
      onPartSelect: (i: number) => void;
      onLoaded?: (n: number) => void;
    }) => {
      const count = TAGGING_PART_COUNT_REF.current;
      React.useEffect(() => {
        onLoaded?.(count);
      }, [count, onLoaded]);
      return (
        <div data-testid="tagging-canvas-mock">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              data-testid={`pick-part-${i}`}
              onClick={() => onPartSelect(i)}
            >
              pick {i}
            </button>
          ))}
        </div>
      );
    },
  };
});

import { CreateModelPage } from './CreateModelPage';

const ADDR = '0x' + '3'.repeat(64);

beforeEach(() => {
  useCurrentAccountMock.mockReturnValue({ address: ADDR });
  clearSessionMock.mockReset();
  isJwtExpiredMock.mockReset();
  isJwtExpiredMock.mockReturnValue(false);
  useSessionMock.mockReturnValue({ session: { address: ADDR, jwt: 'jwt-token' }, clearSession: clearSessionMock });
  signAndExecuteMock.mockReset();
  uploadBlobMock.mockReset();
  signTxMock.mockReset();
  buildPublishPtbMock.mockReset();
  buildPublishPtbMock.mockReturnValue({
    tx: {},
    handles: {},
    metadata: { target: 'stub::publish', expectedEvents: [] },
  });
  buildPayForApiCallPtbMock.mockReset();
  buildPayForApiCallPtbMock.mockReturnValue({
    tx: {},
    handles: {},
    metadata: { target: 'stub::pay', expectedEvents: [] },
  });
  TAGGING_PART_COUNT_REF.current = 12;
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
    expect(screen.getByTestId('generate-button-trigger')).toBeTruthy();
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
    fireEvent.click(screen.getByTestId('generate-button-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button-confirm'));
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
    fireEvent.click(screen.getByTestId('generate-button-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button-confirm'));
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
    fireEvent.click(screen.getByTestId('generate-button-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button-confirm'));
    });
    await waitFor(() => expect(screen.getByTestId('confirm-model')).toBeTruthy());
    fireEvent.click(screen.getByTestId('confirm-model'));
    // plan-013 — Tripo path now gates the metadata form behind the tagging
    // step; click Continue to advance with all-detail defaults.
    await waitFor(() => expect(screen.getByTestId('continue-tagging')).toBeTruthy());
    fireEvent.click(screen.getByTestId('continue-tagging'));

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

  // ----- plan-013 U6 — TaggingStep + partLabels wiring ---------------------

  async function generateAndConfirmTripoModel() {
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
    fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'a sword' } });
    fireEvent.click(screen.getByTestId('generate-button-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button-confirm'));
    });
    await waitFor(() => expect(screen.getByTestId('confirm-model')).toBeTruthy());
    fireEvent.click(screen.getByTestId('confirm-model'));
    await waitFor(() => expect(screen.getByTestId('tagging-step')).toBeTruthy());
  }

  async function driveMintAndCaptureArgs() {
    uploadBlobMock.mockResolvedValue({
      blobId: 'walrus_blob_id_xyz',
      blobObjectId: '0x' + 'a'.repeat(64),
    });
    signAndExecuteMock.mockResolvedValue({ digest: 'PUBDIGEST456' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Tagged Model' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());
    return buildPublishPtbMock.mock.calls[0]![0] as { partLabels: string[]; tags: string[] };
  }

  it('TaggingStep renders after confirming a Tripo model', async () => {
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    expect(screen.getByTestId('tagging-step')).toBeTruthy();
    // The dedicated metadata form (not the prompt) must NOT be visible until Continue.
    expect(screen.queryByTestId('metadata-form')).toBeNull();
  });

  it('Continue without labeling → partLabels is N entries all DEFAULT_LABEL (covers AE1, R6)', async () => {
    TAGGING_PART_COUNT_REF.current = 12;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toHaveLength(12);
    expect(args.partLabels.every((l) => l === 'detail')).toBe(true);
  });

  it('labeling 4 parts with the four presets → partLabels reflects positional choices, rest default', async () => {
    TAGGING_PART_COUNT_REF.current = 12;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const seq: Array<['primary' | 'secondary' | 'accent' | 'detail', number]> = [
      ['primary', 0],
      ['secondary', 1],
      ['accent', 2],
      ['detail', 3],
    ];
    for (const [preset, partIndex] of seq) {
      fireEvent.click(screen.getByTestId(`pick-part-${partIndex}`));
      fireEvent.click(screen.getByTestId(`preset-${preset}`));
    }
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels.slice(0, 4)).toEqual(['primary', 'secondary', 'accent', 'detail']);
    expect(args.partLabels.slice(4)).toEqual(Array(8).fill('detail'));
  });

  it('free-text custom label "fur" entered for part 3 → partLabels[3] === "fur"', async () => {
    TAGGING_PART_COUNT_REF.current = 12;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    fireEvent.click(screen.getByTestId('pick-part-3'));
    fireEvent.change(screen.getByTestId('custom-label-input'), { target: { value: 'fur' } });
    fireEvent.keyDown(screen.getByTestId('custom-label-input'), { key: 'Enter' });
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels[3]).toBe('fur');
    expect(args.partLabels[0]).toBe('detail');
  });

  it('upload mode skips the tagging step entirely → partLabels = []', async () => {
    render(<CreateModelPage />);
    fireEvent.click(screen.getByLabelText('Upload my own .glb'));
    const glbBytes = new Uint8Array(16);
    glbBytes.set([0x67, 0x6c, 0x54, 0x46]); // 'glTF' magic
    const file = new File([glbBytes as BlobPart], 'sword.glb', { type: 'model/gltf-binary' });
    // jsdom's File polyfill omits `arrayBuffer`; stub it from the underlying bytes.
    (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
      glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength);
    await act(async () => {
      fireEvent.change(screen.getByTestId('glb-file-input'), { target: { files: [file] } });
    });
    // Metadata form is visible immediately on upload — no tagging gate.
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    expect(screen.queryByTestId('tagging-step')).toBeNull();
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual([]);
  });

  it('F8 — skip-tagging button is wired to the same emit handler as Continue (default unlabeled to detail)', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    // Label 2 of 5 parts, then click Skip — emit should still produce N=5
    // entries with the labeled positions reflected and the rest defaulted.
    fireEvent.click(screen.getByTestId('pick-part-1'));
    fireEvent.click(screen.getByTestId('preset-accent'));
    fireEvent.click(screen.getByTestId('pick-part-4'));
    fireEvent.click(screen.getByTestId('preset-primary'));
    fireEvent.click(screen.getByTestId('skip-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual(['detail', 'accent', 'detail', 'detail', 'primary']);
  });

  it('F8 — Continue is disabled while TaggingCanvas has not reported a part count yet', async () => {
    // Use 0 as the canvas part count to simulate an in-flight load (the real
    // component's onLoaded is gated on a successful LoadAssetContainerAsync;
    // pre-load the parent's partCount is 0). The disabled gate prevents the
    // silent-empty-partLabels publish flagged by races-L2.
    TAGGING_PART_COUNT_REF.current = 0;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const continueBtn = screen.getByTestId('continue-tagging') as HTMLButtonElement;
    const skipBtn = screen.getByTestId('skip-tagging') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    expect(skipBtn.disabled).toBe(true);
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/LOADING PARTS/);
  });

  it('regenerating after tagging resets partLabels and re-renders TaggingStep', async () => {
    TAGGING_PART_COUNT_REF.current = 12;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    fireEvent.click(screen.getByTestId('pick-part-0'));
    fireEvent.click(screen.getByTestId('preset-primary'));
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Trigger a regenerate by calling generate again (button label is GENERATE
    // AGAIN once we have a model). The same mocked fetch returns a fresh GLB
    // payload, which routes through setGlbBytes → resets confirmed + tagged.
    fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'a chest' } });
    fireEvent.click(screen.getByTestId('generate-button-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button-confirm'));
    });
    await waitFor(() => expect(screen.getByTestId('confirm-model')).toBeTruthy());
    expect(screen.queryByTestId('tagging-step')).toBeNull();
    expect(screen.queryByTestId('metadata-form')).toBeNull();
    // After reconfirming, TaggingStep returns with a clean labels map.
    fireEvent.click(screen.getByTestId('confirm-model'));
    await waitFor(() => expect(screen.getByTestId('tagging-step')).toBeTruthy());
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/0 OF 12/);
  });
});
