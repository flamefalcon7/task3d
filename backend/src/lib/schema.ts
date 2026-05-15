import { z } from 'zod';
import { proceduralParamsSchemas } from '@overflow2026/shared';

// /api/generate slider path validates against the 7 procedural shape schemas
// only — the tripo variant in shared GenerateParamsSchema is RouterDecision
// output, never a direct request input (DL-010). Composing the 7-shape
// subset here keeps the request gate strict while letting the schema authoring
// stay single-sourced in shared/src/types.ts.
export const generateParamsSchema = z.discriminatedUnion('shape', [
  ...proceduralParamsSchemas,
]);

export type ValidatedGenerateParams = z.infer<typeof generateParamsSchema>;

// Phase 2: /api/generate accepts either { prompt } (LLM mode) or the flat
// params shape (slider/backward-compat mode). The route handler branches on
// which variant validated.
export const promptRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
});

export type ValidatedPromptRequest = z.infer<typeof promptRequestSchema>;

export const generateResponseSchema = z.object({
  glbBytes: z.string(),
  lineageJson: z.string(),
  lineageStub: z.unknown(),
});

export type ValidatedGenerateResponse = z.infer<typeof generateResponseSchema>;

// U4 — auth payloads.
// Sui addresses are 0x + 64 hex chars; loose-validate the shape but defer
// canonical-form checks to the verifier (publicKey-derived address compare).
const suiAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/, 'invalid Sui address');

export const challengeRequestSchema = z.object({
  address: suiAddressSchema,
});

export type ValidatedChallengeRequest = z.infer<typeof challengeRequestSchema>;

export const verifyRequestSchema = z.object({
  address: suiAddressSchema,
  nonce: z.string().min(1),
  // signature is the flag-byte-prefixed signature returned by wallet
  // `signPersonalMessage`, base64-encoded. verifyPersonalMessageSignature
  // reads the flag byte to dispatch the scheme.
  signature: z.string().min(1),
});

export type ValidatedVerifyRequest = z.infer<typeof verifyRequestSchema>;
