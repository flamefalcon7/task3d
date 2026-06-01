import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

// Stub Babylon-backed preview so jsdom doesn't try to run WebGL.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-stub" data-glb-url={glbUrl ?? ''} />
  ),
}));

const useCollectionsMock = vi.fn();
vi.mock('../integration/useCollections', () => ({
  useCollections: (...a: unknown[]) => useCollectionsMock(...a),
  POLICY_PERMISSIONLESS: 2,
}));

import { BrowsePage } from './BrowsePage';
import * as hookMod from './useModelIndex';

function mockHook(result: Partial<hookMod.UseModelIndexResult>): void {
  vi.spyOn(hookMod, 'useModelIndex').mockImplementation((opts) => {
    const all = result.models ?? [];
    const filtered = opts?.tagFilter ? all.filter((m) => m.tags.includes(opts.tagFilter!)) : all;
    return {
      models: filtered,
      loading: result.loading ?? false,
      error: result.error ?? null,
      refetch: result.refetch ?? (() => {}),
    };
  });
}

function makeModel(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xaaa',
    blobId: 'blob-1',
    collectionId: '0xcoll-1',
    patchId: '',
    creator: '0x1234567890abcdef',
    shapeType: 'box',
    paramsJson: '{"shape":"box"}',
    name: 'Demo Box',
    directAccessPrice: '100000000',
    tags: ['weapon'],
    partLabels: [],
    createdAtMs: '1700000000000',
    lineageBlobId: 'lin-1',
    glbBlobId: 'glb-1',
    derivativeMintFee: '0',
    accessFee: '0',
    derivativeRoyaltyBps: 0,
    policy: 2,
    isEncrypted: false,
    previewBlobIds: [],
    ...overrides,
  };
}

function renderPage(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BrowsePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  useCollectionsMock.mockReturnValue({ collections: [], loading: false, error: null });
});

afterEach(() => {
  cleanup();
});

