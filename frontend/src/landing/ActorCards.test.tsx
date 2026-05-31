import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActorCards } from './ActorCards';

// ActorCards renders react-router <Link>s for provenance, so every render
// must sit inside a router context.
function renderCards(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <ActorCards />
    </MemoryRouter>,
  );
  return container;
}

describe('ActorCards', () => {
  it('renders 4 cards in modelCreator / nftCreator / buyer / gameDev order (AC-1)', () => {
    renderCards();
    const root = screen.getByTestId('actor-cards');
    const cards = within(root).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(cards[0]?.getAttribute('data-testid')).toBe('actor-card-modelCreator');
    expect(cards[1]?.getAttribute('data-testid')).toBe('actor-card-nftCreator');
    expect(cards[2]?.getAttribute('data-testid')).toBe('actor-card-buyer');
    expect(cards[3]?.getAttribute('data-testid')).toBe('actor-card-gameDev');
  });

  it('each card surfaces all five MTG parts (AC-2)', () => {
    renderCards();
    for (const key of ['modelCreator', 'nftCreator', 'buyer', 'gameDev']) {
      const card = screen.getByTestId(`actor-card-${key}`);
      // name (the actor key doubles as the displayed name by design)
      expect(card.textContent).toContain(key);
      // cost line — non-empty text containing a cost token
      expect(card.textContent).toMatch(/gas|royalty|fee|price/i);
      // ability — the <p> is the ability element; assert IT ends in a period
      // (not the whole-card textContent, which would vacuously match any
      // period anywhere in the concatenation — e.g. the flavor line).
      const ability = card.querySelector('p');
      expect(ability?.textContent?.trim()).toMatch(/\.$/);
      // name + cost + flavor all render as <span>s (gameDev adds a 4th, the
      // kicker). >=3 spans confirms the flavor part is present without
      // coupling to hashed CSS-module class names.
      expect(card.querySelectorAll('span').length).toBeGreaterThanOrEqual(3);
      // provenance — a clickable link to the route
      const link = within(card).getByTestId(`actor-route-${key}`);
      expect(link.getAttribute('href')).toBeTruthy();
    }
  });

  it('provenance routes render verbatim and clickable (AC-2/AC-3)', () => {
    renderCards();
    // react-router renders <Link to="/x"> as <a href="/x">
    expect(screen.getByTestId('actor-route-modelCreator').getAttribute('href')).toBe('/create');
    expect(screen.getByTestId('actor-route-nftCreator').getAttribute('href')).toBe('/launch');
    expect(screen.getByTestId('actor-route-buyer').getAttribute('href')).toBe('/browse');
    expect(screen.getByTestId('actor-route-gameDev').getAttribute('href')).toBe('/integrate');
  });

  it('never surfaces unshipped-mechanic vocabulary (AC-3)', () => {
    const container = renderCards();
    // "Access" (struct deleted D-029) and "Derivative" (deferred fork flavor) are
    // UNSHIPPED — neither may appear. "Seal" IS shipped (v9 / plan-026), so it is
    // NOT forbidden here (see the dedicated honesty guard below). Word-boundary
    // match so legitimate copy like "license" / "forks" wouldn't false-trip.
    // Scan innerHTML (not just textContent) so a forbidden term hiding in an
    // attribute — aria-label, title, alt — is caught too (mirrors the AC-5
    // ff4500 check). AC-3 is load-bearing, so the guard covers attributes.
    const html = container.innerHTML;
    expect(html).not.toMatch(/\baccess\b/i);
    expect(html).not.toMatch(/\bderivative\b/i);
  });

  it('mentions Seal only in honest mitigation framing — never "piracy-proof"/"prevented" (AC-3b, R14)', () => {
    const container = renderCards();
    const html = container.innerHTML;
    // Seal is shipped + named on this surface (the modelCreator card).
    expect(html).toMatch(/\bSeal-encrypted\b/);
    expect(screen.getByTestId('actor-card-modelCreator').textContent ?? '').toMatch(/forkers pay to unlock/i);
    // R14 — protection is positioned as mitigation, NOT prevention. No overclaim.
    expect(html).not.toMatch(/piracy-?proof/i);
    expect(html).not.toMatch(/\bprevent(s|ed|ion)?\b/i);
    expect(html).not.toMatch(/\bunbreakable\b/i);
  });

  it('buyer card asserts ownership (not access); gameDev asserts integration (AC-4)', () => {
    renderCards();
    const buyer = screen.getByTestId('actor-card-buyer').textContent ?? '';
    expect(buyer).toMatch(/\bowns?\b/i);
    expect(buyer).toMatch(/\btoken\b/i);

    // textContent concatenates nodes with no separators ("...gasRegisters..."),
    // so \b boundaries don't survive; match the substring instead.
    const gameDev = screen.getByTestId('actor-card-gameDev').textContent ?? '';
    expect(gameDev).toMatch(/registers/i);
    expect(gameDev).toMatch(/integration/i);
  });

  it('renders no #FF4500 accent in the DOM (AC-5)', () => {
    const container = renderCards();
    expect(container.querySelector('[data-testid="keycap-accent-dot"]')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain('ff4500');
  });

  it('is static — no canvas, no img (AC-6)', () => {
    const container = renderCards();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('marks ONLY the gameDev card as downstream with a kicker (AC-7)', () => {
    renderCards();
    for (const key of ['modelCreator', 'nftCreator', 'buyer']) {
      expect(screen.getByTestId(`actor-card-${key}`).getAttribute('data-downstream')).toBeNull();
    }
    const gameDev = screen.getByTestId('actor-card-gameDev');
    expect(gameDev.getAttribute('data-downstream')).toBe('true');
    expect(gameDev.textContent).toContain('CONSUMES OUTPUT');
    // The kicker is decorative — must stay aria-hidden so screen readers
    // don't announce the "↳ CONSUMES OUTPUT" glyph as content.
    const kicker = within(gameDev).getByText(/CONSUMES OUTPUT/);
    expect(kicker.getAttribute('aria-hidden')).toBe('true');
  });

  // AC-8 (375px no horizontal overflow) is enforced by the grid→2×2 pattern
  // mirrored from LifecycleStrip; the definitive pixel check is the
  // agent-browser verification at 375px, not JSDOM (which has no layout).
  // Here we only guard that the grid container imposes no inline width that
  // would force overflow.
  it('grid container sets no inline width that could force overflow (AC-8 guard)', () => {
    renderCards();
    const root = screen.getByTestId('actor-cards');
    const grid = root.querySelector('ol');
    expect(grid?.getAttribute('style')).toBeNull();
  });
});
