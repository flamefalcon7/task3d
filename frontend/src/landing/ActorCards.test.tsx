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
      // name (the actor key doubles as the displayed name)
      expect(card.textContent).toContain(key);
      // cost line — non-empty text containing a cost token
      expect(card.textContent).toMatch(/gas|royalty|fee|price/i);
      // ability — a full sentence ending in a period
      expect(card.textContent).toMatch(/\.\s*$|\.[^.]/);
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
    renderCards();
    const text = screen.getByTestId('actor-cards').textContent ?? '';
    // Access / Seal are v1.1 (Seal-gated access sale); "Derivative" is the
    // deferred fork flavor — none ship in v1, so none may appear. Word-boundary
    // match so legitimate copy like "license" / "forks" wouldn't false-trip.
    expect(text).not.toMatch(/\baccess\b/i);
    expect(text).not.toMatch(/\bseal\b/i);
    expect(text).not.toMatch(/\bderivative\b/i);
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
