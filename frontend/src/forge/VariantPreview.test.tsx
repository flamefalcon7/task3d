import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VariantPreview } from './VariantPreview';
import type { VariantRow } from './variantState';

// Babylon preview is WebGL — stub it so jsdom can render and we can assert which
// surface (canvas vs encrypted still vs loading placeholder) is shown.
vi.mock('../babylon/PreviewCanvas', () => ({
  PreviewCanvas: ({ glbUrl }: { glbUrl: string | null }) => (
    <div data-testid="preview-canvas-stub" data-glb-url={glbUrl ?? ''} />
  ),
}));

const variants = [{ palette: { primary: '#ff0000' } }] as unknown as VariantRow[];

afterEach(cleanup);

describe('VariantPreview — encrypted base (plan-026)', () => {
  it('with no base GLB but an encrypted preview still → shows the still, NOT the LOADING spinner or canvas', () => {
    render(
      <VariantPreview
        variants={variants}
        selectedIndex={0}
        onSelect={() => {}}
        baseGlbUrl={null}
        encryptedPreviewUrl="https://agg/v1/blobs/by-quilt-patch-id/preview-1"
      />,
    );
    expect(screen.getByTestId('variant-preview-encrypted-still')).toBeTruthy();
    expect(screen.queryByTestId('variant-preview-placeholder')).toBeNull(); // no fake "LOADING BASE MESH…"
    expect(screen.queryByTestId('preview-canvas-stub')).toBeNull(); // never the ciphertext in Babylon
  });

  it('with no base GLB and no encrypted preview → the defensive LOADING placeholder', () => {
    render(<VariantPreview variants={variants} selectedIndex={0} onSelect={() => {}} baseGlbUrl={null} />);
    expect(screen.getByTestId('variant-preview-placeholder')).toBeTruthy();
    expect(screen.queryByTestId('variant-preview-encrypted-still')).toBeNull();
  });

  it('with a base GLB → renders the 3D canvas (public base, unchanged)', () => {
    render(
      <VariantPreview
        variants={variants}
        selectedIndex={0}
        onSelect={() => {}}
        baseGlbUrl="blob:public-base"
        encryptedPreviewUrl={null}
      />,
    );
    expect(screen.getByTestId('preview-canvas-stub')).toBeTruthy();
    expect(screen.queryByTestId('variant-preview-encrypted-still')).toBeNull();
  });
});
