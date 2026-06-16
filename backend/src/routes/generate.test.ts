import { describe, it, expect } from 'vitest';
import type { Router, RouteResult, GenerateResult } from '@overflow2026/shared';
import { buildGenerateRoute } from './generate.js';
import { TripoDisabledError } from '../agent/router.js';
import {
  TripoAuthError,
  TripoTimeoutError,
  TripoFailedError,
  TripoFormatError,
} from '../lib/tripo-client.js';
import type { JwtSigner, SessionClaims } from '../lib/jwt.js';
import type { PaymentVerifier } from '../sui/paymentVerifier.js';

const WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';
const WALLET2 = '0x0000000000000000000000000000000000000000000000000000000000000002';
const DIGEST = '5'.repeat(44); // base58-ish, passes the schema regex

// 'valid' → WALLET, 'valid2' → WALLET2 (for owner-scoping tests).
const stubJwt: JwtSigner = {
  async signSession() {
    return 'valid';
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token === 'valid') return { sub: WALLET } as SessionClaims;
    if (token === 'valid2') return { sub: WALLET2 } as SessionClaims;
    throw new Error('invalid');
  },
};
const okVerifier: PaymentVerifier = {
  async verify() {
    return { ok: true };
  },
};

const stub = (): RouteResult['lineageStub'] =>
  ({ params: { shape: 'tripo', prompt: 'a car' } }) as unknown as RouteResult['lineageStub'];

/** A router whose generator throws `err` AFTER routing (post-payment failure path). */
function routerGenThrows(err: unknown): Router {
  return {
    async route(): Promise<RouteResult> {
      return {
        generator: {
          async generate(): Promise<GenerateResult> {
            throw err;
          },
        },
        lineageStub: stub(),
      };
    },
  };
}

/** A router whose route() itself throws (e.g. Tripo disabled). */
function routerRouteThrows(err: unknown): Router {
  return {
    async route(): Promise<RouteResult> {
      throw err;
    },
  };
}

/** A router that succeeds and returns tiny GLB bytes. */
function routerOk(): Router {
  return {
    async route(): Promise<RouteResult> {
      return {
        generator: {
          async generate(): Promise<GenerateResult> {
            return {
              glbBytes: new Uint8Array([1, 2, 3, 4]),
              lineageStub: { shape: 'tripo', params: { shape: 'tripo', prompt: 'a car' } as never, prompt: 'a car' },
            };
          },
        },
        lineageStub: stub(),
      };
    },
  };
}

type Route = ReturnType<typeof buildGenerateRoute>;

