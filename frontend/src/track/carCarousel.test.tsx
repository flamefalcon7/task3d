import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CarCarousel } from './carCarousel';
import { RAGE_RACING } from './rageRacing/brand';
import { tokens as tuskTokens } from '../ux/tokens';
import type { OwnedToken } from './useOwnedTokens';

function car(overrides: Partial<OwnedToken> = {}): OwnedToken {
  return {
    tokenId: overrides.tokenId ?? '0xcar',
    name: overrides.name ?? 'My Car',
    patchId: overrides.patchId ?? 'patch',
    collectionId: overrides.collectionId ?? '0xcoll',
    baseModelId: overrides.baseModelId ?? '0xbase',
    blobId: overrides.blobId ?? 'blob',
  };
}

afterEach(() => cleanup());

// jsdom serializes inline colors to rgb(); compute the brand/Tusk3D accents in
// both hex and rgb so the assertion is robust to either serialization.
const BRAND_RGB = 'rgb(255, 229, 0)'; // #FFE500
const TUSK_RGB = 'rgb(255, 69, 0)'; // #FF4500 — must NOT appear

describe('CarCarousel (Rage Racing reskin)', () => {
  it('R5 — selected tile uses the Rage Racing accent, not Tusk3D orangered', () => {
    render(
      <CarCarousel
        tokens={[car({ tokenId: '0xa' }), car({ tokenId: '0xb' })]}
        selectedIdx={0}
        onSelect={() => undefined}
      />,
    );
    const style = screen.getByTestId('carousel-tile-0').getAttribute('style') ?? '';
    const matchesBrand =
      style.includes(BRAND_RGB) ||
      style.toLowerCase().includes(RAGE_RACING.color.accent.toLowerCase());
    expect(matchesBrand).toBe(true);
    expect(style.includes(TUSK_RGB)).toBe(false);
    expect(style.toLowerCase()).not.toContain(tuskTokens.color.accent.toLowerCase());
  });

  it('R5 — frames the selected car in the consuming-game voice (in garage)', () => {
    render(
      <CarCarousel tokens={[car()]} selectedIdx={0} onSelect={() => undefined} />,
    );
    expect(screen.getByText(/in garage/i)).toBeTruthy();
  });

  it('still fires onSelect and exposes data-selected (behavior preserved)', () => {
    const onSelect = vi.fn();
    render(
      <CarCarousel
        tokens={[car({ tokenId: '0xa' }), car({ tokenId: '0xb' })]}
        selectedIdx={0}
        onSelect={onSelect}
      />,
    );
    const tile1 = screen.getByTestId('carousel-tile-1');
    expect(tile1.getAttribute('data-selected')).toBe('false');
    fireEvent.click(tile1);
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
