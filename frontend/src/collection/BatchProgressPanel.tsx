// plan-017 U4 — BatchProgressPanel
//
// Surfaces Walrus's quilt structure to the user as an honest, predictable
// part of the launch flow. Two display modes:
//
//   1. Pre-flight (when `stage === 'idle'`):
//      Variant count → quilt count → transaction breakdown.
//      Frames "N variants → 2K+1 signatures" as known structure, not
//      surprise UX regression.
//
//   2. Stepped progress (during the launch flow):
//      Per-quilt Register + Certify rows with ✓ / ⟳ / ○ glyphs and
//      Suiscan links for completed register tx digests, plus the final
//      Launch collection row.
//
// Visual language mirrors TestWalletBanner — 1.5px accent border, 10×12
// padding, mono font 12px, 0.5px letter-spacing.

import type { CSSProperties } from 'react';
import { tokens } from '../ux/tokens';
import { QUILT_SIZE, type UploadStage } from '../walrus/useWalrusUpload';

export interface BatchProgressPanelProps {
  variantCount: number;
  /** Walrus internal stage from useWalrusUpload. */
  stage: UploadStage;
  /** Current quilt being processed (0-based). Meaningful when stage != 'idle'. */
  batchIndex: number;
  /** Total quilts the upload will produce. */
  batchTotal: number;
  /** Register tx digests collected per-quilt, in batch order. */
  txDigests: readonly string[];
  /** Set after the launch PTB lands. Surfaces a Suiscan link on the launch row. */
  launchTxDigest?: string;
  /** True when the parent's launch PTB is in flight (after Walrus done). */
  launchInProgress?: boolean;
  /** When stage === 'error' AND batchIndex > 0, surface the orphan-blob warning. */
  errorBatchIndex?: number;
}

const TX_PER_QUILT = 2; // register + certify
const LAUNCH_TX_COUNT = 1;

/** Total user-visible signatures for N variants. */
export function totalTxsFor(variantCount: number): number {
  if (variantCount <= 0) return LAUNCH_TX_COUNT;
  return TX_PER_QUILT * Math.ceil(variantCount / QUILT_SIZE) + LAUNCH_TX_COUNT;
}

type StepStatus = 'pending' | 'active' | 'done';

function stepStatusForRegister(
  rowBatch: number,
  currentBatch: number,
  stage: UploadStage,
): StepStatus {
  if (stage === 'idle') return 'pending';
  if (rowBatch < currentBatch) return 'done';
  if (rowBatch > currentBatch) return 'pending';
  // rowBatch === currentBatch
  if (stage === 'encoding' || stage === 'awaiting-register') return 'active';
  // After register completed for this batch, the relay-upload / certify /
  // done stages all mean register is finished.
  return 'done';
}

function stepStatusForCertify(
  rowBatch: number,
  currentBatch: number,
  stage: UploadStage,
): StepStatus {
  if (stage === 'idle') return 'pending';
  if (rowBatch < currentBatch) return 'done';
  if (rowBatch > currentBatch) return 'pending';
  // rowBatch === currentBatch
  if (
    stage === 'encoding' ||
    stage === 'awaiting-register' ||
    stage === 'relay-upload'
  ) {
    return 'pending';
  }
  if (stage === 'awaiting-certify') return 'active';
  // 'done' and 'error' both leave the current batch's certify as done if
  // we got that far. Caller signals error via errorBatchIndex; the certify
  // row is the appropriate place to surface 'pending' for the failed batch.
  return stage === 'done' ? 'done' : 'pending';
}

function stepStatusForLaunch(
  walrusStage: UploadStage,
  launchInProgress: boolean | undefined,
  launchTxDigest: string | undefined,
): StepStatus {
  if (launchTxDigest) return 'done';
  if (launchInProgress) return 'active';
  return walrusStage === 'done' ? 'active' : 'pending';
}

const GLYPH: Record<StepStatus, string> = {
  done: '✓',
  active: '⟳',
  pending: '○',
};

const panel: CSSProperties = {
  margin: '12px 0',
  padding: '10px 12px',
  border: tokens.border.primary,
  background: tokens.color.paperPure,
  fontFamily: tokens.font.mono,
  fontSize: 12,
  letterSpacing: '0.5px',
  color: tokens.color.ink,
};

const heading: CSSProperties = {
  margin: '0 0 8px',
  fontWeight: 700,
  textTransform: 'uppercase',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '2px 0',
};

const glyphCell: CSSProperties = {
  display: 'inline-block',
  width: 14,
  textAlign: 'center',
};

