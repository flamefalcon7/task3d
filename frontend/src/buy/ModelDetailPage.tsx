import { Link, useParams } from 'react-router-dom';
import { useModelById } from './hooks';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { glbUrlForSummary, previewStillUrlsForSummary } from '../walrus/aggregator';
import { TurntablePreview } from '../ux/TurntablePreview';

// L1 published-content detail page (`/model/:objectId`). v6 `Model3D` is shared
// content a creator publishes with license terms — it is NOT sold per-access
// (the Phase-2 `purchase_model_access` / `Access` receipt was removed). So this
// page presents the content + its fork terms and routes to /launch, where an
// nft creator forks it into a collection (pay-to-derive). User-facing token
// purchase is the separate L2 Kiosk flow (deferred).

function truncateAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

function mistToSui(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n) || n <= 0) return 'Free';
  return `${(n / 1e9).toString()} SUI`;
}

export function ModelDetailPage() {
  const { objectId } = useParams<{ objectId: string }>();
  const { model, loading, error } = useModelById(objectId ?? '');

  if (!objectId) {
    return (
      <div style={{ padding: 16 }} data-testid="detail-invalid">
        Invalid model ID.
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ padding: 16 }} data-testid="detail-loading">
        Loading…
      </div>
    );
  }
  if (error || !model) {
    return (
      <div style={{ padding: 16, color: 'crimson' }} data-testid="detail-error">
        Couldn't load this model.
      </div>
    );
  }

  const aggregatorUrl = glbUrlForSummary(model);
  // plan-026 — an encrypted base's `glbBlobId` is AES CIPHERTEXT, NOT a loadable
  // GLB. Render the public preview still (or a placeholder) instead of feeding
  // the ciphertext to Babylon (which hangs on "LOADING BASE MESH…"). The real
  // mesh is only obtainable by paying to fork (the forge decrypt flow).
  const previewUrls = previewStillUrlsForSummary(model);

  return (
    <div
      style={{
        padding: 16,
        maxWidth: 960,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: 24,
      }}
      data-testid="model-detail"
    >
      <div>
        <div
          style={{ aspectRatio: '1', background: '#15171b', borderRadius: 8, overflow: 'hidden' }}
          data-testid="preview-canvas-wrap"
        >
          {model.isEncrypted ? (
            previewUrls.length > 0 ? (
              <TurntablePreview
                urls={previewUrls}
                testId="detail-preview-still"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <div
                data-testid="detail-encrypted-placeholder"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: 16,
                  fontSize: 13,
                  opacity: 0.7,
                }}
              >
                Encrypted base — fork to unlock the mesh.
              </div>
            )
          ) : (
            <PreviewCanvas glbUrl={aggregatorUrl} />
          )}
        </div>
        {model.isEncrypted ? (
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }} data-testid="encrypted-blob-note">
            Encrypted base — the Walrus blob holds ciphertext; pay the fork fee to decrypt.
          </div>
        ) : (
          <a
            href={aggregatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, marginTop: 8, display: 'block' }}
            data-testid="walrus-link"
          >
            Walrus blob: {model.glbBlobId || model.blobId}
          </a>
        )}
      </div>
      <div>
        <h2 style={{ marginTop: 0 }} data-testid="model-name">
          {model.name}
        </h2>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          <strong>Creator:</strong>{' '}
          <code style={{ fontSize: 12 }}>{truncateAddr(model.creator)}</code>
        </div>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          <strong>Shape:</strong> {model.shapeType}
        </div>
        <div style={{ fontSize: 14, marginBottom: 12 }}>
          <strong>Tags:</strong>{' '}
          {model.tags.map((t) => (
            <span
              key={t}
              style={{
                display: 'inline-block',
                padding: '2px 6px',
                background: '#eee',
                borderRadius: 4,
                marginRight: 4,
                fontSize: 12,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* L1 license / fork terms (D-002 pay-to-derive). This is what an nft
            creator pays to fork the content on /launch — not an access price. */}
        <div data-testid="fork-terms" style={{ fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
          <div>
            <strong>Fork fee:</strong> {mistToSui(model.derivativeMintFee)}
          </div>
          <div>
            <strong>Resale royalty:</strong> {(model.derivativeRoyaltyBps / 100).toFixed(2)}%
          </div>
        </div>

        <details style={{ fontSize: 12, marginBottom: 12 }}>
          <summary>Params (json)</summary>
          <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, overflow: 'auto' }}>
            {model.paramsJson}
          </pre>
        </details>

        {model.glbBlobId ? (
          <Link
            to="/launch"
            data-testid="fork-cta"
            style={{
              display: 'inline-block',
              padding: '8px 14px',
              background: '#ffb86b',
              color: '#15171b',
              borderRadius: 6,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Fork this into a collection →
          </Link>
        ) : (
          <div data-testid="not-forkable" style={{ fontSize: 12, color: '#888' }}>
            This model has no standalone GLB and can’t be forked.
          </div>
        )}
      </div>
    </div>
  );
}
