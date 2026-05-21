import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { UsedBySection } from './UsedBySection';

const PERMISSIONLESS = 2;
const RESTRICTED = 0;

function integrationsResponse(integrations: unknown[]): Response {
  return { ok: true, json: async () => ({ integrations }) } as unknown as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('UsedBySection', () => {
  it('shows the restricted state and does NOT fetch when policy is not permissionless', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<UsedBySection collectionId="0xc" integrationPolicy={RESTRICTED} />);
    expect(screen.getByTestId('usedby-restricted')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the empty state when the collection has no integrations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(integrationsResponse([])));
    render(<UsedBySection collectionId="0xc" integrationPolicy={PERMISSIONLESS} />);
    await waitFor(() => expect(screen.getByTestId('usedby-empty')).toBeTruthy());
  });

  it('lists integrations with a clickable https link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        integrationsResponse([
          { name: 'Cool Game', url: 'https://cool.example', integrator: '0xabc', registered_at_ms: 1 },
        ]),
      ),
    );
    render(<UsedBySection collectionId="0xc" integrationPolicy={PERMISSIONLESS} />);
    await waitFor(() => expect(screen.getByTestId('usedby-list')).toBeTruthy());
    expect(screen.getByTestId('usedby-name-0').textContent).toBe('Cool Game');
    const link = screen.getByTestId('usedby-url-0') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://cool.example');
  });

  it('AE4: a name containing markup renders as inert text, never an element', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        integrationsResponse([
          {
            name: '<img src=x onerror=alert(1)>',
            url: 'https://safe.example',
            integrator: '0xabc',
            registered_at_ms: 1,
          },
        ]),
      ),
    );
    render(<UsedBySection collectionId="0xc" integrationPolicy={PERMISSIONLESS} />);
    await waitFor(() => expect(screen.getByTestId('usedby-name-0')).toBeTruthy());
    const nameCell = screen.getByTestId('usedby-name-0');
    // The markup is text content, not a real <img> node.
    expect(nameCell.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(within(nameCell).queryByRole('img')).toBeNull();
    expect(nameCell.querySelector('img')).toBeNull();
  });

  it('AE4: a non-https url is rendered as plain text, never a clickable link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        integrationsResponse([
          { name: 'Sketchy', url: 'javascript:alert(1)', integrator: '0xabc', registered_at_ms: 1 },
        ]),
      ),
    );
    render(<UsedBySection collectionId="0xc" integrationPolicy={PERMISSIONLESS} />);
    await waitFor(() => expect(screen.getByTestId('usedby-url-0')).toBeTruthy());
    const cell = screen.getByTestId('usedby-url-0');
    expect(cell.tagName).toBe('SPAN'); // not an <a>
    expect(cell.querySelector('a')).toBeNull();
  });

  it('surfaces an API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));
    render(<UsedBySection collectionId="0xc" integrationPolicy={PERMISSIONLESS} />);
    await waitFor(() => expect(screen.getByTestId('usedby-error')).toBeTruthy());
    expect(screen.getByTestId('usedby-error').textContent).toMatch(/500/);
  });
});
