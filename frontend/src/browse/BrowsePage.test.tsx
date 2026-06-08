import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary, RecallChip } from '@overflow2026/shared';

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

// plan 2026-06-08-002 U3 — session + recall + sign-in mocks. NOTE: this file
// resets via vi.restoreAllMocks(), which does NOT reset hoisted vi.mock module
// factories — so these are backed by mutable module-scope state reset manually
// in beforeEach (see below), or lanes/session leak across tests.
const useSessionMock = vi.fn();
vi.mock('../auth/useSession', () => ({
  useSession: () => useSessionMock(),
  isJwtExpired: () => false,
}));

vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => <div data-testid="signin-buttons" />,
}));

type RecallLane = {
  chips: RecallChip[];
  status: 'idle' | 'loading' | 'ready' | 'empty';
  degraded: boolean;
  recall: ReturnType<typeof vi.fn>;
};
let memoryRecallState: { personal: RecallLane; global: RecallLane };
vi.mock('../memory/useMemoryRecall', () => ({
  useMemoryRecall: () => memoryRecallState,
}));

function lane(
  chips: RecallChip[] = [],
  opts: { status?: RecallLane['status']; degraded?: boolean } = {},
): RecallLane {
  return {
    chips,
    status: opts.status ?? (chips.length ? 'ready' : 'idle'),
    degraded: opts.degraded ?? false,
    recall: vi.fn(),
  };
}

function hit(modelId: string, distance: number, prompt = 'a prompt'): RecallChip {
  return { modelId, distance, prompt } as RecallChip;
}

