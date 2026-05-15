---
title: "CORS is browser-only; cost-bearing endpoints need server-side auth"
date: 2026-05-15
category: best-practices
module: backend-api
problem_type: best_practice
component: authentication
severity: critical
tags:
  - security
  - cors
  - jwt
  - api-auth
  - cost-control
  - llm-spend
  - hono
applies_when:
  - "Building an HTTP endpoint that triggers paid backend work (LLM call, third-party generator, S3 upload, etc.) on each request"
  - "Reading 'we have CORS configured' from a PR description or threat model and being tempted to treat that as access control"
  - "Designing the request shape for any endpoint that calls Anthropic / OpenAI / Tripo / similar metered upstreams"
related_components:
  - backend
  - api
symptoms:
  - "Endpoint accepts requests from any non-browser client (curl, scripts, automated traffic) without authentication"
  - "Cost-bearing third-party upstream (LLM, image gen) can be triggered without a signed user session"
  - "CORS error in the browser console feels like 'access denied' but the server already processed the request"
root_cause: missing_permission
resolution_type: code_fix
---

# CORS is browser-only; cost-bearing endpoints need server-side auth

## Context

When `/api/generate` was first wired up (Phase 2 U4 prompt mode), the only access-control mechanism was a CORS allowlist limiting browser-origin to the frontend dev/prod hosts. The mental model was "browser apps from our origins can hit it, others can't" — and for browser traffic, that's true. But CORS is a **browser-enforced** protocol; a server has no way to know whether a request came from a browser at all. Any `curl -X POST localhost:3000/api/generate` from a shell, a Python script, a competitor, or a runaway crawler bypasses CORS entirely and reaches the handler.

For `/api/generate`'s **slider mode** (procedural generation, zero per-call cost) this is fine — runaway abuse caps out at CPU load. For **prompt mode** (which calls Anthropic Haiku + optionally Tripo P1) every request burns real money on a third-party API. An attacker (or an honest bug) hammering this endpoint with no auth turns into a metered-spend incident in minutes.

`ce-code-review` flagged this as **P0 #2** during the Phase 2 review pass. The fix: gate prompt mode behind JWT verification. Slider mode stays open (no cost). The principle generalizes to **any cost-bearing endpoint on any backend** — CORS is a hint, not a gate.

## Guidance

**For any endpoint that triggers paid work, gate it behind a server-verifiable credential, not browser-enforced CORS.**

The credential can be:

- **A signed session token (JWT)** — what this project chose. Issued at zkLogin / Slush login (Phase 2 U6), HS256-signed by the backend, verified per request via Hono JWT middleware.
- **A signed personal message** — for one-shot operations where session establishment is overkill (e.g., a one-time Walrus upload relay token).
- **An API key bound to an account** — for first-party integrations (mobile client, scheduled jobs).
- **A capability-style token** with TTL + scope — for sharing a single-use action.

CORS is fine to keep — it stops casual browser-origin shenanigans and reduces noise from misconfigured frontends — but **never read it as authorization**.

**The minimum gate:**

```ts
// backend/src/routes/generate.ts (Phase 2 P0 fix #2)
const promptParsed = promptSchema.safeParse(body);
if (promptParsed.success) {
  if (!deps.jwt) {
    return c.json({ error: 'auth_unavailable', message: 'JWT not configured' }, 503);
  }
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return c.json({ error: 'auth_required', message: 'Sign in to use prompt mode' }, 401);
  }
  try {
    await deps.jwt.verifySession(token);
  } catch {
    return c.json({ error: 'auth_invalid', message: 'Session expired or invalid' }, 401);
  }
}
// Slider mode (procedural) requires no auth — no third-party cost.
```

**Two-tier endpoint strategy** (when an endpoint has both free and paid modes):

- Branch on request shape early
- Free branch passes through unauthenticated
- Paid branch requires the credential
- Surface a clear 401 with a hint that auth is required, not a generic 400 — the frontend needs to know to prompt for sign-in

## Why This Matters

1. **CORS attacks the wrong threat.** CORS exists to prevent a malicious site at `evil.com` from triggering an authenticated request to `bank.com` using the user's browser session. It assumes the request is coming from a browser and that the browser is the attack surface. For a metered backend, the attack surface is the endpoint itself — a script with no browser involved.

2. **The cost asymmetry is brutal.** A single attacker with a $0.01/hr VPS can drive 100 req/s at an endpoint; if each request costs $0.03 in LLM token spend, that's $108/hr in burn for $0.01/hr in attacker cost. Rate-limiting helps but doesn't replace auth — anonymous rate limits cap exposure, they don't eliminate it.

