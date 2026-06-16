import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WireframeLoadingOverlay } from './WireframeLoadingOverlay';

afterEach(() => cleanup());

describe('WireframeLoadingOverlay', () => {
  it('renders the cube svg and the label with a leading em-dash', () => {
    render(<WireframeLoadingOverlay testId="x-loading" label="LOADING MESH" />);
    const root = screen.getByTestId('x-loading');
    expect(root.querySelector('svg')).not.toBeNull();
    expect(root.textContent).toBe('— LOADING MESH');
  });

  it('defaults the label to LOADING when none is given', () => {
    render(<WireframeLoadingOverlay testId="y-loading" />);
    expect(screen.getByTestId('y-loading').textContent).toBe('— LOADING');
  });

  it('applies the passed testId and is aria-hidden (no pointer capture intent)', () => {
    render(<WireframeLoadingOverlay testId="z-loading" />);
    expect(screen.getByTestId('z-loading').getAttribute('aria-hidden')).toBe('true');
  });
});
