import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MintButton } from './MintButton';

afterEach(() => cleanup());

describe('MintButton', () => {
  it('shows "Mint" label in idle status', () => {
    render(<MintButton status="idle" onClick={() => {}} />);
    expect(screen.getByTestId('mint-button').textContent).toBe('Mint');
  });

  it('labels step 1/3 when awaiting Walrus register popup', () => {
    render(
      <MintButton
        status="uploading"
        uploadStage="awaiting-register"
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('mint-button').textContent).toMatch(
      /Step 1 of 3 — approve Walrus register/,
    );
  });

  it('labels step 2/3 when awaiting Walrus certify popup', () => {
    render(
      <MintButton
        status="uploading"
        uploadStage="awaiting-certify"
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('mint-button').textContent).toMatch(
      /Step 2 of 3 — approve Walrus certify/,
    );
  });

  it('labels relay-upload (non-popup) stage as "Uploading…"', () => {
    render(
      <MintButton
        status="uploading"
        uploadStage="relay-upload"
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('mint-button').textContent).toMatch(
      /Uploading to Walrus/,
    );
  });

  it('falls back to "Preparing upload…" while encoding', () => {
    render(
      <MintButton
        status="uploading"
        uploadStage="encoding"
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('mint-button').textContent).toMatch(
      /Preparing upload/,
    );
  });

  it('shows step 3/3 (Sui publish) when signing', () => {
    render(<MintButton status="signing" onClick={() => {}} />);
    expect(screen.getByTestId('mint-button').textContent).toMatch(
      /Step 3 of 3 — approve Sui publish/,
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
