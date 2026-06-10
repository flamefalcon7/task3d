// download_content tests (U6, R5/R6, KTD-2/KTD-6, D-104) — transport-level via
// buildMcpRoute (testUtils idiom). The fake client records every getObject
// call so the by-id fullnode read shape (D-043 — no GraphQL) is itself under
// test, and the W-9 invariant (no AES key / plaintext in the response) is
// asserted explicitly.
import { describe, it, expect, beforeEach } from 'vitest';
import { fromBase64 } from '@mysten/sui/utils';
import type { BuildMcpServerDeps, McpSuiClient } from '../server.js';
import { resetMcpRateLimitForTest } from '../auth.js';
import { AGENT_SUB, callTool, errorText, stubJwt } from './testUtils.js';

const PKG = `0x${'9'.repeat(64)}`;
const MODEL_ID = `0x${'7'.repeat(64)}`;
const ENTITLEMENT_ID = `0x${'e'.repeat(64)}`;
const SEALED_KEY = Array.from({ length: 40 }, (_, i) => i + 1);
const SEAL_ID_32 = Array.from({ length: 32 }, () => 7);
const GLB_BLOB_ID = 'cipherQuiltPatchAAA';
const AGGREGATOR = 'https://cdn.example.test';

type Overrides = {
  entType?: string;
  entOwner?: unknown;
  entModelId?: string;
  entThrows?: boolean;
  entObject?: unknown;
  isEncrypted?: boolean;
  sealId?: unknown;
  sealedKey?: unknown;
  glbBlobId?: string;
};

function entitlementObject(o: Overrides) {
  return {
    data: {
      type: o.entType ?? `${PKG}::model3d::AccessEntitlement`,
      owner: o.entOwner !== undefined ? o.entOwner : { AddressOwner: AGENT_SUB },
      content: {
        dataType: 'moveObject',
        type: o.entType ?? `${PKG}::model3d::AccessEntitlement`,
        fields: {
          model_id: o.entModelId ?? MODEL_ID,
          holder: AGENT_SUB,
        },
      },
    },
  };
}

function modelObject(o: Overrides) {
  return {
    data: {
      content: {
        dataType: 'moveObject',
        type: `${PKG}::model3d::Model3D`,
        fields: {
          creator: `0x${'c'.repeat(64)}`,
          name: 'Fox',
          glb_blob_id: o.glbBlobId ?? GLB_BLOB_ID,
          is_encrypted: o.isEncrypted ?? true,
          seal_id: o.sealId !== undefined ? o.sealId : SEAL_ID_32,
          sealed_key: o.sealedKey !== undefined ? o.sealedKey : SEALED_KEY,
          license: {
            type: `${PKG}::model3d::LicenseTerms`,
            fields: {
              derivative_mint_fee: '7000000',
              access_fee: '2000000',
              derivative_royalty_bps: 500,
              policy: 1,
            },
          },
          preview_blob_ids: [],
        },
      },
    },
  };
}

interface CapturedCall {
  id: string;
  options?: Record<string, unknown>;
}

function harness(o: Overrides = {}): { deps: BuildMcpServerDeps; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const suiClient: McpSuiClient = {
    async getObject(params) {
      calls.push({ id: params.id, options: params.options as Record<string, unknown> });
      if (params.id === ENTITLEMENT_ID) {
        if (o.entThrows) throw new Error('rpc boom');
        return o.entObject !== undefined ? o.entObject : entitlementObject(o);
      }
      return modelObject(o);
    },
  };
  return {
    deps: { jwt: stubJwt, suiClient, packageId: PKG, walrusAggregator: AGGREGATOR },
    calls,
  };
}

const ARGS = { modelId: MODEL_ID, entitlementId: ENTITLEMENT_ID };

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('download_content', () => {
  it('matching entitlement → ciphertextUrl + sealedKey + sealApprove + packageId; W-9 holds', async () => {
    const { deps, calls } = harness();
    const result = await callTool(deps, 'download_content', ARGS);

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      ciphertextUrl: `${AGGREGATOR}/v1/blobs/by-quilt-patch-id/${GLB_BLOB_ID}`,
      sealedKey: expect.any(String),
      sealApprove: { modelId: MODEL_ID, entitlementId: ENTITLEMENT_ID },
      packageId: PKG,
    });
    // sealedKey round-trips to the on-chain wrapped bytes (still Seal-wrapped —
    // NOT the AES key).
    const sc = result.structuredContent as { sealedKey: string };
    expect(Array.from(fromBase64(sc.sealedKey))).toEqual(SEALED_KEY);

    // W-9 invariant, asserted explicitly: the server emitted no plaintext AES
    // key and no decrypted content — only the wrapped key + pointers.
    const serialized = JSON.stringify(result);
    for (const needle of ['aesKey', 'plaintext', 'decrypted', 'glbBytes']) {
      expect(serialized).not.toContain(needle);
    }

    // Call shape (D-043): both reads are fullnode getObject BY-ID — the
    // entitlement read carries showOwner+showType for the gate.
    expect(calls[0]).toEqual({
      id: ENTITLEMENT_ID,
      options: { showContent: true, showOwner: true, showType: true },
    });
    expect(calls[1]).toEqual({ id: MODEL_ID, options: { showContent: true } });
  });

  it('entitlement owned by a different address → forbidden', async () => {
    const { deps } = harness({ entOwner: { AddressOwner: `0x${'b'.repeat(64)}` } });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('forbidden:')).toBe(true);
  });

  it('entitlement bound to a different model_id → forbidden', async () => {
    const { deps } = harness({ entModelId: `0x${'d'.repeat(64)}` });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('forbidden:')).toBe(true);
  });

  it('object is not an AccessEntitlement type → forbidden', async () => {
    const { deps } = harness({ entType: `${PKG}::model3d::NftCollectionCreatorCap` });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('forbidden:')).toBe(true);
  });

  it('a foreign package lookalike AccessEntitlement → forbidden', async () => {
    const { deps } = harness({ entType: `0x${'f'.repeat(64)}::model3d::AccessEntitlement` });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('forbidden:')).toBe(true);
  });

  it('entitlement read RPC error → forbidden (fail-closed), material never returned', async () => {
    const { deps, calls } = harness({ entThrows: true });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('forbidden:')).toBe(true);
    // Fail-closed means we never proceeded to the model read.
    expect(calls).toHaveLength(1);
  });

  it('seal_id length != 32 → content_invalid, sealApprove never emitted (D-085 mirror)', async () => {
    const { deps } = harness({ sealId: Array.from({ length: 16 }, () => 1) });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('content_invalid:')).toBe(true);
    expect(errorText(result)).toContain('ESealIdWrongLength');
    expect(result.structuredContent).toBeUndefined();
  });

  it('malformed glb_blob_id → content_invalid, never path-composed (audit W-4)', async () => {
    const { deps } = harness({ glbBlobId: '../../etc/passwd' });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('content_invalid:')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('etc/passwd');
  });

  it('unencrypted model → not_encrypted, pointing the agent at get_model', async () => {
    const { deps } = harness({ isEncrypted: false });
    const result = await callTool(deps, 'download_content', ARGS);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('not_encrypted:')).toBe(true);
  });

  it('missing bearer → auth_required; chain never read', async () => {
    const { deps, calls } = harness();
    const result = await callTool(deps, 'download_content', ARGS, null);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_required:')).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
