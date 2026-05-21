import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';

// Stub Babylon-backed preview so jsdom doesn't try to run WebGL.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-stub" data-glb-url={glbUrl ?? ''} />
  ),
}));

const useModelByIdMock = vi.fn();
vi.mock('./hooks', () => ({
  useModelById: (id: string) => useModelByIdMock(id),
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

function makeModel(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xMODEL',
    blobId: '',
    collectionId: '',
    patchId: '',
    creator: '0xCAFECAFECAFECAFECAFECAFE',
    shapeType: 'tripo',
    paramsJson: '{"shape":"tripo"}',
    name: 'Demo Chest',
    directAccessPrice: '0',
    tags: ['fantasy', 'chest'],
    createdAtMs: '0',
    lineageBlobId: 'walrus_blob_lineage',
    glbBlobId: 'glb_demo',
    derivativeMintFee: '250000000', // 0.25 SUI
    derivativeRoyaltyBps: 500,
    ...overrides,
  };
}

beforeEach(() => {
  useModelByIdMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('ModelDetailPage', () => {
  it('renders L1 content details + fork terms when loaded', () => {
    useModelByIdMock.mockReturnValue({ model: makeModel(), loading: false, error: null });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('model-name').textContent).toBe('Demo Chest');
    expect(screen.getByTestId('walrus-link').textContent).toMatch(/glb_demo/);
    expect(screen.getByTestId('preview-canvas-wrap')).toBeTruthy();
    const terms = screen.getByTestId('fork-terms');
    expect(terms.textContent).toMatch(/0\.25 SUI/);
    expect(terms.textContent).toMatch(/5\.00%/);
  });

  it('routes to /launch via the fork CTA for a forkable model', () => {
    useModelByIdMock.mockReturnValue({ model: makeModel(), loading: false, error: null });
    renderAt('/model/0xMODEL');
    expect((screen.getByTestId('fork-cta') as HTMLAnchorElement).getAttribute('href')).toBe('/launch');
  });

  it('shows a not-forkable note when the model has no standalone GLB', () => {
    useModelByIdMock.mockReturnValue({ model: makeModel({ glbBlobId: '' }), loading: false, error: null });
    renderAt('/model/0xMODEL');
    expect(screen.queryByTestId('fork-cta')).toBeNull();
    expect(screen.getByTestId('not-forkable')).toBeTruthy();
  });

  it('renders loading state', () => {
    useModelByIdMock.mockReturnValue({ model: null, loading: true, error: null });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('detail-loading')).toBeTruthy();
  });

  it('renders error state when load fails', () => {
    useModelByIdMock.mockReturnValue({ model: null, loading: false, error: new Error('boom') });
    renderAt('/model/0xMODEL');
    expect(screen.getByTestId('detail-error')).toBeTruthy();
  });
});
