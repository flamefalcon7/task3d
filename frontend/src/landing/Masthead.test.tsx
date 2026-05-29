import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Masthead } from './Masthead';

const MARK_SVG = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../public/mark/tusk-ridge.svg',
);

describe('Masthead', () => {
  it('renders the wordmark and edition tag (AC-2)', () => {
    render(<Masthead issueNumber={142} />);
    expect(screen.getByTestId('masthead')).toBeTruthy();
    expect(screen.getByTestId('masthead-wordmark').textContent).toBe('Tusk3D');
    expect(screen.getByTestId('masthead-edition').textContent).toBe('TESTNET EDITION');
  });

  it('renders №NNN for a positive issue number (AC-3)', () => {
    render(<Masthead issueNumber={142} />);
    expect(screen.getByTestId('masthead-issue').textContent).toBe('№142');
  });

  it('drops the № token entirely on the sentinel 0 (AC-4)', () => {
    render(<Masthead issueNumber={0} />);
    expect(screen.queryByTestId('masthead-issue')).toBeNull();
    // a coherent wordmark-only masthead — never №0 / №NaN / №undefined
    const text = screen.getByTestId('masthead').textContent ?? '';
    expect(text).toContain('Tusk3D');
    expect(text).toContain('TESTNET EDITION');
    expect(text).not.toMatch(/№/);
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it('drops the № token for a non-finite number (defensive, AC-4)', () => {
    render(<Masthead issueNumber={Number.NaN} />);
    expect(screen.queryByTestId('masthead-issue')).toBeNull();
    expect(screen.getByTestId('masthead').textContent ?? '').not.toMatch(/NaN/);
  });

  it('falls back to no number when the build-time global is undefined (test env, AC-4)', () => {
    // No prop: reads buildIssueNumber, which is the 0 sentinel under vitest
    // (vitest.config.ts has no `define` block). Proves the typeof guard holds.
    render(<Masthead />);
    expect(screen.getByTestId('masthead')).toBeTruthy();
    expect(screen.queryByTestId('masthead-issue')).toBeNull();
  });

  it('renders no #FF4500 accent element (AC-5)', () => {
    const { container } = render(<Masthead issueNumber={313} />);
    // The component introduces no accent marker (cf. KeycapRow's accent dot) and
    // no inline orange. The masthead is pure black-on-paper by construction.
    expect(container.querySelector('[data-testid="keycap-accent-dot"]')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain('ff4500');
  });

  it('renders a large issue number without error (edge)', () => {
    render(<Masthead issueNumber={9999} />);
    expect(screen.getByTestId('masthead-issue').textContent).toBe('№9999');
  });

  it('renders the S3 topology mark as a decorative img before the wordmark (S3)', () => {
    render(<Masthead issueNumber={313} />);
    const mark = screen.getByTestId('masthead-mark');
    expect(mark.tagName).toBe('IMG');
    expect(mark.getAttribute('src')).toBe('/mark/tusk-ridge.svg');
    // decorative — wordmark carries the name, so empty alt avoids double-announce
    expect(mark.getAttribute('alt')).toBe('');
    // DOM order: the mark leads the wordmark
    const wordmark = screen.getByTestId('masthead-wordmark');
    expect(mark.compareDocumentPosition(wordmark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is static — no canvas in the masthead (S3)', () => {
    const { container } = render(<Masthead issueNumber={313} />);
    expect(container.querySelector('canvas')).toBeNull();
  });

  // The DOM ff4500 check above is vacuous for the mark, which is an <img src>
  // (the SVG bytes never enter the DOM). Assert zero accent on the asset file
  // itself — the real zero-accent surface (S4 lesson).
  it('the topology mark SVG asset contains no #FF4500 accent (S3 / D-044)', () => {
    const svg = readFileSync(MARK_SVG, 'utf8').toLowerCase();
    expect(svg).not.toContain('ff4500');
  });
});