const SIGNED_IN = { session: { address: '0xme', jwt: 'jwt-token' } };
const SIGNED_OUT = { session: null };

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
  // Reset hoisted-factory-backed state explicitly (restoreAllMocks won't).
  memoryRecallState = { personal: lane(), global: lane() };
  useSessionMock.mockReturnValue(SIGNED_IN);
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

  // ─── U3: semantic "Ask" search ───

  function precedes(first: Element, second: Element): boolean {
    return Boolean(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }

  it('AE2: signed-out shows a login teaser, no search input, and no recall path', () => {
    useSessionMock.mockReturnValue(SIGNED_OUT);
    mockHook({ models: [makeModel()] });
    renderPage();
    expect(screen.getByTestId('browse-search-signin')).toBeTruthy();
    expect(screen.getByTestId('signin-buttons')).toBeTruthy();
    // No input element exists, so there is no onChange/autofill path to recall.
    expect(screen.queryByTestId('browse-search-input')).toBeNull();
  });

  it('signed-out hides the search entirely in the integration view too', () => {
    useSessionMock.mockReturnValue(SIGNED_OUT);
    mockHook({ models: [makeModel()] });
    renderPage('/browse?filter=integration');
    expect(screen.queryByTestId('browse-search')).toBeNull();
    expect(screen.queryByTestId('browse-search-signin')).toBeNull();
  });

  it('hides the search field in the integration view even when signed in', () => {
    // The whole browse-search row is gated on !integrationFilter.
    mockHook({ models: [makeModel()] });
    renderPage('/browse?filter=integration');
    expect(screen.queryByTestId('browse-search')).toBeNull();
    expect(screen.queryByTestId('browse-search-input')).toBeNull();
  });

  it('AE1: a semantic match promotes its collection to the front with a reason, others stay visible', () => {
    memoryRecallState.global = lane([hit('0xb', 0.3, 'a fast race car')]);
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b' }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'race car' } });
    expect(memoryRecallState.global.recall).toHaveBeenCalledWith('race car');
    const matched = screen.getByTestId('collection-card-0xc-b');
    const other = screen.getByTestId('collection-card-0xc-a');
    // Matched card promoted to the front; the unmatched card is still rendered.
    expect(precedes(matched, other)).toBe(true);
    expect(screen.getByTestId('collection-card-match-reason').textContent).toContain('a fast race car');
  });

  it('AE3: drives both personal + global recall and highlights a personal-scope (own model) match', () => {
    memoryRecallState.personal = lane([hit('0xa', 0.25, 'my own race car')]);
    mockHook({ models: [makeModel({ objectId: '0xa', collectionId: '0xc-a' })] });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'race car' } });
    expect(memoryRecallState.personal.recall).toHaveBeenCalledWith('race car');
    expect(memoryRecallState.global.recall).toHaveBeenCalledWith('race car');
    expect(screen.getByTestId('collection-card-match-reason').textContent).toContain('my own race car');
  });

  it('AE5: a tag-excluded match is not resurrected by search', () => {
    // 0xb matches semantically but is tagged 'armor'; filtering to 'weapon'
    // must keep it hidden — search never un-hides a tag-excluded card.
    memoryRecallState.global = lane([hit('0xb', 0.2, 'armored thing')]);
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a', tags: ['weapon'] }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b', tags: ['armor'] }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('tag-filter'), { target: { value: 'weapon' } });
    expect(screen.getByTestId('collection-card-0xc-a')).toBeTruthy();
    expect(screen.queryByTestId('collection-card-0xc-b')).toBeNull();
  });

  it('AE5: a match WITHIN the tag-filtered subset still promotes to the front', () => {
    // Both cards carry 'weapon'; only 0xw2 matches → it must promote ahead of
    // 0xw1 while the tag filter is active (proves reorder works post-filter).
    memoryRecallState.global = lane([hit('0xw2', 0.2, 'a sharp blade')]);
    mockHook({
      models: [
        makeModel({ objectId: '0xw1', collectionId: '0xc-w1', tags: ['weapon'] }),
        makeModel({ objectId: '0xw2', collectionId: '0xc-w2', tags: ['weapon'] }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('tag-filter'), { target: { value: 'weapon' } });
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'a sharp blade' } });
    const matched = screen.getByTestId('collection-card-0xc-w2');
    const other = screen.getByTestId('collection-card-0xc-w1');
    expect(precedes(matched, other)).toBe(true);
    expect(screen.getByTestId('collection-card-match-reason')).toBeTruthy();
  });

  it('AE6 / R9: a zero-match query keeps the full grid in default order, no "no results" state', () => {
    memoryRecallState = { personal: lane(), global: lane() }; // no chips → no match
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b' }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'nothing matches this' } });
    // Both cards still rendered, original order; the showing-all micro-status fires.
    const a = screen.getByTestId('collection-card-0xc-a');
    const b = screen.getByTestId('collection-card-0xc-b');
    expect(precedes(a, b)).toBe(true);
    expect(screen.getByTestId('browse-search-showing-all')).toBeTruthy();
    expect(screen.queryByTestId('collection-card-match-reason')).toBeNull();
  });

  it('R10: a degraded recall scope surfaces the degraded note, not an empty grid, and suppresses showing-all', () => {
    memoryRecallState.global = lane([], { degraded: true });
    mockHook({ models: [makeModel({ objectId: '0xa', collectionId: '0xc-a' })] });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'race car' } });
    expect(screen.getByTestId('browse-search-degraded')).toBeTruthy();
    expect(screen.getByTestId('collection-card-0xc-a')).toBeTruthy();
    // Mutual exclusion: degraded suppresses showing-all (the !searchDegraded gate).
    expect(screen.queryByTestId('browse-search-showing-all')).toBeNull();
  });

  it('shows the loading micro-status while a scope is loading, suppressing degraded + showing-all', () => {
    memoryRecallState.global = lane([], { status: 'loading', degraded: true });
    mockHook({ models: [makeModel()] });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'race car' } });
    expect(screen.getByTestId('browse-search-loading')).toBeTruthy();
    // loading gates both other statuses off (no contradictory co-render).
    expect(screen.queryByTestId('browse-search-degraded')).toBeNull();
    expect(screen.queryByTestId('browse-search-showing-all')).toBeNull();
  });

  it('Escape clears the query (and the active match clears with it)', () => {
    memoryRecallState.global = lane([hit('0xb', 0.3, 'a fast race car')]);
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b' }),
      ],
    });
    renderPage();
    const inputEl = screen.getByTestId('browse-search-input') as HTMLInputElement;
    fireEvent.change(inputEl, { target: { value: 'race car' } });
    expect(screen.getByTestId('collection-card-match-reason')).toBeTruthy();
    fireEvent.keyDown(inputEl, { key: 'Escape' });
    // Query cleared → searchActive false → grid back to default, no rings.
    expect(inputEl.value).toBe('');
    expect(screen.queryByTestId('collection-card-match-reason')).toBeNull();
    expect(screen.queryByTestId('browse-search-showing-all')).toBeNull();
  });

  it('tag-aware copy: showing-all drops the "showing all" lead when a tag filter is active', () => {
    memoryRecallState = { personal: lane(), global: lane() };
    mockHook({
      models: [makeModel({ objectId: '0xa', collectionId: '0xc-a', tags: ['weapon'] })],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('tag-filter'), { target: { value: 'weapon' } });
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'no match here' } });
    const status = screen.getByTestId('browse-search-showing-all');
    expect(status.textContent).toContain('no semantic matches');
    expect(status.textContent).not.toContain('showing all');
  });

  it('does not fire the showing-all / loading statuses for a sub-MIN_QUERY (1–2 char) query', () => {
    memoryRecallState = { personal: lane(), global: lane() };
    mockHook({ models: [makeModel()] });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'ab' } });
    expect(screen.queryByTestId('browse-search-showing-all')).toBeNull();
    expect(screen.queryByTestId('browse-search-loading')).toBeNull();
  });

  it('survives an in-page signed-out → signed-in transition without a hooks-count error', () => {
    useSessionMock.mockReturnValue(SIGNED_OUT);
    mockHook({ models: [makeModel()] });
    const { rerender } = renderPage();
    expect(screen.getByTestId('browse-search-signin')).toBeTruthy();
    useSessionMock.mockReturnValue(SIGNED_IN);
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <BrowsePage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('browse-search-input')).toBeTruthy();
  });

  // NOTE: this proves BrowsePage's OWN search wiring (effect + memo + render) is
  // StrictMode-idempotent under the double-invoke — it does NOT guard the recall
  // hook's mounted-ref, which is mocked out here. That guard lives in
  // useMemoryRecall.test.ts ('commits async recall correctly under StrictMode').
  it('StrictMode: BrowsePage search wiring renders results under the double-invoke', () => {
    memoryRecallState.global = lane([hit('0xb', 0.3, 'a fast race car')]);
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b' }),
      ],
    });
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/']}>
          <BrowsePage />
        </MemoryRouter>
      </StrictMode>,
    );
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'race car' } });
    expect(screen.getByTestId('collection-card-match-reason').textContent).toContain('a fast race car');
  });

  it('splits an active query with matches into a RESULTS band and an ALL MODELS band', () => {
    memoryRecallState.global = lane([hit('0xb', 0.3, 'a fast race car')]);
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b' }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'race car' } });
    // Two labeled bands.
    expect(screen.getByTestId('browse-split-view')).toBeTruthy();
    expect(screen.getByTestId('browse-results-heading').textContent).toContain('RESULTS · 1');
    expect(screen.getByTestId('browse-rest-heading')).toBeTruthy();
    // Matched card lives in the RESULTS grid; the unmatched card in ALL MODELS.
    const results = screen.getByTestId('model-grid');
    const rest = screen.getByTestId('browse-rest-grid');
    expect(results.contains(screen.getByTestId('collection-card-0xc-b'))).toBe(true);
    expect(rest.contains(screen.getByTestId('collection-card-0xc-a'))).toBe(true);
  });

  it('does NOT split when an active query has zero matches (single grid, no bands)', () => {
    memoryRecallState = { personal: lane(), global: lane() };
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b' }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('browse-search-input'), { target: { value: 'no matches at all' } });
    expect(screen.queryByTestId('browse-split-view')).toBeNull();
    expect(screen.queryByTestId('browse-rest-grid')).toBeNull();
    expect(screen.getByTestId('model-grid')).toBeTruthy();
  });

  it('does NOT split when there is no active query (default single grid)', () => {
    memoryRecallState.global = lane([hit('0xb', 0.3, 'a fast race car')]); // chips present…
    mockHook({
      models: [
        makeModel({ objectId: '0xa', collectionId: '0xc-a' }),
        makeModel({ objectId: '0xb', collectionId: '0xc-b' }),
      ],
    });
    renderPage(); // …but no query typed → searchActive false → no split
    expect(screen.queryByTestId('browse-split-view')).toBeNull();
    expect(screen.getByTestId('model-grid')).toBeTruthy();
    expect(screen.queryByTestId('collection-card-match-reason')).toBeNull();
  });
});
