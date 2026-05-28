// plan-019 U1 — Shared Walrus blob fetch helper with a configurable timeout
// and external AbortSignal support. Lifts the `withFetchTimeout` pattern from
// `frontend/src/market/useListings.ts:78-96` into a reusable module and wraps
// the surrounding fetch + ArrayBuffer conversion + error-classification so
// callers (S1 lede, future Walrus read paths) can distinguish a timeout from
// an externally-driven abort without parsing error messages.
//
// Error contract:
//   - WalrusFetchTimeoutError → AbortSignal.timeout(timeoutMs) fired.
//   - WalrusFetchAbortedError → caller-supplied AbortSignal fired.
//   - generic Error → non-2xx HTTP status (carries status + URL) or a
//     network-layer failure that wasn't an abort.

/** Thrown when the internal `AbortSignal.timeout(timeoutMs)` fires before the
 * fetch resolves. Callers (e.g. the S1 lede) use this to swap to an embedded
 * GLB fallback while keeping generic network failures distinct. */
export class WalrusFetchTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`Walrus fetch timed out after ${timeoutMs}ms: ${url}`);
    this.name = 'WalrusFetchTimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

/** Thrown when the caller-supplied external AbortSignal fires before the fetch
 * resolves (e.g. the consuming component unmounts mid-flight). Distinct from
 * the timeout case so cleanup paths can no-op silently. */
export class WalrusFetchAbortedError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`Walrus fetch aborted by caller: ${url}`);
    this.name = 'WalrusFetchAbortedError';
  }
}

interface FetchBlobOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

/** Combine the external caller signal (if any) with an internal timeout
 * signal. Prefers `AbortSignal.any` (modern browsers + Node 20.3+); falls back
 * to a manual merge for jsdom, which does not expose `AbortSignal.any`.
 *
 * The fallback's merged signal aborts with the FIRST source signal's reason,
 * so the caller can still inspect the timeout vs external signals directly to
 * classify the error (see `classifyAbort` below). */
function mergeSignals(external: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (!external) return timeout;
  const anyFn = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (typeof anyFn === 'function') return anyFn.call(AbortSignal, [external, timeout]);
  const merged = new AbortController();
  const forward = (src: AbortSignal) => {
    if (src.aborted) {
      merged.abort(src.reason);
      return;
    }
    src.addEventListener('abort', () => merged.abort(src.reason), { once: true });
  };
  forward(external);
  forward(timeout);
  return merged.signal;
}

/** Decide which signal triggered the abort. We do not trust the merged
 * signal's `reason` — the manual-merge fallback's reason is the first source's
 * reason, but the native `AbortSignal.any` propagates whichever fired first.
 * Inspecting each source signal directly is the only portable answer. */
function classifyAbort(
  url: string,
  timeoutMs: number,
  external: AbortSignal | undefined,
  timeout: AbortSignal,
): Error {
  if (external?.aborted) return new WalrusFetchAbortedError(url);
  if (timeout.aborted) return new WalrusFetchTimeoutError(url, timeoutMs);
  // Shouldn't happen — fetch raised AbortError but neither tracked signal
  // shows aborted. Fall back to the timeout error so the caller still gets a
  // typed failure.
  return new WalrusFetchTimeoutError(url, timeoutMs);
}

/** Fetch a Walrus blob (or any URL) as an ArrayBuffer, rejecting with typed
 * errors on timeout vs external abort. On non-2xx responses, rejects with a
 * generic Error carrying the HTTP status and URL for diagnostic context. */
export async function fetchBlobWithTimeout(
  url: string,
  opts: FetchBlobOptions,
): Promise<ArrayBuffer> {
  const { timeoutMs, signal: external } = opts;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const merged = mergeSignals(external, timeoutSignal);

  let response: Response;
  try {
    response = await fetch(url, { signal: merged });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw classifyAbort(url, timeoutMs, external, timeoutSignal);
    }
    // Some runtimes surface AbortSignal.timeout as a TimeoutError instead of
    // AbortError; check the tracked signals defensively before rethrowing.
    if (external?.aborted) throw new WalrusFetchAbortedError(url);
    if (timeoutSignal.aborted) throw new WalrusFetchTimeoutError(url, timeoutMs);
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Walrus fetch failed: HTTP ${response.status} ${url}`);
  }

  return await response.arrayBuffer();
}
