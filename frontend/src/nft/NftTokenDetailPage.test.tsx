import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { OwnedToken } from '../track/useOwnedTokens';

const useTokenByIdMock = vi.fn();
vi.mock('../track/useOwnedTokens', () => ({
  useTokenById: (id: string | undefined) => useTokenByIdMock(id),
}));

const useModelIndexMock = vi.fn();
vi.mock('../browse/useModelIndex', () => ({ useModelIndex: () => useModelIndexMock() }));

// Babylon needs WebGL — jsdom doesn't have it. Stub PreviewCanvas, capturing
// the resolved glb url so we can assert it's the token's own variant patch.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string }) => (
    <div data-testid="preview-canvas" data-glb={glbUrl} />
  ),
}));

import { NftTokenDetailPage } from './NftTokenDetailPage';

const TOK = '0xtok';

function token(overrides: Partial<OwnedToken> = {}): OwnedToken {
  return {
    tokenId: TOK,
    name: 'Racer A',
    patchId: 'pTok',
    collectionId: '0xcoll',
    baseModelId: '0xbase',
    blobId: '',
    ...overrides,
  };
}

function renderAt(tokenId: string) {
  return render(
    <MemoryRouter initialEntries={[`/nft/${tokenId}`]}>
      <Routes>
        <Route path="/nft/:tokenId" element={<NftTokenDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTokenByIdMock.mockReset();
  useModelIndexMock.mockReset();
  useModelIndexMock.mockReturnValue({ models: [{ objectId: '0xbase', name: 'Roadster' }], loading: false });
});

afterEach(() => cleanup());

describe('NftTokenDetailPage', () => {
  it('renders the token name, its own variant preview, and a View-collection link', () => {
    useTokenByIdMock.mockReturnValue({ token: token(), loading: false, error: null });
    renderAt(TOK);
    expect(screen.getByTestId('nft-name').textContent).toMatch(/Racer A/);
    // Preview uses the token's OWN quilt patch (its variant model), not the base model.
    expect(screen.getByTestId('preview-canvas').getAttribute('data-glb')).toMatch(/pTok/);
    expect((screen.getByTestId('nft-collection') as HTMLAnchorElement).getAttribute('href')).toBe('/collection/0xcoll');
    // No "drive on the track" — not every NFT is a drivable car.
    expect(screen.queryByTestId('nft-drive')).toBeNull();
  });

  it('resolves the token by id (self-sufficient on direct load)', () => {
    useTokenByIdMock.mockReturnValue({ token: token(), loading: false, error: null });
    renderAt(TOK);
    expect(useTokenByIdMock).toHaveBeenCalledWith(TOK);
  });

  it('copies the token id to the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    useTokenByIdMock.mockReturnValue({ token: token(), loading: false, error: null });
    renderAt(TOK);
    fireEvent.click(screen.getByTestId('copy-token-id'));
    expect(writeText).toHaveBeenCalledWith(TOK);
  });

  it('shows loading then not-found states', () => {
    useTokenByIdMock.mockReturnValue({ token: null, loading: true, error: null });
    const { rerender } = renderAt(TOK);
    expect(screen.getByTestId('nft-loading')).toBeTruthy();

    useTokenByIdMock.mockReturnValue({ token: null, loading: false, error: new Error('Token 0xtok not found') });
    rerender(
      <MemoryRouter initialEntries={[`/nft/${TOK}`]}>
        <Routes>
          <Route path="/nft/:tokenId" element={<NftTokenDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('nft-empty')).toBeTruthy();
    expect((screen.getByText('Back to Market') as HTMLAnchorElement).getAttribute('href')).toBe('/market');
  });
});
