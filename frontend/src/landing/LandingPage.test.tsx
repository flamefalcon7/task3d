import type { ReactNode } from 'react';
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

// Stub LifecycleStrip — keeps the order test free of its SVG <img> loads.
// Its own rendering contract is covered by LifecycleStrip.test.tsx.
vi.mock('./LifecycleStrip', () => ({
  LifecycleStrip: () => <div data-testid="lifecycle-strip">stub</div>,
}));

// Stub ActorCards — its own rendering contract (MTG anatomy, routes,
// forbidden-vocab guard) is covered by ActorCards.test.tsx; here we only
// assert composition + order.
vi.mock('./ActorCards', () => ({
  ActorCards: () => <div data-testid="actor-cards">stub</div>,
}));

// Spine surfaces — this test asserts composition + order, so the spine hook is a
// no-op, the indicator is a stub, and RevealSection is a transparent passthrough
// (their behavior is covered by their own suites). Passthrough preserves both
// child presence and document order.
const smoothScrollSpy = vi.fn();
vi.mock('./useSmoothScroll', () => ({ useSmoothScroll: () => smoothScrollSpy() }));
vi.mock('./ScrollSpineIndicator', () => ({
  ScrollSpineIndicator: () => <div data-testid="scroll-spine-indicator">stub</div>,
}));
vi.mock('./RevealSection', () => ({
  RevealSection: ({ children }: { children: ReactNode }) => (
    <div data-reveal-wrapper="true">{children}</div>
  ),
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
  it('renders Masthead, TelemetryStrip, LedeHero, LifecycleStrip, ActorCards, and KeycapRow inside the landing-page root', () => {
    renderPage();
    expect(screen.getByTestId('landing-page')).toBeTruthy();
    expect(screen.getByTestId('masthead')).toBeTruthy();
    expect(screen.getByTestId('telemetry-strip')).toBeTruthy();
    expect(screen.getByTestId('lede-hero')).toBeTruthy();
    expect(screen.getByTestId('lifecycle-strip')).toBeTruthy();
    expect(screen.getByTestId('actor-cards')).toBeTruthy();
    expect(screen.getByTestId('keycap-row')).toBeTruthy();
  });

  it('document order is Masthead → TelemetryStrip → LedeHero → LifecycleStrip → ActorCards → KeycapRow', () => {
    renderPage();
    const masthead = screen.getByTestId('masthead');
    const strip = screen.getByTestId('telemetry-strip');
    const lede = screen.getByTestId('lede-hero');
    const lifecycle = screen.getByTestId('lifecycle-strip');
    const actors = screen.getByTestId('actor-cards');
    const row = screen.getByTestId('keycap-row');
    // DOCUMENT_POSITION_FOLLOWING (4) — left node is followed by right node.
    expect(masthead.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(lede) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lede.compareDocumentPosition(lifecycle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lifecycle.compareDocumentPosition(actors) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actors.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('mounts the scroll spine indicator and engages the smooth-scroll hook', () => {
    renderPage();
    expect(screen.getByTestId('scroll-spine-indicator')).toBeTruthy();
    expect(smoothScrollSpy).toHaveBeenCalled();
  });

  it('wraps the below-fold sections in reveal wrappers but leaves children reachable and ordered', () => {
    renderPage();
    // The three below-fold sections each sit inside a reveal wrapper, yet their
    // testids resolve (content reachable) and order is preserved.
    expect(screen.getByTestId('lifecycle-strip')).toBeTruthy();
    const wrappers = document.querySelectorAll('[data-reveal-wrapper="true"]');
    expect(wrappers.length).toBe(3);
    // Above-the-fold sections are NOT reveal-wrapped.
    expect(screen.getByTestId('masthead').closest('[data-reveal-wrapper="true"]')).toBeNull();
    expect(screen.getByTestId('lede-hero').closest('[data-reveal-wrapper="true"]')).toBeNull();
  });
});
