import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encodeMemory } from '@overflow2026/shared';
import { buildCopilotRoute, resetCopilotRateLimitForTest, type CopilotRouteDeps } from './copilot.js';
import type { CopilotClient } from '../lib/copilot-client.js';
import { CopilotDegradedError } from '../lib/copilot-client.js';
import type { MemwalClient } from '../lib/memwal-client.js';
import { buildQuotaStore, type QuotaStore } from '../lib/quota-store.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';
const MODEL = '0x00000000000000000000000000000000000000000000000000000000000000a5';

const stubJwt: JwtSigner = {
  async signSession() {
    return 'valid';
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token === 'valid') return { sub: WALLET } as SessionClaims;
    if (token === 'badsub') return { sub: 'not-an-address' } as SessionClaims;
    throw new Error('invalid');
  },
};

function fakeCopilot(over: Partial<CopilotClient> = {}): CopilotClient {
  return {
    configured: true,
    turn: vi.fn(async () => ({ kind: 'question' as const, text: 'What color?' })),
    ...over,
  };
}
function fakeMemory(over: Partial<MemwalClient> = {}): MemwalClient {
  return {
    configured: true,
    remember: vi.fn(async () => {}),
    recall: vi.fn(async () => ({ results: [], errored: false })),
    ...over,
  };
}
function auth(token = 'valid') {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
const post = (route: ReturnType<typeof buildCopilotRoute>, body: unknown, headers: Record<string, string> = auth()) =>
  route.request('/turn', { method: 'POST', headers, body: JSON.stringify(body) });

// Each test gets a fresh in-memory quota store injected (never touches the disk
// default path — R12). The route's per-address counter + cooldown read this handle.
let store: QuotaStore;
function mk(over: Partial<CopilotRouteDeps> = {}) {
  return buildCopilotRoute({ jwt: stubJwt, client: fakeCopilot(), memory: fakeMemory(), store, ...over });
}

beforeEach(() => {
  resetCopilotRateLimitForTest();
  vi.restoreAllMocks();
  store = buildQuotaStore({ path: ':memory:' });
});
afterEach(() => {
  store.close();
});

describe('POST /turn — auth & validation', () => {
  it('401 without a token', async () => {
    const route = mk();
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] }, { 'Content-Type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('401 on an invalid token (hard-fail, never degraded-200)', async () => {
    const route = mk();
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] }, auth('nope'));
    expect(res.status).toBe(401);
  });

  it('401 when the token subject is not an address', async () => {
    const route = mk();
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] }, auth('badsub'));
    expect(res.status).toBe(401);
  });

  it('400 on a malformed body', async () => {
    const route = mk();
    const res = await post(route, { messages: [] });
    expect(res.status).toBe(400);
  });

  it('400 when the array has NO user message (rejects role-spoofed / all-assistant arrays)', async () => {
    const route = mk();
    const res = await post(route, {
      messages: [
        { role: 'assistant', content: 'q1' },
        { role: 'assistant', content: 'q2' },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('accepts "Generate now" right after a copilot question (array ends with assistant)', async () => {
    const client = fakeCopilot({ turn: vi.fn(async () => ({ kind: 'prompt' as const, text: 'p' })) });
    const route = mk({ client });
    const res = await post(route, {
      messages: [
        { role: 'user', content: 'a plane' },
        { role: 'assistant', content: 'what style?' },
      ],
      forceSynthesize: true,
    });
    expect(res.status).toBe(200); // last msg is assistant, but a user message exists → allowed
  });

  it('400 on an oversized message array (cannot inflate the conversation past the cap)', async () => {
    const route = mk();
    const messages = Array.from({ length: 9 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `m${i}`,
    }));
    // ensure it still ends with a user turn so only the .max bound trips
    messages.push({ role: 'user' as const, content: 'last' });
    const res = await post(route, { messages });
    expect(res.status).toBe(400);
  });
});

describe('POST /turn — behavior', () => {
  it('returns a question on an early turn and recalls the caller’s own namespace', async () => {
    const memory = fakeMemory();
    const client = fakeCopilot();
    const route = mk({ client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a spaceship' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, result: { kind: 'question', text: 'What color?' }, turnIndex: 0 });
    expect(memory.recall).toHaveBeenCalledWith(WALLET, 'a spaceship', { limit: 5 });
  });

  it('derives turnIndex from assistant-message count (server-enforced cap, AE2)', async () => {
    const client = fakeCopilot({ turn: vi.fn(async () => ({ kind: 'prompt' as const, text: 'low-poly ship' })) });
    const route = mk({ client });
    const messages = [
      { role: 'user', content: 'a ship' },
      { role: 'assistant', content: 'color?' },
      { role: 'user', content: 'red' },
      { role: 'assistant', content: 'size?' },
      { role: 'user', content: 'big' },
    ];
    await post(route, { messages });
    expect(client.turn).toHaveBeenCalledWith(expect.objectContaining({ turnIndex: 2 }));
  });

  it('passes forceSynthesize through (AE1)', async () => {
    const client = fakeCopilot({ turn: vi.fn(async () => ({ kind: 'prompt' as const, text: 'p' })) });
    const route = mk({ client });
    await post(route, { messages: [{ role: 'user', content: 'a ship' }], forceSynthesize: true });
    expect(client.turn).toHaveBeenCalledWith(expect.objectContaining({ forceSynthesize: true }));
  });

  it('folds recalled prompts (parsed) into the copilot memory context (R6)', async () => {
    const memory = fakeMemory({
      recall: vi.fn(async () => ({
        results: [
          { blob_id: 'b1', text: encodeMemory('low-poly red sports car', { m: MODEL }), distance: 0.4 },
          { blob_id: 'b2', text: encodeMemory('off-road truck', { m: MODEL }), distance: 0.5 },
        ],
        errored: false,
      })),
    });
    const client = fakeCopilot();
    const route = mk({ client, memory });
    await post(route, { messages: [{ role: 'user', content: 'a vehicle' }] });
    expect(client.turn).toHaveBeenCalledWith(
      expect.objectContaining({ memoryContext: ['low-poly red sports car', 'off-road truck'] }),
    );
  });

  it('is fail-soft when recall fails — still drives the copilot with empty context (R10)', async () => {
    const memory = fakeMemory({ recall: vi.fn(async () => ({ results: [], errored: true })) });
    const client = fakeCopilot();
    const route = mk({ client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    expect(client.turn).toHaveBeenCalledWith(expect.objectContaining({ memoryContext: [] }));
  });

  it('is fail-soft when recall THROWS — never 500s, degrades to empty context (R10)', async () => {
    const memory = fakeMemory({
      recall: vi.fn(async () => {
        throw new Error('relayer exploded');
      }),
    });
    const client = fakeCopilot();
    const route = mk({ client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    expect(client.turn).toHaveBeenCalledWith(expect.objectContaining({ memoryContext: [] }));
  });

  it('returns available:false (clean) when the copilot is INERT — no recall, no leak', async () => {
    const memory = fakeMemory();
    const client = fakeCopilot({ configured: false });
    const route = mk({ client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
    expect(res.headers.get('x-copilot-degraded')).toBe('1');
    expect(memory.recall).not.toHaveBeenCalled();
  });

  it('a configured-but-failed turn is TRANSIENT (retryable), not "off" — never 5xx, never leaks', async () => {
    const client = fakeCopilot({
      turn: vi.fn(async () => {
        throw new CopilotDegradedError('gemini exploded with SECRET');
      }),
    });
    const route = mk({ client });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    // available:true (feature stays usable) + retryable — NOT available:false (which hides it).
    expect(json).toEqual({ available: true, error: 'unavailable', retryable: true });
    expect(JSON.stringify(json)).not.toContain('SECRET');
    expect(res.headers.get('x-copilot-degraded')).toBe('1');
  });

  it('ignores a client-supplied namespace; recalls the JWT address only', async () => {
    const memory = fakeMemory();
    const route = mk({ memory });
    // namespace is not in the schema and must be ignored regardless (post body is unknown)
    await post(route, { messages: [{ role: 'user', content: 'a car' }], namespace: '0xEVIL' });
    expect(memory.recall).toHaveBeenCalledWith(WALLET, 'a car', { limit: 5 });
  });

  it('429 after exceeding the per-address window', async () => {
    const route = mk();
    let last = 200;
    for (let i = 0; i < 35; i++) {
      const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('POST /turn — quota contract (U3, R6/R8/R10)', () => {
  it('AE4: an active cooldown → VISIBLE quota_exhausted, NOT available:false', async () => {
    store.setGeminiCooldown('copilot', Date.now() + 120_000);
    const memory = fakeMemory();
    const client = fakeCopilot();
    const route = mk({ client, memory });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { available: boolean; error?: string; retryAfterMs?: number };
    expect(json.available).toBe(true); // stays visible (R10)
    expect(json.error).toBe('quota_exhausted');
    expect(json.retryAfterMs).toBeGreaterThan(0);
    expect(res.headers.get('x-copilot-degraded')).toBe('1');
    expect(client.turn).not.toHaveBeenCalled(); // gated before the model call
    expect(memory.recall).not.toHaveBeenCalled(); // no recall either
  });

  it('turn fails AFTER a recorded 429 → quota_exhausted, not the generic retryable shape', async () => {
    const client = fakeCopilot({
      turn: vi.fn(async () => {
        store.setGeminiCooldown('copilot', Date.now() + 60_000); // closure would have recorded this
        throw new CopilotDegradedError();
      }),
    });
    const route = mk({ client });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('quota_exhausted');
  });

  it('generic transient failure (no cooldown) stays the retryable shape — distinct from quota', async () => {
    const client = fakeCopilot({
      turn: vi.fn(async () => {
        throw new CopilotDegradedError();
      }),
    });
    const route = mk({ client });
    const res = await post(route, { messages: [{ role: 'user', content: 'a car' }] });
    expect(await res.json()).toEqual({ available: true, error: 'unavailable', retryable: true });
  });

  it('R8: per-address cap exhausts one wallet; a different wallet still succeeds', async () => {
    const prev = process.env.GEMINI_PER_ADDRESS_DAILY;
    process.env.GEMINI_PER_ADDRESS_DAILY = '2';
    // A second JWT subject so we can prove per-address isolation.
    const OTHER = '0x0000000000000000000000000000000000000000000000000000000000000002';
    const jwt: JwtSigner = {
      async signSession() {
        return 'valid';
      },
      async verifySession(token: string): Promise<SessionClaims> {
        if (token === 'valid') return { sub: WALLET } as SessionClaims;
        if (token === 'other') return { sub: OTHER } as SessionClaims;
        throw new Error('invalid');
      },
    };
    try {
      const route = mk({ jwt });
      const body = { messages: [{ role: 'user', content: 'a car' }] };
      await post(route, body); // WALLET call #1
      await post(route, body); // WALLET call #2 → at cap
      const capped = (await (await post(route, body)).json()) as { error?: string };
      expect(capped.error).toBe('quota_exhausted');
      // A different wallet is unaffected.
      const other = (await (await post(route, body, auth('other'))).json()) as { available: boolean; error?: string };
      expect(other.available).toBe(true);
      expect(other.error).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.GEMINI_PER_ADDRESS_DAILY;
      else process.env.GEMINI_PER_ADDRESS_DAILY = prev;
    }
  });
});
