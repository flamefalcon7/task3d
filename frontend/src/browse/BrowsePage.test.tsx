import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Model3DSummary } from '@overflow2026/shared';
import { BrowsePage } from './BrowsePage';
import * as hookMod from './useModelIndex';

function mockHook(result: Partial<hookMod.UseModelIndexResult>): void {
  vi.spyOn(hookMod, 'useModelIndex').mockImplementation((opts) => {
    const all = result.models ?? [];
    const filtered = opts?.tagFilter ? all.filter((m) => m.tags.includes(opts.tagFilter!)) : all;
    return {
      models: filtered,
      loading: result.loading ?? false,
      error: result.error ?? null,
      refetch: result.refetch ?? (() => {}),
    };
  });
}

function makeModel(overrides: Partial<Model3DSummary> = {}): Model3DSummary {
  return {
    objectId: '0xaaa',
    blobId: 'blob-1',
    collectionId: '0xcoll-1',
    patchId: '',
    creator: '0x1234567890abcdef',
    shapeType: 'box',
    paramsJson: '{"shape":"box"}',
    name: 'Demo Box',
    directAccessPrice: '100000000',
    tags: ['weapon'],
    createdAtMs: '1700000000000',
    lineageBlobId: 'lin-1',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BrowsePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('BrowsePage', () => {
  it('renders empty state when no models', () => {
    mockHook({ models: [] });
    renderPage();
    expect(screen.getByTestId('empty-state')).toBeTruthy();
  });

  it('renders loading state', () => {
    mockHook({ models: [], loading: true });
    renderPage();
    expect(screen.getByTestId('loading-state')).toBeTruthy();
  });

  it('renders error state with retry', () => {
    mockHook({ models: [], error: new Error('boom') });
    renderPage();
    const alert = screen.getByTestId('error-state');
    expect(alert.textContent).toContain('boom');
    expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);
  });

  it('renders a grid of cards from the hook', () => {
    mockHook({
      models: [
        makeModel({ objectId: '0xa' }),
        makeModel({ objectId: '0xb', shapeType: 'sword' }),
        makeModel({ objectId: '0xc', shapeType: 'sphere', tags: ['armor'] }),
      ],
    });
    renderPage();
    expect(screen.getByTestId('model-grid')).toBeTruthy();
    expect(screen.getByTestId('model-card-0xa')).toBeTruthy();
    expect(screen.getByTestId('model-card-0xb')).toBeTruthy();
    expect(screen.getByTestId('model-card-0xc')).toBeTruthy();
  });

  it('tag filter narrows visible models', () => {
    mockHook({
      models: [
        makeModel({ objectId: '0xa', tags: ['weapon'] }),
        makeModel({ objectId: '0xb', tags: ['armor'] }),
        makeModel({ objectId: '0xc', tags: ['weapon', 'metal'] }),
      ],
    });
    renderPage();
    fireEvent.change(screen.getByTestId('tag-filter'), { target: { value: 'armor' } });
    expect(screen.queryByTestId('model-card-0xa')).toBeNull();
    expect(screen.getByTestId('model-card-0xb')).toBeTruthy();
    expect(screen.queryByTestId('model-card-0xc')).toBeNull();
  });

  it('calls refetch when the refresh button is clicked', () => {
    const refetch = vi.fn();
    mockHook({ models: [makeModel()], refetch });
    renderPage();
    fireEvent.click(screen.getByTestId('refresh-button'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
