import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { TurntablePreview } from './TurntablePreview';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const src = (testId: string) => (screen.getByTestId(testId) as HTMLImageElement).getAttribute('src');

describe('TurntablePreview (faux-turntable)', () => {
  it('cycles through the angle stills over time and wraps', () => {
    vi.useFakeTimers();
    render(<TurntablePreview urls={['a.png', 'b.png', 'c.png']} testId="tp" intervalMs={100} />);
    expect(src('tp')).toBe('a.png');
    act(() => vi.advanceTimersByTime(100));
    expect(src('tp')).toBe('b.png');
    act(() => vi.advanceTimersByTime(100));
    expect(src('tp')).toBe('c.png');
    act(() => vi.advanceTimersByTime(100));
    expect(src('tp')).toBe('a.png'); // wraps back to the first angle
  });

  it('a single still → static (never starts an interval)', () => {
    vi.useFakeTimers();
    render(<TurntablePreview urls={['only.png']} testId="tp" intervalMs={100} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(src('tp')).toBe('only.png');
  });

  it('no stills → renders nothing', () => {
    render(<TurntablePreview urls={[]} testId="tp" />);
    expect(screen.queryByTestId('tp')).toBeNull();
  });
});
