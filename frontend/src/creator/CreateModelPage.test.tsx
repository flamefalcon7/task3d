import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const useCurrentAccountMock = vi.fn();
const signAndExecuteMock = vi.fn();
const signTxMock = vi.fn();
const waitForTransactionMock = vi.fn(async () => ({})); // resolve immediately by default
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignTransaction: () => ({ mutateAsync: signTxMock }),
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
  useSuiClient: () => ({ waitForTransaction: waitForTransactionMock }),
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

// plan-026 U4 — PreviewCanvas is now ref-driven (captureStills). The mock
// forwards a ref exposing a stubbed captureStills so the ALLOW_LIST preview path
// can be driven without Babylon/WebGL.
const captureStillsMock = vi.hoisted(() => vi.fn(async (): Promise<Uint8Array[]> => []));
vi.mock('../babylon/PreviewCanvas', () => {
  const React = require('react') as typeof import('react');
  return {
    PreviewCanvas: React.forwardRef(
      ({ glbUrl }: { glbUrl: string | null }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(
          ref,
          () => ({ dispose: () => {}, remount: () => {}, captureStills: captureStillsMock }),
          [],
        );
        return <div data-testid="preview-canvas-mock">{glbUrl ?? 'no url'}</div>;
      },
    ),
  };
});

// plan-013 — capture buildPublishPtb args so we can assert partLabels reach
// the PTB boundary in the right position. Pay-for-API is also mocked since
// signAndExecute is mocked and we don't need a real Transaction.
const buildPublishPtbMock = vi.hoisted(() => vi.fn());
const buildPublishEncryptedPtbMock = vi.hoisted(() => vi.fn());
const buildPayForApiCallPtbMock = vi.hoisted(() => vi.fn());
vi.mock('../sui/modelTxBuilders', async () => {
  const actual = await vi.importActual<typeof import('../sui/modelTxBuilders')>('../sui/modelTxBuilders');
  return {
    ...actual,
    buildPublishPtb: buildPublishPtbMock,
    buildPublishEncryptedPtb: buildPublishEncryptedPtbMock,
    buildPayForApiCallPtb: buildPayForApiCallPtbMock,
  };
});

// plan-026 U3 — Seal envelope is network-dependent (key servers); mock it so the
// encrypted publish path is driven without hitting Seal. encryptBase returns a
// deterministic ciphertext so we can assert the CIPHERTEXT (not the plaintext)
// reaches uploadBlob.
const encryptBaseMock = vi.hoisted(() => vi.fn());
vi.mock('../seal/sealClient', () => ({ getSealClient: () => ({}) }));
vi.mock('../seal/envelope', () => ({ encryptBase: encryptBaseMock }));

