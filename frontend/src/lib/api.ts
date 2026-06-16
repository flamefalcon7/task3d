import type {
  GenerateDispatchResponse,
  GenerateJobResult,
  LineageRecord,
  TripoParams,
} from '@overflow2026/shared';

export interface GenerateResult {
  glbBytes: Uint8Array;
  lineageJson: Uint8Array;
  lineageStub: Partial<LineageRecord>;
}

/** A classified /api/generate failure (U6/D-083). Carries the backend's typed
 *  `error` code + HTTP status + the post-payment `refundable` flag so the page can
 *  branch to honest copy without regex-matching a raw string. */
export class GenerateError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly refundable: boolean = false,
  ) {
    super(`generate_error:${code}`);
    this.name = 'GenerateError';
  }
}

/** Pre-flight availability result (U4). `available` is the only signal the client
 *  acts on; `reason` is qualitative (never a credit level). `network` is set by the
 *  client when the pre-flight request itself failed (distinct from a balance-dry
 *  server answer). */
export interface PreflightResult {
  available: boolean;
  reason?: string;
}

/**
 * Ask the backend whether a generation can be attempted BEFORE charging the SUI fee
 * (R1). Never throws for a normal unavailable answer — returns `{available:false}`.
 * Throws GenerateError(401) on an expired session so the caller can re-gate; a
 * network failure resolves to `{available:false, reason:'network'}` (fail-closed,
 * no charge).
 */
export async function preflightGenerate(authToken?: string): Promise<PreflightResult> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  let res: Response;
  try {
    res = await fetch('/api/generate/preflight', { method: 'GET', headers });
  } catch {
    return { available: false, reason: 'network' };
  }
  if (res.status === 401) throw new GenerateError('auth_invalid', 401);
  if (!res.ok) return { available: false, reason: 'unknown' };
  try {
    return (await res.json()) as PreflightResult;
  } catch {
    return { available: false, reason: 'network' };
  }
}

export async function generate(
  // D-033: Tripo prompt-mode is the only generation path. The backend reads
  // `prompt` off the body; we send the full TripoParams for forward-compat.
  params: TripoParams,
  // Prompt mode is JWT-gated — caller passes session.jwt.
  authToken?: string,
  // D-034: prompt-mode SUI service-fee proof (tx digest). Merged into the body
  // so the backend pay-gate can verify it before calling Tripo.
  paymentDigest?: string,
): Promise<GenerateResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  // D-106: dispatch. The backend verifies payment synchronously and returns a
  // jobId immediately; the ~7-min Tripo work runs in the background so no single
  // request crosses Cloudflare's ~100s proxy timeout. A non-2xx here is a
  // synchronous failure (auth / payment / validation) — surfaced as today.
  const requestBody = paymentDigest ? { ...params, paymentDigest } : params;
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw await toGenerateError(res);
  const { jobId } = (await res.json()) as GenerateDispatchResponse;

  // Poll the result endpoint until the job is terminal. Each request is fast, so
  // a multi-minute generation is a sequence of short polls, not one long request.
  const pollHeaders: Record<string, string> = {};
  if (authToken) pollHeaders.Authorization = `Bearer ${authToken}`;
  const POLL_INTERVAL_MS = 3000;
  const deadline = Date.now() + 8 * 60 * 1000; // > the ~7-min backend Tripo budget

  // Poll first, sleep only while still pending — so a fast (or mocked) result
  // returns without waiting an interval.
  while (Date.now() < deadline) {
    let pres: Response | undefined;
    try {
      pres = await fetch(`/api/generate/result/${jobId}`, { headers: pollHeaders });
    } catch {
      // transient network blip — fall through to the wait + retry
    }
    if (pres) {
      if (pres.status === 401) throw new GenerateError('auth_invalid', 401);
      if (pres.status === 404) throw new GenerateError('job_not_found', 404);
      if (pres.ok) {
        let body: GenerateJobResult | undefined;
        try {
          body = (await pres.json()) as GenerateJobResult;
        } catch {
          /* unparseable — retry */
        }
        if (body && body.status === 'error') {
          throw new GenerateError(body.error, 502, body.refundable === true);
        }
        if (body && body.status === 'done') {
          return {
            glbBytes: base64ToBytes(body.glbBytes),
            lineageJson: new TextEncoder().encode(body.lineageJson),
            lineageStub: body.lineageStub,
          };
        }
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new GenerateError('tripo_timeout', 504, !!paymentDigest);
}

/** Parse a non-2xx /api/generate response into a classified GenerateError. */
async function toGenerateError(res: Response): Promise<GenerateError> {
  let code = 'unknown';
  let refundable = false;
  try {
    const j = (await res.json()) as { error?: unknown; refundable?: unknown };
    if (typeof j.error === 'string') code = j.error;
    if (j.refundable === true) refundable = true;
  } catch {
    /* non-JSON body — keep the generic code */
  }
  return new GenerateError(code, res.status, refundable);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
