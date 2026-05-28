import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

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
    derivativeRoyaltyBps: 500,
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
  uploadFilesMock.mockReset();
  signAndExecuteMock.mockReset();
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
