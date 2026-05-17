import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const useCurrentAccountMock = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => useCurrentAccountMock(),
  useSignAndExecuteTransaction: () => ({ mutateAsync: vi.fn() }),
}));

// Stub Babylon-backed preview so jsdom doesn't try to run WebGL.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-stub" data-glb-url={glbUrl ?? ''} />
  ),
}));

const useModelByIdMock = vi.fn();
const useOwnsAccessMock = vi.fn();
vi.mock('./hooks', () => ({
  useModelById: (id: string) => useModelByIdMock(id),
  useOwnsAccess: (addr: string | undefined, id: string) =>
    useOwnsAccessMock(addr, id),
}));

import { ModelDetailPage } from './ModelDetailPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/model/:objectId" element={<ModelDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SAMPLE_MODEL = {
  objectId: '0xMODEL',
  blobId: 'walrus_blob_demo',
  creator: '0xCAFECAFECAFECAFECAFECAFE',
  shapeType: 'chest',
  paramsJson: '{"shape":"chest"}',
  name: 'Demo Chest',
  directAccessPrice: '100000000',
  tags: ['fantasy', 'chest'],
  createdAtMs: '0',
  lineageBlobId: 'walrus_blob_lineage',
};

beforeEach(() => {
  useCurrentAccountMock.mockReset();
  useModelByIdMock.mockReset();
  useOwnsAccessMock.mockReset();

  useCurrentAccountMock.mockReturnValue(null);
  useOwnsAccessMock.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
});

describe('ModelDetailPage', () => {
  it('renders model details when loaded', () => {
    useModelByIdMock.mockReturnValue({
      model: SAMPLE_MODEL,
      loading: false,
      error: null,
    });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('model-name').textContent).toBe('Demo Chest');
    expect(screen.getByTestId('walrus-link').textContent).toMatch(
      /walrus_blob_demo/,
    );
    expect(screen.getByTestId('preview-canvas-wrap')).toBeTruthy();
  });

  it('shows "Sign in to buy" hint when no account', () => {
    useModelByIdMock.mockReturnValue({
      model: SAMPLE_MODEL,
      loading: false,
      error: null,
    });
    useCurrentAccountMock.mockReturnValue(null);
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('signin-hint')).toBeTruthy();
  });

  it('shows "You already own access" when ownsAccess is true', () => {
    useModelByIdMock.mockReturnValue({
      model: SAMPLE_MODEL,
      loading: false,
      error: null,
    });
    useCurrentAccountMock.mockReturnValue({ address: '0xBUYER' });
    useOwnsAccessMock.mockReturnValue(true);
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('buy-already-owned')).toBeTruthy();
  });

  it('renders loading state', () => {
    useModelByIdMock.mockReturnValue({
      model: null,
      loading: true,
      error: null,
    });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('detail-loading')).toBeTruthy();
  });

  it('renders error state when load fails', () => {
    useModelByIdMock.mockReturnValue({
      model: null,
      loading: false,
      error: new Error('boom'),
    });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('detail-error')).toBeTruthy();
  });
});
