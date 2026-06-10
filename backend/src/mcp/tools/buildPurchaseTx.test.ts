// build_purchase_tx tests (U5, R4/R6, KTD-7, D-104) — transport-level via
// buildMcpRoute (testUtils idiom), with the `buildTxBytes` seam capturing the
// Transaction the tool built so sender/commands are asserted structurally
// (learnings — never validate a PTB by string-matching serialized JSON).
import { describe, it, expect, beforeEach } from 'vitest';
import type { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import type { BuildMcpServerDeps, McpSuiClient } from '../server.js';
import { resetMcpRateLimitForTest } from '../auth.js';
import { AGENT_SUB, callTool, errorText, stubJwt } from './testUtils.js';

const PKG = `0x${'9'.repeat(64)}`;
const MODEL_ID = `0x${'7'.repeat(64)}`;
const CREATOR = `0x${'c'.repeat(64)}`;
const FEE = '2000000';
const FAKE_BYTES = new Uint8Array([1, 2, 3, 4]);

function modelObject(overrides: { policy?: number; creator?: string } = {}) {
  return {
    data: {
      content: {
        dataType: 'moveObject',
        type: `${PKG}::model3d::Model3D`,
        fields: {
          creator: overrides.creator ?? CREATOR,
          name: 'Fox',
          glb_blob_id: 'cipherBlobBBB',
          license: {
            type: `${PKG}::model3d::LicenseTerms`,
            fields: {
              derivative_mint_fee: '7000000',
              access_fee: FEE,
              derivative_royalty_bps: 500,
              policy: overrides.policy ?? 1,
            },
          },
          is_encrypted: true,
          preview_blob_ids: ['previewBlob1'],
        },
      },
    },
  };
}

interface Captured {
  tx?: Transaction;
  dryRunArg?: string;
  dryRunCalls: number;
  buildCalls: number;
}

function harness(
  overrides: {
    policy?: number;
    creator?: string;
    dryRunStatus?: string;
    dryRunError?: string;
    object?: unknown;
    buildThrows?: string;
  } = {},
): { deps: BuildMcpServerDeps; captured: Captured } {
  const captured: Captured = { dryRunCalls: 0, buildCalls: 0 };
  const suiClient: McpSuiClient = {
    async getObject() {
      return overrides.object !== undefined ? overrides.object : modelObject(overrides);
    },
    async dryRunTransactionBlock({ transactionBlock }) {
      captured.dryRunCalls += 1;
      captured.dryRunArg = transactionBlock;
      return {
        effects: {
          status: {
            status: overrides.dryRunStatus ?? 'success',
            error: overrides.dryRunError,
          },
        },
      };
    },
  };
  const deps: BuildMcpServerDeps = {
    jwt: stubJwt,
    suiClient,
    packageId: PKG,
    async buildTxBytes(tx) {
      captured.buildCalls += 1;
      captured.tx = tx;
      if (overrides.buildThrows) throw new Error(overrides.buildThrows);
      return FAKE_BYTES;
    },
  };
  return { deps, captured };
}

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('build_purchase_tx', () => {
  it('returns dry-run-validated base64 txBytes with sender = JWT sub and the purchase_access target', async () => {
    const { deps, captured } = harness();
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });

    expect(result.isError).toBeFalsy();
    const sc = result.structuredContent as {
      txBytes: string;
      sender: string;
      metadata: { target: string; accessFeeMist: string; expectedEvents: string[] };
    };
    expect(sc.txBytes).toBe(toBase64(FAKE_BYTES));
    expect(sc.sender).toBe(AGENT_SUB);
    expect(sc.metadata.target).toBe(`${PKG}::model3d::purchase_access`);
    expect(sc.metadata.accessFeeMist).toBe(FEE);
    expect(sc.metadata.expectedEvents).toEqual([`${PKG}::model3d::AccessPurchased`]);

    // Dry run received exactly the bytes that were returned.
    expect(captured.dryRunCalls).toBe(1);
    expect(captured.dryRunArg).toBe(sc.txBytes);

    // The Transaction handed to the build step: sender set to the agent, one
    // SplitCoins + one MoveCall on purchase_access (structural, not string).
    const data = captured.tx!.getData();
    expect(data.sender).toBe(AGENT_SUB);
    const moveCalls = data.commands.filter(
      (c) => (c as { $kind?: string }).$kind === 'MoveCall',
    ) as Array<{ MoveCall?: { package?: string; module?: string; function?: string } }>;
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0]!.MoveCall?.package).toBe(PKG);
    expect(moveCalls[0]!.MoveCall?.module).toBe('model3d');
    expect(moveCalls[0]!.MoveCall?.function).toBe('purchase_access');
  });

  it('honors an explicit agentAddress (normalized) instead of the sub', async () => {
    const other = `0x${'b'.repeat(64)}`;
    const { deps, captured } = harness();
    const result = await callTool(deps, 'build_purchase_tx', {
      modelId: MODEL_ID,
      agentAddress: other,
    });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { sender: string }).sender).toBe(other);
    expect(captured.tx!.getData().sender).toBe(other);
  });

  it('contains no signature or secret material anywhere in the response', async () => {
    const { deps } = harness();
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    const serialized = JSON.stringify(result);
    for (const needle of ['signature', 'secret', 'privateKey', 'keypair', 'suiprivkey']) {
      expect(serialized).not.toContain(needle);
    }
  });

  it('unresolvable model → not_found; build and dry-run never called', async () => {
    const { deps, captured } = harness({ object: {} });
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('not_found:')).toBe(true);
    expect(captured.buildCalls).toBe(0);
    expect(captured.dryRunCalls).toBe(0);
  });

  it('dry-run failure → dry_run_failed with the Move abort surfaced; txBytes never returned', async () => {
    const { deps } = harness({
      dryRunStatus: 'failure',
      dryRunError: 'MoveAbort(..., 55) EAlreadyHasEntitlement',
    });
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('dry_run_failed:')).toBe(true);
    expect(errorText(result)).toContain('EAlreadyHasEntitlement');
    expect(result.structuredContent).toBeUndefined();
  });

  it('build failure (e.g. unfunded sender) → dry_run_failed naming the funding question', async () => {
    const { deps, captured } = harness({ buildThrows: 'No valid gas coins found' });
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('dry_run_failed:')).toBe(true);
    expect(errorText(result)).toContain('funded');
    expect(captured.dryRunCalls).toBe(0);
  });

  it('policy != ALLOW_LIST → not_purchasable citing ENotPurchasable; nothing built', async () => {
    const { deps, captured } = harness({ policy: 2 });
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('not_purchasable:')).toBe(true);
    expect(errorText(result)).toContain('ENotPurchasable');
    expect(captured.buildCalls).toBe(0);
  });

  it('sender == creator → not_purchasable citing ECreatorCannotSelfPurchase (D-087)', async () => {
    const { deps, captured } = harness({ creator: AGENT_SUB });
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('not_purchasable:')).toBe(true);
    expect(errorText(result)).toContain('ECreatorCannotSelfPurchase');
    expect(captured.buildCalls).toBe(0);
  });

  it('missing bearer → auth_required', async () => {
    const { deps } = harness();
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID }, null);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_required:')).toBe(true);
  });
});

