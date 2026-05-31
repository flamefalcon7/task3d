import { describe, it, expect } from 'vitest';
import {
  WALRUS_AGGREGATOR,
  glbUrlForSummary,
  previewStillUrlForSummary,
  thumbSourceForSummary,
} from './aggregator';

// plan-026 D-075 — catalog render-path selection. The load-bearing invariant:
// an ENCRYPTED base (glb_blob_id holds AES ciphertext) must NEVER resolve to a
// GLB URL — it renders a public preview still instead.

describe('previewStillUrlForSummary', () => {
  it('returns the first preview blob as an aggregator URL', () => {
    expect(previewStillUrlForSummary({ previewBlobIds: ['still-1', 'still-2'] })).toBe(
      `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/still-1`,
    );
  });

  it('returns null when there are no previews', () => {
    expect(previewStillUrlForSummary({ previewBlobIds: [] })).toBeNull();
  });
});

describe('thumbSourceForSummary', () => {
  const base = {
    patchId: '',
    glbBlobId: 'glb-ciphertext-or-mesh',
    blobId: '',
  };

  it('PERMISSIONLESS / unencrypted → renders the live GLB mesh', () => {
    const t = thumbSourceForSummary({ ...base, isEncrypted: false, previewBlobIds: [] });
    expect(t).toEqual({ kind: 'glb', url: glbUrlForSummary(base) });
  });

  it('encrypted ALLOW_LIST → renders the preview still, NEVER the ciphertext as a GLB', () => {
    const t = thumbSourceForSummary({
      ...base,
      isEncrypted: true,
      previewBlobIds: ['preview-1'],
    });
    expect(t).toEqual({ kind: 'preview', url: `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/preview-1` });
    // The ciphertext blob id must NOT appear in the resolved url.
    expect(t.url).not.toContain('glb-ciphertext-or-mesh');
  });

  it('encrypted base with no still → preview kind with null url (placeholder, never the ciphertext)', () => {
    const t = thumbSourceForSummary({ ...base, isEncrypted: true, previewBlobIds: [] });
    expect(t).toEqual({ kind: 'preview', url: null });
  });
});
