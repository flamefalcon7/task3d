import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

// Stub Babylon-backed preview so jsdom doesn't try to run WebGL.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-stub" data-glb-url={glbUrl ?? ''} />
  ),
}));

// Stub SignInButton — it pulls in dapp-kit wallet hooks we don't exercise here.
vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => <div data-testid="signin-button-stub" />,
}));

const useModelByIdMock = vi.fn();
const useDetailEntitlementMock = vi.fn();
vi.mock('./hooks', () => ({
  useModelById: (id: string) => useModelByIdMock(id),
  useDetailEntitlement: (...args: unknown[]) => useDetailEntitlementMock(...args),
}));

// Wallet/session seams. Defaults set in beforeEach; per-test overrides via the
// exposed mocks.
const useSuiClientMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useSuiClient: () => useSuiClientMock(),
}));

const useSessionMock = vi.fn();
vi.mock('../auth/useSession', () => ({
  useSession: () => useSessionMock(),
}));

const useAppSignerMock = vi.fn();
vi.mock('../wallet/useAppSigner', () => ({
  useAppSigner: () => useAppSignerMock(),
}));

const buildPurchaseAccessPtbMock = vi.fn();
vi.mock('../sui/collectionTxBuilders', () => ({
  buildPurchaseAccessPtb: (...args: unknown[]) => buildPurchaseAccessPtbMock(...args),
}));

const decryptViaEntitlementMock = vi.fn();
const decryptViaCreatorMock = vi.fn();
vi.mock('../seal/decryptAndView', () => ({
  decryptViaEntitlement: (...args: unknown[]) => decryptViaEntitlementMock(...args),
  decryptViaCreator: (...args: unknown[]) => decryptViaCreatorMock(...args),
}));

import { ModelDetailPage } from './ModelDetailPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/model/:objectId" element={<ModelDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeModel(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xMODEL',
    blobId: '',
    collectionId: '',
    patchId: '',
    creator: '0xCAFECAFECAFECAFECAFECAFE',
    shapeType: 'tripo',
    paramsJson: '{"shape":"tripo"}',
    name: 'Demo Chest',
    directAccessPrice: '0',
    tags: ['fantasy', 'chest'],
    partLabels: [],
    createdAtMs: '0',
    lineageBlobId: 'walrus_blob_lineage',
    glbBlobId: 'glb_demo',
    derivativeMintFee: '250000000', // 0.25 SUI
    accessFee: '0',
    derivativeRoyaltyBps: 500,
    policy: 2,
    isEncrypted: false,
    previewBlobIds: [],
    ...overrides,
  };
}

// A connected-and-signed wallet with a signer that succeeds by default.
function setConnected(opts: {
  address?: string;
  signAndExecuteResult?: unknown;
  objectChanges?: unknown[];
} = {}) {
  const address = opts.address ?? '0xBUYER';
  useSessionMock.mockReturnValue({ session: { address }, address });
  const signAndExecuteTransaction = vi.fn().mockResolvedValue(
    opts.signAndExecuteResult ?? {
      $kind: 'Transaction',
      Transaction: { digest: '0xDIGEST' },
    },
  );
  const signPersonalMessage = vi.fn().mockResolvedValue({ signature: 'sig' });
  useAppSignerMock.mockReturnValue({
    signer: { signAndExecuteTransaction, signPersonalMessage, toSuiAddress: () => address },
    loadError: null,
  });
  useSuiClientMock.mockReturnValue({
    waitForTransaction: vi.fn().mockResolvedValue(undefined),
    getTransactionBlock: vi.fn().mockResolvedValue({
      objectChanges: opts.objectChanges ?? [
        {
          type: 'created',
          objectType: '0xPKG::model3d::AccessEntitlement',
          objectId: '0xENT_NEW',
        },
      ],
    }),
    getObject: vi.fn(),
  });
  return { signAndExecuteTransaction, signPersonalMessage };
}

function setEntitlement(
  over: Partial<{ hasEntitlement: boolean; entitlementId?: string }> = {},
) {
  useDetailEntitlementMock.mockReturnValue({
    hasEntitlement: over.hasEntitlement ?? false,
    entitlementId: over.entitlementId,
    loading: false,
    error: null,
    reload: vi.fn(),
  });
}

