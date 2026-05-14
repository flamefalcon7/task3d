import type {
  Generator,
  RouteInput,
  RouteResult,
  Router,
  ShapeId,
} from '@overflow2026/shared';
import {
  BoxGenerator,
  ChestGenerator,
  CylinderGenerator,
  SphereGenerator,
} from '../generators/index.js';

// Phase 1 stub. The Router interface is the seam Phase 2 swaps for an
// AnthropicRouter that takes natural language and emits generator + params via
// structured output (D-011). Callers must not depend on this class — only on
// the Router interface.
export class HardcodedRouter implements Router {
  private readonly generators: Map<ShapeId, Generator>;

  constructor() {
    this.generators = new Map<ShapeId, Generator>([
      ['box', new BoxGenerator()],
      ['chest', new ChestGenerator()],
      ['cylinder', new CylinderGenerator()],
      ['sphere', new SphereGenerator()],
    ]);
  }

  async route(input: RouteInput): Promise<RouteResult> {
    const generator = this.generators.get(input.shape);
    if (!generator) {
      throw new Error(`No generator for shape "${input.shape}"`);
    }
    return {
      generator,
      lineageStub: { generatorSource: 'procedural' },
    };
  }
}
