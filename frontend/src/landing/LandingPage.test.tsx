import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock LedeHero at module boundary so this test doesn't need Babylon or the
// Walrus fetch chain. LandingPage's responsibility is composition + order;
// LedeHero's render details are covered by its own tests.
vi.mock('./LedeHero', () => ({
  LedeHero: () => <div data-testid="lede-hero">stub</div>,
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
  it('renders LedeHero and KeycapRow inside the landing-page root', () => {
    renderPage();
    expect(screen.getByTestId('landing-page')).toBeTruthy();
    expect(screen.getByTestId('lede-hero')).toBeTruthy();
    expect(screen.getByTestId('keycap-row')).toBeTruthy();
  });

  it('LedeHero appears before KeycapRow in document order', () => {
    renderPage();
    const lede = screen.getByTestId('lede-hero');
    const row = screen.getByTestId('keycap-row');
    // DOCUMENT_POSITION_FOLLOWING (4) = `lede` is followed by `row`.
    expect(lede.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
