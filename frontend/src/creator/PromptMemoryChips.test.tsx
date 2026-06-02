import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PromptMemoryChips } from './PromptMemoryChips';
import type { MemoryChip } from './useCreatorMemory';

function renderChips(props: Partial<Parameters<typeof PromptMemoryChips>[0]> & { chips: MemoryChip[] }) {
  const onPick = props.onPick ?? vi.fn();
  render(
    <MemoryRouter>
      <PromptMemoryChips currentPrompt="" onPick={onPick} {...props} />
    </MemoryRouter>,
  );
  return { onPick };
}

const WEAK: MemoryChip = { prompt: 'a chunky off-road truck', modelId: '0xtruck', distance: 0.62 };
const STRONG: MemoryChip = { prompt: 'a low-poly red sports car', modelId: '0xcar', distance: 0.39 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PromptMemoryChips', () => {
  it('renders nothing when there are no chips (cold start / empty / error)', () => {
    const { container } = render(
      <MemoryRouter>
        <PromptMemoryChips chips={[]} currentPrompt="" onPick={vi.fn()} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-testid="memory-chip"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders a chip with an open link to /model/:id', () => {
    renderChips({ chips: [WEAK] });
    expect(screen.getByTestId('memory-chip')).toBeTruthy();
    const open = screen.getByTestId('memory-chip-open') as HTMLAnchorElement;
    expect(open.getAttribute('href')).toBe('/model/0xtruck');
  });

  it('highlights a strong match with the strong testid', () => {
    renderChips({ chips: [STRONG] });
    expect(screen.getByTestId('memory-chip-strong')).toBeTruthy();
    expect(screen.queryByTestId('memory-chip')).toBeNull();
  });

  it('click on empty textarea fills the prompt (no confirm)', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { onPick } = renderChips({ chips: [WEAK], currentPrompt: '' });
    fireEvent.click(screen.getByTestId('memory-chip'));
    expect(onPick).toHaveBeenCalledWith('a chunky off-road truck');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('click with existing text asks confirm before replacing', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onPick } = renderChips({ chips: [WEAK], currentPrompt: 'half typed' });
    fireEvent.click(screen.getByTestId('memory-chip'));
    expect(onPick).toHaveBeenCalledWith('a chunky off-road truck');
  });

  it('declined confirm does not replace the prompt', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onPick } = renderChips({ chips: [WEAK], currentPrompt: 'half typed' });
    fireEvent.click(screen.getByTestId('memory-chip'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a chip with no resolvable modelId renders without a broken link', () => {
    renderChips({ chips: [{ prompt: 'orphan prompt', modelId: null, distance: 0.5 }] });
    expect(screen.getByTestId('memory-chip')).toBeTruthy();
    expect(screen.queryByTestId('memory-chip-open')).toBeNull();
  });

  it('chip pick control is a real button (keyboard-activatable)', () => {
    renderChips({ chips: [WEAK] });
    expect((screen.getByTestId('memory-chip') as HTMLElement).tagName).toBe('BUTTON');
  });

  it('caps at 5 chips even if more are passed', () => {
    const many: MemoryChip[] = Array.from({ length: 8 }, (_, i) => ({
      prompt: `p${i}`,
      modelId: `0x${i}`,
      distance: 0.6,
    }));
    renderChips({ chips: many });
    expect(screen.getAllByTestId('memory-chip')).toHaveLength(5);
  });
});
