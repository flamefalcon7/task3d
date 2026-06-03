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
const DIGEST = '5'.repeat(44); // base58-ish, passes the schema regex

const stubJwt: JwtSigner = {
  async signSession() {
    return 'valid';
  },
  async verifySession(token: string): Promise<SessionClaims> {
    if (token === 'valid') return { sub: WALLET } as SessionClaims;
    throw new Error('invalid');
  },
};
const okVerifier: PaymentVerifier = { async verify() {
    return { ok: true };
  } };

// The route reads routeResult.lineageStub.params; it must be present or the route
// short-circuits with router_no_params before ever calling the generator.
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

function post(route: ReturnType<typeof buildGenerateRoute>, body: unknown) {
  return route.request('/', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const body = { prompt: 'a car', paymentDigest: DIGEST };

describe('POST /api/generate — Tripo error classification (U5, R2/R3)', () => {
  it('AE3: TripoFailedError after payment → tripo_failed + refundable, non-500 status', async () => {
    const route = buildGenerateRoute({
      router: routerGenThrows(new TripoFailedError('quota out')),
      jwt: stubJwt,
      paymentVerifier: okVerifier,
    });
    const res = await post(route, body);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'tripo_failed', refundable: true });
  });

  it('TripoTimeoutError after payment → tripo_timeout + refundable (504)', async () => {
    const route = buildGenerateRoute({
      router: routerGenThrows(new TripoTimeoutError()),
      jwt: stubJwt,
      paymentVerifier: okVerifier,
    });
    const res = await post(route, body);
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: 'tripo_timeout', refundable: true });
  });

  it('TripoFormatError after payment → tripo_failed + refundable (502)', async () => {
    const route = buildGenerateRoute({
      router: routerGenThrows(new TripoFormatError()),
      jwt: stubJwt,
      paymentVerifier: okVerifier,
    });
    const res = await post(route, body);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'tripo_failed', refundable: true });
  });

  it('TripoAuthError → tripo_unavailable (operator-side, NOT user-refundable framing, 503)', async () => {
    const route = buildGenerateRoute({
      router: routerGenThrows(new TripoAuthError()),
      jwt: stubJwt,
      paymentVerifier: okVerifier,
    });
    const res = await post(route, body);
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string; refundable?: boolean };
    expect(json.error).toBe('tripo_unavailable');
    expect(json.refundable).toBeUndefined();
  });

  it('without a payment verifier, a Tripo failure is NOT marked refundable (no fee was charged)', async () => {
    const route = buildGenerateRoute({ router: routerGenThrows(new TripoFailedError()), jwt: stubJwt });
    const res = await post(route, { prompt: 'a car' });
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string; refundable?: boolean };
    expect(json.error).toBe('tripo_failed');
    expect(json.refundable).toBeUndefined();
  });

  it('no known Tripo error class produces a raw 500', async () => {
    for (const err of [new TripoAuthError(), new TripoTimeoutError(), new TripoFailedError(), new TripoFormatError()]) {
      const route = buildGenerateRoute({ router: routerGenThrows(err), jwt: stubJwt, paymentVerifier: okVerifier });
      const res = await post(route, body);
      expect(res.status).not.toBe(500);
    }
  });

  it('regression: TripoDisabledError still → 400 tripo_disabled', async () => {
    const route = buildGenerateRoute({
      router: routerRouteThrows(new TripoDisabledError('tripo off')),
      jwt: stubJwt,
      paymentVerifier: okVerifier,
    });
    const res = await post(route, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('tripo_disabled');
  });

  it('regression: happy path still returns the GLB response', async () => {
    const route = buildGenerateRoute({ router: routerOk(), jwt: stubJwt, paymentVerifier: okVerifier });
    const res = await post(route, body);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { glbBytes: string; lineageJson: string };
    expect(typeof json.glbBytes).toBe('string');
    expect(json.glbBytes.length).toBeGreaterThan(0);
    expect(typeof json.lineageJson).toBe('string');
  });
});