3. **The bug pattern is invisible to most reviewers.** "We have CORS configured" reads as security review on a PR description. The reviewer mentally substitutes "auth done" and moves on. The kind of review that catches it — adversarial / API-contract / security personas, ideally several — is what surfaced this in the Phase 2 audit.

4. **The fix is cheap; the post-incident response is expensive.** Adding `verifySession(token)` to a route is ~10 lines + an integration test. Discovering after launch that a script has racked up $4k in Anthropic spend is a different conversation.

5. **Frontend devs may be misled too.** A frontend dev seeing CORS in the network tab assumes the backend "won't accept" their malformed request — and may stop debugging there. Server-side auth gives unambiguous error codes (401 vs 403 vs 400) that surface real problems faster.

## When to Apply

- Adding any endpoint that calls a metered upstream (LLM, generative AI, payment processor, paid storage write)
- Reviewing an endpoint's threat model — ask "what happens if 1000 unauthenticated curls hit this per second?"
- Building free-tier / paid-tier features on the same route — bifurcate auth at the route layer, not the business logic layer
- Designing rate limits — they ride **on top of** auth, not in place of it
- Onboarding a new team member writing their first backend route — make the auth gate part of the route scaffold so it's not a discoverable later

## Examples

### Anti-pattern (Phase 2 pre-P0 #2)

```ts
// backend/src/app.ts (early Phase 2)
app.use('*', cors({ origin: ALLOWED_ORIGINS }));

// backend/src/routes/generate.ts
app.post('/api/generate', async (c) => {
  const body = await c.req.json();
  const promptParsed = promptSchema.safeParse(body);
  if (promptParsed.success) {
    // → calls Anthropic + Tripo, costs money
    return c.json(await deps.router.route(promptParsed.data.prompt));
  }
  // ... slider mode
});
```

Looks safe at a glance — CORS is on, the dev origin is allowlisted. But:

```bash
$ curl -X POST http://localhost:3000/api/generate \
    -H 'Content-Type: application/json' \
    -d '{"prompt":"a flying castle"}'
# → 200 OK, Anthropic call billed
```

No auth check anywhere. CORS didn't fire because the request came from `curl`, which doesn't honor it.

### Correct (Phase 2 post-P0 #2)

```ts
app.post('/api/generate', async (c) => {
  const body = await c.req.json();
  const promptParsed = promptSchema.safeParse(body);
  if (promptParsed.success) {
    if (!deps.jwt) return c.json({ error: 'auth_unavailable' }, 503);
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return c.json({ error: 'auth_required' }, 401);
    try { await deps.jwt.verifySession(token); }
    catch { return c.json({ error: 'auth_invalid' }, 401); }

    return c.json(await deps.router.route(promptParsed.data.prompt));
  }

  // Slider mode: zero per-call cost, no auth required
  const sliderParsed = sliderSchema.safeParse(body);
  if (sliderParsed.success) {
    return c.json(await deps.generators[sliderParsed.data.shape](sliderParsed.data));
  }

  return c.json({ error: 'invalid_request' }, 400);
});
```

```bash
$ curl -X POST http://localhost:3000/api/generate \
    -H 'Content-Type: application/json' \
    -d '{"prompt":"a flying castle"}'
# → 401 {"error":"auth_required","message":"Sign in to use prompt mode"}
```

CORS still rejects cross-origin browser traffic. Auth rejects unauthenticated cost-bearing traffic. Both layers, different jobs.

### Test the gate

```ts
// backend/src/routes/generate.test.ts
it('rejects prompt mode without bearer token', async () => {
  const res = await app.request('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'hello' }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'auth_required' });
});

it('rejects prompt mode with malformed bearer', async () => {
  const res = await app.request('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'hello' }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer not-a-real-jwt',
    },
  });
  expect(res.status).toBe(401);
});

it('allows slider mode without any auth', async () => {
  const res = await app.request('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ shape: 'box', width: 1, height: 1, depth: 1 }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status).toBe(200);
});
```

Test the unauthenticated-cost-path explicitly — a passing 401 here is a regression test against ever silently widening the gate.

## Related Issues

- `backend/src/routes/generate.ts` — the fix lives here (P0 #2 from Phase 2 code review batch)
- `backend/src/auth/jwt.ts` — JWT verification helper (HS256, Hono-based)
- `docs/decisions.md` — capture as D-XXX when promoting this to a project-wide convention (TBD in next pass)
- `docs/spec.md` §2.6 (auth flow) — references the session JWT issued at zkLogin
- Hono docs for JWT middleware: https://hono.dev/middleware/builtin/jwt — official integration pattern
- OWASP API Security Top 10 — particularly API2 "Broken Authentication" and API4 "Unrestricted Resource Consumption"
