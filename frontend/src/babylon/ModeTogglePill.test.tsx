import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModeTogglePill } from './ModeTogglePill';
import { MODE_PALETTE } from './modePalette';

afterEach(() => cleanup());

describe('ModeTogglePill', () => {
  it('renders the current mode label and fires onCycle on click', () => {
    const onCycle = vi.fn();
    render(<ModeTogglePill entry={MODE_PALETTE.pbr} onCycle={onCycle} />);
    const pill = screen.getByTestId('mode-toggle-pill');
    expect(pill.textContent).toBe('MODE: PBR');
    fireEvent.click(pill);
    expect(onCycle).toHaveBeenCalledTimes(1);
  });

  it('updates the label when the entry prop changes', () => {
    const { rerender } = render(
      <ModeTogglePill entry={MODE_PALETTE.pbr} onCycle={() => {}} />,
    );
    expect(screen.getByTestId('mode-toggle-pill').textContent).toBe('MODE: PBR');
    rerender(<ModeTogglePill entry={MODE_PALETTE.parts} onCycle={() => {}} />);
    expect(screen.getByTestId('mode-toggle-pill').textContent).toBe('MODE: PARTS');
    rerender(<ModeTogglePill entry={MODE_PALETTE.solo} onCycle={() => {}} />);
    expect(screen.getByTestId('mode-toggle-pill').textContent).toBe('MODE: SOLO');
    rerender(<ModeTogglePill entry={MODE_PALETTE.wireframe} onCycle={() => {}} />);
    expect(screen.getByTestId('mode-toggle-pill').textContent).toBe('MODE: WIREFRAME');
  });

  it('accepts a custom testId for multi-mount disambiguation', () => {
    render(
      <ModeTogglePill
        entry={MODE_PALETTE.pbr}
        onCycle={() => {}}
        testId="tagging-mode-pill"
      />,
    );
    expect(screen.getByTestId('tagging-mode-pill')).toBeTruthy();
    expect(screen.queryByTestId('mode-toggle-pill')).toBeNull();
  });

  it('exposes the current mode in aria-label for screen readers', () => {
    render(<ModeTogglePill entry={MODE_PALETTE.solo} onCycle={() => {}} />);
    expect(screen.getByLabelText(/Cycle viewer mode \(current: MODE: SOLO\)/)).toBeTruthy();
  });
});
