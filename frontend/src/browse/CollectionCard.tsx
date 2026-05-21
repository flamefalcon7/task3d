import { Link } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { glbUrlForSummary } from '../walrus/aggregator';

// CollectionCard replaces ModelCard for the grouped Browse view (U5). One
// card per Collection — its preview/name are derived from the first variant
// in the group, and the "N variants" badge advertises the collection size.
//
// Slug strategy (v1 pragmatic): we route by `collectionId` directly. A nicer
// human slug would require either a CollectionPublished event indexer (Phase
// 4) or a `collection:slug:<foo>` tag convention; both are out of scope for
// U5. Using collectionId guarantees uniqueness and round-trips losslessly
// through useCollectionBySlug. URLs look like `/collection/0xabc…` which is
// ugly but bulletproof — listed as a Phase 4 follow-up.

interface Props {
  collectionId: string;
  variants: Model3DSummary[]; // 1..16
}

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

// Derive a human-readable collection name from the variants. For Phase 3
// proper, U1's CollectionPublished event would carry this; until the Phase 4
// indexer lands we approximate by stripping a trailing variant index from
// the first variant's name (e.g. "Red Car #1" → "Red Car") or falling back
// to the bare name. Degenerate-of-1 mints just use the model name verbatim.
function collectionNameFromVariants(variants: Model3DSummary[]): string {
  const first = variants[0]!;
  if (variants.length === 1) return first.name || `Model ${truncate(first.objectId)}`;
  const stripped = first.name.replace(/\s*#\d+\s*$/, '').trim();
  return stripped || first.name || 'Collection';
}

export function CollectionCard({ collectionId, variants }: Props) {
  const first = variants[0]!;
  const name = collectionNameFromVariants(variants);
  const variantCount = variants.length;
  const previewUrl = glbUrlForSummary(first);
  // A v6 L1 Model3D is standalone content with no collection_id, so Browse
  // buckets it under an `_orphan:<objectId>` group key (see groupByCollection).
  // Those have no /collection page to resolve — route them to the existing L1
  // /model/:objectId detail page instead of a dead collection slug.
  const isStandalone = !collectionId || collectionId.startsWith('_orphan:');
  const to = isStandalone ? `/model/${first.objectId}` : `/collection/${collectionId}`;

  return (
    <Link
      to={to}
      data-testid={`collection-card-${collectionId}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        border: '1px solid #2a2d33',
        borderRadius: 8,
        background: '#1a1c20',
        overflow: 'hidden',
        transition: 'border-color 120ms',
        position: 'relative',
      }}
    >
      <div
        style={{
          aspectRatio: '1 / 1',
          background: '#15171b',
          position: 'relative',
          overflow: 'hidden',
        }}
        data-testid="collection-card-preview"
      >
        {/* One Babylon canvas per card. Browsers cap WebGL contexts at
            ~8-16 per page — if the marketplace grows past ~6 cards, later
            cards will render black. Tracked as a Phase 5 follow-up
            (IntersectionObserver lazy-mount, or shared-engine thumbnails). */}
        <PreviewCanvas glbUrl={previewUrl} />
        <span
          data-testid="collection-card-badge"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontSize: 11,
            padding: '2px 8px',
            background: 'rgba(20, 22, 25, 0.85)',
            color: '#ddd',
            borderRadius: 12,
            border: '1px solid #2a2d33',
          }}
        >
          {variantCount} variant{variantCount === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ padding: 12 }}>
        <div
          data-testid="collection-card-name"
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
          by <span data-testid="collection-card-creator">{truncate(first.creator)}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, color: '#aaa' }}>{first.shapeType}</span>
          <span data-testid="collection-card-price" style={{ fontSize: 13, fontWeight: 600 }}>
            {formatSui(first.directAccessPrice)}
          </span>
        </div>
      </div>
    </Link>
  );
}
