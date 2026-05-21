import { Link, useParams } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
import { useCollectionBySlug } from './useCollectionBySlug';
import { SignInButton } from '../auth/SignInButton';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { glbUrlForSummary } from '../walrus/aggregator';

// Phase 3 (U5): Browse → collection card → here. Renders all N variants of
// a collection as a grid of tiles, each fetched directly from the Walrus
// testnet aggregator via its quilt-patch URL (R9 confirmed pattern). Click
// a tile → existing /model/:objectId detail page (which owns the buy flow).
//
// Slug strategy is the collectionId verbatim (see CollectionCard header). A
// Phase 4 indexer can switch this to human slugs without changing the route
// signature.

function truncate(addr: string, head = 6, tail = 4): string {
  if (!addr || addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function formatSui(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n) || n <= 0) return 'Free';
  const sui = n / 1_000_000_000;
  return `${sui.toFixed(sui < 0.01 ? 4 : 2)} SUI`;
}

function deriveCollectionName(variants: Model3DSummary[]): string {
  const first = variants[0];
  if (!first) return 'Collection';
  if (variants.length === 1) return first.name || `Model ${truncate(first.objectId)}`;
  const stripped = first.name.replace(/\s*#\d+\s*$/, '').trim();
  return stripped || first.name || 'Collection';
}

export function CollectionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { variants, loading, error } = useCollectionBySlug(slug ?? '');

  if (!slug) {
    return (
      <div style={{ padding: 16 }} data-testid="collection-invalid">
        Invalid collection slug.
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }} data-testid="collection-loading">
        Loading collection…
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" style={{ padding: 20, color: 'salmon' }} data-testid="collection-error">
        Couldn't load this collection: {error.message}
      </div>
    );
  }
  if (variants.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }} data-testid="collection-empty">
        Collection not found.{' '}
        <Link to="/" style={{ color: '#7aa2ff' }}>Back to Browse</Link>
      </div>
    );
  }

  const name = deriveCollectionName(variants);
  const creator = variants[0]!.creator;

  return (
    <div
      style={{ minHeight: '100vh', background: '#15171b', color: '#ddd', fontFamily: 'system-ui' }}
      data-testid="collection-detail"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid #222',
        }}
      >
        <Link to="/" style={{ color: '#7aa2ff', textDecoration: 'none', fontSize: 14 }}>
          ← Back to Browse
        </Link>
        <div style={{ minWidth: 200 }}>
          <SignInButton />
        </div>
      </header>

      <section style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 8px 0' }} data-testid="collection-name">
          {name}
        </h1>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 24 }}>
          by <code data-testid="collection-creator">{truncate(creator)}</code> ·{' '}
          <span data-testid="collection-variant-count">{variants.length} variant{variants.length === 1 ? '' : 's'}</span>
        </div>

        <div
          data-testid="variant-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          {variants.map((v) => (
            <Link
              key={v.objectId}
              to={`/model/${v.objectId}`}
              data-testid={`variant-tile-${v.objectId}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                border: '1px solid #2a2d33',
                borderRadius: 8,
                background: '#1a1c20',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  aspectRatio: '1 / 1',
                  background: '#15171b',
                  overflow: 'hidden',
                }}
                data-testid={`variant-preview-${v.objectId}`}
              >
                {/* One Babylon canvas per tile. Browsers cap WebGL contexts
                    at ~8-16 per page; collections above that count will see
                    later tiles render as black. Acceptable for v1 since the
                    cap is 16 variants per Move contract. */}
                <PreviewCanvas glbUrl={glbUrlForSummary(v)} />
              </div>
              <div style={{ padding: 10 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {v.name || `Variant ${truncate(v.objectId)}`}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 11, color: '#aaa' }}>{v.shapeType}</span>
                  <span data-testid={`variant-price-${v.objectId}`} style={{ fontSize: 12, fontWeight: 600 }}>
                    {formatSui(v.directAccessPrice)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
