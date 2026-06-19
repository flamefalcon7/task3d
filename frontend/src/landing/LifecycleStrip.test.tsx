import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

// The three Babylon panels + the typewriter are mocked at the module boundary
// so the strip test never touches WebGL or timers (D-092 — the strip is now
// live; its children own that behavior and are tested in their own suites).
vi.mock('./TypewriterPrompt', () => ({
  TypewriterPrompt: () => <span data-testid="mock-typewriter">a low-poly walrus tusk</span>,
}));
vi.mock('./panels/ModelPanel', () => ({
  ModelPanel: () => <div data-testid="mock-model" />,
}));
vi.mock('./panels/VariantPanel', () => ({
  VariantPanel: () => <div data-testid="mock-variant" />,
}));
vi.mock('./panels/InGamePanel', () => ({
  InGamePanel: () => <div data-testid="mock-ingame" />,
}));

import { LifecycleStrip } from './LifecycleStrip';

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/lifecycle');
const PANEL_ASSETS = ['model.svg', 'variant.svg', 'in-game.svg'] as const;

afterEach(cleanup);

describe('LifecycleStrip', () => {
  it('renders 4 panels in PROMPT / MODEL / VARIANT / IN-GAME OBJ order (AC-2)', () => {
    render(<LifecycleStrip />);
    const strip = screen.getByTestId('lifecycle-strip');
    const panels = within(strip).getAllByRole('listitem');
    expect(panels).toHaveLength(4);
    expect(panels[0]?.textContent).toMatch(/PROMPT/);
    expect(panels[1]?.textContent).toMatch(/MODEL/);
    expect(panels[2]?.textContent).toMatch(/VARIANT/);
    expect(panels[3]?.textContent).toMatch(/IN-GAME OBJ/);
  });

  it('renders the four layer sub-captions verbatim (AC-3, contract-locked)', () => {
    render(<LifecycleStrip />);
    const text = screen.getByTestId('lifecycle-strip').textContent ?? '';
    expect(text).toContain('INPUT · Tripo');
    expect(text).toContain('L1 · Model3D');
    expect(text).toContain('L2 · NftToken');
    expect(text).toContain('L3 · Integration');
  });

  it('never surfaces unshipped-mechanic vocabulary (AC-3)', () => {
    render(<LifecycleStrip />);
    const text = screen.getByTestId('lifecycle-strip').textContent ?? '';
    expect(text).not.toMatch(/\baccess\b/i);
    expect(text).not.toMatch(/\bseal\b/i);
    expect(text).not.toMatch(/\bderivative\b/i);
  });

  it('renders the Newsreader-italic tagline (AC-4)', () => {
    render(<LifecycleStrip />);
    expect(screen.getByText('One prompt. One model. Infinite forks. Any world.')).toBeTruthy();
  });

  it('renders the live typewriter in the PROMPT panel (D-092)', () => {
    render(<LifecycleStrip />);
    const promptPanel = screen.getByTestId('lifecycle-panel-prompt');
    expect(within(promptPanel).getByTestId('mock-typewriter')).toBeTruthy();
  });

  it('renders the mapped live well in each pipeline panel (D-092)', () => {
    render(<LifecycleStrip />);
    expect(
      within(screen.getByTestId('lifecycle-panel-model')).getByTestId('mock-model'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('lifecycle-panel-variant')).getByTestId('mock-variant'),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('lifecycle-panel-ingame')).getByTestId('mock-ingame'),
    ).toBeTruthy();
  });

  it('renders no #FF4500 accent in the DOM (AC-5 — panels stay accent-free)', () => {
    const { container } = render(<LifecycleStrip />);
    expect(container.innerHTML.toLowerCase()).not.toContain('ff4500');
  });

  // The static SVG fallbacks (used on low-end/mobile via LiveWell) must also
  // stay zero-accent — the bytes never enter the DOM, so check the files.
  it.each(PANEL_ASSETS)('static fallback asset %s contains no #FF4500 accent (AC-5)', (file) => {
    const svg = readFileSync(join(ASSET_DIR, file), 'utf8').toLowerCase();
    expect(svg).not.toContain('ff4500');
  });
});