// fix(review) regression coverage — T-001 (dry-run-absent + dry-run-RPC-throws
// branches), T-004 (zero-fee end-to-end).
describe('build_purchase_tx — review fixes', () => {
  it('client without dryRunTransactionBlock → dry_run_failed, no PTB returned (T-001a)', async () => {
    const { deps } = harness();
    (deps.suiClient as { dryRunTransactionBlock?: unknown }).dryRunTransactionBlock = undefined;
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('dry_run_failed:')).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it('dry-run RPC throw → upstream_error (distinct from dry_run_failed; T-001b)', async () => {
    const { deps } = harness();
    (deps.suiClient as { dryRunTransactionBlock: unknown }).dryRunTransactionBlock = async () => {
      throw new Error('fullnode connection reset');
    };
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('upstream_error:')).toBe(true);
    // Raw upstream detail is logged server-side, not echoed (review SEC-3).
    expect(errorText(result)).not.toContain('connection reset');
  });

  it('zero access_fee model builds and dry-runs cleanly (T-004)', async () => {
    const { deps, captured } = harness();
    (deps.suiClient as { getObject: unknown }).getObject = async () => {
      const obj = modelObject() as {
        data: { content: { fields: { license: { fields: { access_fee: string } } } } };
      };
      obj.data.content.fields.license.fields.access_fee = '0';
      return obj;
    };
    const result = await callTool(deps, 'build_purchase_tx', { modelId: MODEL_ID });
    expect(result.isError).toBeFalsy();
    expect(
      (result.structuredContent as { metadata: { accessFeeMist: string } }).metadata.accessFeeMist,
    ).toBe('0');
    expect(captured.dryRunCalls).toBe(1);
  });
});
