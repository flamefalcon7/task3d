import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
import { modelDescription } from '@overflow2026/shared';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { LazyCanvasMount } from '../babylon/LazyCanvasMount';
import { thumbSourceForSummary, previewStillUrlsForSummary } from '../walrus/aggregator';
import { TurntablePreview } from '../ux/TurntablePreview';
import { monoLabel, tokens, viewerWell } from '../ux/tokens';
import type { BaseMatch } from './browseSearchRanking';

// CollectionCard is the Browse grid card (U5): one card per Collection — its
// preview/name/description are derived from the first variant in the group, and
// the "N variants" badge advertises the collection size.
//
// Brutalist editorial styling per D-044: paper-pure card body with 1.5px
// ink border, pure-black viewer well, italic-serif name, mono creator/price.

interface Props {
  collectionId: string;
  variants: Model3DSummary[]; // 1..16
  // plan 2026-06-08-002 U2 — set by /browse semantic search when this card's
  // closest variant matched the query. Drives the highlight ring + reason line.
  // Undefined when there's no query match (the default catalog card).
  match?: BaseMatch;
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

// The card root is a plain container (NOT a link), so the 3D preview well can
// own its pointer (drag-to-rotate) without the whole card hijacking the click
// to navigate. Only the text body below is a <Link> to the detail page.
const cardStyle: CSSProperties = {
  background: tokens.color.paperPure,
  border: tokens.border.primary,
  overflow: 'hidden',
};

// Text body — the navigation surface. Keeps bodyStyle's flex/padding/border-top
// but reads as a link (ink text, no underline, pointer cursor).
const bodyLinkStyle: CSSProperties = {
  textDecoration: 'none',
  color: tokens.color.ink,
  cursor: 'pointer',
};

const wellStyle: CSSProperties = {
  ...viewerWell,
  aspectRatio: '1 / 1',
};

const badgeStyle: CSSProperties = {
  ...monoLabel,
  position: 'absolute',
  top: 8,
  // Top-LEFT: the PreviewCanvas BG-toggle pill lives top-right, so anchoring the
  // variant badge left avoids the two overlapping (the pill was covering it).
  left: 8,
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

// plan 2026-06-08-002 U2 — semantic-search match highlight, mirroring /launch's
// matchRing/MatchReason. Non-accent only (D-044 rations #FF4500): a strong match
// (distance < STRONG_MATCH_DISTANCE) rings in ink, a weak match in subtle gray.
// The 2px ring COEXISTS with linkStyle's 1.5px ink border as a composite frame —
// it is spread on top, never replacing the border. No ring when match is absent.
function matchRing(match: BaseMatch | undefined): CSSProperties {
  if (!match) return {};
  return { boxShadow: `0 0 0 2px ${match.strong ? tokens.color.ink : tokens.color.subtle}` };
}

function truncateReason(s: string): string {
  return s.length > 48 ? `${s.slice(0, 47)}…` : s;
}

// "Why it matched" — the matching variant's prompt/caption. Bolder (ink) for a
// strong match, muted (hint) otherwise.
function MatchReason({ match }: { match: BaseMatch }) {
  return (
    <div
      data-testid="collection-card-match-reason"
      style={{ ...descriptionStyle, color: match.strong ? tokens.color.ink : tokens.color.hint }}
    >
      ↳ {truncateReason(match.reason)}
    </div>
  );
}

const priceRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
};

const shapeChip: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  fontSize: 10,
};

// plan 2026-06-17-001 — the card surfaces the two real on-chain fees from the
// LicenseTerms (D-078): the fork/derive fee (prominent) and the buy-access fee
// (secondary). The old `direct_access_price` field was retired from the Move
// struct, so it always read 0 → every card showed "Free".
const priceCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 2,
};

const priceStyle: CSSProperties = {
  fontFamily: tokens.font.display,
  fontStyle: 'italic',
  fontSize: tokens.size.md,
  fontWeight: tokens.weight.medium,
};

// Small mono tag appended to the headline fork fee ("2 SUI · FORK").
const feeTag: CSSProperties = {
  ...monoLabel,
  color: tokens.color.muted,
  fontSize: 9,
  letterSpacing: '1px',
};

// Secondary access-fee line under the fork fee.
const accessFeeStyle: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  fontSize: 10,
  letterSpacing: '0.5px',
};

export function CollectionCard({ collectionId, variants, match }: Props) {
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
    <div
      data-testid={`collection-card-${collectionId}`}
      style={{ ...cardStyle, ...matchRing(match) }}
    >
      {/* Preview well — interactive 3D, NOT a navigation target. The Babylon
          ArcRotateCamera attaches its own pointer controls, so dragging here
          rotates the model; a click does nothing (no detail-page jump). */}
      <div style={wellStyle} data-testid="collection-card-preview">
        {/* One Babylon canvas per card. Browsers cap WebGL contexts at ~8-16
            per page, so the canvas is lazy-mounted (plan 2026-06-17-001 U4):
            LazyCanvasMount only renders PreviewCanvas while the card is in view
            and unmounts it (engine.dispose()) when it scrolls away, bounding
            concurrent contexts. plan-026 — encrypted ALLOW_LIST bases render the
            public still instead (no GLB mesh exists publicly). */}
        {thumb.kind === 'glb' ? (
          // Default the well to GRAY (not D-044 black): mid-gray reads better for
          // the mixed-tone PBR meshes in the catalog grid. Still toggleable via
          // the BG pill (BLACK / PAPER / GRAY).
          <LazyCanvasMount testId="collection-card-lazy">
            <PreviewCanvas glbUrl={thumb.url} defaultBg="gray" />
          </LazyCanvasMount>
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
      {/* Text body — the navigation surface (drag the preview to inspect; click
          the title block to open the detail page). */}
      <Link
        to={to}
        data-testid={`collection-card-link-${collectionId}`}
        className="nav-link"
        style={{ ...bodyStyle, ...bodyLinkStyle }}
      >
        <div data-testid="collection-card-name" className="nav-name" style={nameStyle}>{name}</div>
        <div style={creatorStyle}>
          BY <span data-testid="collection-card-creator">{truncate(first.creator)}</span>
        </div>
        {/* Dedupe (mirrors /launch): when a query match exists, the MatchReason
            already shows the matching variant's prompt — suppress the static
            description snippet so the prompt isn't shown twice. */}
        {match ? (
          <MatchReason match={match} />
        ) : (
          description && (
            <div data-testid="collection-card-description" style={descriptionStyle}>
              {description.text}
            </div>
          )
        )}
        <div style={priceRow}>
          <span style={shapeChip}>{first.shapeType}</span>
          <div style={priceCol}>
            <span data-testid="collection-card-price" style={priceStyle}>
              {formatSui(first.derivativeMintFee)} <span style={feeTag}>· FORK</span>
            </span>
            <span data-testid="collection-card-access-fee" style={accessFeeStyle}>
              {formatSui(first.accessFee)} · ACCESS
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
