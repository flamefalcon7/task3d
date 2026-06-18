import { describe, expect, it } from 'vitest';
import {
  RAGE_RACING,
  BOUND_COLLECTION_ID,
  DEFAULT_CAR_TOKEN_ID,
  DEFAULT_CAR_NAME,
} from './brand';
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

describe('Rage Racing game config', () => {
  it('binds to a well-formed 0x collection id', () => {
    expect(BOUND_COLLECTION_ID).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('exposes a stable default-car id that is not a real object id', () => {
    expect(DEFAULT_CAR_TOKEN_ID).toBe('default-car');
    expect(DEFAULT_CAR_TOKEN_ID).not.toMatch(/^0x/);
    expect(DEFAULT_CAR_NAME.length).toBeGreaterThan(0);
  });
});
