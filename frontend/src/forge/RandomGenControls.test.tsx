import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RandomGenControls } from './RandomGenControls';
import type { HarmonicScheme } from './harmonics';

afterEach(() => cleanup());

interface HarnessProps {
  initialN?: number;
  initialSeed?: string;
  initialScheme?: HarmonicScheme;
  lockedCount?: number;
  onGenerate?: () => void;
}

function Harness({
  initialN = 5,
  initialSeed = '#ff0000',
  initialScheme = 'analogous',
  lockedCount = 0,
  onGenerate = () => {},
}: HarnessProps) {
  const [N, setN] = useState(initialN);
  const [seed, setSeed] = useState(initialSeed);
  const [scheme, setScheme] = useState<HarmonicScheme>(initialScheme);
  return (
    <RandomGenControls
      N={N}
      onChangeN={setN}
      seedHex={seed}
      onChangeSeed={setSeed}
      scheme={scheme}
      onChangeScheme={setScheme}
      lockedCount={lockedCount}
      onGenerate={onGenerate}
    />
  );
}

describe('RandomGenControls', () => {
  it('renders the count stepper, seed picker, 4 scheme swatches, and RANDOM GEN button', () => {
    render(<Harness />);
    expect(screen.getByTestId('random-gen-controls')).toBeTruthy();
    expect(screen.getByTestId('random-gen-n-value').textContent).toBe('5');
    expect(screen.getByTestId('random-gen-seed')).toBeTruthy();
    for (const s of ['analogous', 'complementary', 'triadic', 'tetradic'] as const) {
      expect(screen.getByTestId(`random-gen-scheme-${s}`)).toBeTruthy();
    }
    expect(screen.getByTestId('random-gen-button')).toBeTruthy();
  });

  it('count stepper changes N and clamps at the min/max bounds', () => {
    render(<Harness initialN={1} />);
    // At minimum — minus is disabled.
    expect((screen.getByTestId('random-gen-n-minus') as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    expect(screen.getByTestId('random-gen-n-value').textContent).toBe('2');
    // Click + 20 times — should cap at maxN=16.
    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByTestId('random-gen-n-plus'));
    }
    expect(screen.getByTestId('random-gen-n-value').textContent).toBe('16');
    expect((screen.getByTestId('random-gen-n-plus') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('scheme button click switches the active scheme (aria-pressed reflects state)', () => {
    render(<Harness />);
    expect(
      screen.getByTestId('random-gen-scheme-analogous').getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByTestId('random-gen-scheme-tetradic'));
    expect(
      screen.getByTestId('random-gen-scheme-tetradic').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('random-gen-scheme-analogous').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('RANDOM GEN button label reads "(N VARIANTS)" with no locks', () => {
    render(<Harness initialN={10} lockedCount={0} />);
    expect(screen.getByTestId('random-gen-button').textContent).toBe('RANDOM GEN (10 VARIANTS)');
  });

  it('RANDOM GEN button label reads "(M OF N, K LOCKED)" when K > 0', () => {
    render(<Harness initialN={10} lockedCount={3} />);
    expect(screen.getByTestId('random-gen-button').textContent).toBe(
      'RANDOM GEN (7 OF 10, 3 LOCKED)',
    );
  });

  it('singular form: "(1 VARIANT)" not "(1 VARIANTS)"', () => {
    render(<Harness initialN={1} />);
    expect(screen.getByTestId('random-gen-button').textContent).toBe('RANDOM GEN (1 VARIANT)');
  });

  it('clicking RANDOM GEN fires the onGenerate handler', () => {
    const onGenerate = vi.fn();
    render(<Harness onGenerate={onGenerate} />);
    fireEvent.click(screen.getByTestId('random-gen-button'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('disabled flag locks every input + button', () => {
    function DisabledHarness() {
      const [N, setN] = useState(5);
      return (
        <RandomGenControls
          N={N}
          onChangeN={setN}
          seedHex="#ff0000"
          onChangeSeed={() => {}}
          scheme="analogous"
          onChangeScheme={() => {}}
          lockedCount={0}
          onGenerate={() => {}}
          disabled
        />
      );
    }
    render(<DisabledHarness />);
    expect((screen.getByTestId('random-gen-n-plus') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('random-gen-n-minus') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('random-gen-seed') as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByTestId('random-gen-scheme-triadic') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByTestId('random-gen-button') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('HelpIcon next to the panel title surfaces a popover (R12)', () => {
    render(<Harness />);
    expect(screen.getByTestId('random-gen-help')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByTestId('random-gen-help'));
    expect(screen.getByTestId('random-gen-help-popover').textContent).toMatch(
      /seed color/i,
    );
  });
});
