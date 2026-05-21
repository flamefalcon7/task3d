import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

// PreviewCanvas pulls in Babylon, which jsdom can't run. Stub it with a
// div carrying data-glb-url so URL-construction tests still have something
// to assert on.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-stub" data-glb-url={glbUrl ?? ''} />
  ),
}));

import { CollectionCard } from './CollectionCard';

function makeModel(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xa',
    blobId: 'blob-1',
    collectionId: '0xcoll',
    patchId: 'patch-1',
    creator: '0x1234567890abcdef',
    shapeType: 'box',
    paramsJson: '{"shape":"box"}',
    name: 'Demo Box',
    directAccessPrice: '100000000',
    tags: ['weapon'],
    createdAtMs: '1700000000000',
    lineageBlobId: 'lin-1',
    glbBlobId: 'glb-1',
    derivativeMintFee: '0',
    derivativeRoyaltyBps: 0,
    ...overrides,
  };
}

function renderCard(props: { collectionId: string; variants: Model3DSummary[] }) {
  return render(
    <MemoryRouter>
      <CollectionCard {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('CollectionCard', () => {
  it('shows variant count badge for multi-variant collection', () => {
    const variants = Array.from({ length: 16 }, (_, i) =>
      makeModel({ objectId: `0xv${i}`, patchId: `patch-${i}` }),
    );
    renderCard({ collectionId: '0xcoll', variants });
    expect(screen.getByTestId('collection-card-badge').textContent).toContain('16 variants');
  });

  it('renders singular badge for degenerate-of-1 collection', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ patchId: '' })],
    });
    expect(screen.getByTestId('collection-card-badge').textContent).toContain('1 variant');
    expect(screen.getByTestId('collection-card-badge').textContent).not.toContain('variants');
  });

  it('navigates to /collection/<collectionId> on click', () => {
    renderCard({
      collectionId: '0xdeadbeef',
      variants: [makeModel()],
    });
    const link = screen.getByTestId('collection-card-0xdeadbeef') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/collection/0xdeadbeef');
  });

  it('preview canvas uses Walrus quilt-patch URL when patchId is set', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ patchId: 'my-patch-id' })],
    });
    const stub = screen.getByTestId('preview-canvas-stub');
    expect(stub.getAttribute('data-glb-url')).toContain(
      '/v1/blobs/by-quilt-patch-id/my-patch-id',
    );
  });

  it('preview canvas falls back to whole-blob URL when patchId is empty', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ patchId: '', blobId: 'blob-xyz' })],
    });
    const stub = screen.getByTestId('preview-canvas-stub');
    const url = stub.getAttribute('data-glb-url') ?? '';
    expect(url).toContain('/v1/blobs/blob-xyz');
    expect(url).not.toContain('by-quilt-patch-id');
  });
});
