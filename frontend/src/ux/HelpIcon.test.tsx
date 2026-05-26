import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HelpIcon } from './HelpIcon';

afterEach(() => cleanup());

describe('HelpIcon', () => {
  it('renders the ? button with title as aria-label and no popover initially', () => {
    render(<HelpIcon title="Why naming matters" body="Buyers customize these axes." />);
    const btn = screen.getByLabelText('Why naming matters');
    expect(btn.textContent).toBe('?');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the popover on mouseenter and hides on mouseleave', () => {
    render(<HelpIcon title="t" body="POPOVER BODY" testId="help-1" />);
    const btn = screen.getByTestId('help-1');
    fireEvent.mouseEnter(btn);
    expect(screen.getByTestId('help-1-popover').textContent).toBe('POPOVER BODY');
    fireEvent.mouseLeave(btn);
    expect(screen.queryByTestId('help-1-popover')).toBeNull();
  });

  it('shows the popover on keyboard focus and hides on blur (a11y)', () => {
    render(<HelpIcon title="t" body="b" testId="help-1" />);
    const btn = screen.getByTestId('help-1');
    fireEvent.focus(btn);
    expect(screen.getByTestId('help-1-popover')).toBeTruthy();
    fireEvent.blur(btn);
    expect(screen.queryByTestId('help-1-popover')).toBeNull();
  });

  it('defaults the testId to "help-icon" when none is provided', () => {
    render(<HelpIcon title="t" body="b" />);
    expect(screen.getByTestId('help-icon')).toBeTruthy();
  });
});
