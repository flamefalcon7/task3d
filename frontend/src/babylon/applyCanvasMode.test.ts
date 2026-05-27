import { describe, expect, it, vi } from 'vitest';

// Mock Color3 BEFORE importing applyCanvasMode so the static `import { Color3 }`
// resolves to our stub instead of the real WebGL-laden module. Vitest hoists
// vi.mock() calls automatically.
vi.mock('@babylonjs/core', () => {
  class Color3 {
    constructor(public r: number, public g: number, public b: number) {}
    clone(): Color3 {
      return new Color3(this.r, this.g, this.b);
    }
    copyFrom(c: { r: number; g: number; b: number }): Color3 {
      this.r = c.r;
      this.g = c.g;
      this.b = c.b;
      return this;
    }
  }
  return { Color3 };
});

import { applyCanvasMode } from './applyCanvasMode';
import { partsColor } from './modePalette';

// Fake mesh-with-material factory matching the shape applyCanvasMode reads.
function makeMesh(
  material: {
    alpha?: number;
    wireframe?: boolean;
    albedoColor?: { r: number; g: number; b: number };
    diffuseColor?: { r: number; g: number; b: number };
  } | null = {},
) {
  const wrap = material
    ? {
        alpha: material.alpha ?? 1,
        wireframe: material.wireframe ?? false,
        albedoColor: material.albedoColor
          ? { ...material.albedoColor, clone() { return { ...this, clone: this.clone, copyFrom: this.copyFrom }; }, copyFrom(c: any) { this.r = c.r; this.g = c.g; this.b = c.b; return this; } }
          : null,
        diffuseColor: material.diffuseColor
          ? { ...material.diffuseColor, clone() { return { ...this, clone: this.clone, copyFrom: this.copyFrom }; }, copyFrom(c: any) { this.r = c.r; this.g = c.g; this.b = c.b; return this; } }
          : null,
      }
    : null;
  return { material: wrap } as any;
}

