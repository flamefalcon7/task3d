import { describe, it, expect, vi } from 'vitest';
import {
  buildCopilotClient,
  CopilotDegradedError,
  MAX_TURNS,
  PROMPT_MAX_CHARS,
  type GenerateFn,
  type CopilotMessage,
} from './copilot-client.js';
import { buildQuotaStore } from './quota-store.js';
import type { GeminiGenerateResult } from './gemini-quota.js';

const KEY = 'test-gemini-key';
const msgs = (n: number): CopilotMessage[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` }));

/** The widened generate seam returns { text, headers?, usage? } (U2). */
const ok = (text: string): GeminiGenerateResult => ({ text });

describe('copilot-client', () => {
  it('question mode: early turn with no force asks a question', async () => {
    const generate: GenerateFn = vi.fn(async () => ok('What color should it be?'));
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    const r = await client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 });
    expect(r.kind).toBe('question');
    expect(r.text).toBe('What color should it be?');
  });

  it('forces synthesis at the turn cap even with sparse messages (AE2)', async () => {
    const generate: GenerateFn = vi.fn(async () => ok('low-poly red sports car, smooth shading'));
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    const r = await client.turn({ messages: msgs(1), memoryContext: [], turnIndex: MAX_TURNS - 1 });
    expect(r.kind).toBe('prompt');
    expect(r.text).toContain('sports car');
  });

  it('forceSynthesize short-circuits to a prompt at turn 0 (AE1)', async () => {
    const generate: GenerateFn = vi.fn(async () => ok('low-poly spaceship'));
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    const r = await client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0, forceSynthesize: true });
    expect(r.kind).toBe('prompt');
  });

  it('synthesis ends the conversation with a user "output the prompt" instruction (Generate-now after a question)', async () => {
    let captured: CopilotMessage[] = [];
    const generate: GenerateFn = vi.fn(async ({ messages }) => {
      captured = messages;
      return ok('low-poly biplane, game asset');
    });
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    const r = await client.turn({
      messages: [
        { role: 'user', content: 'a plane' },
        { role: 'assistant', content: 'single or twin engine?' }, // trailing assistant
      ],
      memoryContext: [],
      turnIndex: 1,
      forceSynthesize: true,
    });
    expect(r.kind).toBe('prompt');
    // Gemini needs a user-terminated conversation; the last turn must be a user
    // turn that explicitly asks for the final prompt.
    const last = captured.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content).toMatch(/final text-to-3D prompt/i);
  });

  it('does NOT append a synthesis instruction in question mode', async () => {
    let captured: CopilotMessage[] = [];
    const generate: GenerateFn = vi.fn(async ({ messages }) => {
      captured = messages;
      return ok('What color?');
    });
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    await client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.content).not.toMatch(/final text-to-3D prompt/i);
  });

  it('folds recalled memory into the system prompt (R6)', async () => {
    let capturedSystem = '';
    const generate: GenerateFn = vi.fn(async ({ system }) => {
      capturedSystem = system;
      return ok('Q?');
    });
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    await client.turn({
      messages: msgs(1),
      memoryContext: ['low-poly red sports car', 'off-road truck'],
      turnIndex: 0,
    });
    expect(capturedSystem).toContain('low-poly red sports car');
    expect(capturedSystem).toContain('off-road truck');
  });

  it('does not fabricate history when memory is empty (R7)', async () => {
    let capturedSystem = '';
    const generate: GenerateFn = vi.fn(async ({ system }) => {
      capturedSystem = system;
      return ok('Q?');
    });
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    await client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 });
    expect(capturedSystem.toLowerCase()).toContain('no recalled history');
  });

  it('throws a typed degraded error when the model rejects', async () => {
    const generate: GenerateFn = vi.fn(async () => {
      throw new Error('gemini 500');
    });
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    await expect(client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 })).rejects.toBeInstanceOf(
      CopilotDegradedError,
    );
  });

  it('throws a typed degraded error on timeout', async () => {
    const generate: GenerateFn = vi.fn(() => new Promise<GeminiGenerateResult>(() => {})); // never resolves
    const client = buildCopilotClient({ apiKey: KEY }, { generate, timeoutMs: 20 });
    await expect(client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 })).rejects.toBeInstanceOf(
      CopilotDegradedError,
    );
  });

  it('is inert without an API key — never calls the model', async () => {
    const generate: GenerateFn = vi.fn(async () => ok('should not be called'));
    const client = buildCopilotClient({}, { generate });
    expect(client.configured).toBe(false);
    await expect(client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 })).rejects.toBeInstanceOf(
      CopilotDegradedError,
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('clamps an over-long synthesized prompt to the Tripo limit (R3)', async () => {
    const huge = 'x'.repeat(PROMPT_MAX_CHARS + 500);
    const generate: GenerateFn = vi.fn(async () => ok(huge));
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    const r = await client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0, forceSynthesize: true });
    expect(r.kind).toBe('prompt');
    expect(r.text.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
  });

  it('throws degraded on empty model output', async () => {
    const generate: GenerateFn = vi.fn(async () => ok('   '));
    const client = buildCopilotClient({ apiKey: KEY }, { generate });
    await expect(client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 })).rejects.toBeInstanceOf(
      CopilotDegradedError,
    );
  });

  // --- U2: quota recording inside the generate closure ---

  it('records a self-count on success when a store is injected (no headers required)', async () => {
    const store = buildQuotaStore({ path: ':memory:' });
    const generate: GenerateFn = vi.fn(async () => ok('low-poly tree'));
    const client = buildCopilotClient({ apiKey: KEY }, { generate, store });
    await client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 });
    expect(store.getGeminiState('copilot', { now: Date.now() }).dailyCount).toBe(1);
    store.close();
  });

  it('records a 429 cooldown then still throws degraded (slow-429 capture)', async () => {
    const store = buildQuotaStore({ path: ':memory:' });
    const rateLimit = Object.assign(new Error('429 Too Many Requests'), {
      name: 'APICallError',
      statusCode: 429,
      responseHeaders: { 'retry-after': '120' },
    });
    const generate: GenerateFn = vi.fn(async () => {
      throw rateLimit;
    });
    const client = buildCopilotClient({ apiKey: KEY }, { generate, store });
    await expect(client.turn({ messages: msgs(1), memoryContext: [], turnIndex: 0 })).rejects.toBeInstanceOf(
      CopilotDegradedError,
    );
    // The 429 was recorded as a cooldown even though the call surfaced as degraded.
    expect(store.getGeminiState('copilot', { now: Date.now() }).cooldownUntil).not.toBeNull();
    store.close();
  });
});
