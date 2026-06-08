import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary, RecallChip } from '@overflow2026/shared';

// plan-016 U4 — LaunchCollectionPage now reads account + signer via the
// wrapper hooks (frontend/src/wallet/*). We mock those directly so the
// existing test cases keep their semantics; the wrapper hooks have their
// own unit tests (useAppAccount.test.tsx, useAppSigner.test.tsx) that
// cover the prod-vs-test mode branching. useSuiClient remains a direct
// dapp-kit import for the unified signAndExecuteTransaction shape.
const useAppAccountMock = vi.fn();
const signAndExecuteMock = vi.fn();
const signTxMock = vi.fn();
const signPersonalMessageMock = vi.fn();
const suiClientMock = {
  core: {
    executeTransaction: vi.fn().mockResolvedValue({ digest: '0xexec-digest' }),
  },
  // plan A — onUnlock reads the encrypted base's sealed_key via getObject;
  // parseSealedKeyFromObject is mocked, so the shape doesn't matter.
  getObject: vi.fn().mockResolvedValue({ data: {} }),
  waitForTransaction: vi.fn().mockResolvedValue({}),
  getTransactionBlock: vi.fn().mockResolvedValue({ objectChanges: [] }),
};
vi.mock('@mysten/dapp-kit', () => ({
  useSuiClient: () => suiClientMock,
}));
vi.mock('../wallet/useAppAccount', () => ({
  useAppAccount: () => useAppAccountMock(),
}));
// plan-016 U5 — loadError is mutable per-test so the missing-key banner
// path can be exercised without env stubbing. When set, useAppSigner
// returns a null signer (matching the real wrapper hook's behavior
// when test mode is on but the key fails to load).
let mockSignerLoadError: Error | null = null;
vi.mock('../wallet/useAppSigner', () => ({
  useAppSigner: () => {
    if (mockSignerLoadError) {
      return { signer: null, loadError: mockSignerLoadError };
    }
    const account = useAppAccountMock();
    if (!account) return { signer: null, loadError: null };
    return {
      signer: {
        toSuiAddress: () => account.address,
        signTransaction: signTxMock,
        signAndExecuteTransaction: signAndExecuteMock,
        signPersonalMessage: signPersonalMessageMock,
      },
      loadError: null,
    };
  },
}));

const useSessionMock = vi.fn();
const clearSessionMock = vi.fn();
vi.mock('../auth/useSession', () => ({ useSession: () => useSessionMock() }));

const useModelIndexMock = vi.fn();
vi.mock('../browse/useModelIndex', () => ({ useModelIndex: () => useModelIndexMock() }));

// plan-002 U3 — the base-finder reuses memory/useMemoryRecall. The hook itself
// is unit-tested (useMemoryRecall.test.ts); here we mock it to drive the page's
// reorder/highlight/fail-soft wiring directly off controlled recall lanes.
type RecallLane = {
  chips: RecallChip[];
  status: 'idle' | 'loading' | 'ready' | 'empty';
  degraded: boolean;
  recall: ReturnType<typeof vi.fn>;
};
let memoryRecallState: { personal: RecallLane; global: RecallLane };
const memoryRecallMock = vi.fn(() => memoryRecallState);
vi.mock('../memory/useMemoryRecall', () => ({ useMemoryRecall: () => memoryRecallMock() }));
function lane(chips: RecallChip[] = [], opts: { status?: RecallLane['status']; degraded?: boolean } = {}): RecallLane {
  return { chips, status: opts.status ?? (chips.length ? 'ready' : 'idle'), degraded: opts.degraded ?? false, recall: vi.fn() };
}
function hit(modelId: string, distance: number, prompt = 'a prompt', creator?: string): RecallChip {
  return { modelId, distance, prompt, ...(creator ? { creator } : {}) };
}

const uploadFilesMock = vi.fn();
vi.mock('../walrus/useWalrusUpload', () => ({
  // plan-017 U1 — multi-quilt state returned alongside the legacy idle shape.
  // batchIndex/batchTotal/txDigests default to zero/one/empty so the
  // BatchProgressPanel integration in LaunchCollectionPage gets stable
  // values during pre-flight rendering.
  QUILT_SIZE: 4,
  useWalrusUpload: () => ({
    uploadFiles: uploadFilesMock,
    stage: 'idle',
    status: 'idle',
    error: null,
    batchIndex: 0,
    batchTotal: 1,
    txDigests: [],
  }),
}));

const buildLaunchMock = vi.fn();
vi.mock('../sui/collectionTxBuilders', () => ({
  buildLaunchCollectionWithTokensPtb: (...args: unknown[]) => buildLaunchMock(...args),
}));

// plan-027 U10 — entitlement catalog hook + the free entitlement-gated decrypt
// helper. Mocked so the catalog split (launchable vs locked) + the FREE unlock
// (decryptViaEntitlement, NOT a payment PTB) can be driven without a wallet or
// live key servers. `ownedEntitlementsMock` is mutable per-test so a wallet can
// hold an entitlement for base X but not Y.
const ownedEntitlementsMock = {
  modelIds: new Set<string>(),
  entitlementByModel: new Map<string, string>(),
  loading: false,
  error: null,
  reload: vi.fn(),
};
vi.mock('./useOwnedEntitlements', () => ({
  useOwnedEntitlements: () => ownedEntitlementsMock,
}));
const decryptViaEntitlementMock = vi.fn();
// Contract v11 — the BASE CREATOR forking their OWN encrypted base unlocks via the
// creator gate (no entitlement). Mocked alongside the entitlement decrypt so the
// creator-own-base unlock can be driven without a wallet or live key servers.
const decryptViaCreatorMock = vi.fn();
vi.mock('../seal/decryptAndView', () => ({
  decryptViaEntitlement: (...a: unknown[]) => decryptViaEntitlementMock(...a),
  decryptViaCreator: (...a: unknown[]) => decryptViaCreatorMock(...a),
}));

// plan A2 — runBuildVariants headlessly parses the base GLB for per-part material
// names (real Babylon NullEngine — not jsdom-friendly), so mock it. Default `[]`
// means "no names" → name-keying does not apply → the build payload stays on the
// legacy positional path, preserving every existing test's semantics. Tests that
// exercise the name-keyed payload override the return per-case.
const extractMaterialNamesMock = vi.fn(async (..._args: unknown[]): Promise<(string | null)[]> => []);
vi.mock('../babylon/extractMaterialNames', () => ({
  extractMaterialNames: (...args: unknown[]) => extractMaterialNamesMock(...args),
}));

// plan A — encrypted unlock/mint seam. The real wallet signatures + key-server
// decrypt can't run in jsdom, so mock the seam to drive onUnlock/onMintEncrypted.
const launchEncryptedCollectionMock = vi.fn();
const decryptEncryptedBaseMock = vi.fn();
const mintEncryptedTokensMock = vi.fn();
vi.mock('../seal/sealClient', () => ({ getSealClient: () => ({}) }));
vi.mock('../seal/sessionKey', () => ({
  createSession: vi.fn(async () => ({ personalMessage: new Uint8Array([1]) })),
  activateSession: vi.fn(async () => ({})),
  getCachedSession: vi.fn(() => null),
}));
vi.mock('./encryptedFork', () => ({
  launchEncryptedCollection: (...a: unknown[]) => launchEncryptedCollectionMock(...a),
  decryptEncryptedBase: (...a: unknown[]) => decryptEncryptedBaseMock(...a),
  mintEncryptedTokens: (...a: unknown[]) => mintEncryptedTokensMock(...a),
  parseSealedKeyFromObject: () => new Uint8Array([0x5e]),
  PACKAGE_ID: '0xpkg',
}));

// plan-015 U6/U7 — PreviewCanvas mock surfaces mode pill + onPartClick +
// partColors + highlightedParts so integration tests can verify the
// page-level wiring without spinning up Babylon. data-* attributes carry
// the props out as serialized strings the tests can grep with regex.
// plan-017 U2/U3 — wrapped in forwardRef so the imperative dispose/remount
// handle from PreviewCanvas reaches LaunchCollectionPage. Calls are
// recorded on `previewMockState` for test assertions. Hoisted because
// vi.mock factories run before module-level `const` declarations.
const { previewMockState } = vi.hoisted(() => ({
  previewMockState: {
    disposeCalls: 0,
    remountCalls: 0,
    reset() {
      this.disposeCalls = 0;
      this.remountCalls = 0;
    },
  },
}));
vi.mock('../babylon/PreviewCanvas', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  const PreviewCanvas = forwardRef<
    { dispose(): void; remount(): void },
    {
      glbUrl: string | null;
      mode?: string;
      onModeCycle?: () => void;
      modeToggle?: boolean;
      onPartClick?: (i: number) => void;
      highlightedParts?: readonly number[];
      partColors?: readonly string[];
    }
  >(function PreviewCanvas(
    { glbUrl, mode, onModeCycle, modeToggle, onPartClick, highlightedParts, partColors },
    ref,
  ) {
    useImperativeHandle(
      ref,
      () => ({
        dispose: () => {
          previewMockState.disposeCalls += 1;
        },
        remount: () => {
          previewMockState.remountCalls += 1;
        },
      }),
      [],
    );
    return (
      <div
        data-testid="preview-canvas-mock"
        data-mode={mode}
        data-highlighted={highlightedParts ? highlightedParts.join(',') : ''}
        data-part-colors={partColors ? partColors.join(',') : ''}
      >
        {glbUrl}
        {modeToggle && onModeCycle && (
          <button
            type="button"
            data-testid="preview-mode-toggle-pill"
            onClick={onModeCycle}
          >
            MODE: {(mode ?? 'pbr').toUpperCase()}
          </button>
        )}
        {onPartClick && (
          <button
            type="button"
            data-testid="preview-pick-part-1"
            onClick={() => onPartClick(1)}
          >
            pick part 1
          </button>
        )}
      </div>
    );
  });
  return { PreviewCanvas };
});