function post(route: Route, body: unknown, token = 'valid') {
  return route.request('/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getResult(route: Route, jobId: string, token: string | null = 'valid') {
  return route.request(`/result/${jobId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

interface JobBody {
  status?: string;
  error?: string;
  refundable?: boolean;
  glbBytes?: string;
  lineageJson?: string;
}

/** Dispatch, then poll /result until the background job is terminal. */
async function dispatchAndAwait(route: Route, reqBody: unknown, token = 'valid'): Promise<JobBody> {
  const postRes = await post(route, reqBody, token);
  expect(postRes.status).toBe(202);
  const { jobId } = (await postRes.json()) as { jobId: string };
  expect(typeof jobId).toBe('string');
  for (let i = 0; i < 100; i++) {
    const r = await getResult(route, jobId, token);
    const j = (await r.json()) as JobBody;
    if (j.status !== 'pending') return j;
    await new Promise((res) => setImmediate(res));
  }
  throw new Error('job never reached a terminal state');
}

const body = { prompt: 'a car', paymentDigest: DIGEST };

describe('POST /api/generate — async dispatch + poll (D-106)', () => {
  it('valid request → 202 { jobId }', async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const res = await post(route, body);
    expect(res.status).toBe(202);
    const json = (await res.json()) as { jobId?: string };
    expect(typeof json.jobId).toBe('string');
  });

  it('happy path: poll resolves to a done GLB result', async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const j = await dispatchAndAwait(route, body);
    expect(j.status).toBe('done');
    expect(typeof j.glbBytes).toBe('string');
    expect((j.glbBytes ?? '').length).toBeGreaterThan(0);
    expect(typeof j.lineageJson).toBe('string');
  });
});

describe('result endpoint — Tripo error classification surfaced via /result (U5, R2/R3)', () => {
  it('AE3: TripoFailedError after payment → tripo_failed + refundable', async () => {
    const route = buildGenerateRoute({ router: routerGenThrows(new TripoFailedError('quota out')), jwt: stubJwt, paymentVerifier: okVerifier });
    const j = await dispatchAndAwait(route, body);
    expect(j).toEqual({ status: 'error', error: 'tripo_failed', refundable: true });
  });

  it('TripoTimeoutError after payment → tripo_timeout + refundable', async () => {
    const route = buildGenerateRoute({ router: routerGenThrows(new TripoTimeoutError()), jwt: stubJwt, paymentVerifier: okVerifier });
    const j = await dispatchAndAwait(route, body);
    expect(j).toEqual({ status: 'error', error: 'tripo_timeout', refundable: true });
  });

  it('TripoFormatError after payment → tripo_failed + refundable', async () => {
    const route = buildGenerateRoute({ router: routerGenThrows(new TripoFormatError()), jwt: stubJwt, paymentVerifier: okVerifier });
    const j = await dispatchAndAwait(route, body);
    expect(j).toEqual({ status: 'error', error: 'tripo_failed', refundable: true });
  });

  it('TripoAuthError → tripo_unavailable (operator-side, NOT refundable)', async () => {
    const route = buildGenerateRoute({ router: routerGenThrows(new TripoAuthError()), jwt: stubJwt, paymentVerifier: okVerifier });
    const j = await dispatchAndAwait(route, body);
    expect(j.status).toBe('error');
    expect(j.error).toBe('tripo_unavailable');
    expect(j.refundable).toBeUndefined();
  });

  it('without a payment verifier, a Tripo failure is NOT marked refundable', async () => {
    const route = buildGenerateRoute({ router: routerGenThrows(new TripoFailedError()), jwt: stubJwt });
    const j = await dispatchAndAwait(route, { prompt: 'a car' });
    expect(j.status).toBe('error');
    expect(j.error).toBe('tripo_failed');
    expect(j.refundable).toBeUndefined();
  });

  it('known Tripo error classes never surface as "internal"', async () => {
    for (const err of [new TripoAuthError(), new TripoTimeoutError(), new TripoFailedError(), new TripoFormatError()]) {
      const route = buildGenerateRoute({ router: routerGenThrows(err), jwt: stubJwt, paymentVerifier: okVerifier });
      const j = await dispatchAndAwait(route, body);
      expect(j.error).not.toBe('internal');
    }
  });

  it('TripoDisabledError (route throws) → tripo_disabled', async () => {
    const route = buildGenerateRoute({ router: routerRouteThrows(new TripoDisabledError('tripo off')), jwt: stubJwt, paymentVerifier: okVerifier });
    const j = await dispatchAndAwait(route, body);
    expect(j.status).toBe('error');
    expect(j.error).toBe('tripo_disabled');
  });
});

describe('pay-gate + auth (synchronous, pre-dispatch)', () => {
  it('payment verifier wired but no digest → 402 payment_required', async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const res = await post(route, { prompt: 'a car' });
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe('payment_required');
  });

  it('payment verify fails → 402 payment_invalid (no job dispatched)', async () => {
    const failVerifier: PaymentVerifier = { async verify() { return { ok: false, reason: 'payment_not_found' }; } };
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: failVerifier });
    const res = await post(route, body);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe('payment_invalid');
  });

  it('missing bearer token → 401', async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const res = await route.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(res.status).toBe(401);
  });
});

describe('GET /result/:jobId — owner scoping + lookup', () => {
  it('unknown jobId → 404', async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const res = await getResult(route, 'no-such-job');
    expect(res.status).toBe(404);
  });

  it("another wallet cannot read someone else's job → 403", async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const postRes = await post(route, body); // owned by WALLET ('valid')
    const { jobId } = (await postRes.json()) as { jobId: string };
    const res = await getResult(route, jobId, 'valid2'); // WALLET2
    expect(res.status).toBe(403);
  });

  it('result endpoint requires auth → 401', async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const res = await getResult(route, 'whatever', null);
    expect(res.status).toBe(401);
  });
});
