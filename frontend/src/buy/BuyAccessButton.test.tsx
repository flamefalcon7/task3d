import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const signAndExecuteMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useSignAndExecuteTransaction: () => ({ mutateAsync: signAndExecuteMock }),
}));

import { BuyAccessButton } from './BuyAccessButton';

beforeEach(() => {
  signAndExecuteMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('BuyAccessButton', () => {
  it('renders idle label with formatted SUI price', () => {
    render(
      <BuyAccessButton modelObjectId="0xabc" priceMist={100_000_000n} />,
    );
    expect(screen.getByTestId('buy-button').textContent).toMatch(
      /Buy Access \(0\.10 SUI\)/,
    );
  });

  it('renders "Claim Access (free)" when priceMist is 0', () => {
    render(<BuyAccessButton modelObjectId="0xabc" priceMist={0n} />);
    expect(screen.getByTestId('buy-button').textContent).toMatch(
      /Claim Access \(free\)/,
    );
  });

  it('click → signing → success shows explorer link', async () => {
    signAndExecuteMock.mockResolvedValueOnce({ digest: '0xDIGEST' });
    render(
      <BuyAccessButton modelObjectId="0xabc" priceMist={100_000_000n} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('buy-button'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('buy-button').textContent).toMatch(
        /Purchased/,
      );
    });
    const link = screen.getByTestId('buy-explorer-link') as HTMLAnchorElement;
    expect(link.href).toContain('0xDIGEST');
    expect(link.href).toContain('suiscan.xyz/testnet/tx');
  });

  it('wallet rejection sets rejected state (no crimson error)', async () => {
    signAndExecuteMock.mockRejectedValueOnce(
      new Error('User rejected the request'),
    );
    render(
      <BuyAccessButton modelObjectId="0xabc" priceMist={100_000_000n} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('buy-button'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('buy-rejected')).toBeTruthy();
    });
    expect(screen.queryByTestId('buy-failed')).toBeNull();
  });

  it('generic failure (non-rejection) shows failed state', async () => {
    signAndExecuteMock.mockRejectedValueOnce(new Error('Network unreachable'));
    render(
      <BuyAccessButton modelObjectId="0xabc" priceMist={100_000_000n} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('buy-button'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('buy-failed')).toBeTruthy();
    });
    expect(screen.queryByTestId('buy-rejected')).toBeNull();
    expect(screen.getByTestId('buy-failed').textContent).toMatch(
      /Network unreachable/,
    );
  });

  it('alreadyOwned variant renders disabled "already own" button', () => {
    render(
      <BuyAccessButton
        modelObjectId="0xabc"
        priceMist={100_000_000n}
        alreadyOwned
      />,
    );
    const btn = screen.getByTestId('buy-already-owned') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/already own access/i);
  });

  it('calls onSuccess callback with tx digest', async () => {
    signAndExecuteMock.mockResolvedValueOnce({ digest: '0xAA' });
    const onSuccess = vi.fn();
    render(
      <BuyAccessButton
        modelObjectId="0xabc"
        priceMist={100_000_000n}
        onSuccess={onSuccess}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('buy-button'));
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('0xAA');
    });
  });
});