beforeEach(() => {
  useModelByIdMock.mockReset();
  useDetailEntitlementMock.mockReset();
  useSuiClientMock.mockReset();
  useSessionMock.mockReset();
  useAppSignerMock.mockReset();
  buildPurchaseAccessPtbMock.mockReset();
  decryptViaEntitlementMock.mockReset();
  decryptViaCreatorMock.mockReset();

  // Defaults: not connected, no entitlement, builders return a tx envelope.
  useSessionMock.mockReturnValue({ session: null, address: null });
  useAppSignerMock.mockReturnValue({ signer: null, loadError: null });
  useSuiClientMock.mockReturnValue({});
  setEntitlement({ hasEntitlement: false });
  buildPurchaseAccessPtbMock.mockReturnValue({ tx: { __ptb: true }, handles: {}, metadata: {} });
  decryptViaEntitlementMock.mockResolvedValue({
    plaintext: new Uint8Array([1, 2, 3]),
    blobUrl: 'blob:decrypted-glb',
  });
  decryptViaCreatorMock.mockResolvedValue({
    plaintext: new Uint8Array([4, 5, 6]),
    blobUrl: 'blob:creator-glb',
  });
});

afterEach(() => {
  cleanup();
});

describe('ModelDetailPage', () => {
  it('renders PERMISSIONLESS content details + fork terms when loaded (regression)', () => {
    useModelByIdMock.mockReturnValue({ model: makeModel(), loading: false, error: null });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('model-name').textContent).toBe('Demo Chest');
    expect(screen.getByTestId('walrus-link').textContent).toMatch(/glb_demo/);
    expect(screen.getByTestId('preview-canvas-stub')).toBeTruthy();
    const terms = screen.getByTestId('fork-terms');
    expect(terms.textContent).toMatch(/0\.25 SUI/);
    expect(terms.textContent).toMatch(/5\.00%/);
    // No buy-access UI on a public base.
    expect(screen.queryByTestId('buy-access-cta')).toBeNull();
    expect(screen.queryByTestId('buy-access-connect')).toBeNull();
  });

  it('encrypted base: renders the preview still, NEVER feeds the ciphertext to Babylon (plan-026)', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ isEncrypted: true, policy: 1, glbBlobId: 'cipher-patch', previewBlobIds: ['prev-1'] }),
      loading: false,
      error: null,
    });
    renderAt('/model/0xENC');
    // Public preview still, NOT the 3D canvas (which hangs forever on ciphertext).
    expect(screen.getByTestId('detail-preview-still')).toBeTruthy();
    expect(screen.queryByTestId('preview-canvas-stub')).toBeNull();
    // The misleading "open the GLB" link is replaced with an honest encrypted note.
    expect(screen.getByTestId('encrypted-blob-note')).toBeTruthy();
    expect(screen.queryByTestId('walrus-link')).toBeNull();
  });

  it('encrypted RESTRICTED base with no preview still → placeholder, still no canvas', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ isEncrypted: true, policy: 0, glbBlobId: 'cipher', previewBlobIds: [] }),
      loading: false,
      error: null,
    });
    renderAt('/model/0xENC2');
    expect(screen.getByTestId('detail-encrypted-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('preview-canvas-stub')).toBeNull();
  });

  it('renders loading state', () => {
    useModelByIdMock.mockReturnValue({ model: null, loading: true, error: null });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('detail-loading')).toBeTruthy();
  });

  it('renders error state when load fails', () => {
    useModelByIdMock.mockReturnValue({ model: null, loading: false, error: new Error('boom') });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('detail-error')).toBeTruthy();
  });

  // --- U8 interaction-state table ---

  it('ALLOW_LIST not connected → "Connect wallet to buy access" prompt, no purchase CTA', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    // default beforeEach: not connected.
    renderAt('/model/0xENC');
    const prompt = screen.getByTestId('buy-access-connect');
    expect(prompt.textContent).toMatch(/Connect wallet to buy access/i);
    expect(screen.queryByTestId('buy-access-cta')).toBeNull();
  });

  it('ALLOW_LIST connected, no entitlement → "Buy access — {fee} SUI" CTA; click builds purchase PTB and transitions toward View', async () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected();
    setEntitlement({ hasEntitlement: false });
    renderAt('/model/0xENC');

    const cta = screen.getByTestId('buy-access-cta');
    // Fee rendered in SUI (mist→SUI at the display site): 0.5 SUI.
    expect(cta.textContent).toMatch(/Buy access — 0\.5 SUI/);

    fireEvent.click(cta);

    // Purchase PTB built with the model id + access fee in mist.
    await waitFor(() => expect(buildPurchaseAccessPtbMock).toHaveBeenCalledTimes(1));
    expect(buildPurchaseAccessPtbMock).toHaveBeenCalledWith({
      modelId: '0xMODEL',
      accessFeeMist: 500000000n,
    });
    // Purchase ok → reads objectChanges → decrypts → mounts the viewer.
    await waitFor(() => expect(decryptViaEntitlementMock).toHaveBeenCalledTimes(1));
    expect(decryptViaEntitlementMock.mock.calls[0]?.[0]).toMatchObject({
      entitlementId: '0xENT_NEW',
    });
    await waitFor(() => {
      const canvas = screen.getByTestId('preview-canvas-stub');
      expect(canvas.getAttribute('data-glb-url')).toBe('blob:decrypted-glb');
    });
  });

  it('ALLOW_LIST entitlement held → "View model" action; trigger calls decrypt + mounts viewer; NO download/export element in DOM (AE5)', async () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected();
    setEntitlement({ hasEntitlement: true, entitlementId: '0xENT_HELD' });
    renderAt('/model/0xENC');

    // Holder sees "View model", not "Buy access".
    expect(screen.queryByTestId('buy-access-cta')).toBeNull();
    const viewCta = screen.getByTestId('view-model-cta');
    fireEvent.click(viewCta);

    await waitFor(() => expect(decryptViaEntitlementMock).toHaveBeenCalledTimes(1));
    expect(decryptViaEntitlementMock.mock.calls[0]?.[0]).toMatchObject({
      entitlementId: '0xENT_HELD',
    });
    // Viewer mounts the decrypted blob.
    await waitFor(() => {
      const canvas = screen.getByTestId('preview-canvas-stub');
      expect(canvas.getAttribute('data-glb-url')).toBe('blob:decrypted-glb');
    });
    // Purchase NOT invoked for a holder.
    expect(buildPurchaseAccessPtbMock).not.toHaveBeenCalled();
    // AE5 — no download/export affordance exposing the plaintext blob URL.
    const downloadAnchors = Array.from(document.querySelectorAll('a[download], a[href^="blob:"]'));
    expect(downloadAnchors.length).toBe(0);
    // No walrus-link (that would expose the ciphertext blob), no export button.
    expect(screen.queryByTestId('walrus-link')).toBeNull();
    expect(screen.queryByText(/download/i)).toBeNull();
    expect(screen.queryByText(/export/i)).toBeNull();
  });

  it('RESTRICTED non-creator → no buy-access action (AE6)', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 0, isEncrypted: true, accessFee: '0', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected();
    setEntitlement({ hasEntitlement: false });
    renderAt('/model/0xRES');
    expect(screen.queryByTestId('buy-access-cta')).toBeNull();
    expect(screen.queryByTestId('buy-access-connect')).toBeNull();
    expect(screen.queryByTestId('view-model-cta')).toBeNull();
    expect(screen.getByTestId('restricted-note')).toBeTruthy();
  });

  it('PERMISSIONLESS → unchanged public render (regression)', () => {
    useModelByIdMock.mockReturnValue({ model: makeModel({ policy: 2 }), loading: false, error: null });
    setConnected();
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('preview-canvas-stub')).toBeTruthy();
    expect(screen.getByTestId('walrus-link')).toBeTruthy();
    expect(screen.getByTestId('fork-terms')).toBeTruthy();
    expect(screen.queryByTestId('buy-access-cta')).toBeNull();
    expect(screen.queryByTestId('access-terms')).toBeNull();
  });

  it('decrypt fails after purchase → "Retry decrypt" re-runs decrypt; purchase builder NOT re-invoked', async () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected();
    setEntitlement({ hasEntitlement: false });
    // First decrypt (post-purchase) throws; the retry succeeds.
    decryptViaEntitlementMock
      .mockRejectedValueOnce(new Error('key server denied'))
      .mockResolvedValueOnce({ plaintext: new Uint8Array(), blobUrl: 'blob:retry-ok' });

    renderAt('/model/0xENC');
    fireEvent.click(screen.getByTestId('buy-access-cta'));

    // Purchase happened once; first decrypt failed → distinct failure state.
    await waitFor(() => expect(screen.getByTestId('decrypt-failed')).toBeTruthy());
    expect(screen.getByTestId('decrypt-failed').textContent).toMatch(/Access confirmed — decryption failed/i);
    expect(buildPurchaseAccessPtbMock).toHaveBeenCalledTimes(1);
    expect(decryptViaEntitlementMock).toHaveBeenCalledTimes(1);

    // Retry decrypt re-runs decrypt ONLY.
    fireEvent.click(screen.getByTestId('retry-decrypt-cta'));
    await waitFor(() => expect(decryptViaEntitlementMock).toHaveBeenCalledTimes(2));
    // CRITICAL (idempotent view): purchase builder NOT re-invoked.
    expect(buildPurchaseAccessPtbMock).toHaveBeenCalledTimes(1);
    // Retry mounted the viewer.
    await waitFor(() => {
      const canvas = screen.getByTestId('preview-canvas-stub');
      expect(canvas.getAttribute('data-glb-url')).toBe('blob:retry-ok');
    });
  });

  it('purchase failed → error message + re-enabled Buy access CTA (no auto-decrypt)', async () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected({
      signAndExecuteResult: {
        $kind: 'FailedTransaction',
        FailedTransaction: { digest: '0xBAD', status: { error: { message: 'insufficient fee' } } },
      },
    });
    setEntitlement({ hasEntitlement: false });
    renderAt('/model/0xENC');

    fireEvent.click(screen.getByTestId('buy-access-cta'));
    await waitFor(() => expect(screen.getByTestId('buy-access-error')).toBeTruthy());
    expect(screen.getByTestId('buy-access-error').textContent).toMatch(/insufficient fee/i);
    // CTA still present + re-enabled.
    const cta = screen.getByTestId('buy-access-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    // Never reached the decrypt.
    expect(decryptViaEntitlementMock).not.toHaveBeenCalled();
  });

  // --- Creator-gate view (creator decrypts their OWN encrypted model, free) ---

  const CREATOR_ADDR = '0xCAFECAFECAFECAFECAFECAFE'; // == makeModel().creator

  it('ALLOW_LIST viewer IS creator → NO buy-access CTA; "View" decrypts via creator gate (never purchases)', async () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected({ address: CREATOR_ADDR });
    setEntitlement({ hasEntitlement: false });
    renderAt('/model/0xENC');

    // Creator never sees a buy-access CTA or connect-to-buy prompt.
    expect(screen.queryByTestId('buy-access-cta')).toBeNull();
    expect(screen.queryByTestId('buy-access-connect')).toBeNull();
    expect(screen.getByTestId('creator-note')).toBeTruthy();

    const viewCta = screen.getByTestId('view-model-cta');
    fireEvent.click(viewCta);

    // Decrypts via the CREATOR gate, NOT the entitlement gate.
    await waitFor(() => expect(decryptViaCreatorMock).toHaveBeenCalledTimes(1));
    expect(decryptViaCreatorMock.mock.calls[0]?.[0]).toMatchObject({ address: CREATOR_ADDR });
    expect(decryptViaEntitlementMock).not.toHaveBeenCalled();
    // The purchase builder is NEVER invoked for the creator.
    expect(buildPurchaseAccessPtbMock).not.toHaveBeenCalled();

    // Viewer mounts the decrypted creator blob.
    await waitFor(() => {
      const canvas = screen.getByTestId('preview-canvas-stub');
      expect(canvas.getAttribute('data-glb-url')).toBe('blob:creator-glb');
    });
    // No download/export affordance for the plaintext.
    const downloadAnchors = Array.from(document.querySelectorAll('a[download], a[href^="blob:"]'));
    expect(downloadAnchors.length).toBe(0);
  });

  it('ALLOW_LIST viewer NOT creator, no entitlement → buy-access CTA still shows (regression)', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected({ address: '0xNOTCREATOR' });
    setEntitlement({ hasEntitlement: false });
    renderAt('/model/0xENC');
    expect(screen.getByTestId('buy-access-cta')).toBeTruthy();
    expect(screen.queryByTestId('creator-note')).toBeNull();
  });

  it('RESTRICTED viewer IS creator → can view via creator gate; no buy action, no restricted-note', async () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 0, isEncrypted: true, accessFee: '0', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected({ address: CREATOR_ADDR });
    setEntitlement({ hasEntitlement: false });
    renderAt('/model/0xRES');

    expect(screen.queryByTestId('buy-access-cta')).toBeNull();
    // The "only the creator can decrypt" note is for non-creators; gone here.
    expect(screen.queryByTestId('restricted-note')).toBeNull();

    fireEvent.click(screen.getByTestId('view-model-cta'));
    await waitFor(() => expect(decryptViaCreatorMock).toHaveBeenCalledTimes(1));
    expect(buildPurchaseAccessPtbMock).not.toHaveBeenCalled();
    await waitFor(() => {
      const canvas = screen.getByTestId('preview-canvas-stub');
      expect(canvas.getAttribute('data-glb-url')).toBe('blob:creator-glb');
    });
  });

  it('creator decrypt fails → "Retry decrypt" re-runs creator decrypt, never purchases', async () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ policy: 1, isEncrypted: true, accessFee: '500000000', previewBlobIds: ['p'] }),
      loading: false,
      error: null,
    });
    setConnected({ address: CREATOR_ADDR });
    setEntitlement({ hasEntitlement: false });
    decryptViaCreatorMock
      .mockRejectedValueOnce(new Error('key server denied'))
      .mockResolvedValueOnce({ plaintext: new Uint8Array(), blobUrl: 'blob:creator-retry' });

    renderAt('/model/0xENC');
    fireEvent.click(screen.getByTestId('view-model-cta'));

    await waitFor(() => expect(screen.getByTestId('decrypt-failed')).toBeTruthy());
    expect(decryptViaCreatorMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('retry-decrypt-cta'));
    await waitFor(() => expect(decryptViaCreatorMock).toHaveBeenCalledTimes(2));
    // Never purchases, never routes through the entitlement gate.
    expect(buildPurchaseAccessPtbMock).not.toHaveBeenCalled();
    expect(decryptViaEntitlementMock).not.toHaveBeenCalled();
    await waitFor(() => {
      const canvas = screen.getByTestId('preview-canvas-stub');
      expect(canvas.getAttribute('data-glb-url')).toBe('blob:creator-retry');
    });
  });
});

