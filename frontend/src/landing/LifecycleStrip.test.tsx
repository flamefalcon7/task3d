import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LifecycleStrip } from './LifecycleStrip';

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

  it('renders the four layer sub-captions verbatim (AC-3)', () => {
    render(<LifecycleStrip />);
    const text = screen.getByTestId('lifecycle-strip').textContent ?? '';
    expect(text).toContain('INPUT · Tripo');
    expect(text).toContain('L1 · Model3D');
    expect(text).toContain('L2 · NftToken');
    expect(text).toContain('L3 · Integration');
  });

  it('never surfaces unshipped-mechanic vocabulary (AC-3)', () => {
    render(<LifecycleStrip />);
    const text = (screen.getByTestId('lifecycle-strip').textContent ?? '').toLowerCase();
    // Access / Seal are v1.1; "Derivative" is the deferred fork flavor — none
    // ship in v1, so none may appear on the landing strip.
    expect(text).not.toContain('access');
    expect(text).not.toContain('seal');
    expect(text).not.toContain('derivative');
  });

  it('renders the Newsreader-italic tagline (AC-4)', () => {
    render(<LifecycleStrip />);
    expect(
      screen.getByText('One prompt. One model. Sixteen forks. Every game.'),
    ).toBeTruthy();
  });

  it('renders the prompt text in panel 1 (AC-2)', () => {
    render(<LifecycleStrip />);
    const promptPanel = screen.getByTestId('lifecycle-panel-prompt');
    expect(promptPanel.textContent).toContain('a low-poly walrus tusk, ornate carve');
  });

  it('is static — no canvas, and panels 2–4 are img with non-empty alt (AC-6)', () => {
    const { container } = render(<LifecycleStrip />);
    expect(container.querySelector('canvas')).toBeNull();
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(3);
    imgs.forEach((img) => {
      expect(img.getAttribute('src')).toMatch(/^\/lifecycle\/.+\.svg$/);
      expect((img.getAttribute('alt') ?? '').length).toBeGreaterThan(0);
    });
  });

  it('renders no #FF4500 accent (AC-5)', () => {
    const { container } = render(<LifecycleStrip />);
    expect(container.querySelector('[data-testid="keycap-accent-dot"]')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain('ff4500');
  });
});
