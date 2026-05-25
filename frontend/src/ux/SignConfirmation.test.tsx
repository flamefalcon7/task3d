import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SignConfirmation } from './SignConfirmation';

afterEach(() => {
  cleanup();
});

const baseProps = {
  buttonLabel: 'PAY 0.4 SUI & GENERATE',
  summary: [
    { label: 'Tripo generation', amount: '0.4 SUI' },
    { label: 'Estimated gas', amount: '~ 0.001 SUI', muted: true },
  ],
  recipient: {
    address: '0xd966383abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123',
    note: 'TRIPO_FEE_TREASURY (deployer)',
  },
};

describe('SignConfirmation', () => {
  it('idle state shows only the trigger button, not the panel', () => {
    const onConfirm = vi.fn();
    render(<SignConfirmation {...baseProps} onConfirm={onConfirm} />);
    expect(screen.getByTestId('sign-confirmation-trigger').textContent).toContain(
      'PAY 0.4 SUI & GENERATE',
    );
    expect(screen.queryByTestId('sign-confirmation-panel')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('clicking trigger reveals confirmation panel with summary + recipient + caveat', () => {
    render(<SignConfirmation {...baseProps} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByTestId('sign-confirmation-trigger'));
    const panel = screen.getByTestId('sign-confirmation-panel');
    expect(panel).toBeTruthy();
    // Summary rows visible (label + amount)
    expect(panel.textContent).toContain('Tripo generation');
    expect(panel.textContent).toContain('0.4 SUI');
    expect(panel.textContent).toContain('Estimated gas');
    expect(panel.textContent).toContain('~ 0.001 SUI');
    // Recipient block: truncated address + note
    expect(panel.textContent).toContain('0xd96638…ef0123');
    expect(panel.textContent).toContain('TRIPO_FEE_TREASURY (deployer)');
    // Wallet caveat note is on by default
    expect(panel.textContent).toMatch(/Slush popup may render the amount as raw hex/i);
  });

  it('clicking Cancel returns to idle without firing onConfirm', () => {
    const onConfirm = vi.fn();
    render(<SignConfirmation {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('sign-confirmation-trigger'));
    fireEvent.click(screen.getByTestId('sign-confirmation-cancel'));
    expect(screen.queryByTestId('sign-confirmation-panel')).toBeNull();
    expect(screen.getByTestId('sign-confirmation-trigger')).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('clicking Confirm fires onConfirm exactly once and returns to idle', () => {
    const onConfirm = vi.fn();
    render(<SignConfirmation {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('sign-confirmation-trigger'));
    fireEvent.click(screen.getByTestId('sign-confirmation-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sign-confirmation-panel')).toBeNull();
    expect(screen.getByTestId('sign-confirmation-trigger')).toBeTruthy();
  });

  it('walletCaveat=false hides the Slush caveat (e.g. personal-message signing)', () => {
    render(
      <SignConfirmation
        {...baseProps}
        walletCaveat={false}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('sign-confirmation-trigger'));
    expect(screen.getByTestId('sign-confirmation-panel').textContent).not.toMatch(
      /Slush popup may render the amount as raw hex/i,
    );
  });

  it('disabled idle button does not open the panel on click', () => {
    const onConfirm = vi.fn();
    render(<SignConfirmation {...baseProps} disabled onConfirm={onConfirm} />);
    const trigger = screen.getByTestId('sign-confirmation-trigger') as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByTestId('sign-confirmation-panel')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