describe('applyCanvasMode', () => {
  it('PBR mode is a no-op on a fresh mesh (baseline)', () => {
    const mesh = makeMesh({ alpha: 1, wireframe: false, albedoColor: { r: 0.8, g: 0.2, b: 0.2 } });
    applyCanvasMode([mesh], 'pbr');
    expect(mesh.material.alpha).toBe(1);
    expect(mesh.material.wireframe).toBe(false);
    expect(mesh.material.albedoColor.r).toBeCloseTo(0.8);
  });

  it('PARTS mode tints each mesh albedoColor from partsColor(index)', () => {
    const meshes = [
      makeMesh({ albedoColor: { r: 1, g: 1, b: 1 } }),
      makeMesh({ albedoColor: { r: 1, g: 1, b: 1 } }),
      makeMesh({ albedoColor: { r: 1, g: 1, b: 1 } }),
    ];
    applyCanvasMode(meshes, 'parts');
    for (let i = 0; i < 3; i++) {
      const [r, g, b] = partsColor(i);
      expect(meshes[i].material.albedoColor.r).toBeCloseTo(r);
      expect(meshes[i].material.albedoColor.g).toBeCloseTo(g);
      expect(meshes[i].material.albedoColor.b).toBeCloseTo(b);
    }
  });

  it('PARTS mode falls back to diffuseColor when the material has no albedoColor', () => {
    const mesh = makeMesh({ diffuseColor: { r: 1, g: 1, b: 1 } });
    applyCanvasMode([mesh], 'parts');
    const [r, g, b] = partsColor(0);
    expect(mesh.material.diffuseColor.r).toBeCloseTo(r);
    expect(mesh.material.diffuseColor.g).toBeCloseTo(g);
    expect(mesh.material.diffuseColor.b).toBeCloseTo(b);
  });

  it('SOLO mode dims non-highlighted meshes to alpha 0.2; highlighted untouched', () => {
    const meshes = [
      makeMesh({ alpha: 1, albedoColor: { r: 0.5, g: 0.5, b: 0.5 } }),
      makeMesh({ alpha: 1, albedoColor: { r: 0.5, g: 0.5, b: 0.5 } }),
      makeMesh({ alpha: 1, albedoColor: { r: 0.5, g: 0.5, b: 0.5 } }),
    ];
    applyCanvasMode(meshes, 'solo', [1]);
    expect(meshes[0].material.alpha).toBeCloseTo(0.2);
    expect(meshes[1].material.alpha).toBeCloseTo(1); // highlighted, untouched
    expect(meshes[2].material.alpha).toBeCloseTo(0.2);
  });

  it('SOLO with empty highlightedParts dims ALL meshes', () => {
    const meshes = [
      makeMesh({ alpha: 1, albedoColor: { r: 0.5, g: 0.5, b: 0.5 } }),
      makeMesh({ alpha: 1, albedoColor: { r: 0.5, g: 0.5, b: 0.5 } }),
    ];
    applyCanvasMode(meshes, 'solo', []);
    expect(meshes[0].material.alpha).toBeCloseTo(0.2);
    expect(meshes[1].material.alpha).toBeCloseTo(0.2);
  });

  it('WIREFRAME mode sets material.wireframe=true on every mesh', () => {
    const meshes = [
      makeMesh({ wireframe: false, albedoColor: { r: 1, g: 1, b: 1 } }),
      makeMesh({ wireframe: false, albedoColor: { r: 1, g: 1, b: 1 } }),
    ];
    applyCanvasMode(meshes, 'wireframe');
    expect(meshes[0].material.wireframe).toBe(true);
    expect(meshes[1].material.wireframe).toBe(true);
  });

  it('PARTS → PBR restores original albedoColor (snapshot/restore round-trip)', () => {
    const mesh = makeMesh({ albedoColor: { r: 0.8, g: 0.2, b: 0.1 } });
    applyCanvasMode([mesh], 'parts');
    // After PARTS, color was overwritten with partsColor(0) (a saturated red).
    applyCanvasMode([mesh], 'pbr');
    // After PBR, color is back to the original baseline.
    expect(mesh.material.albedoColor.r).toBeCloseTo(0.8);
    expect(mesh.material.albedoColor.g).toBeCloseTo(0.2);
    expect(mesh.material.albedoColor.b).toBeCloseTo(0.1);
  });

  it('WIREFRAME → PBR restores original wireframe state', () => {
    const mesh = makeMesh({ wireframe: false, albedoColor: { r: 0.5, g: 0.5, b: 0.5 } });
    applyCanvasMode([mesh], 'wireframe');
    expect(mesh.material.wireframe).toBe(true);
    applyCanvasMode([mesh], 'pbr');
    expect(mesh.material.wireframe).toBe(false);
  });

  it('SOLO → PARTS restores baseline alpha before applying PARTS tint', () => {
    const meshes = [
      makeMesh({ alpha: 1, albedoColor: { r: 1, g: 1, b: 1 } }),
      makeMesh({ alpha: 1, albedoColor: { r: 1, g: 1, b: 1 } }),
    ];
    applyCanvasMode(meshes, 'solo', [0]);
    expect(meshes[1].material.alpha).toBeCloseTo(0.2);
    applyCanvasMode(meshes, 'parts');
    expect(meshes[0].material.alpha).toBeCloseTo(1);
    expect(meshes[1].material.alpha).toBeCloseTo(1);
    const [r, g, b] = partsColor(1);
    expect(meshes[1].material.albedoColor.r).toBeCloseTo(r);
    expect(meshes[1].material.albedoColor.g).toBeCloseTo(g);
    expect(meshes[1].material.albedoColor.b).toBeCloseTo(b);
  });

  it('handles meshes with material=null without throwing', () => {
    const mesh = makeMesh(null);
    expect(() => applyCanvasMode([mesh], 'parts')).not.toThrow();
    expect(() => applyCanvasMode([mesh], 'solo', [0])).not.toThrow();
    expect(() => applyCanvasMode([mesh], 'wireframe')).not.toThrow();
    expect(() => applyCanvasMode([mesh], 'pbr')).not.toThrow();
  });

  it('handles an empty mesh list', () => {
    expect(() => applyCanvasMode([], 'parts')).not.toThrow();
    expect(() => applyCanvasMode([], 'solo', [0, 1])).not.toThrow();
  });

  // -- plan-015 U7 — partColors live-recolor overlay -----------------------

  it('partColors apply user-defined hex per mesh in PBR mode', () => {
    const meshes = [
      makeMesh({ albedoColor: { r: 1, g: 1, b: 1 } }),
      makeMesh({ albedoColor: { r: 1, g: 1, b: 1 } }),
    ];
    applyCanvasMode(meshes, 'pbr', [], ['#ff0000', '#00ff00']);
    expect(meshes[0].material.albedoColor.r).toBeCloseTo(1);
    expect(meshes[0].material.albedoColor.g).toBeCloseTo(0);
    expect(meshes[0].material.albedoColor.b).toBeCloseTo(0);
    expect(meshes[1].material.albedoColor.r).toBeCloseTo(0);
    expect(meshes[1].material.albedoColor.g).toBeCloseTo(1);
    expect(meshes[1].material.albedoColor.b).toBeCloseTo(0);
  });

  it('partColors persist across mode transitions PBR → SOLO → WIREFRAME → PBR', () => {
    const meshes = [
      makeMesh({ alpha: 1, albedoColor: { r: 1, g: 1, b: 1 } }),
      makeMesh({ alpha: 1, albedoColor: { r: 1, g: 1, b: 1 } }),
    ];
    const partColors = ['#0000ff', '#ffff00'];
    applyCanvasMode(meshes, 'pbr', [], partColors);
    expect(meshes[0].material.albedoColor.b).toBeCloseTo(1);
    applyCanvasMode(meshes, 'solo', [0], partColors);
    // Mesh 0 highlighted (alpha untouched), partColors still applied.
    expect(meshes[0].material.albedoColor.b).toBeCloseTo(1);
    expect(meshes[0].material.alpha).toBeCloseTo(1);
    expect(meshes[1].material.alpha).toBeCloseTo(0.2);
    expect(meshes[1].material.albedoColor.r).toBeCloseTo(1); // yellow
    expect(meshes[1].material.albedoColor.g).toBeCloseTo(1);
    applyCanvasMode(meshes, 'wireframe', [], partColors);
    expect(meshes[0].material.wireframe).toBe(true);
    expect(meshes[0].material.albedoColor.b).toBeCloseTo(1);
    applyCanvasMode(meshes, 'pbr', [], partColors);
    // Back to PBR — partColors still applied; wireframe + alpha cleared.
    expect(meshes[0].material.wireframe).toBe(false);
    expect(meshes[0].material.alpha).toBeCloseTo(1);
    expect(meshes[1].material.alpha).toBeCloseTo(1);
    expect(meshes[0].material.albedoColor.b).toBeCloseTo(1);
  });

  it('PARTS mode overrides partColors with the diagnostic rainbow', () => {
    const meshes = [
      makeMesh({ albedoColor: { r: 1, g: 1, b: 1 } }),
      makeMesh({ albedoColor: { r: 1, g: 1, b: 1 } }),
    ];
    applyCanvasMode(meshes, 'parts', [], ['#ff00ff', '#ff00ff']);
    const [r0, g0, b0] = partsColor(0);
    expect(meshes[0].material.albedoColor.r).toBeCloseTo(r0);
    expect(meshes[0].material.albedoColor.g).toBeCloseTo(g0);
    expect(meshes[0].material.albedoColor.b).toBeCloseTo(b0);
  });

  it('partColors → undefined restores the original baseline', () => {
    const mesh = makeMesh({ albedoColor: { r: 0.8, g: 0.2, b: 0.1 } });
    applyCanvasMode([mesh], 'pbr', [], ['#000000']);
    // Mesh painted black via partColors.
    expect(mesh.material.albedoColor.r).toBeCloseTo(0);
    // Drop partColors — restore should bring back the original orange.
    applyCanvasMode([mesh], 'pbr');
    expect(mesh.material.albedoColor.r).toBeCloseTo(0.8);
    expect(mesh.material.albedoColor.g).toBeCloseTo(0.2);
    expect(mesh.material.albedoColor.b).toBeCloseTo(0.1);
  });

  it('partColors with missing entries (sparse array) leaves the snapshot baseline in place', () => {
    const meshes = [
      makeMesh({ albedoColor: { r: 0.5, g: 0.5, b: 0.5 } }),
      makeMesh({ albedoColor: { r: 0.5, g: 0.5, b: 0.5 } }),
    ];
    // Only index 0 has a color; index 1 should stay at the snapshot baseline.
    applyCanvasMode(meshes, 'pbr', [], ['#ff0000']);
    expect(meshes[0].material.albedoColor.r).toBeCloseTo(1);
    expect(meshes[1].material.albedoColor.r).toBeCloseTo(0.5);
  });

  it('partColors with a malformed hex string skips that mesh without throwing', () => {
    const meshes = [
      makeMesh({ albedoColor: { r: 0.4, g: 0.4, b: 0.4 } }),
      makeMesh({ albedoColor: { r: 0.4, g: 0.4, b: 0.4 } }),
    ];
    expect(() =>
      applyCanvasMode(meshes, 'pbr', [], ['not-a-color', '#00ff00']),
    ).not.toThrow();
    expect(meshes[0].material.albedoColor.r).toBeCloseTo(0.4);
    expect(meshes[1].material.albedoColor.g).toBeCloseTo(1);
  });

  // plan-015 F13 — snapshot immutability. The baseline is captured ONCE on
  // first encounter; subsequent applyCanvasMode calls must restore from
  // that frozen snapshot even if the mesh material has been mutated
  // out-of-band in between calls. A bug where the snapshot is re-captured
  // on every call would let foreign mutations leak in as the new baseline.
  it('snapshot is captured once and never re-captured between mode transitions', () => {
    const original = { r: 0.8, g: 0.2, b: 0.1 };
    const mesh = makeMesh({ albedoColor: { ...original } });
    // 1. First call — snapshot is captured here, then PARTS tint applied.
    applyCanvasMode([mesh], 'parts');
    // 2. Mutate the material out-of-band with a sentinel blue. If the
    //    snapshot were re-captured on the next call, this blue would
    //    become the "new baseline".
    mesh.material.albedoColor.copyFrom({ r: 0, g: 0, b: 1 });
    expect(mesh.material.albedoColor.b).toBeCloseTo(1);
    // 3. Switch to PBR — restore step must pull from the ORIGINAL
    //    snapshot, not the sentinel blue we wrote in step 2.
    applyCanvasMode([mesh], 'pbr');
    expect(mesh.material.albedoColor.r).toBeCloseTo(original.r);
    expect(mesh.material.albedoColor.g).toBeCloseTo(original.g);
    expect(mesh.material.albedoColor.b).toBeCloseTo(original.b);
  });
});
