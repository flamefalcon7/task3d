// search_models tests (U4, R2, D-104) — transport-level via buildMcpRoute.
//
// Contract under test: global scope recalls GLOBAL_NAMESPACE (the D-080
// community mirror), personal scope recalls the verified JWT sub, relayer
// failure is fail-SOFT (`{ results: [], degraded: true }`, never a throw),
// and auth is fail-HARD (no bearer → auth_required isError).
import { describe, it, expect, beforeEach } from 'vitest';
import { encodeMemory } from '@overflow2026/shared';
import type { MemwalClient, RecallOpts } from '../../lib/memwal-client.js';
import { GLOBAL_NAMESPACE } from '../../routes/memory.js';
import { resetMcpRateLimitForTest } from '../auth.js';
import { AGENT_SUB, callTool, errorText, stubJwt } from './testUtils.js';

const MODEL_A = `0x${'1'.repeat(64)}`;
const MODEL_B = `0x${'2'.repeat(64)}`;
const CREATOR = `0x${'c'.repeat(64)}`;

interface RecallCall {
  namespace: string;
  query: string;
  opts?: RecallOpts;
}

function fakeMemwal(
  results: Array<{ text: string; distance: number }>,
  opts: { errored?: boolean; throws?: boolean } = {},
): { client: MemwalClient; calls: RecallCall[] } {
  const calls: RecallCall[] = [];
  const client: MemwalClient = {
    configured: true,
    async remember() {
      /* unused */
    },
    async recall(namespace, query, recallOpts) {
      calls.push({ namespace, query, opts: recallOpts });
      if (opts.throws) throw new Error('relayer exploded');
      // RecallMemory has more fields (blob_id, …); the tool only reads text+distance.
      return {
        results: results as never,
        errored: opts.errored ?? false,
      };
    },
  };
  return { client, calls };
}

beforeEach(() => {
  resetMcpRateLimitForTest();
});

describe('search_models — global scope (default)', () => {
  it('returns ranked modelIds with creator from the GLOBAL namespace', async () => {
    const { client, calls } = fakeMemwal([
      { text: encodeMemory('a low-poly fox', { m: MODEL_A, c: CREATOR }), distance: 0.21 },
      { text: encodeMemory('a sports car', { m: MODEL_B, c: CREATOR }), distance: 0.35 },
      // No `c` trailer → unverifiable authorship, dropped in global scope.
      { text: encodeMemory('orphan record', { m: MODEL_A }), distance: 0.4 },
    ]);
    const result = await callTool({ jwt: stubJwt, memwal: client }, 'search_models', {
      query: 'fox',
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      results: [
        { modelId: MODEL_A, prompt: 'a low-poly fox', distance: 0.21, creator: CREATOR },
        { modelId: MODEL_B, prompt: 'a sports car', distance: 0.35, creator: CREATOR },
      ],
    });
    // Machine-readable text content mirrors structuredContent (agents on
    // clients that drop structuredContent still get JSON).
    expect(JSON.parse(errorText(result))).toEqual(result.structuredContent);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.namespace).toBe(GLOBAL_NAMESPACE);
    expect(calls[0]!.query).toBe('fox');
    // The route's relevance gate rides along.
    expect(calls[0]!.opts?.maxDistance).toBeGreaterThan(0);
  });

  it('respects limit', async () => {
    const { client } = fakeMemwal([
      { text: encodeMemory('one', { m: MODEL_A, c: CREATOR }), distance: 0.1 },
      { text: encodeMemory('two', { m: MODEL_B, c: CREATOR }), distance: 0.2 },
    ]);
    const result = await callTool({ jwt: stubJwt, memwal: client }, 'search_models', {
      query: 'q',
      limit: 1,
    });
    expect((result.structuredContent as { results: unknown[] }).results).toHaveLength(1);
  });
});

describe('search_models — personal scope', () => {
  it("recalls the caller's own namespace (= verified JWT sub), creator omitted", async () => {
    const { client, calls } = fakeMemwal([
      { text: encodeMemory('my crate', { m: MODEL_A }), distance: 0.15 },
    ]);
    const result = await callTool({ jwt: stubJwt, memwal: client }, 'search_models', {
      query: 'crate',
      scope: 'personal',
    });

    expect(calls[0]!.namespace).toBe(AGENT_SUB);
    expect(result.structuredContent).toEqual({
      results: [{ modelId: MODEL_A, prompt: 'my crate', distance: 0.15 }],
    });
  });
});

describe('search_models — degraded relayer (fail-soft)', () => {
  it('errored outcome → empty results + degraded flag, no throw', async () => {
    const { client } = fakeMemwal([], { errored: true });
    const result = await callTool({ jwt: stubJwt, memwal: client }, 'search_models', {
      query: 'anything',
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ results: [], degraded: true });
  });

  it('a THROWING relayer client → same degraded contract, never an isError', async () => {
    const { client } = fakeMemwal([], { throws: true });
    const result = await callTool({ jwt: stubJwt, memwal: client }, 'search_models', {
      query: 'anything',
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ results: [], degraded: true });
  });
});

describe('search_models — auth gate', () => {
  it('missing bearer → auth_required isError (relayer never called)', async () => {
    const { client, calls } = fakeMemwal([]);
    const result = await callTool({ jwt: stubJwt, memwal: client }, 'search_models', { query: 'q' }, null);
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_required:')).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('invalid bearer → auth_invalid isError', async () => {
    const { client } = fakeMemwal([]);
    const result = await callTool({ jwt: stubJwt, memwal: client }, 'search_models', { query: 'q' }, 'garbage');
    expect(result.isError).toBe(true);
    expect(errorText(result).startsWith('auth_invalid:')).toBe(true);
  });
});
