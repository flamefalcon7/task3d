import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTokenById } from '../track/useOwnedTokens';
import { useModelIndex } from '../browse/useModelIndex';
import { glbUrlForToken } from '../walrus/aggregator';
import { PreviewCanvas } from '../babylon/PreviewCanvas';
import { CopyId } from '../ux/CopyId';
import {
  card,
  displayHeadline,
  eyebrow,
  monoLabel,
  pagePaper,
  tokens,
} from '../ux/tokens';

// Single L2 NftToken detail (`/nft/:tokenId`). Resolves the token by id on chain
// (useTokenById — the same path /track?model= uses), so the page is
// self-sufficient on a direct load / refresh / shared link, not dependent on
// the /market in-memory listing. Shows the token's OWN variant model (its quilt
// patch, plaintext — D-035), copyable ids, and links out to its collection + the
// track. Buy/list stay on /market where the kiosk + price context lives.

function truncate(id: string, head = 6, tail = 4): string {
  if (!id || id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

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

const twoCol: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
  gap: 24,
  alignItems: 'start',
};

const previewWell: CSSProperties = {
  position: 'relative',
  height: 420,
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

const metaRow: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

const metaLabel: CSSProperties = {
  ...monoLabel,
  color: tokens.color.hint,
  fontSize: 10,
};

const actions: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 4,
  paddingTop: 14,
  borderTop: tokens.border.divider,
};

const actionLink: CSSProperties = {
  ...monoLabel,
  color: tokens.color.accent,
  textDecoration: 'none',
  letterSpacing: '1px',
};

export function NftTokenDetailPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const { token, loading, error } = useTokenById(tokenId);
  const { models } = useModelIndex();

  if (!tokenId) {
    return (
      <div style={pagePaper} data-testid="nft-invalid">
        <div style={inner}>
          <p style={{ ...monoLabel, color: tokens.color.err, textTransform: 'none' }}>
            × Invalid NFT id.
          </p>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div style={pagePaper} data-testid="nft-loading">
        <div style={inner}>
          <p style={{ ...monoLabel, color: tokens.color.hint }}>— LOADING NFT</p>
        </div>
      </div>
    );
  }
  if (error || !token) {
    return (
      <div style={pagePaper} data-testid="nft-empty">
        <div style={inner}>
          <p style={{ ...monoLabel, color: tokens.color.hint, textTransform: 'none', letterSpacing: '0.5px' }}>
            NFT not found.{' '}
            <Link to="/market" style={{ color: tokens.color.ink }}>Back to Market</Link>
          </p>
        </div>
      </div>
    );
  }

  const baseModel = models.find((m) => m.objectId === token.baseModelId);
  const title = token.name || `NFT ${truncate(token.tokenId)}`;
  const glbUrl =
    token.patchId || token.blobId
      ? glbUrlForToken({ patchId: token.patchId, blobId: token.blobId })
      : '';

  return (
    <div style={pagePaper} data-testid="nft-detail">
      <div style={inner}>
        <Link to="/market" style={backLink}>← Back to Market</Link>

        <div style={header}>
          <span style={eyebrow}>— L2 / NFT</span>
          <h1 style={{ ...displayHeadline, color: tokens.color.ink, fontSize: 34 }} data-testid="nft-name">
            {title}
          </h1>
          {baseModel?.name && (
            <div style={{ ...monoLabel, color: tokens.color.hint, textTransform: 'none', fontSize: 12 }}>
              from the <code>{baseModel.name}</code> collection
            </div>
          )}
        </div>

        <div style={twoCol}>
          <div style={previewWell}>
            {glbUrl ? (
              <PreviewCanvas glbUrl={glbUrl} />
            ) : (
              <span style={previewPlaceholder}>— NO PREVIEW</span>
            )}
            <span style={layerBadge}>L2 NFT</span>
          </div>

          <div style={metaPanel}>
            <div style={metaRow}>
              <span style={metaLabel}>Token ID</span>
              <CopyId value={token.tokenId} testId="copy-token-id" />
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Collection ID</span>
              <CopyId value={token.collectionId} testId="copy-collection-id" />
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Base Model ID</span>
              <CopyId value={token.baseModelId} testId="copy-model-id" />
            </div>

            <div style={actions}>
              <Link to={`/track?model=${token.tokenId}`} data-testid="nft-drive" style={actionLink}>
                Drive on the track →
              </Link>
              {token.collectionId && (
                <Link to={`/collection/${token.collectionId}`} data-testid="nft-collection" style={actionLink}>
                  View collection →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
