---
title: "In-memory nonce store needs an explicit TTL sweep — lazy delete-on-read leaks abandoned nonces"
date: 2026-05-15
category: best-practices
module: backend-auth
problem_type: best_practice
component: authentication
severity: medium
tags:
  - nonce
  - auth
  - memory-leak
  - ttl
  - challenge-response
  - in-memory-store
applies_when:
  - "Holding short-lived tokens (challenges, nonces, OTPs, magic-link IDs) in a process-local Map without external persistence"
  - "The take/consume path is the only place expiry is checked — meaning never-consumed entries have no eviction path"
  - "Single-process deploys where reaching for Redis feels heavy but you still want the entries to actually disappear"
related_components:
  - backend
  - api
symptoms:
  - "process RSS grows monotonically across the day in the auth route handler's owning process"
  - "`nonces.size()` reported by a debug endpoint or a heap dump grows unbounded while active session count stays flat"
  - "TTL is set in code (e.g., 5 minutes) but eviction never fires for entries the client abandoned"
root_cause: incomplete_setup
resolution_type: code_fix
---

# In-memory nonce store needs an explicit TTL sweep — lazy delete-on-read leaks abandoned nonces

## Context

The Phase 2 auth route uses a challenge–response flow:

1. Client `POST /auth/challenge { address }` → server generates a 32-byte nonce, stores `{ address, expiresAt: now + 5min }` in an in-memory `Map`, returns the nonce
2. Client signs the nonce with their wallet
3. Client `POST /auth/verify { address, nonce, signature }` → server calls `nonces.take(nonce)`, which **removes** the entry, checks address match and expiry, validates the signature, and issues a JWT

The store implementation (backend/src/routes/auth.ts) uses **lazy delete-on-read**:

```ts
take(nonce) {
  const entry = map.get(nonce);
  if (!entry) return undefined;
  map.delete(nonce);                      // ← only deletes when read
  if (entry.expiresAt < now()) return undefined;
  return entry;
},
```

The design assumes every `put` eventually pairs with a `take`. That assumption holds for the happy path. It does **not** hold when:

- The user closes the tab between challenge and verify
- The wallet sign-message popup is rejected, and the client never retries the verify call
- A network blip drops the verify response and the client times out
- An adversary calls `/challenge` thousands of times to grow the map

For each of these, the entry stays in the `Map` forever. `Map` doesn't shrink on its own. The process accumulates orphan nonces at whatever rate the abandon-rate × challenge-rate produces. For a hackathon demo, the rate is trivial. For a deployed service running for weeks, this is a slow memory leak.

The fix: add a periodic sweep that walks the map and deletes expired entries. The decision was parked as a P1 review finding during Phase 2 code review — captured here so the next pass (or any future maintainer) doesn't re-discover the bug pattern.

## Guidance

**Pair every in-memory TTL store with one of:**

1. **A periodic sweep** — `setInterval`-based, hold a handle for shutdown
2. **External storage with native TTL** — Redis `EXPIRE`, Memcached, DynamoDB TTL
3. **A bounded LRU cache** — if you don't care which entries survive when memory is tight (works for caches, **not** for security tokens)

