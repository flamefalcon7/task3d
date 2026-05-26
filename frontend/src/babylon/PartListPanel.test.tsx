import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PartListPanel, type PartListItem } from './PartListPanel';

// jsdom doesn't ship Element.prototype.scrollIntoView. Stub globally so the
// PartListPanel's scroll-on-selection effect doesn't throw at mount when
// selectedIndex starts non-null. Tests that need to inspect the calls
// (`scrolls the active row into view`) overwrite this stub locally.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => cleanup());

const FIVE_PARTS: PartListItem[] = [
  { index: 0, label: 'chassis' },
  { index: 1, label: 'wheels' },
  { index: 2, label: 'spoiler' },
  { index: 3, label: 'windshield' },
  { index: 4, label: 'headlights' },
];

describe('PartListPanel', () => {
  it('renders one row per part with zero-padded index + label', () => {
    render(<PartListPanel parts={FIVE_PARTS} selectedIndex={null} onSelect={() => {}} />);
    for (let i = 0; i < 5; i++) {
      const row = screen.getByTestId(`part-list-row-${i}`);
      expect(row.textContent).toContain(String(i + 1).padStart(2, '0'));
    }
    expect(screen.getByTestId('part-list-row-0').textContent).toContain('chassis');
    expect(screen.getByTestId('part-list-row-4').textContent).toContain('headlights');
  });

  it('fires onSelect with the part index when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<PartListPanel parts={FIVE_PARTS} selectedIndex={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('part-list-row-2'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('marks the selected row with aria-pressed=true and accent border', () => {
    render(<PartListPanel parts={FIVE_PARTS} selectedIndex={2} onSelect={() => {}} />);
    const active = screen.getByTestId('part-list-row-2');
    expect(active.getAttribute('aria-pressed')).toBe('true');
    // Browsers + jsdom serialize the inline border color as rgb(...) regardless
    // of the source hex. tokens.color.accent = #FF4500 = rgb(255, 69, 0).
    expect(active.getAttribute('style')).toMatch(
      /border:\s*2px solid (rgb\(255,\s*69,\s*0\)|#FF4500)/i,
    );
    // Non-selected rows.
    expect(screen.getByTestId('part-list-row-0').getAttribute('aria-pressed')).toBe('false');
  });

  it('scrolls the active row into view when selectedIndex changes', () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const { rerender } = render(
      <PartListPanel parts={FIVE_PARTS} selectedIndex={null} onSelect={() => {}} />,
    );
    expect(scrollSpy).not.toHaveBeenCalled();
    rerender(<PartListPanel parts={FIVE_PARTS} selectedIndex={3} onSelect={() => {}} />);
    expect(scrollSpy).toHaveBeenCalled();
    expect(scrollSpy.mock.calls[0]![0]).toEqual({ block: 'nearest' });
  });

  it('renders a colored swatch when colorHex is provided', () => {
    const partsWithSwatch: PartListItem[] = [
      { index: 0, label: 'chassis', colorHex: '#FF0000' },
      { index: 1, label: 'wheels', colorHex: '#00FF00' },
    ];
    render(<PartListPanel parts={partsWithSwatch} selectedIndex={null} onSelect={() => {}} />);
    const swatch0 = screen.getByTestId('part-list-swatch-0');
    // jsdom inline-style serialization may keep the hex or expand to rgb().
    expect(swatch0.getAttribute('style')).toMatch(/background:\s*(#FF0000|rgb\(255,\s*0,\s*0\))/i);
  });

  it('omits the swatch when colorHex is missing', () => {
    render(<PartListPanel parts={FIVE_PARTS} selectedIndex={null} onSelect={() => {}} />);
    expect(screen.queryByTestId('part-list-swatch-0')).toBeNull();
  });

  it('renders the "—" placeholder for parts with empty/undefined labels', () => {
    const parts: PartListItem[] = [
      { index: 0, label: '' },
      { index: 1 }, // no label key at all
      { index: 2, label: 'spoiler' },
    ];
    render(<PartListPanel parts={parts} selectedIndex={null} onSelect={() => {}} />);
    expect(screen.getByTestId('part-list-row-0').textContent).toMatch(/01.*—/);
    expect(screen.getByTestId('part-list-row-1').textContent).toMatch(/02.*—/);
    expect(screen.getByTestId('part-list-row-2').textContent).toMatch(/03.*spoiler/);
  });

  it('renders the empty state when parts is an empty array', () => {
    render(<PartListPanel parts={[]} selectedIndex={null} onSelect={() => {}} />);
    expect(screen.getByTestId('part-list-empty')).toBeTruthy();
    expect(screen.getByTestId('part-list-empty').textContent).toMatch(/NO PARTS LOADED/);
  });

  it('disambiguates testIds via the testIdSuffix prop', () => {
    render(
      <PartListPanel
        parts={FIVE_PARTS}
        selectedIndex={null}
        onSelect={() => {}}
        testIdSuffix="launch"
      />,
    );
    expect(screen.getByTestId('part-list-panel-launch')).toBeTruthy();
    expect(screen.getByTestId('part-list-row-0-launch')).toBeTruthy();
    expect(screen.queryByTestId('part-list-panel')).toBeNull();
  });
});
