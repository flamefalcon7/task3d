import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Masthead } from './Masthead';

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
});
