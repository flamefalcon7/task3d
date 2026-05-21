import { describe, expect, it } from 'vitest';
import {
  parseRegisterAbort,
  ABORT_INTEGRATIONS_CLOSED,
  ABORT_FEE_TOO_LOW,
  ABORT_ALREADY_REGISTERED,
  ABORT_APP_METADATA_TOO_LONG,
} from './abortMessages';

function moveAbortError(code: number): Error {
  return new Error(
    `MoveAbort(MoveLocation { module: ModuleId { address: 0x57e2.., name: Identifier("model3d") }, function: 12, instruction: 3, function_name: Some("register_integration") }, ${code}) in command 0`,
  );
}

describe('parseRegisterAbort', () => {
  it('maps the closed-integration abort to friendly copy (AE3)', () => {
    const info = parseRegisterAbort(moveAbortError(ABORT_INTEGRATIONS_CLOSED));
    expect(info.code).toBe(ABORT_INTEGRATIONS_CLOSED);
    expect(info.message).toMatch(/not accepting integrations/i);
  });

  it('maps fee-too-low, already-registered, metadata-too-long', () => {
    expect(parseRegisterAbort(moveAbortError(ABORT_FEE_TOO_LOW)).message).toMatch(/too low/i);
    expect(parseRegisterAbort(moveAbortError(ABORT_ALREADY_REGISTERED)).message).toMatch(
      /already registered/i,
    );
    expect(parseRegisterAbort(moveAbortError(ABORT_APP_METADATA_TOO_LONG)).message).toMatch(
      /too large/i,
    );
  });

  it('never shows the raw code for a mapped abort', () => {
    const info = parseRegisterAbort(moveAbortError(ABORT_FEE_TOO_LOW));
    expect(info.message).not.toMatch(/MoveAbort/);
    expect(info.message).not.toMatch(/\b31\b/);
  });

  it('passes through a wallet-rejection / non-abort error unchanged', () => {
    const info = parseRegisterAbort(new Error('User rejected the request'));
    expect(info.code).toBeNull();
    expect(info.message).toMatch(/User rejected/);
  });

  it('handles an unmapped abort code by surfacing the raw message', () => {
    const info = parseRegisterAbort(moveAbortError(999));
    expect(info.code).toBe(999);
    expect(info.message).toMatch(/MoveAbort/);
  });
});
