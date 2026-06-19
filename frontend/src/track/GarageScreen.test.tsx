import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GarageScreen } from './GarageScreen';
import { BOUND_COLLECTION_ID, DEFAULT_CAR_TOKEN_ID } from './rageRacing/brand';
import type { OwnedToken } from './useOwnedTokens';

// PreviewCanvas spins a live Babylon scene — mock it to a stub that records the
// glbUrl it was asked to render, so tests stay in jsdom.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({
    glbUrl,
    testIdSuffix,
  }: {
    glbUrl: string | null;
    testIdSuffix?: string;
  }) => (
    <div data-testid={`preview${testIdSuffix ?? ''}`} data-glburl={glbUrl ?? ''} />
  ),
}));

vi.mock('../auth/SignInButton', () => ({
  SignInButton: () => <div data-testid="signin-button-mock" />,
}));

function nft(overrides: Partial<OwnedToken> = {}): OwnedToken {
  return {
    tokenId: overrides.tokenId ?? '0xnft',
    name: overrides.name ?? 'NFT Car',
    patchId: overrides.patchId ?? 'patch-1',
    collectionId: overrides.collectionId ?? BOUND_COLLECTION_ID,
    baseModelId: '0xbase',
    blobId: overrides.blobId ?? '',
  };
}

const defaultCarToken: OwnedToken = {
  tokenId: DEFAULT_CAR_TOKEN_ID,
  name: 'Starter Car',
  patchId: '',
  collectionId: '',
  baseModelId: '',
  blobId: '',
};

function renderGarage(props: Partial<Parameters<typeof GarageScreen>[0]> = {}) {
  const onDrive = vi.fn();
  render(
    <MemoryRouter>
      <GarageScreen
        defaultCarToken={defaultCarToken}
        nfts={props.nfts ?? []}
        hasWallet={props.hasWallet ?? false}
        loading={props.loading ?? false}
        collectionId={BOUND_COLLECTION_ID}
        onDrive={props.onDrive ?? onDrive}
      />
    </MemoryRouter>,
  );
  return { onDrive: props.onDrive ?? onDrive };
}

afterEach(() => cleanup());

describe('GarageScreen', () => {
  it('default card always renders a preview + Drive that picks the default car', () => {
    const { onDrive } = renderGarage();
    const preview = screen.getByTestId('preview-garage-default');
    expect(preview.getAttribute('data-glburl')).toBe('/dev-glbs/pickup-truck.glb');
    fireEvent.click(screen.getByTestId('garage-default-drive'));
    expect(onDrive).toHaveBeenCalledWith(defaultCarToken);
  });

  it('no wallet: NFT card is locked with a connect + buy-collection CTA, no NFT drive', () => {
    renderGarage({ hasWallet: false, nfts: [] });
    expect(screen.getByTestId('garage-connect')).toBeTruthy();
    const cta = screen.getByTestId('garage-buy-cta');
    expect(cta.getAttribute('href')).toBe(`/collection/${BOUND_COLLECTION_ID}`);
    expect(screen.queryByTestId('garage-nft-drive')).toBeNull();
  });

  it('connected non-owner: buy CTA shown, no connect button', () => {
    renderGarage({ hasWallet: true, nfts: [] });
    expect(screen.getByTestId('garage-buy-cta')).toBeTruthy();
    expect(screen.queryByTestId('garage-connect')).toBeNull();
    expect(screen.queryByTestId('garage-nft-drive')).toBeNull();
  });

  it('owner: lists owned NFTs, preview spins the highlighted one, Drive picks it', () => {
    const a = nft({ tokenId: '0xA', name: 'Red' });
    const b = nft({ tokenId: '0xB', name: 'Blue' });
    const { onDrive } = renderGarage({ hasWallet: true, nfts: [a, b] });
    // First NFT highlighted by default → preview shows its url, Drive picks it.
    expect(screen.getByTestId('garage-nft-option-0').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('preview-garage-nft')).toBeTruthy();
    // Highlight the second, then Drive → onDrive(b).
    fireEvent.click(screen.getByTestId('garage-nft-option-1'));
    expect(screen.getByTestId('garage-nft-option-1').getAttribute('data-selected')).toBe('true');
    fireEvent.click(screen.getByTestId('garage-nft-drive'));
    expect(onDrive).toHaveBeenCalledWith(b);
    expect(screen.queryByTestId('garage-buy-cta')).toBeNull();
  });

  it('loading: shows a loading note in the NFT card', () => {
    renderGarage({ hasWallet: true, loading: true });
    expect(screen.getByTestId('garage-nft-loading')).toBeTruthy();
    expect(screen.queryByTestId('garage-nft-drive')).toBeNull();
  });
});
