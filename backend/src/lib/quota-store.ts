// Durable quota store (plan-002 U1, D-083) — the backend's first persistent store.
//
// A tiny SYNCHRONOUS persistence primitive over `node:sqlite` (flag-free on the
// deploy's Node 22.22.3) holding the only state that must survive restart/redeploy:
//   - the cached spendable Tripo balance (synced by the U4 poller, read by the
//     pre-flight),
//   - per-day Gemini usage counters keyed by (capability, scope, day) so the
//     operator budget (R9, scope='global') and the optional per-address cap
//     (R8, scope=address) share one schema with no later migration, and
//   - per-capability Gemini cooldown + last-seen rate-limit header enrichment.
//
// Synchronous on purpose: `DatabaseSync` keeps the rate-limiter call sites (which
// are synchronous) synchronous, and avoids a native-addon cross-arch build (dev
// macOS arm64 → Linux x64 deploy). Cost: one suppressible ExperimentalWarning.
//
// Lifecycle (R12): NEVER opened at module top-level import. The factory
// `buildQuotaStore({ path })` is the primary seam tests use (`:memory:`); the live
// process resolves exactly ONE shared instance via `getQuotaStore()` and injects
// it into the poller (U4) + Gemini clients (U2) + routes (U3) — the
// single-connection invariant. Do not open a second handle on the same file.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// `node:sqlite` is experimental and absent from `module.builtinModules`, so Vite's
// dep scanner (used by vitest) fails to externalize it — and the scanner matches the
// specifier TEXT even in a type-only import or a `typeof import(...)` cast. So we
// avoid every textual occurrence of the specifier: load it via createRequire with a
// computed (non-literal) string, and hand-declare the tiny slice of the API we use.
interface SqliteStatement {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
interface SqliteDatabaseCtor {
  new (path: string): SqliteDatabase;
}

const nodeRequire = createRequire(import.meta.url);
const SQLITE_MODULE = ['node', 'sqlite'].join(':');
const { DatabaseSync } = nodeRequire(SQLITE_MODULE) as { DatabaseSync: SqliteDatabaseCtor };

/** A Gemini-using feature; a store-key discriminator, not a feature flag. */
export type Capability = 'copilot' | 'caption';

/** The operator-wide usage bucket (R9). Address scopes (R8) are the only other kind. */
export const GLOBAL_SCOPE = 'global';

export interface TripoBalance {
  /** spendable = balance − frozen, in Tripo credits. */
  spendable: number;
  /** epoch ms the balance was synced. */
  syncedAt: number;
}

export interface GeminiState {
  /** Usage count for the queried (capability, scope, today). */
  dailyCount: number;
  /** Active cooldown end (epoch ms), or null when none/expired. */
  cooldownUntil: number | null;
  /** Last-seen `x-ratelimit-remaining` (header enrichment), or null. */
  remaining: number | null;
  /** Last-seen reset (epoch ms) from headers, or null. */
  resetAt: number | null;
}

export interface GeminiQueryOpts {
  /** Injectable clock for deterministic rollover/cooldown tests. */
  now?: number;
  /** Usage bucket; defaults to the global operator budget. */
  scope?: string;
}

export interface QuotaStore {
  getTripoBalance(): TripoBalance | null;
  setTripoBalance(spendable: number, syncedAt: number): void;
  getGeminiState(capability: Capability, opts?: GeminiQueryOpts): GeminiState;
  recordGeminiUsage(capability: Capability, opts?: GeminiQueryOpts): void;
  /** Set the authoritative recovery time (from a 429 reset). */
  setGeminiCooldown(capability: Capability, resetAt: number): void;
  /** Persist opportunistic header enrichment from a successful call. */
  setGeminiRemaining(capability: Capability, headers: { remaining: number; resetAt?: number }): void;
  close(): void;
}

export interface QuotaStoreOptions {
  /** SQLite file path, or ':memory:' for tests. */
  path: string;
}

/** UTC yyyymmdd bucket key. UTC is intentional — the 429 reset is the authoritative
 *  recovery signal (D-083); the self-count is only an operator-budget bound, so a
 *  wrong-boundary rollover at worst trips our own cap a few hours early/late. */
function dayKey(now: number): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function buildQuotaStore(opts: QuotaStoreOptions): QuotaStore {
  // Wrap open + schema init: a raw DB error can carry the filesystem path, which
  // must never reach a client response. Log server-side and rethrow a clean error.
  let db: SqliteDatabase;
  try {
    // node:sqlite creates the file but not its parent directory; ensure it exists
    // for real file paths so a fresh checkout / freshly-mounted volume works.
    if (opts.path !== ':memory:') {
      mkdirSync(dirname(opts.path), { recursive: true });
    }
    db = new DatabaseSync(opts.path);
    db.exec(`
      CREATE TABLE IF NOT EXISTS tripo_balance (
        id INTEGER PRIMARY KEY CHECK (id = 0),
        spendable INTEGER NOT NULL,
        synced_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS gemini_daily (
        capability TEXT NOT NULL,
        scope TEXT NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (capability, scope, day)
      );
      CREATE TABLE IF NOT EXISTS gemini_meta (
        capability TEXT PRIMARY KEY,
        cooldown_until INTEGER,
        remaining INTEGER,
        reset_at INTEGER
      );
    `);
  } catch (e) {
    console.error('[quota-store] failed to open/init DB (degraded):', e instanceof Error ? e.message : e);
    throw new Error('quota store unavailable');
  }

  const balanceGet = db.prepare('SELECT spendable, synced_at FROM tripo_balance WHERE id = 0');
  const balanceSet = db.prepare(
    `INSERT INTO tripo_balance (id, spendable, synced_at) VALUES (0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET spendable = excluded.spendable, synced_at = excluded.synced_at`,
  );
  const dailyGet = db.prepare(
    'SELECT count FROM gemini_daily WHERE capability = ? AND scope = ? AND day = ?',
  );
  const dailyInc = db.prepare(
    `INSERT INTO gemini_daily (capability, scope, day, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(capability, scope, day) DO UPDATE SET count = count + 1`,
  );
  const metaGet = db.prepare(
    'SELECT cooldown_until, remaining, reset_at FROM gemini_meta WHERE capability = ?',
  );
  const cooldownSet = db.prepare(
    `INSERT INTO gemini_meta (capability, cooldown_until) VALUES (?, ?)
     ON CONFLICT(capability) DO UPDATE SET cooldown_until = excluded.cooldown_until`,
  );
  const remainingSet = db.prepare(
    `INSERT INTO gemini_meta (capability, remaining, reset_at) VALUES (?, ?, ?)
     ON CONFLICT(capability) DO UPDATE SET remaining = excluded.remaining, reset_at = excluded.reset_at`,
  );

  return {
    getTripoBalance(): TripoBalance | null {
      const row = balanceGet.get() as { spendable: number; synced_at: number } | undefined;
      if (!row) return null;
      return { spendable: row.spendable, syncedAt: row.synced_at };
    },

    setTripoBalance(spendable: number, syncedAt: number): void {
      balanceSet.run(spendable, syncedAt);
    },

    getGeminiState(capability, queryOpts = {}): GeminiState {
      const now = queryOpts.now ?? Date.now();
      const scope = queryOpts.scope ?? GLOBAL_SCOPE;
      const dailyRow = dailyGet.get(capability, scope, dayKey(now)) as { count: number } | undefined;
      const meta = metaGet.get(capability) as
        | { cooldown_until: number | null; remaining: number | null; reset_at: number | null }
        | undefined;
      const cooldownRaw = meta?.cooldown_until ?? null;
      return {
        dailyCount: dailyRow?.count ?? 0,
        // Expired cooldowns read as not-in-cooldown so consumers need no clock logic.
        cooldownUntil: cooldownRaw !== null && cooldownRaw > now ? cooldownRaw : null,
        remaining: meta?.remaining ?? null,
        resetAt: meta?.reset_at ?? null,
      };
    },

    recordGeminiUsage(capability, queryOpts = {}): void {
      const now = queryOpts.now ?? Date.now();
      const scope = queryOpts.scope ?? GLOBAL_SCOPE;
      dailyInc.run(capability, scope, dayKey(now));
    },

    setGeminiCooldown(capability, resetAt): void {
      cooldownSet.run(capability, resetAt);
    },

    setGeminiRemaining(capability, headers): void {
      remainingSet.run(capability, headers.remaining, headers.resetAt ?? null);
    },

    close(): void {
      db.close();
    },
  };
}

let cached: QuotaStore | null = null;

/** Default local DB path when TUSK_DB_PATH is unset. */
const DEFAULT_DB_PATH = './data/quota.db';

/** Lazily-constructed shared store from process.env (single-connection invariant).
 *  Mirrors getCopilotClient: never opened at import time (R12). */
export function getQuotaStore(): QuotaStore {
  if (!cached) {
    cached = buildQuotaStore({ path: process.env.TUSK_DB_PATH ?? DEFAULT_DB_PATH });
  }
  return cached;
}

/** Test-only: drop the memoized singleton (next getQuotaStore re-opens). */
export function resetQuotaStoreForTest(): void {
  if (cached) {
    try {
      cached.close();
    } catch {
      /* ignore */
    }
  }
  cached = null;
}
