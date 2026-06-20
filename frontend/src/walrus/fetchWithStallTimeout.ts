// Resilient Walrus aggregator read: a STALL-based timeout + bounded retry.
//
// WHY stall-based, not a fixed total deadline: the ciphertext is a quilt patch
// whose size tracks the GLB (envelope.ts — AES ciphertext ≈ plaintext), so a
// large model legitimately takes a while to download. A fixed total timeout
// would have to be set so wide (to not kill a big-but-healthy download) that it
// stops catching the failure we actually hit: the testnet aggregator opening
// the connection and then never sending bytes (curl shows `http_code=000`,
// hanging until the OS gives up). A stall timeout fires only when NO new bytes
// have arrived for `stallMs` — so a steadily-progressing large download is never
// killed, but a wedged connection is aborted promptly. This is the fix for the
// "decrypt spinner hangs forever with no error" report: the bare `fetch(url)`
// in the decrypt path had no timeout at all, so a wedged read never rejected and
// the UI never left its 'decrypting' state.

/** Tuning knobs. Defaults chosen for testnet: a healthy aggregator streams the
 *  ciphertext in well under 20s of *gap* between chunks; a wedged one sends
 *  nothing, so 20s of silence is a confident "this connection is dead". */
export interface StallTimeoutOpts {
  /** Abort if no new bytes arrive for this long (connect-to-first-byte counts
   *  too — the timer starts before the fetch resolves). Default 20000. */
  stallMs?: number;
  /** Extra attempts after the first (so 2 ⇒ up to 3 total). A wedged testnet
   *  read very often succeeds on the next try, which is exactly what the user
   *  saw doing it by hand. Default 2. */
  maxRetries?: number;
  /** Exponential backoff base between attempts: base * 2^(attempt-1). Default 800. */
  retryBackoffMs?: number;
  /** Absolute per-attempt ceiling, regardless of progress. The stall timer alone
   *  is necessary-but-not-sufficient: a connection that trickles 1 byte just
   *  under `stallMs` forever keeps resetting the stall timer and never completes
   *  (re-opening the very hang this module fixes). This caps a single attempt's
   *  total wall-clock so trickle/slowloris reads are aborted. Set wide enough to
   *  cover a healthy large-GLB download. Default 90000. */
  hardCapMs?: number;
}

// Tuned to a ~75s combined decrypt budget (key unwrap gets the other ~30s):
// stall 18s × 2 attempts ≈ 36s for a wedged read; the 45s hard cap bounds the
// rarer trickle case per attempt while still covering a healthy large-GLB pull.
const DEFAULT_STALL_MS = 18_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_BACKOFF_MS = 800;
const DEFAULT_HARD_CAP_MS = 45_000;

/** Thrown when a single attempt times out — either a stall (no bytes for
 *  `stallMs`) or the absolute per-attempt cap (`hardCapMs`, e.g. a trickle that
 *  never stalls but never finishes). Carries a user-facing message so the
 *  decrypt-failed UI can show something actionable rather than a raw AbortError. */
export class WalrusStallTimeoutError extends Error {
  constructor() {
    super(
      'Walrus storage timed out — the decentralized storage node may be slow ' +
        'right now; please retry.',
    );
    this.name = 'WalrusStallTimeoutError';
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A 4xx is a permanent answer (blob missing / bad id / forbidden) — retrying
 *  it just burns the stall budget N more times, so we surface it immediately.
 *  5xx, network errors, and stalls are transient → retried. */
function isPermanent(err: unknown): boolean {
  return err instanceof HttpStatusError && err.status >= 400 && err.status < 500;
}

class HttpStatusError extends Error {
  constructor(public readonly status: number) {
    super(`Walrus aggregator ${status} for the encrypted base`);
    this.name = 'HttpStatusError';
  }
}

/** One attempt: fetch under two timers — a stall timer that resets on every
 *  received chunk (catches a dead/wedged connection), and an absolute per-attempt
 *  cap that never resets (catches a trickle that keeps the stall timer alive but
 *  never finishes). Streams the body via a reader so a mid-download stall is
 *  caught, not just a connect stall. */
async function fetchOnce(
  url: string,
  stallMs: number,
  hardCapMs: number,
): Promise<Uint8Array> {
  const controller = new AbortController();
  let timedOut = false;
  const fail = (): void => {
    timedOut = true;
    controller.abort();
  };
  // Absolute ceiling — armed once, never reset.
  const hardTimer = setTimeout(fail, hardCapMs);
  let stallTimer: ReturnType<typeof setTimeout>;
  const armStall = (): void => {
    stallTimer = setTimeout(fail, stallMs);
  };
  const resetStall = (): void => {
    clearTimeout(stallTimer);
    armStall();
  };

  armStall(); // covers connect-to-first-byte
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new HttpStatusError(res.status);

    // No streamable body (some environments / test mocks): fall back to a single
    // buffered read. The per-chunk stall reset can't apply here, so clear the
    // stall timer and lean on the hard cap — otherwise a healthy-but-slow
    // buffered read would be killed at stallMs even while bytes flow.
    if (!res.body) {
      clearTimeout(stallTimer!);
      return new Uint8Array(await res.arrayBuffer());
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        resetStall(); // progress — keep the connection alive
        chunks.push(value);
        total += value.length;
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  } catch (err) {
    // An abort we triggered (stall OR hard cap) ⇒ a timeout; anything else
    // (network TypeError, HTTP status) propagates as-is for the retry layer.
    if (timedOut) throw new WalrusStallTimeoutError();
    throw err;
  } finally {
    clearTimeout(stallTimer!);
    clearTimeout(hardTimer);
  }
}

/**
 * Fetch bytes from a Walrus aggregator URL with a stall timeout and bounded
 * retry. Drop-in for a bare `fetch(url) → arrayBuffer`, but never hangs forever
 * and absorbs the testnet aggregator's intermittent wedged-connection failures.
 *
 * Throws (after exhausting retries) with a user-facing message — the decrypt
 * path surfaces `error.message` in its decrypt-failed state, so the user gets
 * "storage timed out, please retry" + the existing Retry button instead of an
 * eternal spinner.
 */
export async function fetchBytesWithStallTimeout(
  url: string,
  opts: StallTimeoutOpts = {},
): Promise<Uint8Array> {
  const stallMs = opts.stallMs ?? DEFAULT_STALL_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffMs = opts.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
  const hardCapMs = opts.hardCapMs ?? DEFAULT_HARD_CAP_MS;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchOnce(url, stallMs, hardCapMs);
    } catch (err) {
      lastErr = err;
      if (isPermanent(err) || attempt === maxRetries) break;
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? 'Walrus read failed'));
}
