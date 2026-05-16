import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

const useCollectionBySlugMock = vi.fn();
vi.mock('./useCollectionBySlug', () => ({
  useCollectionBySlug: (slug: string) => useCollectionBySlugMock(slug),
}));

vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => null,
}));

import { CollectionDetailPage } from './CollectionDetailPage';

function makeModel(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xv0',
    blobId: 'blob-quilt',
    collectionId: '0xcoll',
    patchId: 'patch-0',
    creator: '0x1234567890abcdef',
    shapeType: 'box',
    paramsJson: '{"shape":"box"}',
    name: 'Variant 0',
    directAccessPrice: '100000000',
    tags: [],
    createdAtMs: '1700000000000',
    lineageBlobId: 'lin-1',
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
  useCollectionBySlugMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('CollectionDetailPage', () => {
  it('renders N variant tiles when the collection loads', () => {
    const variants = Array.from({ length: 16 }, (_, i) =>
      makeModel({
        objectId: `0xv${i}`,
        patchId: `patch-${i}`,
        name: `Demo Car #${i + 1}`,
      }),
    );
    useCollectionBySlugMock.mockReturnValue({ variants, loading: false, error: null });

    renderAt('0xcoll');
    expect(screen.getByTestId('variant-grid')).toBeTruthy();
    for (let i = 0; i < 16; i++) {
      expect(screen.getByTestId(`variant-tile-0xv${i}`)).toBeTruthy();
    }
    expect(screen.getByTestId('collection-variant-count').textContent).toContain('16 variants');
  });

  it('each tile preview uses its variant-specific patchId aggregator URL', () => {
    const variants = [
      makeModel({ objectId: '0xv0', patchId: 'patch-aaa' }),
      makeModel({ objectId: '0xv1', patchId: 'patch-bbb' }),
    ];
    useCollectionBySlugMock.mockReturnValue({ variants, loading: false, error: null });

    renderAt('0xcoll');
    const img0 = screen.getByTestId('variant-preview-0xv0') as HTMLImageElement;
    const img1 = screen.getByTestId('variant-preview-0xv1') as HTMLImageElement;
    expect(img0.src).toContain('/v1/blobs/by-quilt-patch-id/patch-aaa');
    expect(img1.src).toContain('/v1/blobs/by-quilt-patch-id/patch-bbb');
    expect(img0.src).not.toBe(img1.src);
  });

  it('clicking a variant tile links to /model/<objectId>', () => {
    const variants = [makeModel({ objectId: '0xMODELv7' })];
    useCollectionBySlugMock.mockReturnValue({ variants, loading: false, error: null });

    renderAt('0xcoll');
    const tile = screen.getByTestId('variant-tile-0xMODELv7') as HTMLAnchorElement;
    expect(tile.getAttribute('href')).toBe('/model/0xMODELv7');
  });

  it('renders loading state', () => {
    useCollectionBySlugMock.mockReturnValue({ variants: [], loading: true, error: null });
    renderAt('0xcoll');
    expect(screen.getByTestId('collection-loading')).toBeTruthy();
  });

  it('renders empty state when no variants match', () => {
    useCollectionBySlugMock.mockReturnValue({ variants: [], loading: false, error: null });
    renderAt('0xnotfound');
    expect(screen.getByTestId('collection-empty')).toBeTruthy();
  });

  it('renders error state when load fails', () => {
    useCollectionBySlugMock.mockReturnValue({
      variants: [],
      loading: false,
      error: new Error('GraphQL 502'),
    });
    renderAt('0xcoll');
    expect(screen.getByTestId('collection-error').textContent).toContain('502');
  });
});
