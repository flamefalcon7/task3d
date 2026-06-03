import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { IndeterminateBar } from './IndeterminateBar';

afterEach(cleanup);

describe('IndeterminateBar', () => {
  it('renders a progressbar with the given testid + aria-label', () => {
    render(<IndeterminateBar testId="x-progress" ariaLabel="Working…" />);
    const bar = screen.getByTestId('x-progress');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-label')).toBe('Working…');
  });
});