// plan-013 / plan-015 U5 — TaggingCanvas uses Babylon imperative APIs (no
// WebGL in jsdom). Mock surfaces:
//   • `pick-part-N` buttons per part — drives onPartSelect
//   • `onLoaded(count)` fires via the parts-count probe
//   • `tagging-mode-toggle-pill` stub when modeToggle + onModeCycle —
//     drives the parent-owned mode cycle from the integration tests
const TAGGING_PART_COUNT_REF = { current: 12 };
vi.mock('../babylon/TaggingCanvas', () => {
  const React = require('react') as typeof import('react');
  return {
    TaggingCanvas: ({
      onPartSelect,
      onLoaded,
      mode,
      onModeCycle,
      modeToggle,
    }: {
      glbUrl: string | null;
      selectedIndex: number | null;
      onPartSelect: (i: number) => void;
      onLoaded?: (n: number) => void;
      mode?: string;
      onModeCycle?: () => void;
      modeToggle?: boolean;
    }) => {
      const count = TAGGING_PART_COUNT_REF.current;
      React.useEffect(() => {
        onLoaded?.(count);
      }, [count, onLoaded]);
      return (
        <div data-testid="tagging-canvas-mock" data-mode={mode}>
          {modeToggle && onModeCycle && (
            <button
              type="button"
              data-testid="tagging-mode-toggle-pill"
              onClick={onModeCycle}
            >
              MODE: {(mode ?? 'pbr').toUpperCase()}
            </button>
          )}
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
  buildPublishEncryptedPtbMock.mockReset();
  buildPublishEncryptedPtbMock.mockReturnValue({
    tx: {},
    handles: {},
    metadata: { target: 'stub::publish_encrypted', expectedEvents: [] },
  });
  encryptBaseMock.mockReset();
  encryptBaseMock.mockResolvedValue({
    ciphertext: new Uint8Array([0xc1, 0xc2, 0xc3]),
    sealedKey: new Uint8Array([0x5e, 0xa1]),
    idHex: 'deadbeef',
  });
  captureStillsMock.mockReset();
  captureStillsMock.mockResolvedValue([]);
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
    // Regression guard: the indexer race fix. waitForTransaction must run
    // AFTER signAndExecute and BEFORE the /api/generate POST, otherwise the
    // backend paymentVerifier 402s with `payment_not_found` even though the
    // SUI was spent on chain. Surfaced during plan-013 UAT — backend queries
    // the testnet read-replica before propagation finishes.
    expect(waitForTransactionMock).toHaveBeenCalledTimes(1);
    expect(waitForTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ digest: 'PAYDIGEST123' }),
    );
    const signOrder = signAndExecuteMock.mock.invocationCallOrder[0]!;
    const waitOrder = waitForTransactionMock.mock.invocationCallOrder[0]!;
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const fetchOrder = fetchMock.mock.invocationCallOrder[0]!;
    expect(signOrder).toBeLessThan(waitOrder);
    expect(waitOrder).toBeLessThan(fetchOrder);
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

  it('offers all three policies (Open/Allow-list/Restricted), defaulting to Open (D-076)', async () => {
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
    await waitFor(() => expect(screen.getByTestId('continue-tagging')).toBeTruthy());
    await labelAllParts(TAGGING_PART_COUNT_REF.current);
    fireEvent.click(screen.getByTestId('continue-tagging'));

    // D-076 re-enabled allow-list (1); all three are offered now.
    const open = screen.getByTestId('policy-2') as HTMLInputElement;
    const allowList = screen.getByTestId('policy-1') as HTMLInputElement;
    const restricted = screen.getByTestId('policy-0') as HTMLInputElement;

    // Default is Open (permissionless); no fee-required hint until allow-list.
    expect(open.checked).toBe(true);
    expect(allowList.checked).toBe(false);
    expect(restricted.checked).toBe(false);
    expect(screen.queryByTestId('allow-list-fee-hint')).toBeNull();

    // Selecting Allow-list surfaces the pay-to-fork fee requirement.
    fireEvent.click(allowList);
    expect(allowList.checked).toBe(true);
    expect(open.checked).toBe(false);
    expect(screen.getByTestId('allow-list-fee-hint')).toBeTruthy();
  });

  it('encrypted publish (allow-list): encrypts the GLB, uploads CIPHERTEXT, routes through publish_encrypted', async () => {
    TAGGING_PART_COUNT_REF.current = 3;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(3, ['a', 'b', 'c']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Choose allow-list + a positive fork fee.
    fireEvent.click(screen.getByTestId('policy-1'));
    fireEvent.change(screen.getByTestId('fee-input'), { target: { value: '1' } });

    uploadBlobMock.mockResolvedValue({ blobId: 'cipher_blob_id', blobObjectId: '0x' + 'a'.repeat(64) });
    signAndExecuteMock.mockResolvedValue({ digest: 'ENCDIGEST' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Sealed Model' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    // Encrypted path: encryptBase ran, the CIPHERTEXT (not plaintext) was uploaded,
    // and the encrypted PTB builder was used (not the plain one).
    await waitFor(() => expect(buildPublishEncryptedPtbMock).toHaveBeenCalled());
    expect(encryptBaseMock).toHaveBeenCalledOnce();
    // uploadBlob received the mocked ciphertext bytes, never the plaintext GLB.
    expect(uploadBlobMock.mock.calls[0]![0]).toEqual(new Uint8Array([0xc1, 0xc2, 0xc3]));
    const encArgs = buildPublishEncryptedPtbMock.mock.calls[0]![0] as {
      sealedKey: Uint8Array;
      sealId: Uint8Array;
      previewBlobIds: string[];
      license: { policy: number };
    };
    expect(encArgs.sealedKey).toEqual(new Uint8Array([0x5e, 0xa1]));
    expect(encArgs.sealId).toHaveLength(32);
    expect(encArgs.license.policy).toBe(1);
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
  });

  it('allow-list with zero fork fee is blocked before sign (EAllowListNeedsFee guard)', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Allow-list but leave fee at the default '0'.
    fireEvent.click(screen.getByTestId('policy-1'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Zero Fee' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    // Guarded: neither encryption nor any publish PTB runs.
    expect(encryptBaseMock).not.toHaveBeenCalled();
    expect(buildPublishEncryptedPtbMock).not.toHaveBeenCalled();
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
    expect(uploadBlobMock).not.toHaveBeenCalled();
  });

  it('U4: allow-list captures preview stills, uploads them as public blobs, passes their ids', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    fireEvent.click(screen.getByTestId('policy-1'));
    fireEvent.change(screen.getByTestId('fee-input'), { target: { value: '2' } });

    captureStillsMock.mockResolvedValue([new Uint8Array([0x11]), new Uint8Array([0x22])]);
    let n = 0;
    uploadBlobMock.mockImplementation(async () => ({ blobId: `blob_${n++}`, blobObjectId: '0x' + 'a'.repeat(64) }));
    signAndExecuteMock.mockResolvedValue({ digest: 'ENCDIGEST' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Previewed' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    await waitFor(() => expect(buildPublishEncryptedPtbMock).toHaveBeenCalled());
    expect(captureStillsMock).toHaveBeenCalledOnce();
    // 2 preview stills uploaded first, then the ciphertext = 3 uploads.
    expect(uploadBlobMock).toHaveBeenCalledTimes(3);
    expect(uploadBlobMock.mock.calls[0]![0]).toEqual(new Uint8Array([0x11]));
    expect(uploadBlobMock.mock.calls[1]![0]).toEqual(new Uint8Array([0x22]));
    const encArgs = buildPublishEncryptedPtbMock.mock.calls[0]![0] as {
      previewBlobIds: string[];
      glbBlobId: string;
    };
    expect(encArgs.previewBlobIds).toEqual(['blob_0', 'blob_1']);
    expect(encArgs.glbBlobId).toBe('blob_2');
  });

  it('U4: restricted publish is encrypted but captures NO preview stills (private)', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    fireEvent.click(screen.getByTestId('policy-0')); // Restricted
    captureStillsMock.mockResolvedValue([new Uint8Array([0x11])]);
    uploadBlobMock.mockResolvedValue({ blobId: 'cipher_blob', blobObjectId: '0x' + 'a'.repeat(64) });
    signAndExecuteMock.mockResolvedValue({ digest: 'RESTDIGEST' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Private' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    await waitFor(() => expect(buildPublishEncryptedPtbMock).toHaveBeenCalled());
    expect(captureStillsMock).not.toHaveBeenCalled();
    expect(uploadBlobMock).toHaveBeenCalledTimes(1); // ciphertext only
    const encArgs = buildPublishEncryptedPtbMock.mock.calls[0]![0] as { previewBlobIds: string[] };
    expect(encArgs.previewBlobIds).toEqual([]);
  });

  // ----- plan-015 U1 — Framing-B TaggingStep + partLabels wiring ----------

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

  // plan-015 U1 — types `axis-<i>` into each part's label input by walking
  // the canvas mock's pick-part-N buttons. The selected part's input is the
  // single `part-label-input` element rendered next to the canvas. Used by
  // tests that need to advance past the now-gated tagging step.
  async function labelAllParts(count: number, labels?: readonly string[]) {
    for (let i = 0; i < count; i++) {
      fireEvent.click(screen.getByTestId(`pick-part-${i}`));
      const value = labels?.[i] ?? `axis-${i}`;
      fireEvent.change(screen.getByTestId('part-label-input'), {
        target: { value },
      });
    }
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

  it('TaggingStep renders after confirming a Tripo model (R1 framing-B copy + help icon)', async () => {
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const step = screen.getByTestId('tagging-step');
    expect(step).toBeTruthy();
    expect(step.textContent).toMatch(/STEP 2\/3: NAME WHAT BUYERS CAN CUSTOMIZE/);
    expect(step.textContent).toMatch(
      /Each part you name becomes a customization axis/,
    );
    // R12 — help icon next to step heading.
    expect(screen.getByTestId('tagging-help')).toBeTruthy();
    // Framing B removed the preset escape hatch and the SKIP button.
    expect(screen.queryByTestId('preset-primary')).toBeNull();
    expect(screen.queryByTestId('preset-detail')).toBeNull();
    expect(screen.queryByTestId('skip-tagging')).toBeNull();
    // The dedicated metadata form must NOT be visible until Continue.
    expect(screen.queryByTestId('metadata-form')).toBeNull();
  });

  it('AE2: Continue stays disabled until every part has ≥1 character', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const continueBtn = screen.getByTestId('continue-tagging') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/0 OF 5 NAMED/);
    // Label 4 of 5 — still disabled.
    await labelAllParts(4);
    expect(continueBtn.disabled).toBe(true);
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/4 OF 5 NAMED/);
    // Label the last one — enables.
    fireEvent.click(screen.getByTestId('pick-part-4'));
    fireEvent.change(screen.getByTestId('part-label-input'), { target: { value: 'tail' } });
    expect(continueBtn.disabled).toBe(false);
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/5 OF 5 NAMED/);
  });

  it('AE1: 5-part freeform tagging emits typed labels in part-index order', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(5, ['chassis', 'wheels', 'spoiler', 'windshield', 'headlights']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual([
      'chassis',
      'wheels',
      'spoiler',
      'windshield',
      'headlights',
    ]);
  });

  it('AE2: single-character labels (a, 1) pass the gate — trust the user', async () => {
    TAGGING_PART_COUNT_REF.current = 3;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(3, ['a', '1', 'x']);
    const continueBtn = screen.getByTestId('continue-tagging') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false);
    fireEvent.click(continueBtn);
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual(['a', '1', 'x']);
  });

  it('AE2: label input enforces maxLength=32 (Move MAX_TAG_LEN parity)', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    fireEvent.click(screen.getByTestId('pick-part-0'));
    const input = screen.getByTestId('part-label-input') as HTMLInputElement;
    expect(input.maxLength).toBe(32);
    // Set a value at the cap and verify the stored label round-trips.
    const at32 = 'a'.repeat(32);
    fireEvent.change(input, { target: { value: at32 } });
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels[0]).toHaveLength(32);
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

  it('Continue is disabled while TaggingCanvas has not reported a part count yet', async () => {
    // Use 0 as the canvas part count to simulate an in-flight load (the real
    // component's onLoaded is gated on a successful LoadAssetContainerAsync;
    // pre-load the parent's partCount is 0). The disabled gate prevents the
    // silent-empty-partLabels publish flagged by races-L2.
    TAGGING_PART_COUNT_REF.current = 0;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const continueBtn = screen.getByTestId('continue-tagging') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/LOADING PARTS/);
    // Framing B has no skip escape hatch.
    expect(screen.queryByTestId('skip-tagging')).toBeNull();
  });

  // ----- plan-015 U5 — shared canvas/panel integration --------------------

  it('U5: tagging step mounts MeshInfoPanel + PartListPanel + label-editor', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    expect(screen.getByTestId('mesh-info-panel-tagging')).toBeTruthy();
    expect(screen.getByTestId('part-list-panel-tagging')).toBeTruthy();
    expect(screen.getByTestId('label-editor')).toBeTruthy();
    expect(screen.getByTestId('mesh-info-segments-tagging').textContent).toMatch(/SEGMENTS.*5/);
  });

  it('U5: PartListPanel renders one row per filtered mesh', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`part-list-row-${i}-tagging`)).toBeTruthy();
    }
  });

  it('U5: clicking a PartListPanel row updates selection and reveals the label input', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    // Before any selection — editor shows the "click to name" prompt and no input.
    expect(screen.getByTestId('label-editor').textContent).toMatch(/CLICK A PART TO NAME IT/);
    expect(screen.queryByTestId('part-label-input')).toBeNull();
    // Click row 2 → input appears, EDITING PART 3 OF 5 banner rendered.
    fireEvent.click(screen.getByTestId('part-list-row-2-tagging'));
    expect(screen.getByTestId('label-editor').textContent).toMatch(/EDITING PART 3 OF 5/);
    expect(screen.getByTestId('part-label-input')).toBeTruthy();
  });

  it('U5: typed label flows back into the matching PartListPanel row', async () => {
    TAGGING_PART_COUNT_REF.current = 3;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    fireEvent.click(screen.getByTestId('part-list-row-1-tagging'));
    fireEvent.change(screen.getByTestId('part-label-input'), { target: { value: 'wheels' } });
    expect(screen.getByTestId('part-list-row-1-tagging').textContent).toMatch(/wheels/);
  });

  it('U5: default canvas mode on the tagging step is PARTS (D-055 / F1.3)', async () => {
    TAGGING_PART_COUNT_REF.current = 3;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    expect(screen.getByTestId('tagging-canvas-mock').getAttribute('data-mode')).toBe('parts');
    expect(screen.getByTestId('tagging-mode-toggle-pill').textContent).toBe('MODE: PARTS');
  });

  it('U5: mode-toggle pill cycles PARTS → SOLO → WIREFRAME → PBR → PARTS', async () => {
    TAGGING_PART_COUNT_REF.current = 3;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const pill = screen.getByTestId('tagging-mode-toggle-pill');
    expect(pill.textContent).toBe('MODE: PARTS');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: SOLO');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: WIREFRAME');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: PBR');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: PARTS');
  });

  it('U5: clicking a part in the canvas also drives PartListPanel selection', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    fireEvent.click(screen.getByTestId('pick-part-3'));
    // PartListPanel row 3 should be active (aria-pressed=true).
    expect(
      screen.getByTestId('part-list-row-3-tagging').getAttribute('aria-pressed'),
    ).toBe('true');
    // And the editor shows the EDITING banner for part 4 of 5.
    expect(screen.getByTestId('label-editor').textContent).toMatch(/EDITING PART 4 OF 5/);
  });

  it('regenerating after tagging resets partLabels and re-renders TaggingStep', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(5);
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
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/0 OF 5 NAMED/);
  });
});
