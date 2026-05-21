// plan-008 U13 — translate a Move abort from `register_integration` into human
// copy. Sui execution errors embed the abort code as `MoveAbort(<loc>, <code>)`;
// we extract the trailing integer and map the model3d.move register_integration
// abort constants (EIntegrationsClosed=30 .. EAppMetadataTooLong=33) to guidance
// a gameDev can act on — never a raw code (AE3).

export interface AbortInfo {
  code: number | null;
  message: string;
}

// model3d.move register_integration abort constants.
export const ABORT_INTEGRATIONS_CLOSED = 30;
export const ABORT_FEE_TOO_LOW = 31;
export const ABORT_ALREADY_REGISTERED = 32;
export const ABORT_APP_METADATA_TOO_LONG = 33;

const MESSAGES: Record<number, string> = {
  [ABORT_INTEGRATIONS_CLOSED]: 'This collection is not accepting integrations.',
  [ABORT_FEE_TOO_LOW]:
    'The collection’s register fee changed — your payment is now too low. Refresh and try again.',
  [ABORT_ALREADY_REGISTERED]:
    'You have already registered an integration for this collection.',
  [ABORT_APP_METADATA_TOO_LONG]:
    'Integration details are too large (max 512 bytes on chain). Shorten the name or URL.',
};

export function parseRegisterAbort(err: unknown): AbortInfo {
  const raw = err instanceof Error ? err.message : String(err);
  // Sui abort errors look like `MoveAbort(MoveLocation { … }, <code>) …`. The
  // location can itself contain `)` (e.g. `Identifier("model3d")`), so anchor on
  // the `}` that closes MoveLocation and take the integer right after it.
  const match = raw.match(/MoveAbort\([\s\S]*\},\s*(\d+)\)/);
  const code = match ? Number(match[1]) : null;
  if (code !== null && MESSAGES[code]) {
    return { code, message: MESSAGES[code] };
  }
  // Unknown / non-abort failure (wallet rejection, RPC error): pass through the
  // raw message so nothing is swallowed.
  return { code, message: raw };
}