// plan 2026-06-08-001 U2 — description block + viewer caption (R2,R3,R5,R6).
describe('ModelDetailPage — description surfacing', () => {
  it('AE1: Tripo model shows a "Prompt"-labeled block with the prompt text', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ paramsJson: JSON.stringify({ prompt: 'a low-poly red sports car' }) }),
      loading: false,
      error: null,
    });
    renderAt('/model/0xMODEL');
    const block = screen.getByTestId('model-description');
    expect(block.getAttribute('data-kind')).toBe('prompt');
    expect(block.textContent).toMatch(/Prompt:/);
    expect(screen.getByTestId('model-description-text').textContent).toBe('a low-poly red sports car');
  });

  it('AE2/R2: captioned upload shows a neutral "Description"-labeled block (not "AI description" — the caption may be hand-typed)', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({
        shapeType: 'box',
        paramsJson: JSON.stringify({ source: 'upload', caption: 'a chunky walrus' }),
      }),
      loading: false,
      error: null,
    });
    renderAt('/model/0xMODEL');
    const block = screen.getByTestId('model-description');
    expect(block.getAttribute('data-kind')).toBe('caption');
    expect(block.textContent).toMatch(/Description:/);
    expect(block.textContent).not.toMatch(/AI description/);
    expect(screen.getByTestId('model-description-text').textContent).toBe('a chunky walrus');
  });

  it('AE3/R6: uncaptioned upload renders no description block and no viewer caption', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ shapeType: 'box', paramsJson: JSON.stringify({ source: 'upload' }) }),
      loading: false,
      error: null,
    });
    renderAt('/model/0xMODEL');
    expect(screen.queryByTestId('model-description')).toBeNull();
    expect(screen.queryByTestId('viewer-caption')).toBeNull();
  });

  it('R5: the viewer caption renders the same description text alongside the canvas', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ paramsJson: JSON.stringify({ prompt: 'a low-poly red sports car' }) }),
      loading: false,
      error: null,
    });
    renderAt('/model/0xMODEL');
    const caption = screen.getByTestId('viewer-caption');
    expect(caption.textContent).toMatch(/a low-poly red sports car/);
  });

  it('keeps the raw "Params (json)" expander (demoted, not removed)', () => {
    useModelByIdMock.mockReturnValue({
      model: makeModel({ paramsJson: JSON.stringify({ prompt: 'a prompt' }) }),
      loading: false,
      error: null,
    });
    renderAt('/model/0xMODEL');
    expect(screen.getByText('Params (json)')).toBeTruthy();
  });
});
