// Upload Captioning client (plan 2026-06-03-001 U1, D-082).
//
// A fail-soft façade over Google Gemini (via the Vercel AI SDK, `ai` +
// `@ai-sdk/google`) for vision captioning: it turns a few turntable snapshots of
// an uploaded GLB into one short low-poly description. The API key is SERVER-SIDE
// ONLY (D-081/D-082) — this module is never imported by the frontend.
//
// Mirrors `copilot-client.ts` exactly (INERT-without-key, `withTimeout`,
// `*DegradedError`, injectable `generate` seam) but for a single-shot, image→text
// call instead of a conversational turn. Per R6 the model is fed IMAGES ONLY — no
// filename, mesh, or material text is ever sent (a wrong/non-semantic name
// misleads vision more than it helps).
//
// Contract: `caption` throws `CaptionDegradedError` on ANY failure (no key, model
// error, timeout, empty output, no frames). The route (U2) maps that to a clean
// degraded response so /create upload mode keeps working with no caption.
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

/** One captured preview frame: base64-encoded WebP bytes + its media type. */
export type CaptionFrame = { base64: string; mediaType: 'image/webp' };

export interface CaptionInput {
  /** Turntable snapshots of the uploaded model (1–N). Images only — no text hint (R6). */
  frames: CaptionFrame[];
}

/** Thrown on any caption failure; the route maps it to a clean degraded response. */
export class CaptionDegradedError extends Error {
  constructor(message = 'caption unavailable') {
    super(message);
    this.name = 'CaptionDegradedError';
  }
}

export interface CaptionClient {
  /** Whether a real Gemini key is wired (false → inert; caption() always degrades). */
  readonly configured: boolean;
  caption(input: CaptionInput): Promise<string>;
}

/** A user-message content part (text or image) — the AI SDK v6 multimodal shape. */
export type CaptionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mediaType: string };

/** The generate seam — lets tests inject a fake model without a network call. */
export interface CaptionGenerateArgs {
  system: string;
  /** The single user message's content parts (one text instruction + one image per frame). */
  content: CaptionContentPart[];
}
export type CaptionGenerateFn = (args: CaptionGenerateArgs) => Promise<string>;

export interface CaptionEnv {
  apiKey?: string;
  model?: string;
}
export interface CaptionDeps {
  generate?: CaptionGenerateFn;
  /** Model call timeout budget (ms). Default 15000 (LLM latency). */
  timeoutMs?: number;
}

/** Caption length ceiling — mirrors the Tripo prompt input (1–1000 chars). */
export const CAPTION_MAX_CHARS = 1000;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 15000;

const SYSTEM = [
  'You are the upload captioner for Tusk3D, a tool for low-poly 3D game assets.',
  'You are shown several turntable views of ONE 3D model.',
  `Describe that single object as ONE concise low-poly / game-asset prompt (max ${CAPTION_MAX_CHARS} characters),`,
  'suitable as a text-to-3D generation prompt. Output the prompt text only:',
  'no preamble, no questions, no quotes, no bullet points, no view-by-view breakdown.',
].join(' ');

const INSTRUCTION = 'Describe the single 3D model shown across these turntable views as one concise low-poly game-asset prompt.';

const loggedOnce = new Set<string>();
function logOnce(msg: string): void {
  if (loggedOnce.has(msg)) return;
  loggedOnce.add(msg);
  console.warn(`[caption] ${msg}`);
}
function logError(op: string, e: unknown): void {
  console.warn(`[caption] ${op} failed (degraded):`, e instanceof Error ? e.message : e);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function clamp(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

/** Build the single multimodal user message: one instruction + one image per frame (R6: no other text). */
function buildContent(frames: CaptionFrame[]): CaptionContentPart[] {
  return [
    { type: 'text', text: INSTRUCTION },
    ...frames.map((f) => ({ type: 'image' as const, image: f.base64, mediaType: f.mediaType })),
  ];
}

const INERT: CaptionClient = {
  configured: false,
  async caption() {
    throw new CaptionDegradedError('caption not configured');
  },
};

/** Pure factory — builds a caption client from explicit env (tests + the singleton). */
export function buildCaptionClient(env: CaptionEnv, deps: CaptionDeps = {}): CaptionClient {
  if (!env.apiKey) {
    logOnce('not configured (GOOGLE_GENERATIVE_AI_API_KEY unset) — upload captioning inert');
    return INERT;
  }

  const model = env.model ?? DEFAULT_MODEL;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const generate: CaptionGenerateFn =
    deps.generate ??
    (async ({ system, content }) => {
      const google = createGoogleGenerativeAI({ apiKey: env.apiKey });
      const { text } = await generateText({ model: google(model), system, messages: [{ role: 'user', content }] });
      return text;
    });

  return {
    configured: true,
    async caption(input) {
      if (!input.frames || input.frames.length === 0) throw new CaptionDegradedError('no frames');
      const content = buildContent(input.frames);
      let raw: string;
      try {
        raw = await withTimeout(generate({ system: SYSTEM, content }), timeoutMs);
      } catch (e) {
        logError('caption', e);
        throw new CaptionDegradedError();
      }
      const text = (raw ?? '').trim();
      if (!text) throw new CaptionDegradedError('empty model output');
      return clamp(text, CAPTION_MAX_CHARS);
    },
  };
}

let cached: CaptionClient | null = null;

/** Lazily-constructed shared client from process.env (mirrors getCopilotClient). */
export function getCaptionClient(): CaptionClient {
  if (!cached) {
    cached = buildCaptionClient({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: process.env.CAPTION_MODEL,
    });
  }
  return cached;
}

/** Test-only: reset the memoized singleton. */
export function resetCaptionClientForTest(): void {
  cached = null;
}
