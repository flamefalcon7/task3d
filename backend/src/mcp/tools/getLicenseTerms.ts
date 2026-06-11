// MCP get_license_terms — the machine-readable license projection (U4, R3, D-104).
//
// The license gap is the pitch: agents can't reason over human-language
// licenses, but they CAN reason over five structured fields. This tool returns
// EXACTLY the license projection of a Model3D — nothing else — so an agent can
// budget-check (`accessFee` in MIST, as a string per the D-015 bigint-across-
// JSON discipline) and policy-check before calling build_purchase_tx.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requireAgentSub } from '../auth.js';
import type { BuildMcpServerDeps } from '../server.js';
import { MODEL_ID_SHAPE, readModelSummary } from './getModel.js';
import { AUTH_HINT, guarded, toolResult } from './common.js';

const outputSchema = {
  // Fee fields carry a digit-only pattern (review AC-006): u64 MIST exceeds
  // Number.MAX_SAFE_INTEGER — agents must parse these with BigInt, never float.
  accessFee: z
    .string()
    .regex(/^\d+$/)
    .describe('One-time AccessEntitlement fee in MIST (u64 as DIGIT STRING — parse with BigInt, not float; 1 SUI = 1e9 MIST)'),
  derivativeMintFee: z
    .string()
    .regex(/^\d+$/)
    .describe('Per-launch derive fee in MIST (u64 as digit string — parse with BigInt)'),
  derivativeRoyaltyBps: z.number().describe('Creator royalty on derivatives, basis points (≤ 3000)'),
  policy: z.number().describe('0 RESTRICTED · 1 ALLOW_LIST · 2 PERMISSIONLESS'),
  isEncrypted: z.boolean().describe('true → content is Seal-encrypted; decryption gated on the entitlement'),
};

export function registerGetLicenseTerms(server: McpServer, deps: BuildMcpServerDeps): void {
  server.registerTool(
    'get_license_terms',
    {
      title: 'Get license terms',
      description:
        'Structured LicenseTerms of one Model3D: access fee (MIST), derivative mint fee, royalty bps, ' +
        'policy, encryption flag. Use this to reason over price/policy before purchasing. ' +
        `${AUTH_HINT}`,
      inputSchema: { modelId: MODEL_ID_SHAPE },
      outputSchema,
    },
    guarded(async ({ modelId }, extra) => {
      await requireAgentSub(extra, { jwt: deps.jwt });
      const summary = await readModelSummary(deps, modelId);
      // Exactly the five projection fields — no summary spread, so a future
      // Model3DSummary field can't leak into this contract by accident.
      const structured = {
        accessFee: summary.accessFee,
        derivativeMintFee: summary.derivativeMintFee,
        derivativeRoyaltyBps: summary.derivativeRoyaltyBps,
        policy: summary.policy,
        isEncrypted: summary.isEncrypted,
      };
      return toolResult(structured);
    }),
  );
}