describe('BrowsePage', () => {
  it('renders empty state when no models', () => {
    mockHook({ models: [] });
    renderPage();
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  it('renders loading state', () => {
    mockHook({ models: [], loading: true });
    renderPage();
    expect(screen.getByTestId('loading-state')).toBeTruthy();
  });

  it('renders error state with retry', () => {
    mockHook({ models: [], error: new Error('boom') });
    renderPage();
    const alert = screen.getByTestId('error-state');
    expect(alert.textContent).toContain('boom');
    expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);
  });

  it('renders a grid of cards from the hook (one card per distinct collection)', () => {
    // Each makeModel defaults to collectionId '0xcoll-1' — so without overrides
    // these three variants collapse into a single CollectionCard. We give each
    // a distinct collectionId so the grid still shows three cards.
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b', shapeType: 'sword' }),
        makeModel({ objectId: '0xc', collectionId: '0xc-c', shapeType: 'sphere', tags: ['armor'] }),
      ],
    });
    renderPage();
    expect(screen.getByTestId('model-grid')).toBeTruthy();
    expect(screen.getByTestId('collection-card-0xc-a')).toBeTruthy();
    expect(screen.getByTestId('collection-card-0xc-b')).toBeTruthy();
    expect(screen.getByTestId('collection-card-0xc-c')).toBeTruthy();
  });

  it('groups variants sharing one collection_id into a single collection card (U5)', () => {
    const variants = Array.from({ length: 16 }, (_, i) =>
      makeModel({ objectId: `0xv${i}`, collectionId: '0xshared', patchId: `p${i}` }),
    );
    mockHook({ models: variants });
    renderPage();
    // 16 variants → 1 card, with a "16 variants" badge
    expect(screen.getByTestId('collection-card-0xshared')).toBeTruthy();
    expect(screen.queryByTestId('collection-card-0xv0')).toBeNull();
    expect(screen.getByTestId('collection-card-badge').textContent).toContain('16 variants');
  });

  it('renders a solo collection card for a Phase 2 degenerate-of-1 mint (U5)', () => {
    mockHook({
      models: [makeModel({ objectId: '0xa', collectionId: '0xsolo', patchId: '' })],
    });
    renderPage();
    expect(screen.getByTestId('collection-card-0xsolo')).toBeTruthy();
    expect(screen.getByTestId('collection-card-badge').textContent).toContain('1 variant');
    expect(screen.getByTestId('collection-card-badge').textContent).not.toContain('variants');
  });

  it('renders multiple collection cards for multiple distinct collections (U5)', () => {
    const mkGroup = (cid: string, n: number) =>
      Array.from({ length: n }, (_, i) => makeModel({ objectId: `${cid}-v${i}`, collectionId: cid }));
    mockHook({
      models: [...mkGroup('0xc-1', 4), ...mkGroup('0xc-2', 4), ...mkGroup('0xc-3', 4)],
    });
    renderPage();
    expect(screen.getByTestId('collection-card-0xc-1')).toBeTruthy();
    expect(screen.getByTestId('collection-card-0xc-2')).toBeTruthy();
    expect(screen.getByTestId('collection-card-0xc-3')).toBeTruthy();
    // 3 collection cards, each with a 4-variant badge
    const badges = screen.getAllByTestId('collection-card-badge');
    expect(badges).toHaveLength(3);
    for (const b of badges) {
      expect(b.textContent).toContain('4 variants');
    }
  });

  it('tag filter narrows visible collections (U5: filter applies pre-grouping)', () => {
    // Distinct collectionId per model so the filter visibly removes cards
    // rather than collapsing into a multi-variant group.
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a', tags: ['weapon'] }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b', tags: ['armor'] }),
        makeModel({ objectId: '0xc', collectionId: '0xc-c', tags: ['weapon', 'metal'] }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('tag-filter'), { target: { value: 'armor' } });
    expect(screen.queryByTestId('collection-card-0xc-a')).toBeNull();
    expect(screen.getByTestId('collection-card-0xc-b')).toBeTruthy();
    expect(screen.queryByTestId('collection-card-0xc-c')).toBeNull();
  });

  it('calls refetch when the refresh button is clicked', () => {
    const refetch = vi.fn();
    mockHook({ models: [makeModel()], refetch });
    renderPage();
    fireEvent.click(screen.getByTestId('refresh-button'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // ─── U14: ?filter=integration view (R17) ───

  it('does not fetch collections in the default (non-integration) view', () => {
    mockHook({ models: [makeModel()] });
    renderPage();
    // useCollections is called with enabled=false so it skips the network.
    expect(useCollectionsMock).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('integration-view')).toBeNull();
  });

  it('?filter=integration lists only permissionless collections (R17)', () => {
    mockHook({ models: [{ ...makeModel({ objectId: '0xbase', name: 'Roadster' }) }] });
    useCollectionsMock.mockReturnValue({
      collections: [
        {
          collectionId: '0xopen',
          baseModelId: '0xbase',
          baseCreator: '0xb',
          nftCreator: '0xn',
          baseRoyaltyBps: 500,
          integrationPolicy: 2, // permissionless
          registerFee: '100000000',
        },
        {
          collectionId: '0xclosed',
          baseModelId: '0xbase',
          baseCreator: '0xb',
          nftCreator: '0xn',
          baseRoyaltyBps: 500,
          integrationPolicy: 0, // restricted
          registerFee: '0',
        },
      ],
      loading: false,
      error: null,
    });
    renderPage('/browse?filter=integration');
    expect(useCollectionsMock).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('integration-grid')).toBeTruthy();
    expect(screen.getByTestId('integration-card-0xopen')).toBeTruthy();
    expect(screen.queryByTestId('integration-card-0xclosed')).toBeNull();
    // card links to the collection detail page
    expect(
      (screen.getByTestId('integration-card-0xopen') as HTMLAnchorElement).getAttribute('href'),
    ).toBe('/collection/0xopen');
    // model grid is hidden in this view
    expect(screen.queryByTestId('model-grid')).toBeNull();
  });

  it('?filter=integration shows the empty state when no collection is open', () => {
    mockHook({ models: [] });
    useCollectionsMock.mockReturnValue({ collections: [], loading: false, error: null });
    renderPage('/browse?filter=integration');
    expect(screen.getByTestId('integration-empty')).toBeTruthy();
  });
});
