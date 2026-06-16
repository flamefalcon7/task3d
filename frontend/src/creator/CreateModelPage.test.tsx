import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CaptionStatus } from './useUploadCaption';
import type { CopilotStatus } from './useRiffCopilot';

const useCurrentAccountMock = vi.fn();
const signAndExecuteMock = vi.fn();
const signTxMock = vi.fn();
const waitForTransactionMock = vi.fn(async () => ({})); // resolve immediately by default
// U5 (D-080): remember-on-publish reads objectChanges to extract the new model
// id. Default → no created Model3D, so non-U5 tests never trigger a remember.
const getTransactionBlockMock = vi.fn(async () => ({ objectChanges: [] }) as { objectChanges: unknown[] });
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignTransaction: () => ({ mutateAsync: signTxMock }),
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
  useSuiClient: () => ({ waitForTransaction: waitForTransactionMock, getTransactionBlock: getTransactionBlockMock }),
}));

const useSessionMock = vi.fn();
const clearSessionMock = vi.fn();
const isJwtExpiredMock = vi.fn((_jwt?: string) => false);
vi.mock('../auth/useSession', () => ({
  useSession: () => useSessionMock(),
  isJwtExpired: (jwt: string) => isJwtExpiredMock(jwt),
}));

// L2 (D-081) — controllable Riff Copilot hook so the integration (toggle gate,
// synthesis→fill→flip, second-session reset) can be driven without a backend.
const copilotState = vi.hoisted(() => ({
  messages: [] as { role: 'user' | 'assistant'; content: string }[],
  status: 'idle' as CopilotStatus,
  available: true,
  retryAfterMs: 0,
  synthesizedPrompt: null as string | null,
  synthSeq: 0,
}));
const copilotResetMock = vi.hoisted(() => vi.fn());
const copilotSendMock = vi.hoisted(() => vi.fn());
const copilotGenerateNowMock = vi.hoisted(() => vi.fn());
const copilotRetryMock = vi.hoisted(() => vi.fn());
vi.mock('./useRiffCopilot', () => ({
  useRiffCopilot: () => ({
    ...copilotState,
    sendAnswer: copilotSendMock,
    generateNow: copilotGenerateNowMock,
    reset: copilotResetMock,
    retry: copilotRetryMock,
  }),
}));

const uploadBlobMock = vi.fn();
const uploadFilesMock = vi.fn();
vi.mock('../walrus/useWalrusUpload', () => ({
  useWalrusUpload: () => ({
    uploadBlob: uploadBlobMock,
    uploadFiles: uploadFilesMock,
    stage: 'idle',
    status: 'idle',
    error: null,
  }),
}));

// plan-026 U4 — PreviewCanvas is now ref-driven (captureStills). The mock
// forwards a ref exposing a stubbed captureStills so the ALLOW_LIST preview path
// can be driven without Babylon/WebGL.
const captureStillsMock = vi.hoisted(() => vi.fn(async (): Promise<Uint8Array[]> => []));
// D-082 — clean frames for Upload Captioning. Default: one non-empty frame so the
// describe path runs; tests override to [] to drive the preview-not-ready no-op.
const captureFramesMock = vi.hoisted(() => vi.fn(async (): Promise<Uint8Array[]> => [new Uint8Array([1, 2, 3])]));
vi.mock('../babylon/PreviewCanvas', () => {
  const React = require('react') as typeof import('react');
  return {
    PreviewCanvas: React.forwardRef(
      ({ glbUrl }: { glbUrl: string | null }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(
          ref,
          () => ({
            dispose: () => {},
            remount: () => {},
            captureStills: captureStillsMock,
            captureFrames: captureFramesMock,
          }),
          [],
        );
        return <div data-testid="preview-canvas-mock">{glbUrl ?? 'no url'}</div>;
      },
    ),
  };
});

