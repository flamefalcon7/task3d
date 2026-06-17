import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
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
import type { BaseMatch } from './browseSearchRanking';

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
    accessFee: '0',
    derivativeRoyaltyBps: 0,
    policy: 2,
    isEncrypted: false,
    previewBlobIds: [],
    ...overrides,
  };
}

function renderCard(props: {
  collectionId: string;
  variants: Model3DSummary[];
  match?: BaseMatch;
}) {
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

  it('navigates to /collection/<collectionId> via the text body link (not the preview)', () => {
    renderCard({
      collectionId: '0xdeadbeef',
      variants: [makeModel()],
    });
    const link = screen.getByTestId('collection-card-link-0xdeadbeef') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/collection/0xdeadbeef');
  });

  it('links a standalone L1 model (orphan group) to /model/<objectId>, not the dead collection slug', () => {
    renderCard({
      collectionId: '_orphan:0xstand',
      variants: [makeModel({ objectId: '0xstand', collectionId: '', patchId: '', blobId: '', glbBlobId: 'g' })],
    });
    const link = screen.getByTestId('collection-card-link-_orphan:0xstand') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/model/0xstand');
  });

  it('keeps the preview well OUT of the navigation link (drag-to-rotate, no detail jump)', () => {
    renderCard({ collectionId: '0xc', variants: [makeModel()] });
    const card = screen.getByTestId('collection-card-0xc');
    const preview = screen.getByTestId('collection-card-preview');
    const link = screen.getByTestId('collection-card-link-0xc');
    // Card root is a plain container, not an anchor.
    expect(card.tagName).toBe('DIV');
    // The preview is a sibling of the link, never nested inside it — so a click
    // (or drag) on the 3D well cannot trigger navigation.
    expect(link.contains(preview)).toBe(false);
    expect(card.contains(preview)).toBe(true);
    expect(card.contains(link)).toBe(true);
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
    // Previews are quilt patches (co-located with the ciphertext in one quilt) →
    // resolved via by-quilt-patch-id, never the ciphertext blob.
    expect(still.src).toContain('/v1/blobs/by-quilt-patch-id/still-1');
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

  // plan 2026-06-08-001 U3 — description snippet derived from the first variant.
  it('shows a description snippet for a Tripo first-variant (R4)', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ paramsJson: JSON.stringify({ prompt: 'a low-poly red sports car' }) })],
    });
    expect(screen.getByTestId('collection-card-description').textContent).toBe('a low-poly red sports car');
  });

  it('shows a caption snippet for a captioned-upload first-variant', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ paramsJson: JSON.stringify({ source: 'upload', caption: 'a chunky walrus' }) })],
    });
    expect(screen.getByTestId('collection-card-description').textContent).toBe('a chunky walrus');
  });

  it('shows NO description for an uncaptioned-upload first-variant (R6)', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ paramsJson: JSON.stringify({ source: 'upload' }) })],
    });
    expect(screen.queryByTestId('collection-card-description')).toBeNull();
  });

  // plan 2026-06-17-001 — fees come from LicenseTerms (D-078), NOT the retired
  // direct_access_price field (which always read 0 → every card showed "Free").
  it('shows the fork fee and access fee from the license', () => {
    renderCard({
      collectionId: '0xc',
      variants: [makeModel({
        derivativeMintFee: '2000000000',
        accessFee: '1000000000',
        directAccessPrice: '0', // retired field — must NOT drive the display
      })],
    });
    const fork = screen.getByTestId('collection-card-price').textContent ?? '';
    expect(fork).toContain('2.00 SUI');
    expect(fork).toContain('FORK');
    const access = screen.getByTestId('collection-card-access-fee').textContent ?? '';
    expect(access).toContain('1.00 SUI');
    expect(access).toContain('ACCESS');
  });

  it('shows Free for a permissionless base whose fork + access fees are zero', () => {
    renderCard({
      collectionId: '0xc',
      variants: [makeModel({ derivativeMintFee: '0', accessFee: '0' })],
    });
    expect(screen.getByTestId('collection-card-price').textContent).toContain('Free');
    expect(screen.getByTestId('collection-card-access-fee').textContent).toContain('Free');
  });

  // plan 2026-06-08-002 U2 — semantic-search match highlight + reason.
  const strongMatch: BaseMatch = { distance: 0.2, strong: true, reason: 'a fast race car' };
  const weakMatch: BaseMatch = { distance: 0.6, strong: false, reason: 'a slow tractor' };

  it('renders the match reason and a ring when a match prop is given (AE1)', () => {
    renderCard({
      collectionId: '0xdeadbeef',
      variants: [makeModel({ paramsJson: JSON.stringify({ prompt: 'a fast race car' }) })],
      match: strongMatch,
    });
    expect(screen.getByTestId('collection-card-match-reason').textContent).toContain('a fast race car');
    const link = screen.getByTestId('collection-card-0xdeadbeef');
    expect(link.style.boxShadow).toContain('2px');
  });

  it('renders a strong match reason in ink and a weak one in hint', () => {
    const { unmount } = renderCard({
      collectionId: '0xc-strong',
      variants: [makeModel()],
      match: strongMatch,
    });
    const strongEl = screen.getByTestId('collection-card-match-reason');
    const strongColor = strongEl.style.color;
    unmount();
    renderCard({ collectionId: '0xc-weak', variants: [makeModel()], match: weakMatch });
    const weakColor = screen.getByTestId('collection-card-match-reason').style.color;
    // Distinct treatments: strong (ink) ≠ weak (hint).
    expect(strongColor).not.toBe(weakColor);
    expect(strongColor).toBeTruthy();
  });

  it('suppresses the static description snippet when a match is present (dedupe)', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ paramsJson: JSON.stringify({ prompt: 'a fast race car' }) })],
      match: strongMatch,
    });
    expect(screen.queryByTestId('collection-card-description')).toBeNull();
    expect(screen.getByTestId('collection-card-match-reason')).toBeTruthy();
  });

  it('renders no ring and no match reason when match is undefined (existing-card regression)', () => {
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel({ paramsJson: JSON.stringify({ prompt: 'a fast race car' }) })],
    });
    expect(screen.queryByTestId('collection-card-match-reason')).toBeNull();
    expect(screen.getByTestId('collection-card-0xcoll').style.boxShadow).toBe('');
    // The static description snippet still shows when there's no match.
    expect(screen.getByTestId('collection-card-description').textContent).toBe('a fast race car');
  });

  it('ellipsis-truncates a long match reason', () => {
    const longReason = 'x'.repeat(80);
    renderCard({
      collectionId: '0xcoll',
      variants: [makeModel()],
      match: { distance: 0.2, strong: true, reason: longReason },
    });
    const text = screen.getByTestId('collection-card-match-reason').textContent ?? '';
    expect(text).toContain('…');
    expect(text.length).toBeLessThan(longReason.length);
  });

  // ─── U4: lazy-mounted preview canvas ───
  describe('lazy-mount (U4)', () => {
    class MockIO {
      static instances: MockIO[] = [];
      cb: IntersectionObserverCallback;
      observed = new Set<Element>();
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
        MockIO.instances.push(this);
      }
      observe(el: Element) { this.observed.add(el); }
      unobserve(el: Element) { this.observed.delete(el); }
      disconnect() { this.observed.clear(); }
      fire(isIntersecting: boolean) {
        this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
    }
    const original = globalThis.IntersectionObserver;
    beforeEach(() => {
      MockIO.instances = [];
      globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
    });
    afterEach(() => {
      globalThis.IntersectionObserver = original;
    });
    const live = () => MockIO.instances[MockIO.instances.length - 1]!;

    it('defers the PreviewCanvas until the card scrolls into view, then mounts it', () => {
      renderCard({ collectionId: '0xlazy', variants: [makeModel({ patchId: 'p' })] });
      // Off-screen: no WebGL canvas yet.
      expect(screen.queryByTestId('preview-canvas-stub')).toBeNull();
      act(() => live().fire(true));
      // In view: the canvas mounts.
      expect(screen.getByTestId('preview-canvas-stub')).toBeTruthy();
    });
  });
});
