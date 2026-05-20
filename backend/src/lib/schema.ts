import { z } from 'zod';

// D-033: procedural slider mode removed. /api/generate accepts only { prompt }
// (D-023: dispatched directly to Tripo by HardcodedRouter).
export const promptRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  // D-034: SUI service-fee payment proof. Optional in the schema so legacy
  // callers/tests still validate; the route ENFORCES it (402) when a
  // paymentVerifier is wired (server.ts). base58 tx digest.
  paymentDigest: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,50}$/, 'paymentDigest must be a base58 tx digest')
    .optional(),
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
