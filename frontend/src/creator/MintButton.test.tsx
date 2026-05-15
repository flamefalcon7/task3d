import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MintButton } from './MintButton';

afterEach(() => cleanup());

describe('MintButton', () => {
  it('shows "Mint" label in idle status', () => {
    render(<MintButton status="idle" onClick={() => {}} />);
    expect(screen.getByTestId('mint-button').textContent).toBe('Mint');
  });

  it('shows step 1/3 label when uploading with popupCount=0', () => {
    render(<MintButton status="uploading" popupCount={0} onClick={() => {}} />);
    expect(screen.getByTestId('mint-button').textContent).toMatch(
      /Step 1 of 3/,
    );
  });

  it('shows step 3/3 (Sui publish) when signing', () => {
    render(<MintButton status="signing" onClick={() => {}} />);
    expect(screen.getByTestId('mint-button').textContent).toMatch(
      /Step 3 of 3/,
    );
  });

  it('disables button while uploading or signing', () => {
    render(<MintButton status="uploading" onClick={() => {}} />);
    expect((screen.getByTestId('mint-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders explorer link on success', () => {
    render(
      <MintButton
        status="success"
        onClick={() => {}}
        explorerUrl="https://suiscan.xyz/testnet/tx/0xabc"
      />,
    );
    const link = screen.getByTestId('explorer-link') as HTMLAnchorElement;
    expect(link.href).toContain('0xabc');
    expect(screen.getByTestId('mint-button').textContent).toMatch(/Minted/);
  });

  it('renders error message in error status', () => {
    render(
      <MintButton
        status="error"
        onClick={() => {}}
        errorMessage="boom"
      />,
    );
    expect(screen.getByTestId('mint-error').textContent).toBe('boom');
  });

  it('calls onClick when clicked in idle', () => {
    const onClick = vi.fn();
    render(<MintButton status="idle" onClick={onClick} />);
    fireEvent.click(screen.getByTestId('mint-button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
