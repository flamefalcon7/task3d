# Plan — Async (dispatch + poll) Tripo generation (D-106)

**Problem**: live `/create` generation returns HTTP 524 — Tripo polls up to ~7 min but Cloudflare aborts proxied requests at ~100s. Make generation async so every HTTP hop is < 5s.

## Backend
- **`shared/src/types.ts`**: add `GenerateDispatchResponse { jobId }` and `GenerateJobResult` union (`pending` | `done` & GenerateResponse | `error`).
- **`backend/src/lib/generate-jobs.ts`** (new): in-memory `GenerateJobStore` — `create/setDone/setError/take`. Bounded: delete-on-fetch (terminal reads), TTL sweep (unref'd, 15 min), hard cap (30, oldest-eviction). Mirrors `auth.ts` nonce store.
- **`backend/src/routes/generate.ts`**: refactor.
  - `POST /` — body+schema+auth+**payment verify (sync, unchanged)** → `create(jobId, sub)` → `void runJob(...)` (fire-and-forget) → `202 { jobId }`.
  - `GET /result/:jobId` — JWT-gated, owner-scoped via `take()` → `404 job_not_found` / `403 forbidden` / `200 {status:'pending'|'done'+result|'error'+code+refundable}`.
  - `runJob()` holds the old try/catch generation + the D-083/U5 Tripo error taxonomy; writes terminal state into the store. Genuinely-unknown errors → `console.error` + `internal`.
- No `app.ts` / `server.ts` change (route owns its store; mount already covers `GET /api/generate/result/:jobId`; `/preflight` is a separate mount, no overlap).

## Frontend
- **`frontend/src/lib/api.ts`** `generate()`: `POST` → on `!ok` keep today's sync-error mapping; else read `{jobId}` → poll `GET /result/:jobId` every 3s up to 8 min → `pending` continue, `error` throw `GenerateError`, `done` return `GenerateResult`. 401→auth_invalid, transient network→keep polling, deadline→`tripo_timeout`.
- **`frontend/src/creator/CreateModelPage.tsx`**: unchanged logic (still `await generate()`, catch maps `GenerateError`); `genStatus='thinking'` spans the poll. (Progress % = post-submission polish.)

## Tests
- Update `backend/src/routes/generate.test.ts` to the dispatch+poll shape (POST→202 jobId; GET result states; owner scoping; payment-gate still pre-dispatch).
- `frontend` generate tests updated for the poll loop (injectable fetch / fake timers).

## Verify
- Local: typecheck + tests green.
- Deploy to VM (`deploy.sh`), then live: paid `/create` generation completes through `tusk3d.store` (no 524); `GET /result/:jobId` returns `done` with GLB.

## Accepted residual (D-106)
Backend restart mid-generation loses that in-flight job (digest already spent → refundable/contact path). Rare on single VM; deploy off-peak. Durable store = post-submission.
