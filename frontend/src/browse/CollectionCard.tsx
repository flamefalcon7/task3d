import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
import { modelDescription } from '@overflow2026/shared';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { thumbSourceForSummary, previewStillUrlsForSummary } from '../walrus/aggregator';
import { TurntablePreview } from '../ux/TurntablePreview';
import { monoLabel, tokens, viewerWell } from '../ux/tokens';

// CollectionCard replaces ModelCard for the grouped Browse view (U5). One
// card per Collection — its preview/name are derived from the first variant
// in the group, and the "N variants" badge advertises the collection size.
//
// Brutalist editorial styling per D-044: paper-pure card body with 1.5px
// ink border, pure-black viewer well, italic-serif name, mono creator/price.

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

const linkStyle: CSSProperties = {
  display: 'block',
  textDecoration: 'none',
  color: tokens.color.ink,
  background: tokens.color.paperPure,
  border: tokens.border.primary,
  overflow: 'hidden',
};

const wellStyle: CSSProperties = {
  ...viewerWell,
  aspectRatio: '1 / 1',
};

const badgeStyle: CSSProperties = {
  ...monoLabel,
  position: 'absolute',
  top: 8,
  right: 8,
  padding: '2px 8px',
  background: 'rgba(0, 0, 0, 0.75)',
  color: tokens.color.accent,
  border: `1px solid ${tokens.color.accent}`,
  letterSpacing: '1.5px',
};

const bodyStyle: CSSProperties = {
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  borderTop: tokens.border.primary,
};

const nameStyle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const creatorStyle: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  letterSpacing: '0.5px',
  fontSize: 11,
};

// plan 2026-06-08-001 U3 (R4) — one-line description snippet on the card,
// derived from the first variant (same source as name/preview). Null for an
// uncaptioned upload → nothing (R6).
const descriptionStyle: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  letterSpacing: '0.3px',
  textTransform: 'none',
  fontSize: 11,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const priceRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
};

const shapeChip: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  fontSize: 10,
};

const priceStyle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
};

export function CollectionCard({ collectionId, variants }: Props) {
  const first = variants[0]!;
  const name = collectionNameFromVariants(variants);
  const variantCount = variants.length;
  const description = modelDescription(first);
  // plan-026 D-075 — encrypted ALLOW_LIST bases render their public preview
  // still (an <img>), NEVER the ciphertext glb_blob_id as a 3D GLB.
  // PERMISSIONLESS + legacy bases render the live mesh as before.
  const thumb = thumbSourceForSummary(first);
  // A v6 L1 Model3D is standalone content with no collection_id, so Browse
  // buckets it under an `_orphan:<objectId>` group key (see groupByCollection).
  // Those have no /collection page to resolve — route them to the existing L1
  // /model/:objectId detail page instead of a dead collection slug.
  const isStandalone = !collectionId || collectionId.startsWith('_orphan:');
  const to = isStandalone ? `/model/${first.objectId}` : `/collection/${collectionId}`;

  return (
    <Link to={to} data-testid={`collection-card-${collectionId}`} style={linkStyle}>
      <div style={wellStyle} data-testid="collection-card-preview">
        {/* One Babylon canvas per card. Browsers cap WebGL contexts at
            ~8-16 per page — if the marketplace grows past ~6 cards, later
            cards will render black. Tracked as a Phase 5 follow-up
            (IntersectionObserver lazy-mount, or shared-engine thumbnails).
            plan-026 — encrypted ALLOW_LIST bases render the public still
            instead (no GLB mesh exists publicly). */}
        {thumb.kind === 'glb' ? (
          <PreviewCanvas glbUrl={thumb.url} />
        ) : thumb.url ? (
          <TurntablePreview
            urls={previewStillUrlsForSummary(first)}
            testId="collection-card-preview-still"
            alt={`${name} preview`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            data-testid="collection-card-preview-locked"
            style={{ ...monoLabel, color: 'rgba(255,255,255,0.5)' }}
          >
            ENCRYPTED
          </span>
        )}
        <span data-testid="collection-card-badge" style={badgeStyle}>
          {variantCount} variant{variantCount === 1 ? '' : 's'}
        </span>
      </div>
      <div style={bodyStyle}>
        <div data-testid="collection-card-name" style={nameStyle}>{name}</div>
        <div style={creatorStyle}>
          BY <span data-testid="collection-card-creator">{truncate(first.creator)}</span>
        </div>
        {description && (
          <div data-testid="collection-card-description" style={descriptionStyle}>
            {description.text}
          </div>
        )}
        <div style={priceRow}>
          <span style={shapeChip}>{first.shapeType}</span>
          <span data-testid="collection-card-price" style={priceStyle}>
            {formatSui(first.directAccessPrice)}
          </span>
        </div>
      </div>
    </Link>
  );
}
