import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KeycapRow } from './KeycapRow';

function renderRow(): void {
  render(
    <MemoryRouter>
      <KeycapRow />
    </MemoryRouter>,
  );
}

describe('KeycapRow', () => {
  it('renders 4 keycaps in CARVE / RIFF / BROWSE / INTEGRATE order (AE1)', () => {
    renderRow();
    const row = screen.getByTestId('keycap-row');
    const items = within(row).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]?.textContent).toMatch(/CARVE/);
    expect(items[1]?.textContent).toMatch(/RIFF/);
    expect(items[2]?.textContent).toMatch(/BROWSE/);
    expect(items[3]?.textContent).toMatch(/INTEGRATE/);
  });

  it('each keycap link resolves to its expected route', () => {
    renderRow();
    expect(
      (screen.getByTestId('keycap-carve') as HTMLAnchorElement).getAttribute('href'),
    ).toBe('/create');
    expect(
      (screen.getByTestId('keycap-riff') as HTMLAnchorElement).getAttribute('href'),
    ).toBe('/launch');
    expect(
      (screen.getByTestId('keycap-browse') as HTMLAnchorElement).getAttribute('href'),
    ).toBe('/browse');
    expect(
      (screen.getByTestId('keycap-integrate') as HTMLAnchorElement).getAttribute('href'),
    ).toBe('/integrate');
  });

  it('accent dot renders only inside the BROWSE keycap (R4, R17 — 1 accent slot)', () => {
    renderRow();
    const dots = screen.getAllByTestId('keycap-accent-dot');
    expect(dots).toHaveLength(1);
    const browse = screen.getByTestId('keycap-browse');
    expect(browse.contains(dots[0]!)).toBe(true);
  });
});