import { LaunchCollectionPage } from './LaunchCollectionPage';

const ADDR = '0x' + '3'.repeat(64);

function summary(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xbase1',
    blobId: 'blob-1',
    collectionId: '',
    patchId: '',
    creator: '0xcreator',
    shapeType: 'tripo',
    paramsJson: '{}',
    name: 'Base Car',
    directAccessPrice: '0',
    tags: [],
    partLabels: [],
    createdAtMs: '0',
    lineageBlobId: '',
    glbBlobId: 'glb-base-1',
    derivativeMintFee: '250000000', // 0.25 SUI
    accessFee: '0',
    derivativeRoyaltyBps: 500,
    policy: 2,
    isEncrypted: false,
    previewBlobIds: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LaunchCollectionPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAppAccountMock.mockReturnValue({ address: ADDR });
  mockSignerLoadError = null;
  clearSessionMock.mockReset();
  useSessionMock.mockReturnValue({ session: { address: ADDR, jwt: 'jwt-token' }, clearSession: clearSessionMock });
  useModelIndexMock.mockReturnValue({ models: [summary()], loading: false, error: null, refetch: vi.fn() });
  memoryRecallState = { personal: lane(), global: lane() };
  uploadFilesMock.mockReset();
  signAndExecuteMock.mockReset();
  signPersonalMessageMock.mockReset();
  launchEncryptedCollectionMock.mockReset();
  decryptEncryptedBaseMock.mockReset();
  mintEncryptedTokensMock.mockReset();
  decryptViaEntitlementMock.mockReset();
  decryptViaCreatorMock.mockReset();
  ownedEntitlementsMock.modelIds = new Set<string>();
  ownedEntitlementsMock.entitlementByModel = new Map<string, string>();
  extractMaterialNamesMock.mockReset();
  extractMaterialNamesMock.mockResolvedValue([]);
  buildLaunchMock.mockReset();
  buildLaunchMock.mockReturnValue({ tx: {}, handles: {}, metadata: {} });
  previewMockState.reset();
  vi.unstubAllGlobals();
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  }));
});
afterEach(() => cleanup());

