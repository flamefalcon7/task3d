// Shared model-description resolver (plan 2026-06-08-001 U1).
//
// One resolver, every display surface (detail page, market card, /launch
// picker, 3D previews). It maps a published model to the text we show users
// and the KIND of that text, so an AI caption is never presented as a human
// prompt:
//   - Tripo models carry the human creation prompt in params_json.prompt.
//   - Captioned uploads carry an AI caption in params_json.caption (D-082).
//   - Uncaptioned uploads carry neither → null (surfaces render NOTHING, R6 —
//     no placeholder text).
//
// Pure + synchronous: it reads the already-loaded Model3DSummary.paramsJson,
// never a new fetch, so it adds no race surface. Co-located test +
// re-exported from index.ts, mirroring memory.ts.
import type { Model3DSummary } from './types.js';

export type ModelDescriptionKind = 'prompt' | 'caption';

export interface ModelDescription {
  text: string;
  kind: ModelDescriptionKind;
}

/**
 * Resolve a model's display description + kind, or null when it has none.
 *
 * Discriminates on the PARSED params_json fields, never on shapeType: a Tripo
 * model always has a non-empty `prompt`; an upload has `caption` only when it
 * was captioned. `prompt` wins if (anomalously) both are present.
 *
 * Returns null on: missing/empty/whitespace prompt AND caption, malformed JSON,
 * or a non-object params_json — every "no description" path collapses to null.
 */
/**
 * Display label for a description kind. NOTE: a 'caption' is NOT necessarily
 * AI-authored — the upload DESCRIPTION field is user-editable (hand-typed or
 * AI-drafted), so it reads as a neutral "Description", never "AI description".
 * A Tripo 'prompt' is the human generation prompt, labeled "Prompt".
 */
export function modelDescriptionLabel(kind: ModelDescriptionKind): string {
  return kind === 'prompt' ? 'Prompt' : 'Description';
}

export function modelDescription(summary: Model3DSummary): ModelDescription | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(summary.paramsJson || '{}');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  if (prompt) return { text: prompt, kind: 'prompt' };

  const caption = typeof obj.caption === 'string' ? obj.caption.trim() : '';
  if (caption) return { text: caption, kind: 'caption' };

  return null;
}
