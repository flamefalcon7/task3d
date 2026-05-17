import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

const useCollectionBySlugMock = vi.fn();
vi.mock('./useCollectionBySlug', () => ({
  useCollectionBySlug: (slug: string) => useCollectionBySlugMock(slug),
}));

// Stub Babylon-backed preview so jsdom doesn't try to run WebGL.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-stub" data-glb-url={glbUrl ?? ''} />
  ),
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
    const url0 =
      screen.getByTestId('variant-preview-0xv0').querySelector('[data-glb-url]')?.getAttribute('data-glb-url') ?? '';
    const url1 =
      screen.getByTestId('variant-preview-0xv1').querySelector('[data-glb-url]')?.getAttribute('data-glb-url') ?? '';
    expect(url0).toContain('/v1/blobs/by-quilt-patch-id/patch-aaa');
    expect(url1).toContain('/v1/blobs/by-quilt-patch-id/patch-bbb');
    expect(url0).not.toBe(url1);
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
