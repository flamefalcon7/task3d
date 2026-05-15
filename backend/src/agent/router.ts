import type Anthropic from '@anthropic-ai/sdk';
import type {
  Generator,
  GeneratorId,
  RouteInput,
  RouteResult,
  Router,
  RouterDecision,
  ShapeId,
} from '@overflow2026/shared';
import { RouterDecisionSchema } from '@overflow2026/shared';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  BoxGenerator,
  ChestGenerator,
  CylinderGenerator,
  HammerGenerator,
  PlatformGenerator,
  SphereGenerator,
  SwordGenerator,
} from '../generators/index.js';

export class RouterParseError extends Error {
  public readonly zodIssue?: unknown;
  constructor(message: string, zodIssue?: unknown) {
    super(message);
    this.name = 'RouterParseError';
    this.zodIssue = zodIssue;
  }
}

export class RouterFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouterFormatError';
  }
}

export class TripoDisabledError extends Error {
  constructor(message = 'tripo generator disabled — try a procedural shape (box, chest, cylinder, sphere, sword, hammer, platform)') {
    super(message);
    this.name = 'TripoDisabledError';
  }
}

// Phase 1 stub kept as the dev/no-key fallback (server.ts switches based on
// ANTHROPIC_API_KEY). Slider-mode callers go through this path directly.
export class HardcodedRouter implements Router {
  private readonly generators: Map<ShapeId, Generator>;

  constructor() {
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
    if (!input.shape) {
      throw new Error('HardcodedRouter requires { shape } — prompt-mode requires AnthropicRouter');
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

// JSON Schema derived once at module load; Anthropic tool-use requires
// input_schema in JSON Schema form, and we want zod (TS-friendly) to remain
// the authoring surface — hence zod-to-json-schema on a shared zod object.
const routerDecisionJsonSchema = zodToJsonSchema(RouterDecisionSchema, { target: 'openApi3' });

const SYSTEM_PROMPT =
  'You route user prompts to a 3D model generator. Pick ONE generator from {box, chest, cylinder, sphere, sword, hammer, platform, tripo} and emit params that fit its schema. Use procedural generators when the prompt fits a basic primitive or weapon/platform/chest. Use `tripo` ONLY for shapes that no procedural generator can produce (e.g. organic creatures, ornate sculptures). Always extract 1-5 short tags describing aesthetic / category.';

export class AnthropicRouter implements Router {
  constructor(
    private readonly client: Anthropic,
    private readonly generators: Map<GeneratorId, Generator>,
    private readonly tripoEnabled: boolean,
  ) {}

  async route(input: RouteInput): Promise<RouteResult> {
    // Backward compat: slider-mode callers pass { shape, params } directly.
    if (!input.prompt) {
      if (!input.shape) {
        throw new Error('AnthropicRouter requires either { prompt } or { shape, params }');
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

    const prompt = input.prompt.slice(0, 1000);

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'route',
          description: 'Choose a generator and emit params + tags for the user prompt.',
          input_schema: routerDecisionJsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'route' },
      messages: [{ role: 'user', content: prompt }],
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    if (!toolUse || toolUse.name !== 'route' || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new RouterFormatError('Anthropic response missing route tool_use block');
    }

    const parsed = RouterDecisionSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new RouterParseError('Router decision failed zod validation', parsed.error.issues);
    }
    const decision: RouterDecision = parsed.data;

    if (decision.generator === 'tripo' && !this.tripoEnabled) {
      throw new TripoDisabledError();
    }

    const generator = this.generators.get(decision.generator);
    if (!generator) {
      throw new RouterParseError(`No generator registered for "${decision.generator}"`);
    }

    const generatorSource = decision.generator === 'tripo' ? 'tripo' : 'procedural';

    return {
      generator,
      lineageStub: {
        generatorSource,
        prompt,
        llmDecision: decision,
        params: decision.params,
        shape: decision.generator,
      },
    };
  }
}
