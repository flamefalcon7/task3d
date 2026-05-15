import { useParams } from 'react-router-dom';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useModelById, useOwnsAccess } from './hooks';
import { BuyAccessButton } from './BuyAccessButton';
import { SignInButton } from '../auth/SignInButton';

export function ModelDetailPage() {
  const { objectId } = useParams<{ objectId: string }>();
  const { model, loading, error } = useModelById(objectId ?? '');
  const account = useCurrentAccount();
  const ownsAccess = useOwnsAccess(account?.address, objectId ?? '');

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
      <div
        style={{ padding: 16, color: 'crimson' }}
        data-testid="detail-error"
      >
        Couldn't load this model.
      </div>
    );
  }

  const aggregatorUrl = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${model.blobId}`;

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
          style={{
            aspectRatio: '1',
            background: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
          }}
          data-testid="preview-placeholder"
        >
          {/* Phase 2: static placeholder. Phase 5 polish may render Babylon. */}
          <span style={{ fontSize: 64, opacity: 0.4 }}>◇</span>
        </div>
        <a
          href={aggregatorUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, marginTop: 8, display: 'block' }}
          data-testid="walrus-link"
        >
          Walrus blob: {model.blobId}
        </a>
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
        <details style={{ fontSize: 12, marginBottom: 12 }}>
          <summary>Params (json)</summary>
          <pre
            style={{
              background: '#f5f5f5',
              padding: 8,
              borderRadius: 4,
              overflow: 'auto',
            }}
          >
            {model.paramsJson}
          </pre>
        </details>
        <BuyAccessButton
          modelObjectId={model.objectId}
          priceMist={BigInt(model.directAccessPrice)}
          disabled={!account}
          alreadyOwned={ownsAccess}
        />
        {!account && (
          <div data-testid="signin-hint" style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
              Sign in to buy:
            </div>
            <SignInButton />
          </div>
        )}
      </div>
    </div>
  );
}

function truncateAddr(a: string): string {
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}
