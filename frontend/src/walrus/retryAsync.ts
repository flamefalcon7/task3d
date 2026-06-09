// Retry an IDEMPOTENT async op a few times with fixed backoff. Used to ride
// out transient Walrus relay / RPC timeouts on flaky testnet — the SDK arms an
// `AbortSignal.timeout(...)` on its requests (default 30s, we raise to 60s in
// walrusClient.ts) which surfaces as a DOMException `name: 'TimeoutError'`,
// message "signal timed out". D-101 made launches upload a single (bigger)
// quilt, so one relay write is more exposed to a slow-testnet moment; this lets
// it self-recover instead of dumping the error on the user.
//
// IMPORTANT: only wrap idempotent steps. The relay upload (`flow.upload`) is
// safe to repeat for an already-registered blob; the on-chain register/certify
// txs are NOT (they cost gas and would double-execute) — never retry those.

export interface RetryOptions {
  /** Total attempts including the first try. Default 3 (1 + 2 retries). */
  attempts?: number;
  /** Delay before each retry, in ms. Default 1500. */
  backoffMs?: number;
  /** Return true to retry on this error. Default: retry on anything. */
  shouldRetry?: (err: unknown) => boolean;
  /** Called before each retry (attempt = the try that just failed, 1-based). */
  onRetry?: (err: unknown, attempt: number) => void;
  /** Injectable sleep (tests pass a no-op to avoid real timers). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const backoffMs = opts.backoffMs ?? 1500;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !shouldRetry(err)) throw err;
      opts.onRetry?.(err, attempt);
      if (backoffMs > 0) await sleep(backoffMs);
    }
  }
  throw lastErr;
}

/**
 * True for transient network/timeout errors that are safe to retry on an
 * idempotent op. Matches the SDK's `AbortSignal.timeout` DOMException
 * (`name: 'TimeoutError'` / "signal timed out"), the SDK's
 * `RetryableWalrusClientError`, and common connection-level failures.
 */
export function isRetryableUploadError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: unknown }).name;
  const rawMsg = (err as { message?: unknown }).message;
  const msg = typeof rawMsg === 'string' ? rawMsg : String(err);
  if (name === 'TimeoutError' || name === 'RetryableWalrusClientError') return true;
  return /timed out|timeout|network|fetch failed|connection|econnreset|socket hang up/i.test(
    msg,
  );
}
