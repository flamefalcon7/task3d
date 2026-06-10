// get_model tests (U4, R3, D-104) — transport-level via buildMcpRoute.
//
// The JSON-RPC fixture is the realistic fullnode `getObject` rendering of the
// shared jsonToSummary.test.ts encrypted ALLOW_LIST fixture: nested Move
// structs come back as `{ type, fields }` wrappers (see integrationIndexer's
// `fields.integrations.fields.id`), which `unwrapMoveFields` must flatten
// before the shared mapper runs — otherwise every license fee silently
// defaults to '0'.
import { describe, it, expect, beforeEach } from 'vitest';
import type { McpSuiClient } from '../server.js';
import { resetMcpRateLimitForTest } from '../auth.js';
import { unwrapMoveFields } from './getModel.js';
import { callTool, errorText, stubJwt } from './testUtils.js';

const PKG = `0x${'9'.repeat(64)}`;
const MODEL_ID = `0x${'7'.repeat(64)}`;
const CREATOR = `0x${'c'.repeat(64)}`;
const COLLECTION_ID = `0x${'d'.repeat(64)}`;

// JSON-RPC moveObject fields for the shared ENCRYPTED_JSON fixture.
const RPC_FIELDS: Record<string, unknown> = {
  id: { id: MODEL_ID }, // UID renders as { id } — must survive unwrap untouched
  collection_id: COLLECTION_ID,
  patch_id: 'patch-01',
  creator: CREATOR,
  shape_type: 'tripo',
  params_json: '{"shape":"tripo","prompt":"a low-poly fox"}',
  name: 'Fox',
  direct_access_price: '5000000',
  tags: ['animal', 'fox'],
  part_labels: ['body', 'tail'],
  created_at_ms: '1765432100000',
  lineage_blob_id: 'lineageBlobAAA',
  glb_blob_id: 'cipherBlobBBB',
  // Nested Move struct: JSON-RPC wraps it in { type, fields }.
  license: {
    type: `${PKG}::model3d::LicenseTerms`,
    fields: {
      derivative_mint_fee: '7000000',
      access_fee: '2000000',
      derivative_royalty_bps: 500,
      policy: 1,
    },
  },
  is_encrypted: true,
  preview_blob_ids: ['previewBlob1', 'previewBlob2'],
};

const EXPECTED_SUMMARY = {
  objectId: MODEL_ID,
  blobId: '',
  collectionId: COLLECTION_ID,
  patchId: 'patch-01',
  creator: CREATOR,
  shapeType: 'tripo',
  paramsJson: '{"shape":"tripo","prompt":"a low-poly fox"}',
  name: 'Fox',
  directAccessPrice: '5000000',
  tags: ['animal', 'fox'],
  partLabels: ['body', 'tail'],
  createdAtMs: '1765432100000',
  lineageBlobId: 'lineageBlobAAA',
  glbBlobId: 'cipherBlobBBB',
  derivativeMintFee: '7000000',
  accessFee: '2000000',
  derivativeRoyaltyBps: 500,
  policy: 1,
  isEncrypted: true,
  previewBlobIds: ['previewBlob1', 'previewBlob2'],
};

type GetObjectResponse = unknown;

function fakeSui(respond: (id: string) => GetObjectResponse | Promise<GetObjectResponse>): {
  client: McpSuiClient;
  calls: Array<{ id: string; options?: { showContent?: boolean } }>;
} {
  const calls: Array<{ id: string; options?: { showContent?: boolean } }> = [];
  return {
    calls,
    client: {
      async getObject(params) {
        calls.push(params);
        return respond(params.id);
      },
    },
  };
}

function modelResponse(fields: Record<string, unknown> = RPC_FIELDS, type = `${PKG}::model3d::Model3D`) {
  return {
    data: {
      objectId: MODEL_ID,
      content: { dataType: 'moveObject', type, hasPublicTransfer: false, fields },
    },
  };
}

const baseDeps = (client: McpSuiClient) => ({ jwt: stubJwt, suiClient: client, packageId: PKG });

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('unwrapMoveFields', () => {
  it('flattens nested { type, fields } struct wrappers, recursively', () => {
    expect(unwrapMoveFields(RPC_FIELDS)).toEqual({
      ...RPC_FIELDS,
      id: { id: MODEL_ID },
      license: {
        derivative_mint_fee: '7000000',
        access_fee: '2000000',
        derivative_royalty_bps: 500,
        policy: 1,
      },
    });
  });
});

describe('get_model', () => {
  it('maps a fullnode getObject payload to the full Model3DSummary (showContent read)', async () => {
    const { client, calls } = fakeSui(() => modelResponse());
    const result = await callTool(baseDeps(client), 'get_model', { modelId: MODEL_ID });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(EXPECTED_SUMMARY);
    expect(JSON.parse(errorText(result))).toEqual(EXPECTED_SUMMARY);
    // Fullnode by-id read with content (D-043 / unit spec call shape).
    expect(calls).toEqual([{ id: MODEL_ID, options: { showContent: true } }]);
  });

  it('unknown object id → clean not_found tool error', async () => {
    const { client } = fakeSui(() => ({ error: { code: 'notExists' } }));
    const result = await callTool(baseDeps(client), 'get_model', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('not_found:')).toBe(true);
  });

  it('an object of a DIFFERENT type (even a lookalike from a foreign package) → not_found', async () => {
    const foreign = `0x${'b'.repeat(64)}::model3d::Model3D`;
    const { client } = fakeSui(() => modelResponse(RPC_FIELDS, foreign));
    const result = await callTool(baseDeps(client), 'get_model', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('not_found:')).toBe(true);
  });

  it('a rejecting RPC client → upstream_error (not a silent default summary)', async () => {
    const { client } = fakeSui(() => Promise.reject(new Error('fullnode down')));
    const result = await callTool(baseDeps(client), 'get_model', { modelId: MODEL_ID });
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('upstream_error:')).toBe(true);
  });

  it('missing bearer → auth_required (chain never read)', async () => {
    const { client, calls } = fakeSui(() => modelResponse());
    const result = await callTool(baseDeps(client), 'get_model', { modelId: MODEL_ID }, null);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_required:')).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('invalid bearer → auth_invalid', async () => {
    const { client } = fakeSui(() => modelResponse());
    const result = await callTool(baseDeps(client), 'get_model', { modelId: MODEL_ID }, 'garbage');
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_invalid:')).toBe(true);
  });
});
