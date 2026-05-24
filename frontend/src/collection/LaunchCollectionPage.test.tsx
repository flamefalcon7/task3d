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

vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => <div data-testid="preview-canvas-mock">{glbUrl}</div>,
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

  it('build request resolves variants[i].partColors via base.partLabels → palette lookup', async () => {
    // Segmented base: 4 unique labels across 4 parts.
    useModelIndexMock.mockReturnValue({
      models: [
        summary({
          objectId: '0xseg',
          glbBlobId: 'glb-seg',
          partLabels: ['primary', 'secondary', 'accent', 'detail'],
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
      fireEvent.click(screen.getByTestId('base-option-0xseg'));
    });
    await waitFor(() => expect(screen.getByTestId('authoring')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByTestId('preview-button'));
    });

    await waitFor(() => expect(buildBodies.length).toBeGreaterThan(0));
    const body = JSON.parse(buildBodies[0]!);
    expect(body.variants[0].partColors).toHaveLength(4);
    // Default palette hex from newVariantRow is '#cc3333' for every label, so
    // each resolved baseColorRgb maps to the same float tuple. Asserting the
    // length + tuple shape confirms the positional contract: one entry per
    // partLabels element, in order.
    const expected = [204 / 255, 51 / 255, 51 / 255, 1];
    for (const pc of body.variants[0].partColors) {
      pc.baseColorRgb.forEach((n: number, idx: number) =>
        expect(n).toBeCloseTo(expected[idx]!, 5),
      );
    }
    // paramsJson round-trip stores the palette + texture (U7 lineage shape).
    const params = JSON.parse(body.variants[0].paramsJson);
    expect(params.palette).toMatchObject({
      primary: '#cc3333',
      secondary: '#cc3333',
      accent: '#cc3333',
      detail: '#cc3333',
    });
    expect(typeof params.texture).toBe('string');
  });

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
