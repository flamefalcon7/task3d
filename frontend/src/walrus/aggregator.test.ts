import { describe, it, expect } from 'vitest';
import {
  WALRUS_AGGREGATOR,
  glbUrlForSummary,
  previewStillUrlForSummary,
  previewStillUrlsForSummary,
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

// audit W-4 — blob ids come from attacker-publishable on-chain data, so a crafted
// id must never be spliced into an aggregator URL. Valid base64url ids resolve
// normally; anything with `/`, `.`, `%`, or other traversal chars resolves to a
// safe empty/null so the caller falls back to a placeholder.
describe('blob id validation (W-4)', () => {
  it('valid base64url ids resolve to a normal aggregator URL', () => {
    expect(glbUrlForSummary({ patchId: '', glbBlobId: 'aZ09_-id', blobId: '' })).toBe(
      `${WALRUS_AGGREGATOR}/v1/blobs/aZ09_-id`,
    );
    expect(previewStillUrlForSummary({ previewBlobIds: ['still_1-ok'] })).toBe(
      `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/still_1-ok`,
    );
  });

  it.each([
    '../../../etc/passwd',
    '%2e%2e%2fsecret',
    'has/slash',
    'has.dot',
    'has space',
    'has?query=1',
  ])('rejects crafted id %s → empty/placeholder, never a crafted URL', (bad) => {
    expect(glbUrlForSummary({ patchId: '', glbBlobId: bad, blobId: '' })).toBe('');
    expect(glbUrlForSummary({ patchId: bad, glbBlobId: 'safe', blobId: '' })).toBe('');
    expect(previewStillUrlForSummary({ previewBlobIds: [bad] })).toBeNull();
  });

  it('previewStillUrlsForSummary drops malformed ids and keeps valid ones', () => {
    expect(
      previewStillUrlsForSummary({ previewBlobIds: ['good-1', '../evil', 'good-2'] }),
    ).toEqual([
      `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/good-1`,
      `${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-patch-id/good-2`,
    ]);
  });
});
