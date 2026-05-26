import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VariantStrip } from './VariantStrip';
import { newVariantRow, type VariantRow } from './VariantEditor';

afterEach(() => cleanup());

function makeVariants(count: number, palette?: Record<string, string>): VariantRow[] {
  return Array.from({ length: count }, (_, i) =>
    newVariantRow({
      uniqueLabels: ['primary'],
      seed: palette ? { palette } : undefined,
    }),
  );
}

function StatefulHarness({
  initial = makeVariants(5),
  initialSelected = 0,
  initialLocked = new Set<number>(),
}: {
  initial?: VariantRow[];
  initialSelected?: number;
  initialLocked?: Set<number>;
}) {
  const [selected, setSelected] = useState(initialSelected);
  const [locked, setLocked] = useState<Set<number>>(initialLocked);
  return (
    <VariantStrip
      variants={initial}
      selectedIndex={selected}
      onSelect={setSelected}
      lockedIndices={locked}
      onToggleLock={(i) => {
        setLocked((prev) => {
          const next = new Set(prev);
          if (next.has(i)) next.delete(i);
          else next.add(i);
          return next;
        });
      }}
    />
  );
}

describe('VariantStrip', () => {
  it('renders N tiles with mono "NNN/TOT" index labels', () => {
    render(<StatefulHarness initial={makeVariants(3)} />);
    for (let i = 0; i < 3; i++) {
      const tile = screen.getByTestId(`variant-strip-tile-${i}`);
      expect(tile).toBeTruthy();
      expect(tile.textContent).toContain(`${String(i + 1).padStart(3, '0')}/003`);
    }
  });

  it('clicking a tile fires onSelect with that index', () => {
    const onSelect = vi.fn();
    render(
      <VariantStrip
        variants={makeVariants(4)}
        selectedIndex={0}
        onSelect={onSelect}
        lockedIndices={new Set()}
        onToggleLock={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('variant-strip-tile-2'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('active tile reflects accent border (aria-pressed=true)', () => {
    render(<StatefulHarness initial={makeVariants(4)} initialSelected={2} />);
    const active = screen.getByTestId('variant-strip-tile-2');
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(active.getAttribute('style')).toMatch(
      /border:\s*2px solid (rgb\(255,\s*69,\s*0\)|#FF4500)/i,
    );
    expect(
      screen.getByTestId('variant-strip-tile-0').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('lock badge click toggles lock state without firing onSelect', () => {
    const onSelect = vi.fn();
    function Harness() {
      const [locked, setLocked] = useState<Set<number>>(new Set());
      return (
        <VariantStrip
          variants={makeVariants(3)}
          selectedIndex={0}
          onSelect={onSelect}
          lockedIndices={locked}
          onToggleLock={(i) =>
            setLocked((prev) => {
              const next = new Set(prev);
              next.has(i) ? next.delete(i) : next.add(i);
              return next;
            })
          }
        />
      );
    }
    render(<Harness />);
    expect(
      screen.getByTestId('variant-strip-lock-1').getAttribute('aria-checked'),
    ).toBe('false');
    fireEvent.click(screen.getByTestId('variant-strip-lock-1'));
    expect(
      screen.getByTestId('variant-strip-lock-1').getAttribute('aria-checked'),
    ).toBe('true');
    // onSelect should NOT have fired — lock badge stops propagation.
    expect(onSelect).not.toHaveBeenCalled();
    // Re-click toggles off.
    fireEvent.click(screen.getByTestId('variant-strip-lock-1'));
    expect(
      screen.getByTestId('variant-strip-lock-1').getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('locked tile shows accent-fill badge + ink border (visual distinct from active)', () => {
    render(
      <VariantStrip
        variants={makeVariants(3)}
        selectedIndex={0}
        onSelect={() => {}}
        lockedIndices={new Set([1])}
        onToggleLock={() => {}}
      />,
    );
    const locked = screen.getByTestId('variant-strip-tile-1');
    // Locked tile border = ink (rgb(0, 0, 0)).
    expect(locked.getAttribute('style')).toMatch(
      /border:\s*2px solid (rgb\(0,\s*0,\s*0\)|#000000)/i,
    );
    // Lock badge background = accent (rgb(255, 69, 0)).
    const badge = screen.getByTestId('variant-strip-lock-1');
    expect(badge.getAttribute('style')).toMatch(
      /background:\s*(rgb\(255,\s*69,\s*0\)|#FF4500)/i,
    );
  });

  it('tile color reflects palette.primary for legacy bases (LEGACY_LABEL fallback)', () => {
    const variants = [
      newVariantRow({ uniqueLabels: ['primary'], seed: { palette: { primary: '#ff0000' } } }),
      newVariantRow({ uniqueLabels: ['primary'], seed: { palette: { primary: '#00ff00' } } }),
    ];
    render(
      <VariantStrip
        variants={variants}
        selectedIndex={0}
        onSelect={() => {}}
        lockedIndices={new Set()}
        onToggleLock={() => {}}
      />,
    );
    expect(screen.getByTestId('variant-strip-tile-0').getAttribute('style')).toMatch(
      /background:\s*(rgb\(255,\s*0,\s*0\)|#ff0000)/i,
    );
    expect(screen.getByTestId('variant-strip-tile-1').getAttribute('style')).toMatch(
      /background:\s*(rgb\(0,\s*255,\s*0\)|#00ff00)/i,
    );
  });

  it('keyboard activation on the lock badge (Enter / Space) toggles lock', () => {
    function Harness() {
      const [locked, setLocked] = useState<Set<number>>(new Set());
      return (
        <VariantStrip
          variants={makeVariants(2)}
          selectedIndex={0}
          onSelect={() => {}}
          lockedIndices={locked}
          onToggleLock={(i) =>
            setLocked((prev) => {
              const next = new Set(prev);
              next.has(i) ? next.delete(i) : next.add(i);
              return next;
            })
          }
        />
      );
    }
    render(<Harness />);
    const badge = screen.getByTestId('variant-strip-lock-0');
    fireEvent.keyDown(badge, { key: 'Enter' });
    expect(badge.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(badge, { key: ' ' });
    expect(badge.getAttribute('aria-checked')).toBe('false');
  });

  it('disabled flag prevents both lock toggle and tile selection', () => {
    const onSelect = vi.fn();
    const onToggleLock = vi.fn();
    render(
      <VariantStrip
        variants={makeVariants(2)}
        selectedIndex={0}
        onSelect={onSelect}
        lockedIndices={new Set()}
        onToggleLock={onToggleLock}
        disabled
      />,
    );
    fireEvent.click(screen.getByTestId('variant-strip-tile-1'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('variant-strip-lock-1'));
    expect(onToggleLock).not.toHaveBeenCalled();
  });

  it('N=16 renders all 16 tiles (max Move-contract size)', () => {
    render(<StatefulHarness initial={makeVariants(16)} />);
    for (let i = 0; i < 16; i++) {
      expect(screen.getByTestId(`variant-strip-tile-${i}`)).toBeTruthy();
    }
  });
});
