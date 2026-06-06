import { describe, expect, it } from 'vitest';
import { RAGE_RACING } from './brand';
import { tokens } from '../../ux/tokens';

// The whole point of the reskin is that Rage Racing reads as a DIFFERENT team's
// product. These guards fail loudly if the brand ever drifts back toward
// Tusk3D's identity (palette/typeface collision = "same team" to a viewer).
describe('Rage Racing brand', () => {
  it('does not reuse Tusk3D accent (#FF4500)', () => {
    expect(RAGE_RACING.color.accent.toLowerCase()).not.toBe(
      tokens.color.accent.toLowerCase(),
    );
  });

  it('uses a display face distinct from Tusk3D', () => {
    expect(RAGE_RACING.font.display).not.toBe(tokens.font.display);
  });

  it('surface is not Tusk3D paper/well white', () => {
    expect(RAGE_RACING.color.surface).not.toBe(tokens.color.paper);
    expect(RAGE_RACING.color.surface).not.toBe(tokens.color.paperPure);
  });

  it('exposes the studio + game identity strings', () => {
    expect(RAGE_RACING.game).toBe('RAGE RACING');
    expect(RAGE_RACING.studioCredit).toContain('Deksat');
  });
});
