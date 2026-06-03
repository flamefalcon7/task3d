// MemWal backend client wrapper (plan-001 U1, D-080).
//
// Fail-soft façade over `@mysten-incubation/memwal` (pinned 0.0.6). The SDK is a
// thin ed25519-signed HTTP client to the managed relayer (TEE does embedding /
// SEAL / Walrus) — verified by the U1 spike. The delegate key acts across ALL
// namespaces of the baked account, so this MUST stay server-side only.
//
// Corrections from the spike (see D-080 "U1 Spike Findings"):
//   - MemWalConfig is { key, accountId, serverUrl?, namespace? } — there is NO
//     `suiNetwork` field; network is implicit in the relayer URL.
//   - The live testnet relayer is https://relayer.dev.memwal.ai.
//
// Contract: memory ops never throw and never block the caller. `remember` is
// fire-and-forget; `recall` returns [] (with an internal `errored` flag for the
// operator health signal) on any failure or a ~2s timeout. Missing env → an
// inert no-op stub (logged once) so /create is unaffected when MemWal is unset.
import { MemWal } from '@mysten-incubation/memwal';
import type { RecallMemory } from '@mysten-incubation/memwal';

export type { RecallMemory };

/** Result of a recall: client results plus an operator-only error flag. */
export interface RecallOutcome {
  results: RecallMemory[];
  /** true when the relayer call failed/timed out (distinguishes error from a
   *  genuinely empty namespace; never surfaced to API clients). */
  errored: boolean;
}

export interface RecallOpts {
  limit?: number;
  maxDistance?: number;
}

export interface MemwalClient {
  /** Whether a real relayer client is wired (false → inert stub). */
  readonly configured: boolean;
  /** Fire-and-forget store. Resolves even on failure; never rejects. */
  remember(namespace: string, text: string): Promise<void>;
  /** Semantic recall scoped to `namespace`. Returns [] (errored) on failure. */
  recall(namespace: string, query: string, opts?: RecallOpts): Promise<RecallOutcome>;
}

/** The slice of the SDK surface we use — lets tests inject a fake. */
export interface MemwalLike {
  remember(text: string, namespace?: string): Promise<unknown>;
  recall(params: {
    query: string;
    namespace?: string;
    limit?: number;
    maxDistance?: number;
  }): Promise<{ results: RecallMemory[]; total: number }>;
}

export interface MemwalEnv {
  delegateKey?: string;
  accountId?: string;
  serverUrl?: string;
}

export interface MemwalDeps {
  /** Inject a fake SDK client (tests). Defaults to a real MemWal.create(). */
  sdk?: MemwalLike;
  /** Recall timeout budget (ms). Default 2000. */
  recallTimeoutMs?: number;
}

const DEFAULT_SERVER_URL = 'https://relayer.dev.memwal.ai';
const DEFAULT_RECALL_TIMEOUT_MS = 2000;

const loggedOnce = new Set<string>();
function logOnce(msg: string): void {
  if (loggedOnce.has(msg)) return;
  loggedOnce.add(msg);
  console.warn(`[memwal] ${msg}`);
}
function logError(op: string, e: unknown): void {
  console.warn(`[memwal] ${op} failed (fail-soft):`, e instanceof Error ? e.message : e);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const INERT_STUB: MemwalClient = {
  configured: false,
  async remember() {
    /* no-op */
  },
  async recall() {
    return { results: [], errored: false };
  },
};

/** Pure factory — builds a wrapper from explicit env (used by tests + the singleton). */
export function buildMemwalClient(env: MemwalEnv, deps: MemwalDeps = {}): MemwalClient {
  if (!env.delegateKey || !env.accountId) {
    logOnce('not configured (MEMWAL_DELEGATE_KEY / MEMWAL_ACCOUNT_ID unset) — memory features inert');
    return INERT_STUB;
  }

  const sdk: MemwalLike =
    deps.sdk ??
    (MemWal.create({
      key: env.delegateKey,
      accountId: env.accountId,
      serverUrl: env.serverUrl ?? DEFAULT_SERVER_URL,
    }) as unknown as MemwalLike);
  const recallTimeoutMs = deps.recallTimeoutMs ?? DEFAULT_RECALL_TIMEOUT_MS;

  return {
    configured: true,
    async remember(namespace, text) {
      try {
        // async-accepted variant: do NOT await the background job.
        await sdk.remember(text, namespace);
      } catch (e) {
        logError('remember', e);
      }
    },
    async recall(namespace, query, opts) {
      try {
        const res = await withTimeout(
          sdk.recall({ query, namespace, limit: opts?.limit, maxDistance: opts?.maxDistance }),
          recallTimeoutMs,
        );
        return { results: res.results ?? [], errored: false };
      } catch (e) {
        logError('recall', e);
        return { results: [], errored: true };
      }
    },
  };
}

let cached: MemwalClient | null = null;

/** Lazily-constructed shared client from process.env (mirrors sui/client.ts). */
export function getMemwalClient(): MemwalClient {
  if (!cached) {
    cached = buildMemwalClient({
      delegateKey: process.env.MEMWAL_DELEGATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl: process.env.MEMWAL_SERVER_URL,
    });
  }
  return cached;
}

/** Test-only: reset the memoized singleton. */
export function resetMemwalClientForTest(): void {
  cached = null;
}
