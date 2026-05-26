import type { CSSProperties } from 'react';
import { tokens } from '../ux/tokens';

// plan-015 U3 — compact info panel for the viewer well's side rail. Used on
// both /create tagging step (U5) and /launch (U6) to surface the structural
// shape of the mesh: how many segments, how big the GLB is, how many
// distinct materials. After publish, also shows the Walrus blob id as a
// truncated mono pill so creators have a visible artifact of where their
// content lives. Triangle / vertex / bounding-box stats are deliberately
// omitted (R3) — they are geek stats, not authoring information.

interface MeshInfoPanelProps {
  /** Number of segmented parts (filtered mesh count). */
  segmentCount: number;
  /** GLB file size in bytes. Hides the SIZE row when 0 / unknown. */
  fileSizeBytes: number;
  /** Distinct materials in the GLB. Hides the MATERIALS row when 0. */
  materialCount: number;
  /** Walrus blob id surfaced after publish. Renders as a truncated pill. */
  walrusBlobId?: string;
  /** Test id suffix when multiple panels are mounted on one page. */
  testIdSuffix?: string;
}

export function MeshInfoPanel({
  segmentCount,
  fileSizeBytes,
  materialCount,
  walrusBlobId,
  testIdSuffix,
}: MeshInfoPanelProps) {
  const tid = (key: string) =>
    testIdSuffix ? `mesh-info-${key}-${testIdSuffix}` : `mesh-info-${key}`;

  return (
    <div data-testid={tid('panel')} style={panelStyle}>
      <Row label="SEGMENTS" testId={tid('segments')}>
        <span style={valueStyle}>{segmentCount}</span>
      </Row>
      {fileSizeBytes > 0 && (
        <Row label="SIZE" testId={tid('size')}>
          <span style={valueStyle}>{formatBytes(fileSizeBytes)}</span>
        </Row>
      )}
      {materialCount > 0 && (
        <Row label="MATERIALS" testId={tid('materials')}>
          <span style={valueStyle}>{materialCount}</span>
        </Row>
      )}
      {walrusBlobId && (
        <Row label="BLOB" testId={tid('blob')}>
          <span style={blobPillStyle} title={walrusBlobId}>
            {truncateBlobId(walrusBlobId)}
          </span>
        </Row>
      )}
    </div>
  );
}

function Row({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

// Format bytes as "N B" / "N.X KB" / "N.X MB" — fixed 1-decimal precision for
// readability at small wells. AE1 expects "2.0 MB" for a 2 MiB file.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Walrus blob ids are URL-safe base58/base64 strings, typically ~32-44 chars.
// Truncate to first 8 + ellipsis + last 4 so the pill fits in the side rail.
export function truncateBlobId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 12,
  background: tokens.color.paperPure,
  border: tokens.border.primary,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  color: tokens.color.hint,
};

const valueStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.sm,
  color: tokens.color.ink,
};

const blobPillStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: tokens.size.xs,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: tokens.color.ink,
  border: tokens.border.primary,
  padding: '2px 6px',
};