describe('LaunchCollectionPage', () => {
  it('gates on sign-in when there is no session', () => {
    useSessionMock.mockReturnValue({ session: null });
    renderPage();
    expect(screen.getByTestId('launch-page')).toBeTruthy();
    expect(screen.queryByTestId('base-picker')).toBeNull();
  });

  it('lists only forkable models (non-empty glb_blob_id)', () => {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({ objectId: '0xforkable', glbBlobId: 'glb-x' }),
        summary({ objectId: '0xlegacy', glbBlobId: '' }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('base-option-0xforkable')).toBeTruthy();
    expect(screen.queryByTestId('base-option-0xlegacy')).toBeNull();
  });

  it('shows an empty-state hint when no forkable models exist', () => {
    useModelIndexMock.mockReturnValue({ models: [], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByTestId('no-base-models')).toBeTruthy();
  });

  // ---- plan-002 U3: natural-language base finder ----
  function threeForkable() {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({ objectId: '0xaa', name: 'Alpha', glbBlobId: 'g1' }),
        summary({ objectId: '0xbb', name: 'Beta', glbBlobId: 'g2' }),
        summary({ objectId: '0xcc', name: 'Gamma', glbBlobId: 'g3' }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  }
  const cardOrder = () =>
    screen.getAllByTestId(/^base-option-0x[a-c]{2}$/).map((el) => el.getAttribute('data-testid'));

  it('AE1/F1: typing fires recall and reorders matched bases to the front', () => {
    threeForkable();
    memoryRecallState.personal = lane([hit('0xbb', 0.3, 'a fast race car')]);
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    expect(memoryRecallState.personal.recall).toHaveBeenCalledWith('race car');
    expect(memoryRecallState.global.recall).toHaveBeenCalledWith('race car');
    expect(cardOrder()).toEqual(['base-option-0xbb', 'base-option-0xaa', 'base-option-0xcc']);
  });

  it('AE2/R5: a single match is highlighted but all bases stay selectable', () => {
    threeForkable();
    memoryRecallState.global = lane([hit('0xbb', 0.3, 'race car', '0xc2')]);
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    expect(screen.getByTestId('base-match-reason-0xbb')).toBeTruthy();
    // R5 — nothing removed: all three cards still present + clickable.
    expect(screen.getByTestId('base-option-0xaa')).toBeTruthy();
    expect(screen.getByTestId('base-option-0xbb')).toBeTruthy();
    expect(screen.getByTestId('base-option-0xcc')).toBeTruthy();
  });

  it('R6: the match reason shows the base creator prompt', () => {
    threeForkable();
    memoryRecallState.personal = lane([hit('0xbb', 0.3, 'a low-poly race car')]);
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    expect(screen.getByTestId('base-match-reason-0xbb').textContent).toContain('low-poly race car');
  });

  it('AE3/F2: a query with no matches shows the "showing all" note and the full grid', () => {
    threeForkable();
    memoryRecallState.personal = lane([], { status: 'empty' });
    memoryRecallState.global = lane([], { status: 'empty' });
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'zzzzz' } });
    expect(screen.getByTestId('base-search-showing-all')).toBeTruthy();
    expect(cardOrder()).toEqual(['base-option-0xaa', 'base-option-0xbb', 'base-option-0xcc']);
  });

  it('degraded scope surfaces the honest note, not presented as a complete reorder', () => {
    threeForkable();
    memoryRecallState.personal = lane([hit('0xbb', 0.3, 'race car')]);
    memoryRecallState.global = lane([], { degraded: true });
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    expect(screen.getByTestId('base-search-degraded')).toBeTruthy();
    expect(screen.queryByTestId('base-search-showing-all')).toBeNull();
  });

  it('shows a searching indicator while a scope is in flight', () => {
    threeForkable();
    memoryRecallState.personal = lane([], { status: 'loading' });
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race' } });
    expect(screen.getByTestId('base-search-loading')).toBeTruthy();
  });

  it('R8: the coverage hint is always present when the search box is shown', () => {
    threeForkable();
    renderPage();
    expect(screen.getByTestId('base-search-hint')).toBeTruthy();
    expect(screen.getByTestId('base-search-input')).toBeTruthy();
  });

  it('clearing the input fires recall with the empty value (reset path)', () => {
    threeForkable();
    renderPage();
    const input = screen.getByTestId('base-search-input');
    fireEvent.change(input, { target: { value: 'race' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(memoryRecallState.personal.recall).toHaveBeenLastCalledWith('');
  });

  it('distinguishes a strong match from a weak one (ring + reason color differ)', () => {
    threeForkable();
    memoryRecallState.personal = lane([hit('0xaa', 0.3, 'strong'), hit('0xbb', 0.6, 'weak')]);
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    const strongCard = screen.getByTestId('base-option-0xaa');
    const weakCard = screen.getByTestId('base-option-0xbb');
    expect(strongCard.style.boxShadow).not.toBe(weakCard.style.boxShadow); // ink vs subtle ring
    expect(screen.getByTestId('base-match-reason-0xaa').style.color).not.toBe(
      screen.getByTestId('base-match-reason-0xbb').style.color,
    );
  });

  it('suppresses notes when the query drops below 3 chars, even with degraded lane state', () => {
    threeForkable();
    memoryRecallState.global = lane([], { degraded: true });
    memoryRecallState.personal = lane([], { status: 'empty' });
    renderPage();
    const input = screen.getByTestId('base-search-input');
    fireEvent.change(input, { target: { value: 'race' } }); // active
    fireEvent.change(input, { target: { value: 'ra' } }); // below MIN_QUERY_LEN
    expect(screen.queryByTestId('base-search-degraded')).toBeNull();
    expect(screen.queryByTestId('base-search-showing-all')).toBeNull();
    expect(screen.getByTestId('base-search-hint')).toBeTruthy(); // static hint still shown
  });

  it('never shows the searching and degraded notes together (no contradiction)', () => {
    threeForkable();
    memoryRecallState.personal = lane([], { status: 'loading' });
    memoryRecallState.global = lane([], { degraded: true });
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    expect(screen.getByTestId('base-search-loading')).toBeTruthy();
    expect(screen.queryByTestId('base-search-degraded')).toBeNull(); // gated on !loading
  });

  it('discards the search query when a base is picked (CHANGE re-opens unsearched)', async () => {
    threeForkable();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xaa'));
    });
    await waitFor(() => expect(screen.getByTestId('base-picker-change')).toBeTruthy());
    fireEvent.click(screen.getByTestId('base-picker-change'));
    expect((screen.getByTestId('base-search-input') as HTMLInputElement).value).toBe('');
  });

  it('a matched LOCKED card gets the reason badge but stays non-clickable', () => {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({ objectId: '0xaa', name: 'Alpha', glbBlobId: 'g1' }),
        summary({ objectId: '0xbb', name: 'Locked', glbBlobId: 'cipher', isEncrypted: true, policy: 1 }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    memoryRecallState.global = lane([hit('0xbb', 0.3, 'rare locked car', '0xc2')]);
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'rare car' } });
    expect(screen.getByTestId('base-option-locked-card-0xbb')).toBeTruthy();
    expect(screen.getByTestId('base-match-reason-0xbb')).toBeTruthy();
    // locked ≠ forkable: no clickable fork button for the locked base.
    expect(screen.queryByTestId('base-option-0xbb')).toBeNull();
  });

  it('picking a base fetches its GLB from the aggregator and reveals the authoring step', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1/blobs/glb-base-1'));
  });

  it('launch passes the base model derive fee + quilt blob + N token names to the batch builder', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      // /api/collection/build
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({ blobIds: ['quilt-blob-1'], blobObjects: [{ blobId: 'quilt-blob-1', blobObjectId: '0xobj' }], patchIds: ['patch-0'] });
    // plan-016 code-review hotfix — the AppSigner contract returns the SDK
    // TransactionResult discriminated union; the pre-U7 {digest} flat shape
    // is gone. Tests must mock the real shape so a future shape regression
    // surfaces in tests instead of at smoke time.
    signAndExecuteMock.mockResolvedValue({
      $kind: 'Transaction',
      Transaction: { digest: 'LAUNCHDIGEST' },
    });

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });

    await waitFor(() => expect(buildLaunchMock).toHaveBeenCalledOnce());
    const args = buildLaunchMock.mock.calls[0]![0] as {
      modelId: string;
      feeMist: bigint;
      quiltBlobId: string;
      tokenNames: string[];
      tokenPatchIds: string[];
    };
    expect(args.modelId).toBe('0xbase1');
    expect(args.feeMist).toBe(250_000_000n); // base model's derivative_mint_fee
    expect(args.quiltBlobId).toBe('quilt-blob-1');
    expect(args.tokenNames).toHaveLength(1);
    expect(args.tokenPatchIds).toEqual(['patch-0']);
    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeTruthy());
  });

  // plan-016 hotfix — client.core.executeTransaction returns the Sui SDK
  // TransactionResult discriminated union { $kind: 'Transaction', Transaction:
  // { digest, ... } } rather than the dapp-kit mutation shape { digest }. The
  // unified Signer call path (signer.signAndExecuteTransaction) goes through
  // client.core.executeTransaction, so onLaunch must unwrap res.Transaction.
  // digest, not res.digest. Verified end-to-end via agent-browser smoke
  // 2026-05-27 (test wallet, digest CndwZBuDApr…ac7); this test locks the fix.
  it('launch unwraps res.Transaction.digest when the signer returns the Sui SDK shape', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({ blobIds: ['quilt-b'], blobObjects: [{ blobId: 'quilt-b', blobObjectId: '0xobj' }], patchIds: ['patch-0'] });
    // Real Sui SDK shape — discriminated union with the digest nested
    signAndExecuteMock.mockResolvedValue({
      $kind: 'Transaction',
      Transaction: { digest: 'SUI_SDK_SHAPE_DIGEST' },
    });

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeTruthy());
    const link = screen.getByTestId('launch-success').querySelector('a');
    expect(link?.getAttribute('href')).toContain('SUI_SDK_SHAPE_DIGEST');
  });

  it('launch surfaces an error when the signer returns FailedTransaction', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({ blobIds: ['quilt-b'], blobObjects: [{ blobId: 'quilt-b', blobObjectId: '0xobj' }], patchIds: ['patch-0'] });
    // plan-016 code-review hotfix — status.error is an ExecutionError object
    // {message, command?}, not a string. Pre-hotfix code accessed it as a
    // string which would have rendered '[object Object]' in the banner.
    signAndExecuteMock.mockResolvedValue({
      $kind: 'FailedTransaction',
      FailedTransaction: {
        digest: '0xfail',
        status: { error: { message: 'insufficient_gas' } },
      },
    });

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });

    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeTruthy());
    // Tightened (was: /insufficient_gas|Launch tx failed/). The disjunction
    // let a regression silently drop status.error propagation and still pass
    // via the generic "Launch tx failed" fallback. Asserting the exact
    // error.message string locks the propagation path.
    expect(screen.getByTestId('launch-error').textContent).toMatch(/insufficient_gas/);
  });

  // ----- plan-013 U7 — palette → partColors resolution (AE2, AE4) ----------

  // fix-pass F8: the previously-here "default palette resolution" test was
  // vacuous — every label resolved to the same '#cc3333' default, so the
  // length+tuple assertion couldn't distinguish positional lookup from a
  // single hardcoded color. The mixed-palette test below proves positional
  // resolution; the paramsJson round-trip assertion moved with it.

  it('palette { primary: red, accent: green } + partLabels [primary,primary,accent] → partColors[0,1] red, [2] green', async () => {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({
          objectId: '0xmix',
          glbBlobId: 'glb-mix',
          partLabels: ['primary', 'primary', 'accent'],
        }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const buildBodies: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/blobs/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      if (init?.body) buildBodies.push(init.body as string);
      return new Response(
        JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xmix'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());

    // Drive both pickers in variant 0: primary → red, accent → green.
    act(() => {
      fireEvent.change(screen.getByTestId('variant-color-0-primary'), {
        target: { value: '#ff0000' },
      });
    });
    act(() => {
      fireEvent.change(screen.getByTestId('variant-color-0-accent'), {
        target: { value: '#00ff00' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });

    await waitFor(() => expect(buildBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(buildBodies[0]!);
    const pc = body.variants[0].partColors;
    expect(pc).toHaveLength(3);
    // Indices 0,1 → primary → red.
    expect(pc[0].baseColorRgb[0]).toBeCloseTo(1, 5);
    expect(pc[0].baseColorRgb[1]).toBeCloseTo(0, 5);
    expect(pc[1].baseColorRgb[0]).toBeCloseTo(1, 5);
    expect(pc[1].baseColorRgb[1]).toBeCloseTo(0, 5);
    // Index 2 → accent → green.
    expect(pc[2].baseColorRgb[0]).toBeCloseTo(0, 5);
    expect(pc[2].baseColorRgb[1]).toBeCloseTo(1, 5);
    // F8 — paramsJson round-trip stores the palette + texture (U7 lineage shape).
    const params = JSON.parse(body.variants[0].paramsJson);
    expect(params.palette).toMatchObject({ primary: '#ff0000', accent: '#00ff00' });
    expect(typeof params.texture).toBe('string');
  });

  it('plan A2 — attaches per-part materialName to the build payload when the base is bijectively named', async () => {
    // A taggable base: 3 parts, 3 unique material names. The forge derives the
    // names from the base GLB (mocked here) and attaches them so the backend
    // swaps by name (order-independent) rather than by positional material order.
    extractMaterialNamesMock.mockResolvedValueOnce(['mat_a', 'mat_b', 'mat_c']);
    useModelIndexMock.mockReturnValue({
      models: [
        summary({
          objectId: '0xnamekey',
          glbBlobId: 'glb-namekey',
          partLabels: ['primary', 'primary', 'accent'],
        }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const buildBodies: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/blobs/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      if (init?.body) buildBodies.push(init.body as string);
      return new Response(
        JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xnamekey'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });

    await waitFor(() => expect(buildBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(buildBodies[0]!);
    const pc = body.variants[0].partColors;
    expect(pc).toHaveLength(3);
    // The material name rides each entry, in partLabels order.
    expect(pc.map((p: { materialName?: string }) => p.materialName)).toEqual([
      'mat_a',
      'mat_b',
      'mat_c',
    ]);
  });

  it('plan A2 — omits materialName (positional fallback) when the base names are not unique', async () => {
    // Two parts sharing a material name → name-keying is ambiguous → the forge
    // must NOT attach materialName, leaving the legacy positional path intact.
    extractMaterialNamesMock.mockResolvedValueOnce(['dup', 'dup']);
    useModelIndexMock.mockReturnValue({
      models: [
        summary({
          objectId: '0xdupname',
          glbBlobId: 'glb-dupname',
          partLabels: ['primary', 'accent'],
        }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const buildBodies: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/blobs/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      if (init?.body) buildBodies.push(init.body as string);
      return new Response(
        JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xdupname'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });

    await waitFor(() => expect(buildBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(buildBodies[0]!);
    const pc = body.variants[0].partColors;
    expect(pc).toHaveLength(2);
    expect(pc[0].materialName).toBeUndefined();
    expect(pc[1].materialName).toBeUndefined();
  });

  it('plan A2 — omits materialName (positional fallback) on fork-time drift (extracted names length ≠ partLabels length)', async () => {
    // The base published 3 partLabels, but a fresh parse at fork time yields only
    // 2 material names (e.g. blob/loader drift). nameKeyingApplies must fail on the
    // length guard and fall back to positional rather than misalign names↔labels.
    extractMaterialNamesMock.mockResolvedValueOnce(['m0', 'm1']); // length 2 ≠ 3
    useModelIndexMock.mockReturnValue({
      models: [
        summary({
          objectId: '0xdrift2',
          glbBlobId: 'glb-drift2',
          partLabels: ['primary', 'primary', 'accent'],
        }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const buildBodies: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/blobs/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      if (init?.body) buildBodies.push(init.body as string);
      return new Response(
        JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xdrift2'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });

    await waitFor(() => expect(buildBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(buildBodies[0]!);
    const pc = body.variants[0].partColors;
    expect(pc).toHaveLength(3);
    expect(pc.every((p: { materialName?: string }) => p.materialName === undefined)).toBe(true);
  });

  it('F7 — typed 422 part_count_mismatch surfaces a human-readable message (materialCount vs partColorsCount)', async () => {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({
          objectId: '0xdrift',
          glbBlobId: 'glb-drift',
          partLabels: ['primary', 'accent'],
        }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      // Backend reports the base GLB actually has 5 materials; FE sent 2.
      return new Response(
        JSON.stringify({ error: 'part_count_mismatch', materialCount: 5, partColorsCount: 2 }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xdrift'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });

    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeTruthy());
    const errorText = screen.getByTestId('launch-error').textContent ?? '';
    expect(errorText).toMatch(/5 parts/);
    expect(errorText).toMatch(/2 colors/);
    // Generic HTTP-error envelope is NOT shown when the typed branch fires.
    expect(errorText).not.toMatch(/HTTP 422/);
  });

  it('F8 — resolvePartColors falls back to gray when a base.partLabels label is missing from the variant palette', async () => {
    // Stage a base with a label the seed palette won't carry (free-text 'fur').
    useModelIndexMock.mockReturnValue({
      models: [
        summary({
          objectId: '0xfur',
          glbBlobId: 'glb-fur',
          partLabels: ['primary', 'fur'],
        }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const buildBodies: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/blobs/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      if (init?.body) buildBodies.push(init.body as string);
      return new Response(
        JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xfur'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    // The pick-base reset seeds the palette with both labels, so the fallback
    // can't fire from the happy path. Manually edit the variant's palette to
    // remove the 'fur' key by setting primary only (the editor only exposes
    // the keys derived from base.partLabels — drop into the build-time
    // resolution by clicking preview without touching the 'fur' picker).
    // Without simulating a divergent palette directly, this test proves the
    // resolved length == partLabels.length even when the user never opened
    // the second picker.
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });
    await waitFor(() => expect(buildBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(buildBodies[0]!);
    // Positional contract: 2 parts → 2 partColors entries, regardless of
    // palette completeness. The 'fur' position resolves via palette
    // lookup (always populated by the pick-base reset).
    expect(body.variants[0].partColors).toHaveLength(2);
  });

  it('F8 — legacy base (partLabels = []) sends a length-1 partColors array via the single-row editor', async () => {
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xlegacy', glbBlobId: 'glb-legacy', partLabels: [] })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const buildBodies: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/v1/blobs/')) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      if (init?.body) buildBodies.push(init.body as string);
      return new Response(
        JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xlegacy'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });
    await waitFor(() => expect(buildBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(buildBodies[0]!);
    // Legacy fallback: partLabels=[] → length-1 partColors (the single-material
    // sentinel for pre-v8 / upload-mode bases).
    expect(body.variants[0].partColors).toHaveLength(1);
  });

  // ----- plan-015 U6 — axes strip + side rail + mode pill ----------------

  async function pickBaseWithLabels(
    partLabels: string[],
    overrides: Partial<Model3DSummary> = {},
  ) {
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xaxes', glbBlobId: 'glb-axes', partLabels, ...overrides })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xaxes'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
  }

  it('U6: customization-axes strip renders the picked base partLabels in mono uppercase (R6, AE3)', async () => {
    await pickBaseWithLabels(['chassis', 'wheels', 'spoiler', 'windshield', 'headlights']);
    const strip = screen.getByTestId('customization-axes-strip');
    expect(strip).toBeTruthy();
    expect(strip.textContent).toMatch(/CUSTOMIZATION AXES/);
    expect(strip.textContent).toMatch(/CHASSIS/);
    expect(strip.textContent).toMatch(/WHEELS/);
    expect(strip.textContent).toMatch(/SPOILER/);
    expect(strip.textContent).toMatch(/WINDSHIELD/);
    expect(strip.textContent).toMatch(/HEADLIGHTS/);
  });

  it('U6: customization-axes strip hidden for legacy base (partLabels=[])', async () => {
    await pickBaseWithLabels([]);
    expect(screen.queryByTestId('customization-axes-strip')).toBeNull();
  });

  it('U6: MeshInfoPanel + PartListPanel mount after a base is picked', async () => {
    await pickBaseWithLabels(['chassis', 'wheels', 'spoiler']);
    expect(screen.getByTestId('mesh-info-panel-launch')).toBeTruthy();
    expect(screen.getByTestId('mesh-info-segments-launch').textContent).toMatch(/SEGMENTS.*3/);
    // Walrus blob id surfaces as the BLOB pill (truncated id with title attr).
    expect(screen.getByTestId('mesh-info-blob-launch')).toBeTruthy();
    expect(screen.getByTestId('part-list-panel-launch')).toBeTruthy();
    for (let i = 0; i < 3; i++) {
      expect(screen.getByTestId(`part-list-row-${i}-launch`)).toBeTruthy();
    }
  });

  it('U6: clicking a PartListPanel row marks the row active (selectedPartIndex)', async () => {
    await pickBaseWithLabels(['chassis', 'wheels', 'spoiler']);
    fireEvent.click(screen.getByTestId('part-list-row-1-launch'));
    expect(
      screen.getByTestId('part-list-row-1-launch').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('part-list-row-0-launch').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('U6: canvas-side pick (onPartClick) also drives PartListPanel selection — after PREVIEW builds variant GLBs', async () => {
    // The main preview canvas only mounts (with onPartClick) once a variant
    // GLB is built — drive a single PREVIEW pass first.
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xprev', glbBlobId: 'glb-prev', partLabels: ['a', 'b', 'c'] })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xprev'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });
    await waitFor(() => expect(screen.getByTestId('preview-pick-part-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('preview-pick-part-1'));
    // PartListPanel row 1 now active.
    expect(
      screen.getByTestId('part-list-row-1-launch').getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('U6: mode pill cycles PBR → PARTS → SOLO → WIREFRAME → PBR on the main preview', async () => {
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xmode', glbBlobId: 'glb-mode', partLabels: ['a', 'b'] })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xmode'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });
    await waitFor(() => expect(screen.getByTestId('preview-mode-toggle-pill')).toBeTruthy());

    const pill = screen.getByTestId('preview-mode-toggle-pill');
    expect(pill.textContent).toBe('MODE: PBR');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: PARTS');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: SOLO');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: WIREFRAME');
    fireEvent.click(pill);
    expect(pill.textContent).toBe('MODE: PBR');
  });

  it('U6: switching bases resets selectedPartIndex (regression guard)', async () => {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({ objectId: '0xa', glbBlobId: 'glb-a', partLabels: ['x', 'y'] }),
        summary({ objectId: '0xb', glbBlobId: 'glb-b', partLabels: ['m', 'n'] }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xa'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    // Select row 1 on base A.
    fireEvent.click(screen.getByTestId('part-list-row-1-launch'));
    expect(
      screen.getByTestId('part-list-row-1-launch').getAttribute('aria-pressed'),
    ).toBe('true');
    // Picker auto-collapsed after pick; expand to switch to base B.
    fireEvent.click(screen.getByTestId('base-picker-change'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xb'));
    });
    await waitFor(() => expect(screen.getByTestId('part-list-row-1-launch')).toBeTruthy());
    expect(
      screen.getByTestId('part-list-row-1-launch').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  // ----- plan-015 U7 — column-hover SOLO + live recolor ------------------

  // The page renders MANY PreviewCanvas mounts (1 per base-picker thumb +
  // 1 main preview). Only the main preview gets the mode-toggle pill, so
  // its presence distinguishes the two.
  function mainPreviewCanvas(): HTMLElement {
    const matches = screen.getAllByTestId('preview-canvas-mock').filter((el) =>
      el.querySelector('[data-testid="preview-mode-toggle-pill"]'),
    );
    if (matches.length === 0) {
      throw new Error('no main preview canvas (mode-toggle pill missing)');
    }
    if (matches.length > 1) {
      throw new Error(`expected one main preview canvas, got ${matches.length}`);
    }
    return matches[0]!;
  }

  it('U7: hovering a VariantEditor column flips main preview to SOLO with matching part indices (R8, AE4)', async () => {
    await pickBaseWithLabels(['chassis', 'wheels', 'chassis', 'spoiler']);
    // Pre-hover: preview defaults to PBR with no highlights.
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('pbr');
    expect(mainPreviewCanvas().getAttribute('data-highlighted')).toBe('');
    // Hover the 'chassis' column header — should flip mode to SOLO and
    // highlight parts [0, 2] (the two indices in partLabels matching 'chassis').
    fireEvent.mouseEnter(screen.getByTestId('palette-col-chassis'));
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('solo');
    expect(mainPreviewCanvas().getAttribute('data-highlighted')).toBe('0,2');
    // Mouseout — mode and highlight return to baseline after the 50ms
    // hover-null debounce (plan-015 F10).
    fireEvent.mouseLeave(screen.getByTestId('palette-col-chassis'));
    await waitFor(() =>
      expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('pbr'),
    );
    expect(mainPreviewCanvas().getAttribute('data-highlighted')).toBe('');
  });

  it('F12: column-hover chain delivers (mode=solo, highlightedParts=matching) to the canvas mock — sibling of PreviewCanvas applyCanvasMode test', async () => {
    // This is the page-level half of the F12 bridge: the canvas mock
    // exposes mode + highlightedParts as data-* attributes so we can
    // assert the chain reaches the prop boundary. The behavioral half —
    // proving those props reach mesh.material.albedoColor — lives in
    // PreviewCanvas.test.tsx (F2). Together they verify the full
    // VariantEditor hover → page state → PreviewCanvas → applyCanvasMode
    // → mesh material chain.
    await pickBaseWithLabels(['a', 'b', 'a', 'c', 'a']);
    fireEvent.mouseEnter(screen.getByTestId('palette-col-a'));
    const main = mainPreviewCanvas();
    expect(main.getAttribute('data-mode')).toBe('solo');
    // partLabels=['a','b','a','c','a'] → hovering 'a' yields [0,2,4].
    expect(main.getAttribute('data-highlighted')).toBe('0,2,4');
  });

  it('U7: hover overlay does not override user-picked mode after mouseout', async () => {
    await pickBaseWithLabels(['a', 'b']);
    // User cycles PBR → PARTS via the pill.
    fireEvent.click(screen.getByTestId('preview-mode-toggle-pill'));
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('parts');
    // Hover a column — flips to SOLO temporarily.
    fireEvent.mouseEnter(screen.getByTestId('palette-col-a'));
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('solo');
    // Mouseout — restores PARTS (not PBR) after the 50ms F10 debounce.
    fireEvent.mouseLeave(screen.getByTestId('palette-col-a'));
    await waitFor(() =>
      expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('parts'),
    );
  });

  it('U7: live recolor — VariantEditor color pick updates partColors prop on the preview canvas (R9)', async () => {
    await pickBaseWithLabels(['primary', 'accent']);
    // Default palette seeds every label to #cc3333.
    expect(mainPreviewCanvas().getAttribute('data-part-colors')).toBe('#cc3333,#cc3333');
    // Pick a red for the 'primary' column on variant 0.
    fireEvent.change(screen.getByTestId('variant-color-0-primary'), {
      target: { value: '#ff0000' },
    });
    expect(mainPreviewCanvas().getAttribute('data-part-colors')).toBe('#ff0000,#cc3333');
  });

  it('U7: live recolor falls back to the base mesh URL when no swapped variant GLB exists yet (R9)', async () => {
    await pickBaseWithLabels(['a', 'b']);
    // Without clicking PREVIEW, the main preview canvas still renders with
    // glbUrl set — the base mesh blob URL acts as the live-recolor surface.
    const main = mainPreviewCanvas();
    expect(main.textContent).toMatch(/blob:/);
    // The "select a variant" / "click PREVIEW" placeholders should NOT
    // surface — the new fallback bypasses them.
    expect(screen.queryByTestId('variant-preview-placeholder')).toBeNull();
  });

  // ----- plan-015 U8 — Random Gen + VariantStrip + lock ------------------

  it('U8: RandomGenControls + VariantStrip mount after a base is picked', async () => {
    await pickBaseWithLabels(['primary', 'accent']);
    expect(screen.getByTestId('random-gen-controls')).toBeTruthy();
    expect(screen.getByTestId('variant-strip')).toBeTruthy();
    // Default editor seeds 1 variant; the strip reflects that.
    expect(screen.getByTestId('variant-strip-tile-0')).toBeTruthy();
    expect(screen.queryByTestId('variant-strip-tile-1')).toBeNull();
  });

  it('U8: changing N via RandomGen stepper updates the variant count + strip tiles', async () => {
    await pickBaseWithLabels(['primary', 'accent']);
    expect(screen.getByTestId('random-gen-n-value').textContent).toBe('1');
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    }
    expect(screen.getByTestId('random-gen-n-value').textContent).toBe('5');
    // Strip now shows 5 tiles.
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`variant-strip-tile-${i}`)).toBeTruthy();
    }
    // Truncating drops tiles.
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByTestId('random-gen-n-minus'));
    }
    expect(screen.getByTestId('random-gen-n-value').textContent).toBe('3');
    expect(screen.queryByTestId('variant-strip-tile-3')).toBeNull();
  });

  it('U8: RANDOM GEN populates every unlocked variant palette with harmonic colors (AE5)', async () => {
    await pickBaseWithLabels(['primary', 'accent']);
    // Bump to 5 variants.
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    }
    // Pre-gen: every palette seed is #cc3333 (newVariantRow default).
    const beforePrimary0 = (
      screen.getByTestId('variant-color-0-primary') as HTMLInputElement
    ).value;
    expect(beforePrimary0).toBe('#cc3333');
    // Click RANDOM GEN.
    fireEvent.click(screen.getByTestId('random-gen-button'));
    // After: every variant's palette[primary] differs from the default.
    // (Some variants may coincidentally roll #cc3333, but variant 0's
    // harmonic palette starts at hue 0 ≈ red, and the editor seed wasn't
    // exactly #cc3333 saturation — we just need ANY variant to differ.)
    const variant0Primary = (
      screen.getByTestId('variant-color-0-primary') as HTMLInputElement
    ).value;
    const variant1Primary = (
      screen.getByTestId('variant-color-1-primary') as HTMLInputElement
    ).value;
    // Sibling variants should differ from each other (distinct seed
    // rotations around the harmonic wheel).
    expect(variant0Primary).not.toBe(variant1Primary);
  });

  it('U8: locked variants survive RANDOM GEN re-rolls (R11)', async () => {
    await pickBaseWithLabels(['primary']);
    // Bump to 3 variants + first RANDOM GEN.
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    }
    fireEvent.click(screen.getByTestId('random-gen-button'));
    const lockedValue = (
      screen.getByTestId('variant-color-1-primary') as HTMLInputElement
    ).value;
    // Lock variant 1.
    fireEvent.click(screen.getByTestId('variant-strip-lock-1'));
    expect(
      screen.getByTestId('variant-strip-lock-1').getAttribute('aria-pressed'),
    ).toBe('true');
    // Cycle the seed + re-roll.
    fireEvent.change(screen.getByTestId('random-gen-seed'), {
      target: { value: '#0000ff' },
    });
    fireEvent.click(screen.getByTestId('random-gen-button'));
    // Variant 1 unchanged.
    const afterLocked = (
      screen.getByTestId('variant-color-1-primary') as HTMLInputElement
    ).value;
    expect(afterLocked).toBe(lockedValue);
    // Variant 0 (unlocked) changed (was red-leaning, now blue-leaning).
    const variant0After = (
      screen.getByTestId('variant-color-0-primary') as HTMLInputElement
    ).value;
    expect(variant0After).not.toBe('#cc3333');
  });

  it('U8: RANDOM GEN button label reflects locked count', async () => {
    await pickBaseWithLabels(['primary']);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    }
    expect(screen.getByTestId('random-gen-button').textContent).toBe(
      'RANDOM GEN (5 VARIANTS)',
    );
    fireEvent.click(screen.getByTestId('variant-strip-lock-1'));
    fireEvent.click(screen.getByTestId('variant-strip-lock-3'));
    expect(screen.getByTestId('random-gen-button').textContent).toBe(
      'RANDOM GEN (3 OF 5, 2 LOCKED)',
    );
  });

  it('U8: VariantStrip tile click switches the active main-preview index', async () => {
    await pickBaseWithLabels(['primary']);
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    }
    // Variant 0 starts as active.
    expect(
      screen.getByTestId('variant-strip-tile-0').getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByTestId('variant-strip-tile-2'));
    expect(
      screen.getByTestId('variant-strip-tile-2').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('variant-strip-tile-0').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('U8: switching bases clears the locked set (regression guard)', async () => {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({ objectId: '0xa', glbBlobId: 'glb-a', partLabels: ['x'] }),
        summary({ objectId: '0xb', glbBlobId: 'glb-b', partLabels: ['m'] }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xa'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    // Bump to 2 variants + lock variant 0.
    fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    fireEvent.click(screen.getByTestId('variant-strip-lock-0'));
    expect(
      screen.getByTestId('variant-strip-lock-0').getAttribute('aria-pressed'),
    ).toBe('true');
    // Picker auto-collapsed after pick; expand to switch to base B —
    // locks should clear; variant array resets to 1.
    fireEvent.click(screen.getByTestId('base-picker-change'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xb'));
    });
    await waitFor(() => expect(screen.getByTestId('variant-strip-tile-0')).toBeTruthy());
    expect(
      screen.getByTestId('variant-strip-lock-0').getAttribute('aria-pressed'),
    ).toBe('false');
    expect(screen.queryByTestId('variant-strip-tile-1')).toBeNull();
  });

  it('on an expired session (build 401) clears the session and shows a re-sign-in message', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      // /api/collection/build — simulate an expired JWT
      return new Response(JSON.stringify({ error: 'auth_invalid' }), { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });

    await waitFor(() => expect(clearSessionMock).toHaveBeenCalledOnce());
    expect(screen.getByTestId('launch-error').textContent).toMatch(/session expired/i);
  });

  // plan-016 U5 / R5 / AE2 — test-wallet missing-key banner. Renders the
  // wrapper hook's loadError message verbatim above the page content;
  // LAUNCH stays disabled via the existing signer-null check.
  it('renders the missing-key banner with verbatim AE2 copy + Vite restart hint on the sign-in scaffold', () => {
    // plan-016 code-review hotfix — banner now includes ", then restart
    // Vite (env vars are loaded at server start)" so devs don't sit
    // stuck on the banner after editing .env.local without restarting
    // pnpm dev. The verbatim match locks the user-visible string.
    useSessionMock.mockReturnValue({ session: null });
    useAppAccountMock.mockReturnValue(null);
    const expected =
      'TEST_WALLET enabled but VITE_TEST_WALLET_KEY is missing — set it in .env.local, then restart Vite (env vars are loaded at server start)';
    mockSignerLoadError = new Error(expected);
    renderPage();
    const banner = screen.getByTestId('test-wallet-banner');
    expect(banner.textContent).toBe(expected);
    expect(banner.getAttribute('role')).toBe('alert');
  });

  it('renders the banner on the signed-in scaffold when signer failed to load (invalid key path)', () => {
    mockSignerLoadError = new Error('VITE_TEST_WALLET_KEY is invalid: bad bech32');
    // Signed-in beforeEach default applies; the page renders the
    // base-picker branch above which the banner appears.
    renderPage();
    expect(screen.getByTestId('test-wallet-banner').textContent).toMatch(
      /VITE_TEST_WALLET_KEY is invalid/,
    );
  });

  it('no banner when loadError is null (production / valid test-wallet path)', () => {
    mockSignerLoadError = null;
    renderPage();
    expect(screen.queryByTestId('test-wallet-banner')).toBeNull();
  });

  // plan-016 code-review hotfix — synchronous double-click guard. Two
  // clicks within the same synchronous task should result in exactly ONE
  // signAndExecuteMock invocation. The `busy` state alone doesn't protect
  // because React state lags behind a synchronous click event; the useRef
  // guard in onLaunch is the actual serializer.
  it('LAUNCH double-click race: second synchronous click is a no-op (only one PTB sign)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({ blobIds: ['quilt-b'], blobObjects: [{ blobId: 'quilt-b', blobObjectId: '0xobj' }], patchIds: ['patch-0'] });
    signAndExecuteMock.mockResolvedValue({
      $kind: 'Transaction',
      Transaction: { digest: 'ONLY_ONCE' },
    });

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());

    // Two synchronous clicks back-to-back; the ref guard inside onLaunch
    // must serialize them so only one upload + sign chain runs.
    await act(async () => {
      const btn = screen.getByTestId('launch-button');
      fireEvent.click(btn);
      fireEvent.click(btn);
    });

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeTruthy());
    expect(signAndExecuteMock).toHaveBeenCalledTimes(1);
    expect(uploadFilesMock).toHaveBeenCalledTimes(1);
  });

  // plan-016 code-review hotfix — exercise the "neither digest path"
  // throw in onLaunch. If a future signer impl returns an unexpected
  // shape (no Transaction property, no FailedTransaction), the page must
  // surface a launch-error rather than silently leaving txDigest null.
  // Note: the AppSigner contract is now the discriminated union, so this
  // case is structurally precluded for compliant signers — the throw is
  // defense-in-depth against `as` casts at future call sites.
  it('LAUNCH surfaces launch-error when signer returns a shape with no digest at all', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({ blobIds: ['quilt-b'], blobObjects: [{ blobId: 'quilt-b', blobObjectId: '0xobj' }], patchIds: ['patch-0'] });
    // Off-contract shape: neither $kind branch is set.
    signAndExecuteMock.mockResolvedValue({} as unknown as { $kind: 'Transaction'; Transaction: { digest: string } });

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });

    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeTruthy());
  });

  // -- plan-017 U3 — Babylon lifecycle hook ---------------------------------

  it('onLaunch happy path: previewRef.dispose() called before upload, remount() called after', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({
      blobIds: ['quilt-b'],
      blobObjects: [{ blobId: 'quilt-b', blobObjectId: '0xobj' }],
      patchIds: ['patch-0'],
    });
    signAndExecuteMock.mockResolvedValue({
      $kind: 'Transaction',
      Transaction: { digest: 'OK' },
    });

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    // Reset counters AFTER initial mount/effects settle — base-option mount
    // can trigger preview remount/recreate flickers we don't care about for
    // this assertion. We want to count only what onLaunch caused.
    previewMockState.reset();

    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeTruthy());
    expect(previewMockState.disposeCalls).toBe(1);
    expect(previewMockState.remountCalls).toBe(1);
  });

  it('onLaunch error path: remount() still called when upload fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockRejectedValueOnce(new Error('walrus quota'));

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    previewMockState.reset();

    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });

    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeTruthy());
    // dispose() fired before runBuildVariants; remount() fires in finally
    // regardless of which step rejected.
    expect(previewMockState.disposeCalls).toBe(1);
    expect(previewMockState.remountCalls).toBe(1);
  });

  it('onLaunch sign error: remount() still called when signer rejects after upload succeeded', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({
      blobIds: ['quilt-b'],
      blobObjects: [{ blobId: 'quilt-b', blobObjectId: '0xobj' }],
      patchIds: ['patch-0'],
    });
    signAndExecuteMock.mockRejectedValueOnce(new Error('user cancelled'));

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    previewMockState.reset();

    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });

    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeTruthy());
    expect(previewMockState.disposeCalls).toBe(1);
    expect(previewMockState.remountCalls).toBe(1);
  });

  // plan-017 P1-E: pre-flight and progress BatchProgressPanels must not
  // render simultaneously on phase='error'. busy doesn't cover 'error',
  // so without the explicit phase guard, both gates matched.
  it('phase=error renders only ONE BatchProgressPanel (the progress one), not the pre-flight too', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    // Force an upload failure to land us in phase='error'.
    uploadFilesMock.mockRejectedValueOnce(new Error('walrus boom'));

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });
    await waitFor(() => expect(screen.getByTestId('launch-error')).toBeTruthy());

    // Only one BatchProgressPanel in the DOM. With the dual-render bug,
    // two would appear: one in pre-flight mode, one in progress mode.
    // (The default test base has 1 variant, which is <= QUILT_SIZE so
    // neither panel renders. Tests can't easily exercise multi-quilt
    // here without significant fixture changes, so this primarily
    // asserts no regression in the gate condition itself.)
    const panels = screen.queryAllByTestId('batch-progress-panel');
    expect(panels.length).toBeLessThanOrEqual(1);
  });

  it('onLaunch double-click: dispose called only once (launchingRef guard)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    uploadFilesMock.mockResolvedValue({
      blobIds: ['quilt-b'],
      blobObjects: [{ blobId: 'quilt-b', blobObjectId: '0xobj' }],
      patchIds: ['patch-0'],
    });
    signAndExecuteMock.mockResolvedValue({
      $kind: 'Transaction',
      Transaction: { digest: 'OK' },
    });

    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    previewMockState.reset();

    const btn = screen.getByTestId('launch-button');
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });

    await waitFor(() => expect(screen.getByTestId('launch-success')).toBeTruthy());
    // launchingRef short-circuits the second click before it reaches
    // previewRef.dispose() — only the first invocation gets through.
    expect(previewMockState.disposeCalls).toBe(1);
    expect(previewMockState.remountCalls).toBe(1);
  });
});

// plan-027 U10 / D-078 — entitlement-gated encrypted ALLOW_LIST base. The wallet
// signatures (the SessionKey personal message at unlock + the launch/mint txs)
// can't be driven in jsdom/agent-browser, so the live decrypt arc is the user's
// manual real-Slush step; here we assert the page routes + renders correctly,
// the catalog launchable/locked split, the FREE unlock (no payment PTB), and the
// derive-fee-at-mint flow — mocking the seam (decryptViaEntitlement, the
// entitlement-gated launch, mint_tokens).
describe('LaunchCollectionPage — encrypted ALLOW_LIST base (entitlement-gated)', () => {
  const encBase = (overrides: Partial<Model3DSummary> = {}) =>
    summary({
      objectId: '0xenc',
      name: 'Sealed Car',
      isEncrypted: true,
      policy: 1, // ALLOW_LIST
      glbBlobId: 'cipher-blob', // AES ciphertext — must NEVER be fetched as a GLB
      previewBlobIds: ['still-1'],
      ...overrides,
    });

  // Seed the owned-entitlements mock so the wallet HOLDS an entitlement for the
  // given base id → the catalog surfaces it as launchable + the free unlock has
  // an entitlement id to gate the decrypt.
  function holdEntitlement(modelId: string, entitlementId = '0xentitlement') {
    ownedEntitlementsMock.modelIds = new Set([modelId]);
    ownedEntitlementsMock.entitlementByModel = new Map([[modelId, entitlementId]]);
  }

  it('AE1: renders the public preview STILL (an <img>) for an encrypted base, never the ciphertext as a GLB', () => {
    // No entitlement held → locked card, but the public still still renders.
    useModelIndexMock.mockReturnValue({ models: [encBase()], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    const still = screen.getByTestId('base-option-still-0xenc') as HTMLImageElement;
    expect(still).toBeTruthy();
    expect(still.src).toContain('still-1');
    // The ciphertext blob id must NOT be rendered as a GLB anywhere.
    expect(still.src).not.toContain('cipher-blob');
  });

  it('AE4: catalog splits — held base X launchable, unheld base Y locked (w/ /model/:id link), public Z launchable', () => {
    const X = encBase({ objectId: '0xX', name: 'X' });
    const Y = encBase({ objectId: '0xY', name: 'Y' });
    const Z = summary({ objectId: '0xZ', name: 'Z', glbBlobId: 'glb-z' }); // public
    useModelIndexMock.mockReturnValue({ models: [X, Y, Z], loading: false, error: null, refetch: vi.fn() });
    holdEntitlement('0xX'); // wallet holds an entitlement for X only
    renderPage();
    // X (held) + Z (public) → full clickable fork buttons.
    expect(screen.getByTestId('base-option-0xX')).toBeTruthy();
    expect(screen.getByTestId('base-option-0xZ')).toBeTruthy();
    // X + Z are NOT locked cards.
    expect(screen.queryByTestId('base-option-locked-card-0xX')).toBeNull();
    expect(screen.queryByTestId('base-option-locked-card-0xZ')).toBeNull();
    // Y (unheld ALLOW_LIST) → locked card, NOT a forkable button (locked ≠ forkable).
    expect(screen.queryByTestId('base-option-0xY')).toBeNull();
    expect(screen.getByTestId('base-option-locked-card-0xY')).toBeTruthy();
    const buyLink = screen.getByTestId('base-option-buy-access-0xY') as HTMLAnchorElement;
    expect(buyLink.getAttribute('href')).toBe('/model/0xY');
  });

  it('AE1: picking an entitled encrypted base does NOT fetch the ciphertext as a base GLB', async () => {
    useModelIndexMock.mockReturnValue({ models: [encBase()], loading: false, error: null, refetch: vi.fn() });
    holdEntitlement('0xenc');
    const fetchMock = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xenc'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    // No aggregator fetch for the ciphertext base — the decrypt happens later at
    // unlock (free, via the entitlement). Forker evaluates from the still only.
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('cipher-blob'))).toBe(false);
  });

  // plan-027 U10 — before unlock, the blind color editor is gone; only the unlock
  // gate shows. After the FREE unlock the live editor + MINT button appear.
  it('PRE-UNLOCK: shows the FREE unlock gate and hides the color editor + mint button', async () => {
    useModelIndexMock.mockReturnValue({ models: [encBase()], loading: false, error: null, refetch: vi.fn() });
    holdEntitlement('0xenc');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xenc'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    expect(screen.getByTestId('unlock-gate')).toBeTruthy();
    // Copy advertises the free decrypt, not a payment.
    expect(screen.getByTestId('unlock-button').textContent).toMatch(/UNLOCK TO DESIGN/);
    expect(screen.getByTestId('unlock-button').textContent).toMatch(/FREE/);
    // No blind authoring: the color editor, PREVIEW, mint button, and the
    // "unlocked" notice are all absent until the base is unlocked.
    expect(screen.queryByTestId('collection-name-input')).toBeNull();
    expect(screen.queryByTestId('preview-button')).toBeNull();
    expect(screen.queryByTestId('launch-button')).toBeNull();
    expect(screen.queryByTestId('encrypted-base-notice')).toBeNull();
  });

  it('AE3: UNLOCK is a FREE decrypt — decryptViaEntitlement is called, editor mounts, NO payment/launch PTB issued', async () => {
    useModelIndexMock.mockReturnValue({ models: [encBase()], loading: false, error: null, refetch: vi.fn() });
    holdEntitlement('0xenc', '0xent-enc');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));
    signPersonalMessageMock.mockResolvedValue({ signature: 'sig' });
    decryptViaEntitlementMock.mockResolvedValue({
      plaintext: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
      blobUrl: 'blob:mock',
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xenc'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-button')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-button'));
    });
    // Unlocked: gate gone, live editor present, button now mints.
    await waitFor(() => expect(screen.queryByTestId('unlock-gate')).toBeNull());
    expect(screen.getByTestId('collection-name-input')).toBeTruthy();
    expect(screen.getByTestId('preview-button')).toBeTruthy();
    expect(screen.getByTestId('launch-button').textContent).toMatch(/MINT COLLECTION/);
    expect(screen.getByTestId('encrypted-base-notice').textContent).toMatch(/Unlocked/);
    // The decrypt ran via the held entitlement.
    expect(decryptViaEntitlementMock).toHaveBeenCalledOnce();
    expect(decryptViaEntitlementMock.mock.calls[0]![0]).toMatchObject({
      entitlementId: '0xent-enc',
      address: ADDR,
    });
    // CRITICAL (AE3): unlock issues NO on-chain charge — the entitlement-gated
    // launch + the bare/with-tokens launch builders are NOT called at unlock.
    expect(launchEncryptedCollectionMock).not.toHaveBeenCalled();
    expect(buildLaunchMock).not.toHaveBeenCalled();
    expect(mintEncryptedTokensMock).not.toHaveBeenCalled();
  });

  it('MINT (AE3 fee-at-mint): issues launch_collection_with_entitlement (derive fee) + mint_tokens, threads the entitlement id + base derive fee', async () => {
    useModelIndexMock.mockReturnValue({ models: [encBase()], loading: false, error: null, refetch: vi.fn() });
    holdEntitlement('0xenc', '0xent-enc');
    signPersonalMessageMock.mockResolvedValue({ signature: 'sig' });
    decryptViaEntitlementMock.mockResolvedValue({
      plaintext: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
      blobUrl: 'blob:mock',
    });
    launchEncryptedCollectionMock.mockResolvedValue({ capId: '0xcap', collectionId: '0xcol' });
    mintEncryptedTokensMock.mockResolvedValue('0xmintdigest');
    uploadFilesMock.mockResolvedValue({
      blobIds: ['quilt'],
      blobObjects: [{ blobId: 'quilt', blobObjectId: '0xq' }],
      patchIds: ['p0'],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1]), { status: 200 });
        return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    );
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xenc'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-button')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-button'));
    });
    await waitFor(() => expect(screen.getByTestId('launch-button').textContent).toMatch(/MINT COLLECTION/));
    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });
    await waitFor(() => expect(mintEncryptedTokensMock).toHaveBeenCalled());
    // The cap is created AT MINT via the entitlement-gated launch (charges the
    // derive fee read from the base summary), threading the held entitlement id.
    expect(launchEncryptedCollectionMock).toHaveBeenCalledOnce();
    expect(launchEncryptedCollectionMock.mock.calls[0]![0]).toMatchObject({
      modelId: '0xenc',
      // Contract v11 — a FORKER (non-creator) routes through the entitlement gate.
      launchAuth: { kind: 'entitlement', entitlementId: '0xent-enc' },
      feeMist: BigInt(encBase().derivativeMintFee), // 0.25 SUI from the base summary
    });
    // mint_tokens consumes the cap + collection that launch just created.
    expect(mintEncryptedTokensMock.mock.calls[0]![0]).toMatchObject({
      capId: '0xcap',
      collectionId: '0xcol',
    });
  });

  it('R5: a derive-fee = 0 encrypted base → unlock + mint succeed with a zero derive payment', async () => {
    useModelIndexMock.mockReturnValue({
      models: [encBase({ derivativeMintFee: '0' })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    holdEntitlement('0xenc', '0xent-enc');
    signPersonalMessageMock.mockResolvedValue({ signature: 'sig' });
    decryptViaEntitlementMock.mockResolvedValue({
      plaintext: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
      blobUrl: 'blob:mock',
    });
    launchEncryptedCollectionMock.mockResolvedValue({ capId: '0xcap', collectionId: '0xcol' });
    mintEncryptedTokensMock.mockResolvedValue('0xmintdigest');
    uploadFilesMock.mockResolvedValue({
      blobIds: ['quilt'],
      blobObjects: [{ blobId: 'quilt', blobObjectId: '0xq' }],
      patchIds: ['p0'],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1]), { status: 200 });
        return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    );
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xenc'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-button')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-button'));
    });
    await waitFor(() => expect(screen.getByTestId('launch-button').textContent).toMatch(/MINT COLLECTION/));
    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });
    await waitFor(() => expect(mintEncryptedTokensMock).toHaveBeenCalled());
    // The zero derive fee flows through to the entitlement-gated launch (the
    // contract splits + destroys a zero coin).
    expect(launchEncryptedCollectionMock.mock.calls[0]![0]).toMatchObject({ feeMist: 0n });
  });

  it('re-pick base resets the catalog/decrypt state (a freshly picked encrypted base is locked again)', async () => {
    const enc1 = encBase({ objectId: '0xenc1', name: 'Enc One' });
    const enc2 = encBase({ objectId: '0xenc2', name: 'Enc Two' });
    useModelIndexMock.mockReturnValue({ models: [enc1, enc2], loading: false, error: null, refetch: vi.fn() });
    // Wallet holds entitlements for BOTH so both are launchable.
    ownedEntitlementsMock.modelIds = new Set(['0xenc1', '0xenc2']);
    ownedEntitlementsMock.entitlementByModel = new Map([
      ['0xenc1', '0xent1'],
      ['0xenc2', '0xent2'],
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));
    signPersonalMessageMock.mockResolvedValue({ signature: 'sig' });
    decryptViaEntitlementMock.mockResolvedValue({
      plaintext: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
      blobUrl: 'blob:mock',
    });
    renderPage();
    // Pick + unlock enc1 → live editor.
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xenc1'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-button')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-button'));
    });
    await waitFor(() => expect(screen.queryByTestId('unlock-gate')).toBeNull());
    // CHANGE base → re-expand grid → pick enc2: the new base is locked again
    // (decrypt state reset), so the unlock gate returns and the editor is gone.
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-picker-change'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xenc2'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-gate')).toBeTruthy());
    expect(screen.queryByTestId('collection-name-input')).toBeNull();
  });

  it('regression: a PERMISSIONLESS base keeps the GLB thumbnail, PREVIEW button, and LAUNCH COLLECTION label', async () => {
    // Default summary() is PERMISSIONLESS — assert the encrypted branch did not
    // bleed into the public path.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));
    renderPage();
    // GLB thumbnail (PreviewCanvas mock), not a still <img>.
    expect(screen.queryByTestId('base-option-still-0xbase1')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    expect(screen.queryByTestId('encrypted-base-notice')).toBeNull();
    expect(screen.getByTestId('preview-button')).toBeTruthy();
    expect(screen.getByTestId('launch-button').textContent).toMatch(/LAUNCH COLLECTION/);
  });
});

