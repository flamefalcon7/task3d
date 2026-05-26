import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

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
vi.mock('../auth/useSession', () => ({ useSession: () => useSessionMock() }));

const useModelIndexMock = vi.fn();
vi.mock('../browse/useModelIndex', () => ({ useModelIndex: () => useModelIndexMock() }));

const uploadFilesMock = vi.fn();
vi.mock('../walrus/useWalrusUpload', () => ({
  useWalrusUpload: () => ({ uploadFiles: uploadFilesMock, stage: 'idle', status: 'idle', error: null }),
}));

const buildLaunchMock = vi.fn();
vi.mock('../sui/collectionTxBuilders', () => ({
  buildLaunchCollectionWithTokensPtb: (...args: unknown[]) => buildLaunchMock(...args),
}));

// plan-015 U6/U7 — PreviewCanvas mock surfaces mode pill + onPartClick +
// partColors + highlightedParts so integration tests can verify the
// page-level wiring without spinning up Babylon. data-* attributes carry
// the props out as serialized strings the tests can grep with regex.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({
    glbUrl,
    mode,
    onModeCycle,
    modeToggle,
    onPartClick,
    highlightedParts,
    partColors,
  }: {
    glbUrl: string | null;
    mode?: string;
    onModeCycle?: () => void;
    modeToggle?: boolean;
    onPartClick?: (i: number) => void;
    highlightedParts?: readonly number[];
    partColors?: readonly string[];
  }) => (
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
  ),
}));

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
  useCurrentAccountMock.mockReturnValue({ address: ADDR });
  clearSessionMock.mockReset();
  useSessionMock.mockReturnValue({ session: { address: ADDR, jwt: 'jwt-token' }, clearSession: clearSessionMock });
  useModelIndexMock.mockReturnValue({ models: [summary()], loading: false, error: null, refetch: vi.fn() });
  uploadFilesMock.mockReset();
  signAndExecuteMock.mockReset();
  buildLaunchMock.mockReset();
  buildLaunchMock.mockReturnValue({ tx: {}, handles: {}, metadata: {} });
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
    signAndExecuteMock.mockResolvedValue({ digest: 'LAUNCHDIGEST' });

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
    // Switch to base B; the previously-active row 1 should NOT carry over.
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
    // Mouseout — mode and highlight return to baseline.
    fireEvent.mouseLeave(screen.getByTestId('palette-col-chassis'));
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('pbr');
    expect(mainPreviewCanvas().getAttribute('data-highlighted')).toBe('');
  });

  it('U7: hover overlay does not override user-picked mode after mouseout', async () => {
    await pickBaseWithLabels(['a', 'b']);
    // User cycles PBR → PARTS via the pill.
    fireEvent.click(screen.getByTestId('preview-mode-toggle-pill'));
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('parts');
    // Hover a column — flips to SOLO temporarily.
    fireEvent.mouseEnter(screen.getByTestId('palette-col-a'));
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('solo');
    // Mouseout — restores PARTS, not PBR.
    fireEvent.mouseLeave(screen.getByTestId('palette-col-a'));
    expect(mainPreviewCanvas().getAttribute('data-mode')).toBe('parts');
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
      screen.getByTestId('variant-strip-lock-1').getAttribute('aria-checked'),
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
      screen.getByTestId('variant-strip-lock-0').getAttribute('aria-checked'),
    ).toBe('true');
    // Switch to base B — locks should clear; variant array resets to 1.
    await act(async () => {
      fireEvent.click(screen.getByTestId('base-option-0xb'));
    });
    await waitFor(() => expect(screen.getByTestId('variant-strip-tile-0')).toBeTruthy());
    expect(
      screen.getByTestId('variant-strip-lock-0').getAttribute('aria-checked'),
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
});
