// MCP build_purchase_tx — unsigned, dry-run-validated purchase_access PTB
// (U5, R4/R6, KTD-7, D-104).
//
// The keyless half of the agent purchase arc: the server reads the model's
// `access_fee`, builds the `purchase_access` PTB via the SHARED builder
// (KTD-5 — same code the frontend signs against, so the two surfaces can't
// drift), sets the agent's address as sender, builds the final BCS bytes, and
// dry-runs them against the fullnode. Only a dry-run-validated PTB is ever
// returned (KTD-7; learnings — dry-run is the validator, never string-match
// serialized JSON). The agent signs and executes with its OWN keypair; the
// server never holds a key and never signs (R6, D-034: builder fixes amount +
// destination, the buyer only signs).
//
// Cheap Move-precondition mirrors (fail fast with the on-chain abort named in
// the detail, instead of a build + dry-run round-trip the chain would abort):
//   policy != ALLOW_LIST  → ENotPurchasable
//   sender == creator     → ECreatorCannotSelfPurchase (D-087 L-3)
// The duplicate-purchase guard (EAlreadyHasEntitlement) needs a dynamic-field
// read, so it is NOT mirrored — the dry run catches it.
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeSuiAddress, toBase64 } from '@mysten/sui/utils';
import type { Transaction } from '@mysten/sui/transactions';
import { buildPurchaseAccessPtb } from '@overflow2026/shared';
import { McpToolError, requireAgentSub } from '../auth.js';
import type { BuildMcpServerDeps, McpSuiClient } from '../server.js';
import { MODEL_ID_SHAPE, readModelSummary, resolveSuiDeps } from './getModel.js';
import { AUTH_HINT, guarded, toolResult, withTimeout } from './common.js';

// Move's LicenseTerms policy constant (POLICY_ALLOW_LIST = 1) — the only
// policy `purchase_access` accepts (abort ENotPurchasable otherwise).
const POLICY_ALLOW_LIST = 1;

const OUTPUT_SHAPE = {
  txBytes: z
    .string()
    .describe(
      'base64 BCS TransactionData — UNSIGNED. Sign with your own keypair ' +
        '(the sender below) and execute; the server never signs.',
    ),
  sender: z.string().describe('canonical address the PTB was built for'),
  metadata: z.object({
    target: z.string(),
    accessFeeMist: z.string().describe('u64 MIST as string — confirm budget before signing'),
    expectedEvents: z.array(z.string()),
  }),
};

/**
 * Default final-build step. `tx.build` resolves object refs, reference gas
 * price, and gas coins through the client's core surface — the live
 * `getSuiClient()` (a real `SuiJsonRpcClient`) provides all of it; the
 * structural `McpSuiClient` is narrower only so test fakes stay small, hence
 * the cast through the build param's own type.
 */
async function defaultBuildTxBytes(tx: Transaction, client: McpSuiClient): Promise<Uint8Array> {
  type BuildClient = NonNullable<Parameters<Transaction['build']>[0]>['client'];
  return tx.build({ client: client as unknown as BuildClient });
}

export function registerBuildPurchaseTx(server: McpServer, deps: BuildMcpServerDeps): void {
  server.registerTool(
    'build_purchase_tx',
    {
      title: 'Build purchase transaction',
      description:
        'Build an UNSIGNED purchase_access transaction for one Tusk3D model: pays the ' +
        'access_fee (read on-chain) to the creator and mints a soulbound AccessEntitlement ' +
        'to the sender. Returns dry-run-validated BCS bytes for YOU to sign and execute ' +
        `with your own keypair — the server holds no keys. ${AUTH_HINT}`,
      inputSchema: {
        modelId: MODEL_ID_SHAPE,
        agentAddress: z
          .string()
          .regex(/^0x[0-9a-fA-F]{1,64}$/)
          .optional()
          .describe('sender address; defaults to the authenticated JWT sub'),
      },
      outputSchema: OUTPUT_SHAPE,
    },
    guarded(async ({ modelId, agentAddress }, extra) => {
      const sub = await requireAgentSub(extra, { jwt: deps.jwt });
      const sender = agentAddress ? normalizeSuiAddress(agentAddress) : sub;

      // Resolve once and thread through (review M-009 — readModelSummary
      // would otherwise re-resolve the same deps).
      const resolved = await resolveSuiDeps(deps);
      const summary = await readModelSummary(deps, modelId, resolved);
      if (summary.policy !== POLICY_ALLOW_LIST) {
        throw new McpToolError(
          'not_purchasable',
          `model ${modelId} policy is ${summary.policy}, not ALLOW_LIST(1) — ` +
            'purchase_access aborts ENotPurchasable on-chain',
        );
      }
      if (normalizeSuiAddress(summary.creator) === sender) {
        throw new McpToolError(
          'not_purchasable',
          'sender is the model creator — purchase_access aborts ' +
            'ECreatorCannotSelfPurchase on-chain (D-087); creators decrypt via ' +
            'seal_approve_creator without an entitlement',
        );
      }

      const { client, packageId } = resolved;
      const { tx, metadata } = buildPurchaseAccessPtb(packageId, {
        modelId,
        accessFeeMist: BigInt(summary.accessFee),
      });
      tx.setSender(sender);

      let txBytes: string;
      try {
        const bytes = await withTimeout(
          (deps.buildTxBytes ?? defaultBuildTxBytes)(tx, client),
          'transaction build',
        );
        txBytes = toBase64(bytes);
      } catch (e) {
        if (e instanceof McpToolError) throw e;
        // Raw builder messages can carry internal endpoint detail — log them
        // server-side, return the actionable hint only (review SEC-3).
        console.warn('[mcp] build_purchase_tx build failed:', e);
        throw new McpToolError(
          'dry_run_failed',
          `transaction build failed — is ${sender} funded with SUI gas on this network? ` +
            '(gas-coin selection is the most common cause)',
        );
      }

      if (!client.dryRunTransactionBlock) {
        // Fail closed: an unvalidated PTB is never returned (KTD-7).
        throw new McpToolError('dry_run_failed', 'client cannot dry-run transactions');
      }
      let status: string | undefined;
      let dryRunError: string | undefined;
      try {
        const dryRun = await withTimeout(
          client.dryRunTransactionBlock({ transactionBlock: txBytes }),
          'dry run',
        );
        status = dryRun.effects?.status?.status;
        dryRunError = dryRun.effects?.status?.error;
      } catch (e) {
        if (e instanceof McpToolError) throw e;
        console.warn('[mcp] build_purchase_tx dry-run RPC failed:', e);
        throw new McpToolError('upstream_error', 'dry run RPC failed; retry shortly');
      }
      if (status !== 'success') {
        throw new McpToolError(
          'dry_run_failed',
          `dry run did not succeed (status=${status ?? 'unknown'}${
            dryRunError ? `, error=${dryRunError}` : ''
          }) — PTB not returned`,
        );
      }

      const result = {
        txBytes,
        sender,
        metadata: {
          target: metadata.target,
          accessFeeMist: summary.accessFee,
          expectedEvents: metadata.expectedEvents,
        },
      };
      return toolResult(result);
    }),
  );
}