For short-lived auth tokens in a process-local Map, periodic sweep is the right answer. Redis is overkill for hackathon scope; LRU has wrong semantics for nonces (an attacker could push out a legitimate user's nonce by spamming).

**Minimum sweep pattern:**

```ts
// backend/src/routes/auth.ts
export function createInMemoryNonceStore(
  now: () => number = Date.now,
  sweepIntervalMs = 60_000,
): NonceStore & { stopSweep: () => void } {
  const map = new Map<string, NonceEntry>();

  const sweep = () => {
    const t = now();
    for (const [nonce, entry] of map) {
      if (entry.expiresAt < t) map.delete(nonce);
    }
  };

  const handle = setInterval(sweep, sweepIntervalMs);
  // Don't keep the event loop alive for the sweep alone.
  if (typeof handle === 'object' && 'unref' in handle) {
    (handle as { unref: () => void }).unref();
  }

  return {
    put(nonce, entry) { map.set(nonce, entry); },
    take(nonce) {
      const entry = map.get(nonce);
      if (!entry) return undefined;
      map.delete(nonce);
      if (entry.expiresAt < now()) return undefined;
      return entry;
    },
    size: () => map.size,
    stopSweep: () => clearInterval(handle),
  };
}
```

**The key details:**

- **Sweep interval ≪ TTL.** Nonce TTL is 5 min; sweep interval = 1 min gives ≤1 min of post-expiry residency at worst. If TTL is 10 min, sweep every 1-2 min. Don't sweep faster than O(TTL/5) — overkill burns CPU walking the map.
- **`unref()` the interval handle** so it doesn't block Node from exiting on shutdown. For Hono/Node servers, this is mandatory; otherwise `process.exit()` hangs until the next scheduled sweep.
- **Expose `stopSweep`** for tests and orderly shutdown. Vitest's `beforeEach`/`afterEach` lifecycle should `.stopSweep()` between test cases to avoid handle leaks across the test run.
- **The `take`-path expiry check stays** as belt-and-suspenders. A request can land in the same millisecond the sweep is running; the read-time check is the last line of defense.

## Why This Matters

1. **The leak is invisible in tests.** A single-request integration test calls `put` then `take` once and the Map empties. Test memory usage is flat. The leak only manifests under sustained abandon traffic — which test harnesses never produce. Memory-growth tests across many "abandoned" flows would surface it but rarely exist.

2. **No external alarm fires.** Process RSS grows but slowly enough that auto-scaling, error budgets, and SLO monitors won't trip. The first signal is usually OOM hours or days later — far from the change that introduced the pattern. Adding the sweep up front eliminates this whole class of incident.

3. **The fix is small enough that the absence is a tell.** When you see an in-memory TTL store with no sweep, assume the author either didn't think about it or knew their hot path always reads. Both cases deserve a 5-line addition; the former because it's a bug, the latter because the assumption can break later (e.g., a new route adds `put` without matching `take` discipline).

4. **`Map.size` is not free.** Some monitoring instinct says "expose `size()` as a metric." For very large maps in hot paths, `Map.size` is O(1) — fine. But scanning the map for stale entries during the sweep is O(n). At small sizes (hackathon scale, sub-10k entries) this is microseconds. At million-entry scale, you're already in Redis territory.

5. **External stores often win at scale anyway.** Redis with native `SETEX` solves this *and* handles multi-process, *and* survives restart, *and* gives you persistence-by-default if needed. The in-memory + sweep pattern is the right choice when the operational cost of adding Redis outweighs the leak risk — usually small deployments, single-process services, and prototypes.

## When to Apply

- Storing **any** TTL-bound entry in a `Map`, `Set`, or plain object — verify a sweep exists
- Reviewing a "challenge → response" route — confirm the challenge store evicts unread entries
- Code-review checklists for backend changes that introduce new in-memory state
- Migrating from in-memory to Redis later — the migration is smoother if the old code didn't rely on lazy-delete semantics that Redis doesn't share
- Onboarding to a new project — search the backend for `setInterval`; if there are none, all in-memory TTL stores are suspect

## Examples

### Before (Phase 2 current state — parked P1)

```ts
// backend/src/routes/auth.ts (current)
export function createInMemoryNonceStore(now: () => number = Date.now): NonceStore {
  const map = new Map<string, NonceEntry>();
  return {
    put(nonce, entry) { map.set(nonce, entry); },
    take(nonce) {
      const entry = map.get(nonce);
      if (!entry) return undefined;
      map.delete(nonce);
      if (entry.expiresAt < now()) return undefined;
      return entry;
    },
    size: () => map.size,
  };
}
```

Works for the demo flow; leaks under any abandon traffic.

### After (P1 polish target)

The pattern above — `setInterval` sweep, `unref`, exposed `stopSweep`. Adds ~15 LOC. Tests need an `afterEach(() => store.stopSweep())` to keep Node handles clean.

### Regression test

```ts
// backend/src/routes/auth.test.ts
it('sweeps expired nonces from the in-memory store', async () => {
  const fakeNow = vi.fn(() => 1_000_000);
  const store = createInMemoryNonceStore(fakeNow, /* sweepIntervalMs */ 50);

  store.put('a', { address: '0xaaaa', expiresAt: 999_999 });    // already expired
  store.put('b', { address: '0xbbbb', expiresAt: 2_000_000 });  // valid
  expect(store.size()).toBe(2);

  await new Promise((r) => setTimeout(r, 80));   // let sweep tick

  expect(store.size()).toBe(1);                  // 'a' swept
  store.stopSweep();
});
```

The fake `now` keeps the sweep deterministic; the real `setTimeout` lets the real `setInterval` fire once.

### What NOT to do

```ts
// ❌ Don't sweep in the request hot path
take(nonce) {
  // O(n) on every request — kills latency at scale
  for (const [k, v] of map) if (v.expiresAt < now()) map.delete(k);
  // ... real take logic
}
```

```ts
// ❌ Don't rely on a heartbeat from the client to drive sweep
// The whole point is to evict entries from clients that DON'T come back.
```

```ts
// ❌ Don't conflate sweep with `take`'s expiry check
// Both are needed: sweep stops the leak; take's check stops the race.
```

## Related Issues

- `backend/src/routes/auth.ts` lines 25-40 — the current implementation (sweep is the parked addition)
- Phase 2 code-review batch (`docs/plans/2026-05-14-002-feat-phase-2-sui-integration-plan.md` review pass) — flagged as P1, scheduled for the mechanical-polish batch
- `docs/spec.md` §2.6 (auth flow) — challenge/verify protocol semantics
- Hono context — single-process Node deploy posture; if/when the project moves to Cloudflare Workers or another multi-instance runtime, this store must move to durable storage (KV, Durable Objects) regardless
- Redis `SETEX` documentation — the natural next step if the project outgrows in-memory: https://redis.io/commands/setex/