// D-082 — controllable Upload Captioning hook so the button gate, describe→fill,
// and degraded paths can be driven without a backend. The editable DESCRIPTION
// field is independent of this hook (it's plain state), so memory/params_json
// tests drive it by typing directly.
const captionState = vi.hoisted(() => ({
  status: 'idle' as CaptionStatus,
  available: true,
  retryAfterMs: 0,
}));
const captionDescribeMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => 'low-poly red truck'));
const captionRetryMock = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
const captionResetMock = vi.hoisted(() => vi.fn());
vi.mock('./useUploadCaption', () => ({
  useUploadCaption: () => ({
    status: captionState.status,
    available: captionState.available,
    retryAfterMs: captionState.retryAfterMs,
    describe: captionDescribeMock,
    retry: captionRetryMock,
    reset: captionResetMock,
  }),
}));

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
// plan A2 — per-part material names the mock reports via onLoaded. `null` means
// "auto-generate unique names (mat_0..mat_N-1)" → a taggable base by default.
// Upload-path tests override this (e.g. duplicate names) to exercise auto-skip.
const TAGGING_MATERIAL_NAMES_REF = { current: null as (string | null)[] | null };
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
      onLoaded?: (info: { partCount: number; materialNames: (string | null)[] }) => void;
      mode?: string;
      onModeCycle?: () => void;
      modeToggle?: boolean;
    }) => {
      const count = TAGGING_PART_COUNT_REF.current;
      const names =
        TAGGING_MATERIAL_NAMES_REF.current ??
        Array.from({ length: count }, (_, i) => `mat_${i}`);
      React.useEffect(() => {
        onLoaded?.({ partCount: count, materialNames: names });
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
  uploadFilesMock.mockReset();
  // Default quilt result: 1 file (ciphertext only) → 1 patch id. Tests with
  // preview stills override this to return more patch ids (input order).
  uploadFilesMock.mockResolvedValue({
    blobIds: ['quilt_blob'],
    blobObjects: [{ blobId: 'quilt_blob', blobObjectId: '0x' + 'a'.repeat(64) }],
    patchIds: ['patch_cipher'],
  });
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
  captureFramesMock.mockReset();
  captureFramesMock.mockResolvedValue([new Uint8Array([1, 2, 3])]);
  captionState.status = 'idle';
  captionState.available = true;
  captionState.retryAfterMs = 0;
  captionDescribeMock.mockReset();
  captionDescribeMock.mockResolvedValue('low-poly red truck');
  captionRetryMock.mockReset();
  captionRetryMock.mockResolvedValue(null);
  captionResetMock.mockReset();
  buildPayForApiCallPtbMock.mockReset();
  buildPayForApiCallPtbMock.mockReturnValue({
    tx: {},
    handles: {},
    metadata: { target: 'stub::pay', expectedEvents: [] },
  });
  TAGGING_PART_COUNT_REF.current = 12;
  TAGGING_MATERIAL_NAMES_REF.current = null;
  // Reset L2 copilot mock to defaults (available, idle, no synthesis).
  copilotState.messages = [];
  copilotState.status = 'idle';
  copilotState.available = true;
  copilotState.retryAfterMs = 0;
  copilotState.synthesizedPrompt = null;
  copilotState.synthSeq = 0;
  copilotResetMock.mockReset();
  copilotSendMock.mockReset();
  copilotGenerateNowMock.mockReset();
  copilotRetryMock.mockReset();
  vi.unstubAllGlobals();
  // jsdom lacks createObjectURL.
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

// URL-aware fetch mock for the Tripo flow (U6): the generate flow now pre-flights
// (GET /api/generate/preflight) BEFORE charging, then POSTs /api/generate. The
// pre-flight answers available:true by default; pass overrides to exercise the
// blocked-before-pay path and classified post-payment errors.
// D-106: generation is now dispatch (POST → 202 { jobId }) + poll (GET
// /result/:jobId). `result` overrides the terminal poll response (for the async
// Tripo-error paths); `dispatch` overrides the POST (for sync auth/payment errors).
function tripoFetchMock(opts: { preflight?: () => Response; dispatch?: () => Response; result?: () => Response } = {}) {
  const okDone = () =>
    new Response(JSON.stringify({ status: 'done', glbBytes: 'Z2xURg==', lineageJson: '{}', lineageStub: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  const okPreflight = () =>
    new Response(JSON.stringify({ available: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  const okDispatch = () =>
    new Response(JSON.stringify({ jobId: 'job-1' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/api/generate/preflight')) return (opts.preflight ?? okPreflight)();
    if (u.includes('/api/generate/result/')) return (opts.result ?? okDone)();
    return (opts.dispatch ?? okDispatch)(); // POST /api/generate
  });
}

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
    vi.stubGlobal('fetch', tripoFetchMock());

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
    // The generate POST is the call to /api/generate carrying a body — distinct from
    // the pre-flight (a bodyless GET to /api/generate/preflight, which fires first).
    const genCallIndex = fetchMock.mock.calls.findIndex(
      (c) => String(c[0]).endsWith('/api/generate') && (c[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(genCallIndex).toBeGreaterThanOrEqual(0);
    const genOrder = fetchMock.mock.invocationCallOrder[genCallIndex]!;
    expect(signOrder).toBeLessThan(waitOrder);
    expect(waitOrder).toBeLessThan(genOrder); // waitForTransaction before the generate POST
    const body = JSON.parse((fetchMock.mock.calls[genCallIndex]![1] as RequestInit).body as string);
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

  // ----- U6: pre-flight before pay + classified generate errors (R1/R2/R3/R10) -----

  async function clickGenerate() {
    render(<CreateModelPage />);
    fireEvent.change(screen.getByTestId('prompt-input'), { target: { value: 'a sword' } });
    fireEvent.click(screen.getByTestId('generate-button-trigger'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-button-confirm'));
    });
  }

  it('AE1: pre-flight available:false blocks payment — no signAndExecute, visible message (R1/R10)', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'SHOULD_NOT_BE_CALLED' });
    vi.stubGlobal(
      'fetch',
      tripoFetchMock({
        preflight: () =>
          new Response(JSON.stringify({ available: false, reason: 'insufficient' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      }),
    );
    await clickGenerate();
    expect(signAndExecuteMock).not.toHaveBeenCalled(); // R1 — never charged
    // Credit-dry gets honest copy that points to the no-Tripo .glb upload path.
    expect(screen.getByTestId('gen-error').textContent).toMatch(/credits are exhausted/i);
    expect(screen.getByTestId('gen-error').textContent).toMatch(/upload your own model/i);
  });

  it('pre-flight network failure → treated as unavailable (no charge), distinct message', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'SHOULD_NOT_BE_CALLED' });
    vi.stubGlobal(
      'fetch',
      tripoFetchMock({
        preflight: () => {
          throw new Error('network down');
        },
      }),
    );
    await clickGenerate();
    expect(signAndExecuteMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('gen-error').textContent).toMatch(/couldn't check generation availability/i);
  });

  it('AE3: a refundable post-payment failure shows the "fee may be refundable" copy (R3)', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'PAYDIGEST123' });
    vi.stubGlobal(
      'fetch',
      tripoFetchMock({
        result: () =>
          new Response(JSON.stringify({ status: 'error', error: 'tripo_failed', refundable: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      }),
    );
    await clickGenerate();
    expect(signAndExecuteMock).toHaveBeenCalledTimes(1); // payment WAS made
    await waitFor(() => expect(screen.getByTestId('gen-error').textContent).toMatch(/may be refundable/i));
  });

  it('tripo_unavailable (operator outage) maps to the temporary-unavailable message', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'PAYDIGEST123' });
    vi.stubGlobal(
      'fetch',
      tripoFetchMock({
        result: () =>
          new Response(JSON.stringify({ status: 'error', error: 'tripo_unavailable' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      }),
    );
    await clickGenerate();
    await waitFor(() => expect(screen.getByTestId('gen-error').textContent).toMatch(/temporarily unavailable/i));
    expect(screen.getByTestId('gen-error').textContent).not.toMatch(/refundable/i);
  });

  it('a 401 during generate clears the session (re-gates to sign-in)', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'PAYDIGEST123' });
    vi.stubGlobal(
      'fetch',
      tripoFetchMock({
        result: () =>
          new Response(JSON.stringify({ error: 'auth_invalid' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
      }),
    );
    await clickGenerate();
    await waitFor(() => expect(clearSessionMock).toHaveBeenCalled());
    expect(screen.getByTestId('gen-error').textContent).toMatch(/session expired/i);
  });

  it('offers all three policies (Open/Allow-list/Restricted), defaulting to Open (D-076)', async () => {
    signAndExecuteMock.mockResolvedValue({ digest: 'PAYDIGEST123' });
    vi.stubGlobal('fetch', tripoFetchMock());

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

    // Choose allow-list + a positive access (unlock) fee. plan-027: the publish
    // gate is on access_fee now, not the derive fee.
    fireEvent.click(screen.getByTestId('policy-1'));
    fireEvent.change(screen.getByTestId('access-fee-input'), { target: { value: '1' } });

    signAndExecuteMock.mockResolvedValue({ digest: 'ENCDIGEST' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Sealed Model' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    // Encrypted path: encryptBase ran, the ciphertext + previews go up as ONE
    // Walrus quilt (ciphertext is file [0], never the plaintext GLB), and the
    // encrypted PTB builder was used (not the plain one). No standalone uploadBlob.
    await waitFor(() => expect(buildPublishEncryptedPtbMock).toHaveBeenCalled());
    expect(encryptBaseMock).toHaveBeenCalledOnce();
    expect(uploadFilesMock).toHaveBeenCalledOnce();
    expect(uploadFilesMock.mock.calls[0]![0][0]).toEqual(new Uint8Array([0xc1, 0xc2, 0xc3]));
    expect(uploadBlobMock).not.toHaveBeenCalled();
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

  it('plan-027 U7: allow-list with empty access (unlock) fee is blocked before sign (EAllowListNeedsFee guard)', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Allow-list but leave the access (unlock) fee empty — the gate is now on
    // access_fee, not the derive fee (which may be 0).
    fireEvent.click(screen.getByTestId('policy-1'));
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Zero Fee' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    // Guarded: the access-fee field is highlighted with its error; neither
    // encryption nor any publish PTB runs.
    expect(screen.getByTestId('access-fee-required-error')).toBeTruthy();
    expect(encryptBaseMock).not.toHaveBeenCalled();
    expect(buildPublishEncryptedPtbMock).not.toHaveBeenCalled();
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
    expect(uploadBlobMock).not.toHaveBeenCalled();
    expect(uploadFilesMock).not.toHaveBeenCalled();
  });

  it('clicking Mint with a missing required field highlights it (not a silent no-op); filling clears it', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Mint is clickable (no silently-disabled button), and nothing is flagged yet.
    expect((screen.getByTestId('mint-button') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('name-required-error')).toBeNull();

    // (generation already used signAndExecute to pay the Tripo fee — reset so we
    // can assert the mint attempt itself fires no transaction.)
    signAndExecuteMock.mockClear();

    // Attempt to mint with an empty MODEL NAME → the field is highlighted with an
    // inline error + a summary, and no transaction fires.
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.getByTestId('name-required-error')).toBeTruthy();
    expect(screen.getByTestId('mint-missing-fields')).toBeTruthy();
    expect(signAndExecuteMock).not.toHaveBeenCalled();

    // Filling the name clears the highlight + the summary.
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Model' } });
    expect(screen.queryByTestId('name-required-error')).toBeNull();
    expect(screen.queryByTestId('mint-missing-fields')).toBeNull();
  });

  it('U4: allow-list quilts the ciphertext + preview stills in ONE upload; passes their patch ids', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    fireEvent.click(screen.getByTestId('policy-1'));
    // plan-027: a positive access (unlock) fee satisfies the publish gate.
    fireEvent.change(screen.getByTestId('access-fee-input'), { target: { value: '2' } });

    captureStillsMock.mockResolvedValue([new Uint8Array([0x11]), new Uint8Array([0x22])]);
    // Quilt returns one patch id per file, in input order: ciphertext, then stills.
    uploadFilesMock.mockResolvedValue({
      blobIds: ['quilt_blob'],
      blobObjects: [{ blobId: 'quilt_blob', blobObjectId: '0x' + 'a'.repeat(64) }],
      patchIds: ['patch_cipher', 'patch_still_1', 'patch_still_2'],
    });
    signAndExecuteMock.mockResolvedValue({ digest: 'ENCDIGEST' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Previewed' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    await waitFor(() => expect(buildPublishEncryptedPtbMock).toHaveBeenCalled());
    expect(captureStillsMock).toHaveBeenCalledOnce();
    // ONE quilt upload (not 3 standalone): [ciphertext, still1, still2] in order.
    expect(uploadFilesMock).toHaveBeenCalledOnce();
    expect(uploadBlobMock).not.toHaveBeenCalled();
    const files = uploadFilesMock.mock.calls[0]![0] as Uint8Array[];
    expect(files[0]).toEqual(new Uint8Array([0xc1, 0xc2, 0xc3])); // ciphertext first
    expect(files[1]).toEqual(new Uint8Array([0x11]));
    expect(files[2]).toEqual(new Uint8Array([0x22]));
    // Forced into ONE quilt (quiltSize === file count) so the publish stays at
    // ~3 popups even with 12 turntable frames.
    const uploadOpts = uploadFilesMock.mock.calls[0]![2] as { quiltSize?: number } | undefined;
    expect(uploadOpts?.quiltSize).toBe(files.length);
    const encArgs = buildPublishEncryptedPtbMock.mock.calls[0]![0] as {
      previewBlobIds: string[];
      glbBlobId: string;
    };
    expect(encArgs.glbBlobId).toBe('patch_cipher'); // ciphertext patch → glb_blob_id
    expect(encArgs.previewBlobIds).toEqual(['patch_still_1', 'patch_still_2']);
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
    signAndExecuteMock.mockResolvedValue({ digest: 'RESTDIGEST' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Private' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    await waitFor(() => expect(buildPublishEncryptedPtbMock).toHaveBeenCalled());
    expect(captureStillsMock).not.toHaveBeenCalled();
    // One quilt holding ONLY the ciphertext (no preview stills).
    expect(uploadFilesMock).toHaveBeenCalledOnce();
    expect(uploadFilesMock.mock.calls[0]![0]).toHaveLength(1);
    const encArgs = buildPublishEncryptedPtbMock.mock.calls[0]![0] as { previewBlobIds: string[] };
    expect(encArgs.previewBlobIds).toEqual([]);
  });

  // ----- plan-027 U7 — access-fee input + flipped publish guard -----------

  it('U7: access-fee input renders ONLY for ALLOW_LIST (not PERMISSIONLESS)', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Default policy is Open (permissionless, 2) → no access-fee input.
    expect(screen.queryByTestId('access-fee-input')).toBeNull();

    // Allow-list → access-fee input appears.
    fireEvent.click(screen.getByTestId('policy-1'));
    expect(screen.getByTestId('access-fee-input')).toBeTruthy();

    // Back to Open → access-fee input gone again.
    fireEvent.click(screen.getByTestId('policy-2'));
    expect(screen.queryByTestId('access-fee-input')).toBeNull();
  });

  it('U7: ALLOW_LIST with a positive access fee and derive fee 0 publishes; license carries accessFee>0, derivativeMintFee=0', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Allow-list, access fee 3 SUI, leave the derive fee at its default '0'.
    fireEvent.click(screen.getByTestId('policy-1'));
    fireEvent.change(screen.getByTestId('access-fee-input'), { target: { value: '3' } });
    // derive fee input is left at '0' (the default) — now allowed for ALLOW_LIST.

    signAndExecuteMock.mockResolvedValue({ digest: 'ACCDIGEST' });
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Priced Base' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });

    // Guard passes → the encrypted publish PTB is built with a license carrying
    // accessFee = 3 SUI (mist) and derivativeMintFee = 0.
    await waitFor(() => expect(buildPublishEncryptedPtbMock).toHaveBeenCalled());
    const license = (
      buildPublishEncryptedPtbMock.mock.calls[0]![0] as {
        license: { policy: number; accessFee: bigint; derivativeMintFee: bigint };
      }
    ).license;
    expect(license.policy).toBe(1);
    expect(license.accessFee).toBe(3_000_000_000n);
    expect(license.derivativeMintFee).toBe(0n);
  });

  it('U7: policy flip ALLOW_LIST → PERMISSIONLESS → ALLOW_LIST clears the access-fee value', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(1, ['a']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());

    // Enter a value under ALLOW_LIST.
    fireEvent.click(screen.getByTestId('policy-1'));
    fireEvent.change(screen.getByTestId('access-fee-input'), { target: { value: '5' } });
    expect((screen.getByTestId('access-fee-input') as HTMLInputElement).value).toBe('5');

    // Flip away (PERMISSIONLESS) — input unmounts and the value is reset.
    fireEvent.click(screen.getByTestId('policy-2'));
    expect(screen.queryByTestId('access-fee-input')).toBeNull();

    // Return to ALLOW_LIST — the input is back and empty (stale value cleared).
    fireEvent.click(screen.getByTestId('policy-1'));
    expect((screen.getByTestId('access-fee-input') as HTMLInputElement).value).toBe('');
  });

  // ----- plan-015 U1 — Framing-B TaggingStep + partLabels wiring ----------

  async function generateAndConfirmTripoModel() {
    signAndExecuteMock.mockResolvedValue({ digest: 'PAYDIGEST123' });
    vi.stubGlobal('fetch', tripoFetchMock());
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
    // plan 2026-06-08-001 U4 — an uncaptioned upload now warns first; click
    // "Publish anyway" to proceed. Tripo + captioned uploads never show this,
    // so the guard keeps every existing caller transparent.
    if (screen.queryByTestId('no-caption-panel')) {
      await act(async () => {
        fireEvent.click(screen.getByTestId('no-caption-confirm'));
      });
    }
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());
    return buildPublishPtbMock.mock.calls[0]![0] as { partLabels: string[]; tags: string[] };
  }

  it('U5 (D-080): a successful Tripo publish remembers the prompt + extracted modelId + policy', async () => {
    const MODEL_ID = '0x' + 'b'.repeat(64);
    getTransactionBlockMock.mockResolvedValue({
      objectChanges: [
        { type: 'mutated', objectType: '0x2::coin::Coin', objectId: '0xgas' },
        { type: 'created', objectType: '0xpkg::model3d::Model3D', objectId: MODEL_ID },
      ],
    });
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel(); // prompt 'a sword', default policy Open(2)
    await labelAllParts(TAGGING_PART_COUNT_REF.current);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('name-input')).toBeTruthy());
    await driveMintAndCaptureArgs(); // names, signs, mints (digest PUBDIGEST456)

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => c[0] === '/api/memory/remember');
      expect(calls.length).toBe(1);
    });
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/memory/remember')!;
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      prompt: 'a sword',
      modelId: MODEL_ID,
      policy: 2,
    });
  });

  it('U5 (D-080): publish does NOT remember when objectChanges has no Model3D (degrade, not crash)', async () => {
    getTransactionBlockMock.mockResolvedValue({ objectChanges: [] });
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(TAGGING_PART_COUNT_REF.current);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('name-input')).toBeTruthy());
    await driveMintAndCaptureArgs();
    // Publish still succeeds; no remember fetch fired.
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const calls = fetchMock.mock.calls.filter((c) => c[0] === '/api/memory/remember');
    expect(calls.length).toBe(0);
  });

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

  it('AE2: Continue flags unnamed parts on attempt (no silent disabled button); naming clears them', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const continueBtn = screen.getByTestId('continue-tagging') as HTMLButtonElement;
    // Clickable, not silently disabled (partCount > 0).
    expect(continueBtn.disabled).toBe(false);
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/0 OF 5 NAMED/);

    // Name 4 of 5, then attempt Continue → the 1 unnamed part is highlighted and
    // the step does NOT advance.
    await labelAllParts(4);
    fireEvent.click(continueBtn);
    expect(screen.getByTestId('part-list-row-4-tagging').getAttribute('data-flagged')).toBe('true');
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/NAME THE 1 HIGHLIGHTED PART/);
    expect(screen.queryByTestId('metadata-form')).toBeNull();

    // Naming the last part clears its highlight + restores the progress label.
    fireEvent.click(screen.getByTestId('pick-part-4'));
    fireEvent.change(screen.getByTestId('part-label-input'), { target: { value: 'tail' } });
    expect(screen.getByTestId('part-list-row-4-tagging').getAttribute('data-flagged')).toBeNull();
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/5 OF 5 NAMED/);
  });

  it('AUTO-NAME fills every part with part1..N, enables Continue, and emits in order', async () => {
    TAGGING_PART_COUNT_REF.current = 5;
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    const continueBtn = screen.getByTestId('continue-tagging') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false); // clickable; flags on attempt rather than disabling
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/0 OF 5 NAMED/);
    // One click fills all five parts.
    fireEvent.click(screen.getByTestId('auto-name-parts'));
    expect(screen.getByTestId('tag-progress').textContent).toMatch(/5 OF 5 NAMED/);
    expect(continueBtn.disabled).toBe(false);
    // Continue emits the incrementing labels in part-index order.
    fireEvent.click(continueBtn);
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual(['part1', 'part2', 'part3', 'part4', 'part5']);
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

  // plan A2 — uploads now route through the tagging step (with auto-skip).
  async function uploadGlb(filename = 'model.glb') {
    fireEvent.click(screen.getByLabelText('Upload my own .glb'));
    const glbBytes = new Uint8Array(16);
    glbBytes.set([0x67, 0x6c, 0x54, 0x46]); // 'glTF' magic
    const file = new File([glbBytes as BlobPart], filename, { type: 'model/gltf-binary' });
    // jsdom's File polyfill omits `arrayBuffer`; stub it from the underlying bytes.
    (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
      glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength);
    await act(async () => {
      fireEvent.change(screen.getByTestId('glb-file-input'), { target: { files: [file] } });
    });
  }

  it('plan A2 — upload of a non-taggable GLB (single part) auto-skips tagging → partLabels = []', async () => {
    TAGGING_PART_COUNT_REF.current = 1;
    TAGGING_MATERIAL_NAMES_REF.current = ['only']; // single part → not taggable
    render(<CreateModelPage />);
    await uploadGlb();
    // The tagging step auto-skips; the metadata form appears with no naming.
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    expect(screen.queryByTestId('tagging-step')).toBeNull();
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual([]);
  });

  it('plan A2 — upload of a multi-part GLB with duplicate material names auto-skips (name-keying ambiguous) → partLabels = []', async () => {
    TAGGING_PART_COUNT_REF.current = 2;
    TAGGING_MATERIAL_NAMES_REF.current = ['body', 'body']; // dup → not name-keyable
    render(<CreateModelPage />);
    await uploadGlb();
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    expect(screen.queryByTestId('tagging-step')).toBeNull();
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual([]);
  });

  it('plan A2 — upload of a taggable multi-part GLB routes through the tagging step → partLabels populated', async () => {
    TAGGING_PART_COUNT_REF.current = 3;
    // Default material names (null → unique mat_0..2) make the base taggable.
    render(<CreateModelPage />);
    await uploadGlb();
    // Taggable → the naming step shows; the metadata form is gated behind it.
    await waitFor(() => expect(screen.getByTestId('tagging-step')).toBeTruthy());
    expect(screen.queryByTestId('metadata-form')).toBeNull();
    await labelAllParts(3, ['blade', 'hilt', 'guard']);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    const args = await driveMintAndCaptureArgs();
    expect(args.partLabels).toEqual(['blade', 'hilt', 'guard']);
  });

  // ----- D-082 Upload Captioning ------------------------------------------

  // Upload a single-part (non-taggable) GLB and land on the metadata form.
  async function uploadToMetadataForm() {
    TAGGING_PART_COUNT_REF.current = 1;
    TAGGING_MATERIAL_NAMES_REF.current = ['only'];
    await uploadGlb();
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
  }

  it('U5 (D-082): "Describe with AI" captures frames, calls describe, fills the editable field (AE1, R2)', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'true');
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    await waitFor(() => expect(screen.getByTestId('caption-describe')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('caption-describe'));
    });
    expect(captureFramesMock).toHaveBeenCalled();
    expect(captionDescribeMock).toHaveBeenCalled();
    await waitFor(() =>
      expect((screen.getByTestId('caption-input') as HTMLTextAreaElement).value).toBe('low-poly red truck'),
    );
    // The drafted caption is editable; the edit (not the draft) is what sticks.
    fireEvent.change(screen.getByTestId('caption-input'), { target: { value: 'my own words' } });
    expect((screen.getByTestId('caption-input') as HTMLTextAreaElement).value).toBe('my own words');
  });

  it('U5 (D-082): a captioned upload writes caption to params_json AND remembers personal-only (AE3, R9)', async () => {
    const MODEL_ID = '0x' + 'c'.repeat(64);
    getTransactionBlockMock.mockResolvedValue({
      objectChanges: [{ type: 'created', objectType: '0xpkg::model3d::Model3D', objectId: MODEL_ID }],
    });
    const fetchMock = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('caption-input'), { target: { value: 'low-poly red truck' } });
    await driveMintAndCaptureArgs();

    const args = (buildPublishPtbMock.mock.calls[0]! as unknown as [{ paramsJson: string }])[0];
    expect(JSON.parse(args.paramsJson)).toEqual({ source: 'upload', caption: 'low-poly red truck' });

    await waitFor(() => {
      const calls = (fetchMock.mock.calls as unknown as [string, RequestInit][]).filter(
        (c) => c[0] === '/api/memory/remember',
      );
      expect(calls.length).toBe(1);
    });
    const body = JSON.parse(
      ((fetchMock.mock.calls as unknown as [string, RequestInit][]).find(
        (c) => c[0] === '/api/memory/remember',
      )![1]).body as string,
    );
    // Caption stored as the prompt + model id, and crucially NO policy → personal-only.
    expect(body).toEqual({ prompt: 'low-poly red truck', modelId: MODEL_ID });
    expect('policy' in body).toBe(false);
  });

  it('U5 (D-082): an uncaptioned upload mints {source:"upload"} and remembers nothing (AE4, R10)', async () => {
    getTransactionBlockMock.mockResolvedValue({
      objectChanges: [{ type: 'created', objectType: '0xpkg::model3d::Model3D', objectId: '0x' + 'd'.repeat(64) }],
    });
    const fetchMock = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    uploadBlobMock.mockResolvedValue({ blobId: 'walrus_blob_id_xyz', blobObjectId: '0x' + 'a'.repeat(64) });
    signAndExecuteMock.mockResolvedValue({ digest: 'PUBDIGEST456' });
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    // do NOT type a caption
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    // plan 2026-06-08-001 U4 — an uncaptioned upload now warns first; confirm it.
    await act(async () => {
      fireEvent.click(screen.getByTestId('no-caption-confirm'));
    });
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());

    const args = (buildPublishPtbMock.mock.calls[0]! as unknown as [{ paramsJson: string }])[0];
    expect(JSON.parse(args.paramsJson)).toEqual({ source: 'upload' });
    const calls = (fetchMock.mock.calls as unknown as [string, RequestInit][]).filter(
      (c) => c[0] === '/api/memory/remember',
    );
    expect(calls.length).toBe(0);
  });

  it('U5 (D-082): with the flag off, no AI button — but the description field still works (AE6)', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'false');
    render(<CreateModelPage />); // flag off → captionOn false
    await uploadToMetadataForm();
    expect(screen.getByTestId('caption-input')).toBeTruthy();
    expect(screen.queryByTestId('caption-describe')).toBeNull();
  });

  it('D-084: keyless captioning stays VISIBLE as "AI UNAVAILABLE" (never hidden), hand-typing still works', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'true');
    captionState.available = false;
    captionState.status = 'unavailable';
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    expect(screen.getByTestId('caption-input')).toBeTruthy(); // always-on hand-type field
    const btn = screen.getByTestId('caption-describe') as HTMLButtonElement; // NOT hidden
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/AI UNAVAILABLE/i);
    expect(screen.getByTestId('caption-unavailable')).toBeTruthy();
  });

  it('U7: caption quota → button stays VISIBLE, disabled "AI QUOTA REACHED" + reset hint, no RETRY (R6/R10)', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'true');
    captionState.status = 'quota';
    captionState.retryAfterMs = 90_000;
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    const btn = screen.getByTestId('caption-describe') as HTMLButtonElement;
    expect(btn).toBeTruthy(); // NOT hidden (R10)
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/AI QUOTA REACHED/i);
    expect(screen.getByTestId('caption-quota').textContent).toMatch(/~2m/); // reset hint
    expect(screen.queryByTestId('caption-retry')).toBeNull(); // auto-recovery → no manual retry
  });

  it('U5 (D-082): describe is a soft no-op when the preview yields no frames', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'true');
    captureFramesMock.mockResolvedValueOnce([]);
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    await act(async () => {
      fireEvent.click(screen.getByTestId('caption-describe'));
    });
    expect(captureFramesMock).toHaveBeenCalled();
    expect(captionDescribeMock).not.toHaveBeenCalled();
  });

  it('U5 (D-082): a new upload clears a prior caption (no stale caption onto the wrong model)', async () => {
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('caption-input'), { target: { value: 'model A caption' } });
    expect((screen.getByTestId('caption-input') as HTMLTextAreaElement).value).toBe('model A caption');
    // Upload a different GLB → fresh `glb` reference → the prior caption is cleared.
    await uploadGlb('model-b.glb');
    await waitFor(() => expect(screen.getByTestId('metadata-form')).toBeTruthy());
    expect((screen.getByTestId('caption-input') as HTMLTextAreaElement).value).toBe('');
  });

  it('U5 (D-082): the description field is locked while a describe is in flight (no edit clobber)', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'true');
    captionState.status = 'thinking';
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    expect((screen.getByTestId('caption-input') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('U5 (D-082): Tripo mode shows no caption section (R14)', async () => {
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    expect(screen.queryByTestId('caption-section')).toBeNull();
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

  // ----- plan 2026-06-08-001 U4 — publish-time no-caption nudge (R7, R8) -----

  it('AE4: publishing an uncaptioned upload opens the confirm panel and does NOT publish yet', async () => {
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    // Do NOT type a caption.
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    // The nudge appears; the publish PTB is NOT built until the user confirms.
    expect(screen.getByTestId('no-caption-panel')).toBeTruthy();
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
  });

  it('AE4: Cancel ("Go back") closes the panel and does not publish', async () => {
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.getByTestId('no-caption-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('no-caption-cancel'));
    // Back in edit state: panel gone, mint button back, nothing published.
    expect(screen.queryByTestId('no-caption-panel')).toBeNull();
    expect(screen.getByTestId('mint-button')).toBeTruthy();
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
  });

  it('AE4: Continue ("Publish anyway") proceeds to publish', async () => {
    uploadBlobMock.mockResolvedValue({ blobId: 'b', blobObjectId: '0x' + 'a'.repeat(64) });
    signAndExecuteMock.mockResolvedValue({ digest: 'PUBDIGEST' });
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.getByTestId('no-caption-panel')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('no-caption-confirm'));
    });
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());
    const args = (buildPublishPtbMock.mock.calls[0]! as unknown as [{ paramsJson: string }])[0];
    expect(JSON.parse(args.paramsJson)).toEqual({ source: 'upload' });
  });

  it('AE5/R8: the warning still fires when captioning is unavailable (informational copy)', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'true');
    captionState.available = false;
    captionState.status = 'unavailable';
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    const panel = screen.getByTestId('no-caption-panel');
    expect(panel).toBeTruthy();
    expect(panel.textContent).toMatch(/unavailable/i);
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
  });

  it('AE6: a captioned upload publishes directly (no nudge)', async () => {
    uploadBlobMock.mockResolvedValue({ blobId: 'b', blobObjectId: '0x' + 'a'.repeat(64) });
    signAndExecuteMock.mockResolvedValue({ digest: 'PUBDIGEST' });
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    fireEvent.change(screen.getByTestId('caption-input'), { target: { value: 'a tidy caption' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.queryByTestId('no-caption-panel')).toBeNull();
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());
  });

  it('AE6: a Tripo model publishes directly (no nudge)', async () => {
    uploadBlobMock.mockResolvedValue({ blobId: 'b', blobObjectId: '0x' + 'a'.repeat(64) });
    signAndExecuteMock.mockResolvedValue({ digest: 'PUBDIGEST' });
    render(<CreateModelPage />);
    await generateAndConfirmTripoModel();
    await labelAllParts(TAGGING_PART_COUNT_REF.current);
    fireEvent.click(screen.getByTestId('continue-tagging'));
    await waitFor(() => expect(screen.getByTestId('name-input')).toBeTruthy());
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Tripo' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.queryByTestId('no-caption-panel')).toBeNull();
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());
  });

  it('the nudge panel REPLACES the Mint button while open (no second publish entry point)', async () => {
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.getByTestId('no-caption-panel')).toBeTruthy();
    expect(screen.queryByTestId('mint-button')).toBeNull();
  });

  it('R8: shows the ACTIONABLE copy when captioning is available', async () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', 'true');
    captionState.available = true;
    captionState.status = 'idle';
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    const panel = screen.getByTestId('no-caption-panel');
    expect(panel.textContent).toMatch(/Describe with AI/i);
    expect(panel.textContent).not.toMatch(/unavailable/i);
  });

  it('a whitespace-only caption is treated as uncaptioned → the nudge fires', async () => {
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    fireEvent.change(screen.getByTestId('caption-input'), { target: { value: '   ' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.getByTestId('no-caption-panel')).toBeTruthy();
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
  });

  it('review(correctness): Continue after clearing the name does NOT publish (proceedMint re-validates)', async () => {
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.getByTestId('no-caption-panel')).toBeTruthy();
    // Clear the (still-editable) name field, THEN confirm publish.
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('no-caption-confirm'));
    });
    // Re-validation blocks the publish + flags the missing field.
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('name-required-error')).toBeTruthy();
  });

  it('review: Cancel → add a caption → re-publish skips the nudge and publishes', async () => {
    uploadBlobMock.mockResolvedValue({ blobId: 'b', blobObjectId: '0x' + 'a'.repeat(64) });
    signAndExecuteMock.mockResolvedValue({ digest: 'PUBDIGEST' });
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    fireEvent.click(screen.getByTestId('no-caption-cancel'));
    // Add a caption, then publish again — no nudge this time.
    fireEvent.change(screen.getByTestId('caption-input'), { target: { value: 'now described' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.queryByTestId('no-caption-panel')).toBeNull();
    await waitFor(() => expect(buildPublishPtbMock).toHaveBeenCalled());
    const args = (buildPublishPtbMock.mock.calls[0]! as unknown as [{ paramsJson: string }])[0];
    expect(JSON.parse(args.paramsJson)).toEqual({ source: 'upload', caption: 'now described' });
  });

  it('review(races): re-uploading a model while the nudge is open dismisses it (no stale-model publish)', async () => {
    render(<CreateModelPage />);
    await uploadToMetadataForm();
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'My Upload' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('mint-button'));
    });
    expect(screen.getByTestId('no-caption-panel')).toBeTruthy();
    // Switch source mode (changes the model-identity effect deps) — the open
    // nudge must be dismissed rather than left referencing the old model.
    fireEvent.click(screen.getByText('Generate with Tripo'));
    expect(screen.queryByTestId('no-caption-panel')).toBeNull();
    expect(buildPublishPtbMock).not.toHaveBeenCalled();
  });
});