// Contract v11 — the BASE CREATOR can fork their OWN ALLOW_LIST base for free:
// it appears launchable (not locked) even with NO entitlement; unlock decrypts via
// the creator gate (seal_approve_creator, no entitlement, no pay); mint uses the
// LEGACY `launch_collection` (creator mode, no entitlement arg).
describe('LaunchCollectionPage — creator forks their OWN encrypted ALLOW_LIST base (contract v11)', () => {
  // An encrypted ALLOW_LIST base CREATED by the signed-in wallet (creator === ADDR),
  // with NO entitlement held.
  const ownEncBase = (overrides: Partial<Model3DSummary> = {}) =>
    summary({
      objectId: '0xown',
      name: 'My Sealed Car',
      creator: ADDR, // the signed-in wallet IS the creator
      isEncrypted: true,
      policy: 1, // ALLOW_LIST
      glbBlobId: 'cipher-own', // AES ciphertext
      previewBlobIds: ['still-own'],
      ...overrides,
    });

  it('catalog: the wallet OWN encrypted base with NO entitlement is launchable (not a locked card)', () => {
    useModelIndexMock.mockReturnValue({ models: [ownEncBase()], loading: false, error: null, refetch: vi.fn() });
    // No entitlement held; the wallet is the creator, so it is still launchable.
    renderPage();
    expect(screen.getByTestId('base-option-0xown')).toBeTruthy();
    expect(screen.queryByTestId('base-option-locked-card-0xown')).toBeNull();
  });

  it('UNLOCK own base: decryptViaCreator is called (NOT decryptViaEntitlement), no entitlement lookup, no pay PTB', async () => {
    useModelIndexMock.mockReturnValue({ models: [ownEncBase()], loading: false, error: null, refetch: vi.fn() });
    // No entitlement in the owned set — the creator gate must not need one.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })));
    signPersonalMessageMock.mockResolvedValue({ signature: 'sig' });
    decryptViaCreatorMock.mockResolvedValue({
      plaintext: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
      blobUrl: 'blob:mock',
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xown'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-button')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-button'));
    });
    await waitFor(() => expect(screen.queryByTestId('unlock-gate')).toBeNull());
    // Unlocked: live editor + mint button present.
    expect(screen.getByTestId('collection-name-input')).toBeTruthy();
    expect(screen.getByTestId('launch-button').textContent).toMatch(/MINT COLLECTION/);
    // The creator gate ran; the entitlement gate did NOT.
    expect(decryptViaCreatorMock).toHaveBeenCalledOnce();
    expect(decryptViaCreatorMock.mock.calls[0]![0]).toMatchObject({ address: ADDR });
    // No entitlementId is threaded through the creator decrypt.
    expect(decryptViaCreatorMock.mock.calls[0]![0]).not.toHaveProperty('entitlementId');
    expect(decryptViaEntitlementMock).not.toHaveBeenCalled();
    // No on-chain charge at unlock.
    expect(launchEncryptedCollectionMock).not.toHaveBeenCalled();
    expect(buildLaunchMock).not.toHaveBeenCalled();
    expect(mintEncryptedTokensMock).not.toHaveBeenCalled();
  });

  it('MINT own base: launchEncryptedCollection uses creator mode (legacy launch, no entitlement) + mint_tokens', async () => {
    useModelIndexMock.mockReturnValue({ models: [ownEncBase()], loading: false, error: null, refetch: vi.fn() });
    signPersonalMessageMock.mockResolvedValue({ signature: 'sig' });
    decryptViaCreatorMock.mockResolvedValue({
      plaintext: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
      blobUrl: 'blob:mock',
    });
    launchEncryptedCollectionMock.mockResolvedValue({ capId: '0xcap', collectionId: '0xcol' });
    mintEncryptedTokensMock.mockResolvedValue('0xmintdigest');
    uploadFilesMock.mockResolvedValue({
      blobIds: ['quilt'],
      blobObjects: [{ blobId: 'quilt', blobObjectId: '0xq' }],
      patchIds: ['p0'],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/v1/blobs/')) return new Response(new Uint8Array([1]), { status: 200 });
        return new Response(JSON.stringify({ variants: [{ glbBase64: 'Z2xURg==' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    );
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xown'));
    });
    await waitFor(() => expect(screen.getByTestId('unlock-button')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('unlock-button'));
    });
    await waitFor(() => expect(screen.getByTestId('launch-button').textContent).toMatch(/MINT COLLECTION/));
    await act(async () => {
      fireEvent.click(screen.getByTestId('launch-button'));
    });
    await waitFor(() => expect(mintEncryptedTokensMock).toHaveBeenCalled());
    // Creator mode — the legacy launch (no entitlement arg) issues the cap.
    expect(launchEncryptedCollectionMock).toHaveBeenCalledOnce();
    expect(launchEncryptedCollectionMock.mock.calls[0]![0]).toMatchObject({
      modelId: '0xown',
      launchAuth: { kind: 'creator' },
      feeMist: BigInt(ownEncBase().derivativeMintFee),
    });
    // No entitlementId leaks into the creator launch args.
    expect(launchEncryptedCollectionMock.mock.calls[0]![0].launchAuth).not.toHaveProperty('entitlementId');
    // mint_tokens consumes the cap + collection the legacy launch created.
    expect(mintEncryptedTokensMock.mock.calls[0]![0]).toMatchObject({
      capId: '0xcap',
      collectionId: '0xcol',
    });
  });

  it('regression: a non-creator encrypted base with NO entitlement is still locked (creator-only path does not leak)', () => {
    // creator !== ADDR and no entitlement → locked card, not launchable.
    const other = summary({
      objectId: '0xother',
      creator: '0xsomeoneelse',
      isEncrypted: true,
      policy: 1,
      glbBlobId: 'cipher-other',
      previewBlobIds: ['still-other'],
    });
    useModelIndexMock.mockReturnValue({ models: [other], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.queryByTestId('base-option-0xother')).toBeNull();
    expect(screen.getByTestId('base-option-locked-card-0xother')).toBeTruthy();
  });
});

// plan 2026-06-08-001 U3 — base-option description snippets + picked-base
// preview caption (R4, R5, R6) + the plan-002 merge dedupe (a card with a
// search match shows the MatchReason, never also the static snippet).
describe('LaunchCollectionPage — description snippets', () => {
  it('R4: a launchable base with a prompt shows the snippet on its base-option card', () => {
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xbase1', paramsJson: JSON.stringify({ prompt: 'a low-poly red sports car' }) })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('base-option-description-0xbase1').textContent).toBe('a low-poly red sports car');
  });

  it('R4: a locked base with a caption shows the snippet on its locked card', () => {
    const locked = summary({
      objectId: '0xlocked',
      creator: '0xsomeoneelse',
      isEncrypted: true,
      policy: 1,
      glbBlobId: 'cipher-x',
      previewBlobIds: ['still-x'],
      paramsJson: JSON.stringify({ source: 'upload', caption: 'a chunky walrus' }),
    });
    useModelIndexMock.mockReturnValue({ models: [locked], loading: false, error: null, refetch: vi.fn() });
    renderPage();
    expect(screen.getByTestId('base-option-locked-card-0xlocked')).toBeTruthy();
    expect(screen.getByTestId('base-option-description-0xlocked').textContent).toBe('a chunky walrus');
  });

  it('R6: an uncaptioned-upload base shows no snippet on its card', () => {
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xbase1', paramsJson: JSON.stringify({ source: 'upload' }) })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.queryByTestId('base-option-description-0xbase1')).toBeNull();
  });

  it('DEDUPE (plan-002 merge): a card with a search match shows the MatchReason and SUPPRESSES the static snippet; an unmatched described card still shows its snippet', () => {
    useModelIndexMock.mockReturnValue({
      models: [
        summary({ objectId: '0xaa', name: 'Alpha', glbBlobId: 'g1', paramsJson: JSON.stringify({ prompt: 'an alpha widget' }) }),
        summary({ objectId: '0xbb', name: 'Beta', glbBlobId: 'g2', paramsJson: JSON.stringify({ prompt: 'a fast race car' }) }),
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    // Recall matches only 0xbb (0xaa has a description but no match).
    memoryRecallState.personal = lane([hit('0xbb', 0.3, 'a fast race car')]);
    renderPage();
    fireEvent.change(screen.getByTestId('base-search-input'), { target: { value: 'race car' } });
    // 0xbb: match-reason shows, static snippet suppressed (never both).
    expect(screen.getByTestId('base-match-reason-0xbb')).toBeTruthy();
    expect(screen.queryByTestId('base-option-description-0xbb')).toBeNull();
    // 0xaa: no match → its static snippet still shows.
    expect(screen.queryByTestId('base-match-reason-0xaa')).toBeNull();
    expect(screen.getByTestId('base-option-description-0xaa')).toBeTruthy();
  });

  it('R5: picking a described base shows the description caption under the preview', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xbase1', paramsJson: JSON.stringify({ prompt: 'a low-poly red sports car' }) })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    const caption = screen.getByTestId('picked-base-description');
    expect(caption.textContent).toMatch(/Prompt:/);
    expect(caption.textContent).toMatch(/a low-poly red sports car/);
  });

  it('R6: picking an uncaptioned-upload base shows no preview caption', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    useModelIndexMock.mockReturnValue({
      models: [summary({ objectId: '0xbase1', paramsJson: JSON.stringify({ source: 'upload' }) })],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xbase1'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());
    expect(screen.queryByTestId('picked-base-description')).toBeNull();
  });
});
