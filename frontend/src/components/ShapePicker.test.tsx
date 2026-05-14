import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ShapeCatalog } from '@overflow2026/shared';
import { ShapePicker } from './ShapePicker';

const FAKE_CATALOG: ShapeCatalog = [
  {
    id: 'box',
    label: 'Box',
    fields: [
      { name: 'width', label: 'Width', min: 0.1, max: 5, step: 0.1, default: 1 },
      { name: 'height', label: 'Height', min: 0.1, max: 5, step: 0.1, default: 1 },
    ],
  },
  {
    id: 'chest',
    label: 'Chest',
    fields: [
      { name: 'width', label: 'Width', min: 0.2, max: 4, step: 0.1, default: 1.4 },
      { name: 'lidOpenRadians', label: 'Lid open', min: 0, max: Math.PI, step: 0.05, default: 0.6 },
    ],
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => FAKE_CATALOG,
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ShapePicker', () => {
  it('fetches /api/shapes and renders the catalog dropdown', async () => {
    render(<ShapePicker onParamsChange={() => {}} />);
    expect(await screen.findByText('Box')).toBeTruthy();
    expect(screen.getByText('Chest')).toBeTruthy();
  });

  it('switching to chest reveals the chest-only lid slider', async () => {
    render(<ShapePicker onParamsChange={() => {}} />);
    await screen.findByText('Box');
    expect(screen.queryByTestId('slider-lidOpenRadians')).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'chest' } });
    expect(screen.getByTestId('slider-lidOpenRadians')).toBeTruthy();
  });

  it('slider change calls onParamsChange with new value', async () => {
    const onChange = vi.fn();
    render(<ShapePicker onParamsChange={onChange} />);
    await screen.findByText('Box');
    onChange.mockClear();
    fireEvent.change(screen.getByTestId('slider-width'), { target: { value: '2.5' } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const last = onChange.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ shape: 'box', width: 2.5 });
  });

  it('shows error state when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(<ShapePicker onParamsChange={() => {}} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