describe('CreateModelPage — L2 Riff Copilot integration (D-081)', () => {
  beforeEach(() => vi.stubEnv('VITE_COPILOT_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the toggle hidden when the feature flag is off (default-off safety)', () => {
    vi.stubEnv('VITE_COPILOT_ENABLED', '');
    render(<CreateModelPage />);
    expect(screen.queryByTestId('copilot-toggle')).toBeNull();
    expect(screen.getByTestId('prompt-input')).toBeTruthy();
  });

  it('shows the Write/Chat toggle when enabled and the copilot is available', () => {
    render(<CreateModelPage />);
    expect(screen.getByTestId('copilot-toggle')).toBeTruthy();
    expect(screen.getByTestId('prompt-input')).toBeTruthy(); // Write is the default
  });

  it('D-084: keyless copilot stays VISIBLE — toggle shown, panel says "AI unavailable" (never hidden)', () => {
    copilotState.available = false;
    copilotState.status = 'unavailable';
    render(<CreateModelPage />);
    // Toggle is NOT hidden (gated on the build flag only, not on availability).
    expect(screen.getByTestId('copilot-toggle')).toBeTruthy();
    fireEvent.click(screen.getByTestId('copilot-toggle-chat'));
    expect(screen.getByTestId('copilot-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('copilot-answer-input')).toBeNull(); // input replaced by the message
  });

  it('clicking "Chat with Copilot" mounts the conversation panel', () => {
    render(<CreateModelPage />);
    fireEvent.click(screen.getByTestId('copilot-toggle-chat'));
    expect(screen.getByTestId('copilot-chat')).toBeTruthy();
    expect(screen.queryByTestId('prompt-input')).toBeNull(); // textarea swapped out
  });

  it('U7: copilot quota → toggle stays visible; panel shows reset hint instead of input (R6/R10)', () => {
    copilotState.status = 'quota';
    copilotState.retryAfterMs = 90_000;
    render(<CreateModelPage />);
    // available stays true in quota, so the toggle is NOT hidden (R10).
    expect(screen.getByTestId('copilot-toggle')).toBeTruthy();
    fireEvent.click(screen.getByTestId('copilot-toggle-chat'));
    expect(screen.getByTestId('copilot-quota').textContent).toMatch(/~2m/);
    // the answer input is replaced by the quota message — feature present, not hidden.
    expect(screen.queryByTestId('copilot-answer-input')).toBeNull();
  });

  it('a synthesized prompt is written into the shared prompt state (R3)', () => {
    // Default mode is Write; the one-shot effect writes synthesis into `prompt`
    // (no auto-snap — option A delivers it in-panel; here we assert the state lands).
    copilotState.synthesizedPrompt = 'low-poly red sports car';
    copilotState.synthSeq = 1;
    copilotState.status = 'done';
    render(<CreateModelPage />);
    const box = screen.getByTestId('prompt-input') as HTMLTextAreaElement;
    expect(box.value).toBe('low-poly red sports car');
  });

  it('the synthesized prompt remains user-editable before generation (AE5)', () => {
    copilotState.synthesizedPrompt = 'low-poly red sports car';
    copilotState.synthSeq = 1;
    copilotState.status = 'done';
    render(<CreateModelPage />);
    const box = screen.getByTestId('prompt-input') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'low-poly red sports car with chrome wheels' } });
    // Generate reads the live `prompt` state, so the edited value is what ships.
    expect(box.value).toBe('low-poly red sports car with chrome wheels');
  });

  it('does NOT auto-switch to Write on synthesis — the panel stays in Chat (option A)', () => {
    copilotState.synthesizedPrompt = 'low-poly red sports car';
    copilotState.synthSeq = 1;
    copilotState.status = 'done';
    render(<CreateModelPage />);
    fireEvent.click(screen.getByTestId('copilot-toggle-chat')); // enter Chat
    // status is 'done' → re-enter resets to a fresh chat; the panel is shown (not snapped to Write)
    expect(screen.getByTestId('copilot-chat')).toBeTruthy();
    expect(screen.queryByTestId('prompt-input')).toBeNull();
  });

  it('renders the real Generate gate inside the chat done-state, not duplicated below', () => {
    copilotState.synthesizedPrompt = 'low-poly red sports car';
    copilotState.synthSeq = 1;
    copilotState.status = 'done';
    render(<CreateModelPage />);
    fireEvent.click(screen.getByTestId('copilot-toggle-chat')); // enter Chat (done state)
    const triggers = screen.getAllByTestId('generate-button-trigger');
    expect(triggers.length).toBe(1); // exactly one SignConfirmation — in the panel, not also below
    expect(screen.getByTestId('copilot-done')).toBeTruthy();
  });

  it('re-entering Chat after a finished conversation resets it (no second-session dead-end)', () => {
    copilotState.status = 'done';
    copilotState.messages = [
      { role: 'user', content: 'a car' },
      { role: 'assistant', content: 'low-poly red car' },
    ];
    render(<CreateModelPage />);
    fireEvent.click(screen.getByTestId('copilot-toggle-chat'));
    expect(copilotResetMock).toHaveBeenCalled();
  });

  it('flipping back to Write resets the copilot (abandons an in-flight turn)', () => {
    render(<CreateModelPage />);
    fireEvent.click(screen.getByTestId('copilot-toggle-chat')); // enter chat
    fireEvent.click(screen.getByText('✎ Write')); // back to write
    expect(copilotResetMock).toHaveBeenCalled();
  });
});
