import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { NftCollectionSummary } from '../integration/useCollections';

const useCollectionByIdMock = vi.fn();
vi.mock('../integration/useCollections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../integration/useCollections')>();
  return {
    ...actual, // keep POLICY_PERMISSIONLESS for UsedBySection
    useCollectionById: (id: string | undefined) => useCollectionByIdMock(id),
  };
});

const useModelIndexMock = vi.fn();
vi.mock('../browse/useModelIndex', () => ({ useModelIndex: () => useModelIndexMock() }));

const useCollectionNamesMock = vi.fn();
vi.mock('../integration/useCollectionNames', () => ({
  useCollectionNames: () => useCollectionNamesMock(),
}));

vi.mock('../auth/SignInButton', () => ({ SignInButton: () => null }));

// Babylon needs WebGL — jsdom doesn't have it. Stub PreviewCanvas.
vi.mock('../babylon/PreviewCanvas', () => ({ PreviewCanvas: () => null }));

import { CollectionDetailPage } from './CollectionDetailPage';

function makeCollection(overrides: Partial<NftCollectionSummary> = {}): NftCollectionSummary {
  return {
    collectionId: '0xcoll',
    baseModelId: '0xbase',
    baseCreator: '0xbasecreator',
    nftCreator: '0xnftcreator',
    baseRoyaltyBps: 500,
    integrationPolicy: 2,
    registerFee: '100000000',
    ...overrides,
  };
}

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/collection/${slug}`]}>
      <Routes>
        <Route path="/collection/:slug" element={<CollectionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useCollectionByIdMock.mockReset();
  useModelIndexMock.mockReset();
  useModelIndexMock.mockReturnValue({ models: [{ objectId: '0xbase', name: 'Roadster' }], loading: false });
  useCollectionNamesMock.mockReset();
  // Default: no token-derived name → page falls back to the base-model label.
  useCollectionNamesMock.mockReturnValue({ names: new Map(), loading: false, error: null });
  // Default: UsedBySection's fetch resolves to no integrations.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ integrations: [] }),
  } as unknown as Response));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CollectionDetailPage', () => {
  it('renders the collection name (joined from base model) + economics', () => {
    useCollectionByIdMock.mockReturnValue({ collection: makeCollection(), loading: false, error: null });
    renderAt('0xcoll');
    expect(screen.getByTestId('collection-name').textContent).toMatch(/Roadster collection/);
    expect(screen.getByTestId('collection-register-fee').textContent).toMatch(/0\.10 SUI/);
    expect(screen.getByTestId('usedby-section')).toBeTruthy();
  });

  it('prefers the creator-chosen name (token-derived) over the base-model label', () => {
    useCollectionByIdMock.mockReturnValue({ collection: makeCollection(), loading: false, error: null });
    useCollectionNamesMock.mockReturnValue({
      names: new Map([['0xcoll', 'Neon drift']]),
      loading: false,
      error: null,
    });
    renderAt('0xcoll');
    expect(screen.getByTestId('collection-name').textContent).toBe('Neon drift');
  });

  it('shows a copyable Model ID that writes the base model id to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    useCollectionByIdMock.mockReturnValue({ collection: makeCollection(), loading: false, error: null });
    renderAt('0xcoll');
    const copyBtn = screen.getByTestId('copy-model-id');
    expect(copyBtn).toBeTruthy();
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith('0xbase'); // makeCollection().baseModelId
  });

  it('renders loading state', () => {
    useCollectionByIdMock.mockReturnValue({ collection: null, loading: true, error: null });
    renderAt('0xcoll');
    expect(screen.getByTestId('collection-loading')).toBeTruthy();
  });

  it('renders not-found state on error', () => {
    useCollectionByIdMock.mockReturnValue({
      collection: null,
      loading: false,
      error: new Error('Collection 0xnope not found'),
    });
    renderAt('0xnope');
    expect(screen.getByTestId('collection-empty')).toBeTruthy();
    // plan-020 U4 — error-state "Back to Browse" link points at /browse,
    // not the legacy / path that used to host the catalog.
    const backLink = screen.getByText('Back to Browse') as HTMLAnchorElement;
    expect(backLink.getAttribute('href')).toBe('/browse');
  });
});
