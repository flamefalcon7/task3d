import { Link, useParams } from 'react-router-dom';
import { SignInButton } from '../auth/SignInButton';
import { useCollectionById } from '../integration/useCollections';
import { useModelIndex } from '../browse/useModelIndex';
import { UsedBySection } from './UsedBySection';

// plan-008 U14 — L2 collection detail (`/collection/:slug`, slug = NftCollection
// object id). Reworked off the dead Phase-3 `useCollectionBySlug` path: v6
// `Model3D` no longer carries `collection_id`, so the collection relation lives
// on the L2 `NftCollection` itself. This page resolves that object, shows its
// economics, and renders the public "Used by" integration list. The colored
// variant tokens are driven on /track (owned-NftToken discovery, U11), so this
// page intentionally does not re-render a 3D variant grid.

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

export function CollectionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { collection, loading, error } = useCollectionById(slug);
  const { models } = useModelIndex();

  if (!slug) {
    return (
      <div style={{ padding: 16 }} data-testid="collection-invalid">
        Invalid collection id.
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
  if (error || !collection) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }} data-testid="collection-empty">
        Collection not found.{' '}
        <Link to="/" style={{ color: '#7aa2ff' }}>Back to Browse</Link>
      </div>
    );
  }

  const baseModel = models.find((m) => m.objectId === collection.baseModelId);
  const name = baseModel?.name ? `${baseModel.name} collection` : `Collection ${truncate(collection.collectionId)}`;

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

      <section style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, margin: '0 0 8px 0' }} data-testid="collection-name">
          {name}
        </h1>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 24 }}>
          launched by <code data-testid="collection-creator">{truncate(collection.nftCreator)}</code>
        </div>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '6px 16px',
            fontSize: 14,
          }}
        >
          <dt style={{ color: '#888' }}>Register fee</dt>
          <dd data-testid="collection-register-fee" style={{ margin: 0 }}>
            {formatSui(collection.registerFee)}
          </dd>
          <dt style={{ color: '#888' }}>Resale royalty</dt>
          <dd style={{ margin: 0 }}>{(collection.baseRoyaltyBps / 100).toFixed(2)}%</dd>
        </dl>

        <UsedBySection
          collectionId={collection.collectionId}
          integrationPolicy={collection.integrationPolicy}
        />

        <p style={{ marginTop: 24, fontSize: 13 }}>
          <Link to="/integrate" style={{ color: '#7aa2ff' }}>Register your game →</Link>
        </p>
      </section>
    </div>
  );
}
