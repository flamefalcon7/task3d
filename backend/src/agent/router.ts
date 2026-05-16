import type {
  Generator,
  GeneratorId,
  RouteInput,
  RouteResult,
  Router,
  ShapeId,
} from '@overflow2026/shared';
import {
  BoxGenerator,
  ChestGenerator,
  CylinderGenerator,
  HammerGenerator,
  PlatformGenerator,
  SphereGenerator,
  SwordGenerator,
} from '../generators/index.js';

// Thrown when prompt-mode is invoked but Tripo isn't configured. Surfaces a
// helpful message listing the procedural shapes that are still available.
export class TripoDisabledError extends Error {
  constructor(
    message = 'tripo generator disabled — set TRIPO_ENABLED=true + TRIPO_API_KEY, or use slider mode with one of: box, chest, cylinder, sphere, sword, hammer, platform',
  ) {
    super(message);
    this.name = 'TripoDisabledError';
  }
}

// Deterministic tag derivation for prompt-mode requests. Replaces the LLM
// tag extraction that D-023 dropped — lineage records still carry useful
// descriptive metadata without an Anthropic call. Strategy: split on
// non-word chars, lowercase, drop tokens < 3 chars (noise), drop dupes,
// cap at 5 (matches RouterDecisionSchema's old tags array max).
function deriveTagsFromPrompt(prompt: string): string[] {
  const tokens = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 5) break;
  }
  return out;
}

// Only concrete Router implementation in v1 (D-023 removed AnthropicRouter).
// Slider mode: caller passes { shape, params } — dispatch to matching
// procedural generator. Prompt mode: caller passes { prompt } — dispatch
// to Tripo if registered, else throw TripoDisabledError.
export class HardcodedRouter implements Router {
  private readonly generators: Map<GeneratorId, Generator>;

  // Procedural-only constructor (back-compat). server.ts uses the explicit
  // constructor when Tripo is registered.
  constructor(generators?: Map<GeneratorId, Generator>) {
    if (generators) {
      this.generators = generators;
      return;
    }
    this.generators = new Map<ShapeId, Generator>([
      ['box', new BoxGenerator()],
      ['chest', new ChestGenerator()],
      ['cylinder', new CylinderGenerator()],
      ['sphere', new SphereGenerator()],
      ['sword', new SwordGenerator()],
      ['hammer', new HammerGenerator()],
      ['platform', new PlatformGenerator()],
    ]);
  }

  async route(input: RouteInput): Promise<RouteResult> {
    // Prompt mode: D-023 deterministic Tripo passthrough.
    if (input.prompt) {
      const prompt = input.prompt.slice(0, 1000);
      const tripo = this.generators.get('tripo');
      if (!tripo) throw new TripoDisabledError();
      const tags = deriveTagsFromPrompt(prompt);
      const tripoParams = { shape: 'tripo' as const, prompt };
      return {
        generator: tripo,
        lineageStub: {
          generatorSource: 'tripo',
          prompt,
          shape: 'tripo',
          params: tripoParams,
          // Stash derived tags on the lineage record so downstream consumers
          // (Walrus lineage JSON, future indexer) keep getting tags.
          llmDecision: { generator: 'tripo', params: tripoParams, tags },
        },
      };
    }

    // Slider mode unchanged.
    if (!input.shape) {
      throw new Error('HardcodedRouter requires { prompt } or { shape, params }');
    }
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