const linkStyle: CSSProperties = {
  color: tokens.color.ink,
  textDecoration: 'underline',
};

const errorLine: CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: `1px solid ${tokens.color.hint}`,
  color: tokens.color.err,
};

function suiscanTxLink(digest: string): string {
  return `https://suiscan.xyz/testnet/tx/${digest}`;
}

function StepRow({
  testId,
  status,
  label,
  digest,
}: {
  testId: string;
  status: StepStatus;
  label: string;
  digest?: string;
}) {
  return (
    <div style={rowStyle} data-testid={testId} data-status={status}>
      <span style={glyphCell} aria-hidden="true">
        {GLYPH[status]}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {digest && (
        <a
          href={suiscanTxLink(digest)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
          data-testid={`${testId}-link`}
        >
          {digest.slice(0, 8)}…
        </a>
      )}
    </div>
  );
}

export function BatchProgressPanel({
  variantCount,
  stage,
  batchIndex,
  batchTotal,
  txDigests,
  launchTxDigest,
  launchInProgress,
  errorBatchIndex,
}: BatchProgressPanelProps) {
  const K = Math.max(1, Math.ceil(Math.max(0, variantCount) / QUILT_SIZE));
  const total = totalTxsFor(variantCount);

  // Pre-flight breakdown: shown only at idle. Variant count of 0 stays
  // graceful — the breakdown reads as "0 variants" and the math still works.
  if (stage === 'idle') {
    return (
      <div style={panel} data-testid="batch-progress-panel" data-mode="preflight">
        <p style={heading}>walrus upload plan</p>
        <p style={{ margin: '0 0 4px' }}>
          your collection: {variantCount} variant{variantCount === 1 ? '' : 's'}
        </p>
        <p style={{ margin: '0 0 4px' }}>
          walrus packs up to {QUILT_SIZE} variants per quilt — {K} quilt
          {K === 1 ? '' : 's'} total
        </p>
        <p style={{ margin: 0 }}>
          you'll sign: {TX_PER_QUILT}×{K} walrus + {LAUNCH_TX_COUNT} launch
          = <strong data-testid="batch-progress-tx-total">{total}</strong>{' '}
          transaction{total === 1 ? '' : 's'}
        </p>
      </div>
    );
  }

  // Stepped progress: one Register + Certify row per quilt, then Launch.
  const usedBatchTotal = Math.max(1, batchTotal);
  const rows = [];
  for (let i = 0; i < usedBatchTotal; i++) {
    const registerStatus = stepStatusForRegister(i, batchIndex, stage);
    const certifyStatus = stepStatusForCertify(i, batchIndex, stage);
    rows.push(
      <StepRow
        key={`reg-${i}`}
        testId={`batch-step-${i}-register`}
        status={registerStatus}
        label={`quilt ${i + 1} of ${usedBatchTotal} — register`}
        digest={registerStatus === 'done' ? txDigests[i] : undefined}
      />,
      <StepRow
        key={`cert-${i}`}
        testId={`batch-step-${i}-certify`}
        status={certifyStatus}
        label={`quilt ${i + 1} of ${usedBatchTotal} — certify`}
      />,
    );
  }
  const launchStatus = stepStatusForLaunch(stage, launchInProgress, launchTxDigest);
  rows.push(
    <StepRow
      key="launch"
      testId="batch-step-launch"
      status={launchStatus}
      label="launch collection"
      digest={launchTxDigest}
    />,
  );

  // Partial-failure orphan-blob surface. Walrus blobs aren't deletable; the
  // user paid storage for {errorBatchIndex} quilt(s) that won't be reachable
  // until the next retry (which will re-publish all). Make the cost honest.
  const showOrphanWarning =
    stage === 'error' && errorBatchIndex !== undefined && errorBatchIndex > 0;

  return (
    <div style={panel} data-testid="batch-progress-panel" data-mode="progress">
      <p style={heading}>
        uploading {variantCount} variant{variantCount === 1 ? '' : 's'} in {usedBatchTotal} quilt
        {usedBatchTotal === 1 ? '' : 's'}
      </p>
      {rows}
      {showOrphanWarning && (
        <p style={errorLine} data-testid="batch-progress-orphan-warning">
          quilts 1–{errorBatchIndex} were stored on walrus and paid for.
          retrying will re-publish all {usedBatchTotal} quilts — the failed
          ones aren't recoverable (walrus blobs can't be deleted).
        </p>
      )}
    </div>
  );
}
