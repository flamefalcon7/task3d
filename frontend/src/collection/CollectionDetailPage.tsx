import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCollectionById } from '../integration/useCollections';
import { useCollectionNames } from '../integration/useCollectionNames';
import { useModelIndex } from '../browse/useModelIndex';
import {
  previewStillUrlsForSummary,
  thumbSourceForSummary,
} from '../walrus/aggregator';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { TurntablePreview } from '../ux/TurntablePreview';
import { CopyId } from '../ux/CopyId';
import {
  card,
  displayHeadline,
  eyebrow,
  monoLabel,
  pagePaper,
  tokens,
} from '../ux/tokens';
import { UsedBySection } from './UsedBySection';

// plan-008 U14 — L2 collection detail (`/collection/:slug`, slug = NftCollection
// object id). Reworked off the dead Phase-3 `useCollectionBySlug` path: v6
// `Model3D` no longer carries `collection_id`, so the collection relation lives
// on the L2 `NftCollection` itself.
//
// Restyled onto the D-044 brutalist token system (was a stale Phase-3 dark
// theme that clashed with the rest of the app + had no preview). Now renders a
// 3D preview of the base L1 model and copyable on-chain ids. The shared
// masthead (NavGuard) supplies nav + wallet, so this page no longer renders its
// own header chrome.

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

// --- styles (D-044 tokens) ---

const inner: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '24px 24px 64px',
};

const backLink: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  textDecoration: 'none',
  letterSpacing: '1px',
};

const header: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  margin: '16px 0 24px',
};

const creatorLine: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  letterSpacing: '0.5px',
  textTransform: 'none',
  fontSize: 12,
};

const twoCol: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
  gap: 24,
  alignItems: 'start',
};

const previewWell: CSSProperties = {
  position: 'relative',
  height: 380,
  background: tokens.color.well,
  border: tokens.border.primary,
  overflow: 'hidden',
};

const previewPlaceholder: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ...monoLabel,
  color: 'rgba(255,255,255,0.5)',
};

const layerBadge: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 12,
  ...monoLabel,
  color: tokens.color.wellInk,
  fontSize: 9,
};

const metaPanel: CSSProperties = {
  ...card,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const metaRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const metaLabel: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  fontSize: 10,
};

const metaValue: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 14,
  color: tokens.color.ink,
};

const registerLink: CSSProperties = {
  ...monoLabel,
  color: tokens.color.accent,
  textDecoration: 'none',
  letterSpacing: '1px',
};

export function CollectionDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { collection, loading, error } = useCollectionById(slug);
  const { models } = useModelIndex();
  // Creator-chosen collection name recovered from minted token names. Absent for
  // a freshly launched (token-less) collection → base-model fallback below.
  const { names } = useCollectionNames();

  if (!slug) {
    return (
      <div style={pagePaper} data-testid="collection-invalid">
        <div style={inner}>
          <p style={{ ...monoLabel, color: tokens.color.err, textTransform: 'none' }}>
            × Invalid collection id.
          </p>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div style={pagePaper} data-testid="collection-loading">
        <div style={inner}>
          <p style={{ ...monoLabel, color: tokens.color.hint }}>— LOADING COLLECTION</p>
        </div>
      </div>
    );
  }
  if (error || !collection) {
    return (
      <div style={pagePaper} data-testid="collection-empty">
        <div style={inner}>
          <p style={{ ...monoLabel, color: tokens.color.hint, textTransform: 'none', letterSpacing: '0.5px' }}>
            Collection not found.{' '}
            <Link to="/browse" style={{ color: tokens.color.ink }}>Back to Browse</Link>
          </p>
        </div>
      </div>
    );
  }

  const baseModel = models.find((m) => m.objectId === collection.baseModelId);
  // Prefer the creator-chosen name; fall back to the base-model-derived label
  // (token-less collection) then the truncated id.
  const name =
    names.get(collection.collectionId) ??
    (baseModel?.name
      ? `${baseModel.name} collection`
      : `Collection ${truncate(collection.collectionId)}`);
  // plan-026 D-075 — encrypted L1 bases render their PUBLIC preview still
  // (turntable <img>), NEVER the ciphertext glbBlobId as a GLB. Mirrors
  // CollectionCard: thumbSourceForSummary picks glb vs still; no source →
  // placeholder.
  const thumb = baseModel ? thumbSourceForSummary(baseModel) : null;
  const stills = baseModel ? previewStillUrlsForSummary(baseModel) : [];

  return (
    <div style={pagePaper} data-testid="collection-detail">
      <div style={inner}>
        <Link to="/browse" style={backLink}>← Back to Browse</Link>

        <div style={header}>
          <span style={eyebrow}>— L2 / COLLECTION</span>
          <h1 style={{ ...displayHeadline, color: tokens.color.ink, fontSize: 34 }} data-testid="collection-name">
            {name}
          </h1>
          <div style={creatorLine}>
            launched by <code data-testid="collection-creator">{truncate(collection.nftCreator)}</code>
          </div>
        </div>

        <div style={twoCol}>
          <div style={previewWell}>
            {!thumb ? (
              <span style={previewPlaceholder}>— NO PREVIEW</span>
            ) : thumb.kind === 'glb' && thumb.url ? (
              <PreviewCanvas glbUrl={thumb.url} />
            ) : thumb.url ? (
              <TurntablePreview
                urls={stills}
                testId="collection-preview-still"
                alt={`${name} preview`}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span style={previewPlaceholder}>— NO PREVIEW</span>
            )}
            <span style={layerBadge}>L1 MODEL</span>
          </div>

          <div style={metaPanel}>
            <div style={metaRow}>
              <span style={metaLabel}>Model ID</span>
              <CopyId value={collection.baseModelId} testId="copy-model-id" />
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Collection ID</span>
              <CopyId value={collection.collectionId} testId="copy-collection-id" />
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Register fee</span>
              <span style={metaValue} data-testid="collection-register-fee">
                {formatSui(collection.registerFee)}
              </span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Resale royalty</span>
              <span style={metaValue}>{(collection.baseRoyaltyBps / 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 32 }}>
          <UsedBySection
            collectionId={collection.collectionId}
            integrationPolicy={collection.integrationPolicy}
          />
        </div>

        <p style={{ marginTop: 24 }}>
          <Link to={`/integrate?collection=${collection.collectionId}`} style={registerLink}>
            Register your work →
          </Link>
        </p>
      </div>
    </div>
  );
}
