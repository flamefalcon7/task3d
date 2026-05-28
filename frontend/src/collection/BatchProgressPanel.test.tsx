import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import { BatchProgressPanel, totalTxsFor } from './BatchProgressPanel';

afterEach(() => cleanup());

describe('BatchProgressPanel', () => {
  describe('pre-flight breakdown (stage === "idle")', () => {
    // formula: totalTxs(N) = 2 * ceil(N/QUILT_SIZE) + 1
    it('4 variants → 1 quilt → 3 transactions', () => {
      render(
        <BatchProgressPanel
          variantCount={4}
          stage="idle"
          batchIndex={0}
          batchTotal={1}
          txDigests={[]}
        />,
      );
      expect(screen.getByTestId('batch-progress-panel').getAttribute('data-mode')).toBe('preflight');
      expect(screen.getByTestId('batch-progress-tx-total').textContent).toBe('3');
    });

    it('5 variants → 2 quilts → 5 transactions', () => {
      render(
        <BatchProgressPanel
          variantCount={5}
          stage="idle"
          batchIndex={0}
          batchTotal={2}
          txDigests={[]}
        />,
      );
      expect(screen.getByTestId('batch-progress-tx-total').textContent).toBe('5');
    });

    it('6 variants → 2 quilts (boundary) → 5 transactions', () => {
      render(
        <BatchProgressPanel
          variantCount={6}
          stage="idle"
          batchIndex={0}
          batchTotal={2}
          txDigests={[]}
        />,
      );
      expect(screen.getByTestId('batch-progress-tx-total').textContent).toBe('5');
    });

    it('8 variants → 2 quilts → 5 transactions (AE2 visible UX)', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="idle"
          batchIndex={0}
          batchTotal={2}
          txDigests={[]}
        />,
      );
      expect(screen.getByTestId('batch-progress-tx-total').textContent).toBe('5');
    });

    it('1 variant → 1 quilt → 3 transactions, plural handling reads "1 transaction" not "1 transactions"', () => {
      render(
        <BatchProgressPanel
          variantCount={1}
          stage="idle"
          batchIndex={0}
          batchTotal={1}
          txDigests={[]}
        />,
      );
      const panel = screen.getByTestId('batch-progress-panel');
      expect(panel.textContent).toContain('1 variant');
      expect(panel.textContent).not.toContain('1 variants');
      // 3 still plural — "3 transactions"
      expect(panel.textContent).toContain('3 transactions');
    });

    it('0 variants — graceful zero state (1 launch tx remains)', () => {
      render(
        <BatchProgressPanel
          variantCount={0}
          stage="idle"
          batchIndex={0}
          batchTotal={1}
          txDigests={[]}
        />,
      );
      // 0 variants → 0 quilts × 2 + 1 = 1 transaction
      // (the math floors gracefully — ceil(0/4) = 0 → totalTxsFor returns
      // just LAUNCH_TX_COUNT = 1)
      expect(screen.getByTestId('batch-progress-tx-total').textContent).toBe('1');
    });

    it('totalTxsFor returns the canonical formula values', () => {
      expect(totalTxsFor(0)).toBe(1);
      expect(totalTxsFor(1)).toBe(3);
      expect(totalTxsFor(4)).toBe(3);
      expect(totalTxsFor(5)).toBe(5);
      expect(totalTxsFor(6)).toBe(5);
      expect(totalTxsFor(7)).toBe(5);
      expect(totalTxsFor(8)).toBe(5);
      expect(totalTxsFor(9)).toBe(7);
    });
  });

  describe('stepped progress (stage !== "idle")', () => {
    it('encoding stage at batchIndex=0 → batch 0 register active, batch 0 certify pending, batch 1 register pending', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="encoding"
          batchIndex={0}
          batchTotal={2}
          txDigests={[]}
        />,
      );
      expect(screen.getByTestId('batch-progress-panel').getAttribute('data-mode')).toBe('progress');
      expect(screen.getByTestId('batch-step-0-register').getAttribute('data-status')).toBe('active');
      expect(screen.getByTestId('batch-step-0-certify').getAttribute('data-status')).toBe('pending');
      expect(screen.getByTestId('batch-step-1-register').getAttribute('data-status')).toBe('pending');
      expect(screen.getByTestId('batch-step-1-certify').getAttribute('data-status')).toBe('pending');
      expect(screen.getByTestId('batch-step-launch').getAttribute('data-status')).toBe('pending');
    });

    it('awaiting-register stage at batchIndex=0 → batch 0 register active', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="awaiting-register"
          batchIndex={0}
          batchTotal={2}
          txDigests={[]}
        />,
      );
      expect(screen.getByTestId('batch-step-0-register').getAttribute('data-status')).toBe('active');
    });

    it('awaiting-certify stage at batchIndex=0 → batch 0 register done, batch 0 certify active', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="awaiting-certify"
          batchIndex={0}
          batchTotal={2}
          txDigests={['0xq0digest']}
        />,
      );
      expect(screen.getByTestId('batch-step-0-register').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-0-certify').getAttribute('data-status')).toBe('active');
      // Suiscan link surfaces on the done register step.
      const link = within(screen.getByTestId('batch-step-0-register')).getByTestId('batch-step-0-register-link');
      expect(link.getAttribute('href')).toContain('0xq0digest');
    });

    it('relay-upload stage at batchIndex=0 → register done, certify still pending (upload sits between)', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="relay-upload"
          batchIndex={0}
          batchTotal={2}
          txDigests={['0xq0digest']}
        />,
      );
      expect(screen.getByTestId('batch-step-0-register').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-0-certify').getAttribute('data-status')).toBe('pending');
    });

    it('moved on to batchIndex=1 → batch 0 both done, batch 1 register active', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="encoding"
          batchIndex={1}
          batchTotal={2}
          txDigests={['0xq0digest']}
        />,
      );
      expect(screen.getByTestId('batch-step-0-register').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-0-certify').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-1-register').getAttribute('data-status')).toBe('active');
    });

    it('stage === "done" → all walrus steps done, launch step active', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="done"
          batchIndex={1}
          batchTotal={2}
          txDigests={['0xq0digest', '0xq1digest']}
        />,
      );
      expect(screen.getByTestId('batch-step-0-register').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-0-certify').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-1-register').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-1-certify').getAttribute('data-status')).toBe('done');
      expect(screen.getByTestId('batch-step-launch').getAttribute('data-status')).toBe('active');
    });

    it('launchInProgress prop → launch step active even before walrus completes', () => {
      render(
        <BatchProgressPanel
          variantCount={4}
          stage="done"
          batchIndex={0}
          batchTotal={1}
          txDigests={['0xq0']}
          launchInProgress
        />,
      );
      expect(screen.getByTestId('batch-step-launch').getAttribute('data-status')).toBe('active');
    });

    it('launchTxDigest → launch step done with Suiscan link', () => {
      render(
        <BatchProgressPanel
          variantCount={4}
          stage="done"
          batchIndex={0}
          batchTotal={1}
          txDigests={['0xq0']}
          launchTxDigest="LAUNCH_DIGEST_123"
        />,
      );
      expect(screen.getByTestId('batch-step-launch').getAttribute('data-status')).toBe('done');
      const link = within(screen.getByTestId('batch-step-launch')).getByTestId('batch-step-launch-link');
      expect(link.getAttribute('href')).toContain('LAUNCH_DIGEST_123');
    });

    it('txDigests length mismatch (fewer digests than batchIndex) → no throw, missing digests render without link', () => {
      // Defensive: batchIndex=2 but only 1 digest collected (race between
      // setBatchIndex and setTxDigests).
      expect(() =>
        render(
          <BatchProgressPanel
            variantCount={12}
            stage="encoding"
            batchIndex={2}
            batchTotal={3}
            txDigests={['0xq0digest']}
          />,
        ),
      ).not.toThrow();
      // Batch 0 register is done with link…
      expect(
        within(screen.getByTestId('batch-step-0-register')).queryByTestId('batch-step-0-register-link'),
      ).toBeTruthy();
      // …Batch 1 register is done but has no digest at txDigests[1] → no link.
      expect(
        within(screen.getByTestId('batch-step-1-register')).queryByTestId('batch-step-1-register-link'),
      ).toBeNull();
    });
  });

  describe('partial-failure orphan-blob warning', () => {
    it('stage === "error" with errorBatchIndex > 0 → warning visible', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="error"
          batchIndex={1}
          batchTotal={2}
          txDigests={['0xq0digest']}
          errorBatchIndex={1}
        />,
      );
      const warning = screen.getByTestId('batch-progress-orphan-warning');
      expect(warning.textContent).toContain('quilts 1–1');
      expect(warning.textContent).toContain('paid for');
      expect(warning.textContent).toContain("can't be deleted");
    });

    it('stage === "error" with errorBatchIndex === 0 → no warning (no orphan blobs yet)', () => {
      render(
        <BatchProgressPanel
          variantCount={4}
          stage="error"
          batchIndex={0}
          batchTotal={1}
          txDigests={[]}
          errorBatchIndex={0}
        />,
      );
      expect(screen.queryByTestId('batch-progress-orphan-warning')).toBeNull();
    });

    it('stage !== "error" → no warning even if errorBatchIndex set', () => {
      render(
        <BatchProgressPanel
          variantCount={8}
          stage="encoding"
          batchIndex={1}
          batchTotal={2}
          txDigests={['0xq0digest']}
          errorBatchIndex={1}
        />,
      );
      expect(screen.queryByTestId('batch-progress-orphan-warning')).toBeNull();
    });
  });
});
