import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FALLBACK_TELEMETRY } from './telemetryFallback';

// Mock the data hook directly so each test can pivot status/data per case.
// useTelemetryData is covered indirectly through TelemetryStrip's contract:
// give it { status, data } and we assert the rendered shape. Hook-internal
// fetch/timeout behavior is exercised by manual browser verification per
// CLAUDE.md frontend protocol; unit tests focus on render contract.
const mockUseTelemetryData = vi.fn();
vi.mock('./useTelemetryData', () => ({
  useTelemetryData: () => mockUseTelemetryData(),
}));

import { TelemetryStrip } from './TelemetryStrip';

describe('TelemetryStrip', () => {
  it('renders fallback values with ●cache dot on first paint', () => {
    mockUseTelemetryData.mockReturnValue({
      status: 'cache',
      data: FALLBACK_TELEMETRY,
    });
    render(<TelemetryStrip />);

    expect(screen.getByTestId('telemetry-strip')).toBeTruthy();
    expect(screen.getByTestId('telemetry-dot-cache')).toBeTruthy();
    expect(screen.queryByTestId('telemetry-dot-live')).toBeNull();
    expect(screen.getByTestId('telemetry-status').textContent).toBe('CACHE');
    expect(screen.getByTestId('telemetry-l1-models').textContent).toBe(
      String(FALLBACK_TELEMETRY.l1Models),
    );
  });

  it('renders fresh values with ●live dot when status is live', () => {
    mockUseTelemetryData.mockReturnValue({
      status: 'live',
      data: {
        asOfIso: '2026-06-15T14:22:00-07:00',
        l1Models: 47,
        l2Nfts: 312,
        walrusBlobs: 47,
        latestCid: 'bafy1234567890abcdef3kQ',
      },
    });
    render(<TelemetryStrip />);

    expect(screen.getByTestId('telemetry-dot-live')).toBeTruthy();
    expect(screen.queryByTestId('telemetry-dot-cache')).toBeNull();
    expect(screen.getByTestId('telemetry-status').textContent).toBe('LIVE');
    expect(screen.getByTestId('telemetry-l1-models').textContent).toBe('47');
    expect(screen.getByTestId('telemetry-l2-nfts').textContent).toBe('312');
    expect(screen.getByTestId('telemetry-walrus-blobs').textContent).toBe('47');
  });

  it('CID renders as external link with new-tab safety and Walrus aggregator URL', () => {
    mockUseTelemetryData.mockReturnValue({
      status: 'live',
      data: {
        asOfIso: '2026-06-15T14:22:00-07:00',
        l1Models: 1,
        l2Nfts: 0,
        walrusBlobs: 1,
        latestCid: 'bafy1234567890abcdef3kQ',
      },
    });
    render(<TelemetryStrip />);

    const link = screen.getByTestId('telemetry-cid-link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.target).toBe('_blank');
    expect(link.rel.includes('noopener')).toBe(true);
    expect(link.rel.includes('noreferrer')).toBe(true);
    expect(link.href).toBe(
      'https://aggregator.testnet.walrus.atalma.io/v1/blobs/bafy1234567890abcdef3kQ',
    );
    // Truncation: first 4 + ellipsis + last 3.
    expect(link.textContent?.includes('bafy…3kQ')).toBe(true);
  });

  it('formats AS OF timestamp as YYYY-MM-DD HH:MM PT', () => {
    mockUseTelemetryData.mockReturnValue({
      status: 'live',
      data: {
        asOfIso: '2026-06-15T21:22:00Z',
        l1Models: 0,
        l2Nfts: 0,
        walrusBlobs: 0,
        latestCid: 'bafy1234567890abc',
      },
    });
    render(<TelemetryStrip />);

    const asOf = screen.getByTestId('telemetry-asof').textContent ?? '';
    // 2026-06-15T21:22 UTC == 14:22 PT (PDT)
    expect(asOf).toMatch(/^2026-06-15 14:22 PT$/);
  });

  it('strip carries data-status for CSS / debugging hooks', () => {
    mockUseTelemetryData.mockReturnValue({
      status: 'cache',
      data: FALLBACK_TELEMETRY,
    });
    render(<TelemetryStrip />);
    expect(screen.getByTestId('telemetry-strip').getAttribute('data-status')).toBe('cache');
  });
});
