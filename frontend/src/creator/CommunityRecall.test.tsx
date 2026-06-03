import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommunityRecall } from './CommunityRecall';
import type { MemoryChip } from './useCreatorMemory';

function renderCR(items: MemoryChip[]) {
  render(
    <MemoryRouter>
      <CommunityRecall items={items} />
    </MemoryRouter>,
  );
}

const ITEM: MemoryChip = {
  prompt: 'a sleek sci-fi hover bike',
  modelId: '0xbike',
  distance: 0.3,
  creator: '0x1234567890abcdef1234567890abcdef12345678',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CommunityRecall', () => {
  it('renders nothing when empty', () => {
    const { container } = render(
      <MemoryRouter>
        <CommunityRecall items={[]} />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });

  it('renders community items as new-tab links to the model page', () => {
    renderCR([ITEM]);
    const link = screen.getByTestId('community-item') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/model/0xbike');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows a truncated creator byline', () => {
    renderCR([ITEM]);
    expect(screen.getByText('0x1234…5678')).toBeTruthy();
  });

  it('an item with no resolvable modelId renders without a broken link', () => {
    renderCR([{ prompt: 'orphan', modelId: null, distance: 0.5, creator: '0xabc' }]);
    const el = screen.getByTestId('community-item');
    expect(el.tagName).not.toBe('A');
  });

  it('caps at 3 items', () => {
    const many: MemoryChip[] = Array.from({ length: 6 }, (_, i) => ({
      prompt: `p${i}`,
      modelId: `0x${i}`,
      distance: 0.5,
      creator: '0xc',
    }));
    renderCR(many);
    expect(screen.getAllByTestId('community-item')).toHaveLength(3);
  });

  it('status=loading with no items shows the "searching the community" affordance', () => {
    render(
      <MemoryRouter>
        <CommunityRecall items={[]} status="loading" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('community-loading')).toBeTruthy();
    expect(screen.queryByTestId('community-item')).toBeNull();
  });

  it('status=ready shows the Walrus provenance line', () => {
    render(
      <MemoryRouter>
        <CommunityRecall items={[ITEM]} status="ready" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/from the community on Walrus/i)).toBeTruthy();
  });

  it('status=empty renders nothing', () => {
    const { container } = render(
      <MemoryRouter>
        <CommunityRecall items={[]} status="empty" />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });

  it('on a narrow viewport, collapses behind a disclosure until opened', () => {
    const mq = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mq));
    renderCR([ITEM]);
    // collapsed: disclosure shown, no items yet
    const toggle = screen.getByTestId('community-disclosure');
    expect(screen.queryByTestId('community-item')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId('community-item')).toBeTruthy();
  });
});
