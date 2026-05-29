import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock LedeHero at module boundary so this test doesn't need Babylon or the
// Walrus fetch chain. LandingPage's responsibility is composition + order;
// LedeHero's render details are covered by its own tests.
vi.mock('./LedeHero', () => ({
  LedeHero: () => <div data-testid="lede-hero">stub</div>,
}));

// Stub TelemetryStrip too — its data hook calls into @mysten/dapp-kit's
// SuiClient context which isn't mounted in this test harness. Its own
// rendering contract is covered by TelemetryStrip.test.tsx.
vi.mock('./TelemetryStrip', () => ({
  TelemetryStrip: () => <div data-testid="telemetry-strip">stub</div>,
}));

// Stub Masthead — it reads the build-time __ISSUE_NUMBER__ global, which is
// undefined under vitest. Its own rendering contract is covered by
// Masthead.test.tsx; here we only assert composition + order.
vi.mock('./Masthead', () => ({
  Masthead: () => <div data-testid="masthead">stub</div>,
}));

import { LandingPage } from './LandingPage';

function renderPage(): void {
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  it('renders Masthead, TelemetryStrip, LedeHero, and KeycapRow inside the landing-page root', () => {
    renderPage();
    expect(screen.getByTestId('landing-page')).toBeTruthy();
    expect(screen.getByTestId('masthead')).toBeTruthy();
    expect(screen.getByTestId('telemetry-strip')).toBeTruthy();
    expect(screen.getByTestId('lede-hero')).toBeTruthy();
    expect(screen.getByTestId('keycap-row')).toBeTruthy();
  });

  it('document order is Masthead → TelemetryStrip → LedeHero → KeycapRow', () => {
    renderPage();
    const masthead = screen.getByTestId('masthead');
    const strip = screen.getByTestId('telemetry-strip');
    const lede = screen.getByTestId('lede-hero');
    const row = screen.getByTestId('keycap-row');
    // DOCUMENT_POSITION_FOLLOWING (4) — left node is followed by right node.
    expect(masthead.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(lede) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lede.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
