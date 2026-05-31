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
    partLabels: [],
    createdAtMs: '1700000000000',
    lineageBlobId: 'lin-1',
    glbBlobId: 'glb-1',
    derivativeMintFee: '0',
    derivativeRoyaltyBps: 0,
    policy: 2,
    isEncrypted: false,
    previewBlobIds: [],
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

  it('links a standalone L1 model (orphan group) to /model/<objectId>, not the dead collection slug', () => {
    renderCard({
      collectionId: '_orphan:0xstand',
      variants: [makeModel({ objectId: '0xstand', collectionId: '', patchId: '', blobId: '', glbBlobId: 'g' })],
    });
    const link = screen.getByTestId('collection-card-_orphan:0xstand') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/model/0xstand');
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

  it('preview canvas resolves a standalone L1 model via glb_blob_id (v6: no patchId/blobId)', () => {
    renderCard({
      collectionId: '_orphan:0xa',
      variants: [makeModel({ patchId: '', blobId: '', glbBlobId: 'glb-standalone' })],
    });
    const url = screen.getByTestId('preview-canvas-stub').getAttribute('data-glb-url') ?? '';
    expect(url).toContain('/v1/blobs/glb-standalone');
    expect(url).not.toContain('by-quilt-patch-id');
  });

  it('preview canvas falls back to the legacy whole-blob URL only when patchId and glbBlobId are both empty', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ patchId: '', blobId: 'blob-xyz', glbBlobId: '' })],
    });
    const stub = screen.getByTestId('preview-canvas-stub');
    const url = stub.getAttribute('data-glb-url') ?? '';
    expect(url).toContain('/v1/blobs/blob-xyz');
    expect(url).not.toContain('by-quilt-patch-id');
  });

  // plan-026 D-075 — encrypted ALLOW_LIST card renders the public preview still
  // (an <img>), NEVER the ciphertext glb_blob_id as a 3D GLB.
  it('renders the preview still for an encrypted ALLOW_LIST base, not a GLB canvas', () => {
    renderCard({
      collectionId: '_orphan:0xenc',
      variants: [
        makeModel({
          objectId: '0xenc',
          patchId: '',
          isEncrypted: true,
          policy: 1,
          glbBlobId: 'cipher-blob',
          previewBlobIds: ['still-1'],
        }),
      ],
    });
    const still = screen.getByTestId('collection-card-preview-still') as HTMLImageElement;
    expect(still.src).toContain('/v1/blobs/still-1');
    expect(still.src).not.toContain('cipher-blob');
    // No GLB canvas rendered for an encrypted base.
    expect(screen.queryByTestId('preview-canvas-stub')).toBeNull();
  });

  it('shows an ENCRYPTED placeholder for an encrypted base with no preview still', () => {
    renderCard({
      collectionId: '_orphan:0xenc2',
      variants: [
        makeModel({
          objectId: '0xenc2',
          patchId: '',
          isEncrypted: true,
          policy: 1,
          glbBlobId: 'cipher-blob',
          previewBlobIds: [],
        }),
      ],
    });
    expect(screen.getByTestId('collection-card-preview-locked')).toBeTruthy();
    expect(screen.queryByTestId('preview-canvas-stub')).toBeNull();
  });
});
