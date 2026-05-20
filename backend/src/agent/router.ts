import type { Generator, RouteInput, RouteResult, Router } from '@overflow2026/shared';

// Thrown when prompt-mode is invoked but Tripo isn't configured.
export class TripoDisabledError extends Error {
  constructor(
    message = 'tripo generator disabled — set TRIPO_ENABLED=true + TRIPO_API_KEY',
  ) {
    super(message);
    this.name = 'TripoDisabledError';
  }
}

// Deterministic tag derivation for prompt-mode requests (D-023 dropped the LLM
// tag extraction). Split on non-word chars, lowercase, drop tokens < 3 chars,
// dedup, cap at 5.
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

// Sole Router impl. D-033 removed procedural slider mode — the only content
// source the backend generates is Tripo prompt-mode. The Tripo generator is
// injected when configured (server.ts); absent it, prompt requests throw
// TripoDisabledError (surfaced as 400 by /api/generate).
export class HardcodedRouter implements Router {
  constructor(private readonly tripo?: Generator) {}

  async route(input: RouteInput): Promise<RouteResult> {
    if (!input.prompt) {
      throw new Error('HardcodedRouter requires { prompt }');
    }
    if (!this.tripo) throw new TripoDisabledError();

    const prompt = input.prompt.slice(0, 1000);
    const tags = deriveTagsFromPrompt(prompt);
    const tripoParams = { shape: 'tripo' as const, prompt };
    return {
      generator: this.tripo,
      lineageStub: {
        generatorSource: 'tripo',
        prompt,
        shape: 'tripo',
        params: tripoParams,
        llmDecision: { generator: 'tripo', params: tripoParams, tags },
      },
    };
  }
}
