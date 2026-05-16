import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
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

  it('preview img src uses Walrus quilt-patch URL when patchId is set', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ patchId: 'my-patch-id' })],
    });
    const img = screen.getByTestId('collection-card-preview') as HTMLImageElement;
    expect(img.src).toContain('/v1/blobs/by-quilt-patch-id/my-patch-id');
  });

  it('preview falls back to whole-blob URL when patchId is empty', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ patchId: '', blobId: 'blob-xyz' })],
    });
    const img = screen.getByTestId('collection-card-preview') as HTMLImageElement;
    expect(img.src).toContain('/v1/blobs/blob-xyz');
    expect(img.src).not.toContain('by-quilt-patch-id');
  });
});
