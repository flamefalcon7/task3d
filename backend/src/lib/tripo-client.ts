const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

const DONE_STATUSES = new Set(['success', 'done', 'complete', 'completed']);
const FAIL_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled']);

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class TripoAuthError extends Error {
  constructor(message = 'Tripo API authentication failed (401)') {
    super(message);
    this.name = 'TripoAuthError';
  }
}

export class TripoTimeoutError extends Error {
  constructor(message = 'Tripo task polling timed out') {
    super(message);
    this.name = 'TripoTimeoutError';
  }
}

export class TripoFailedError extends Error {
  constructor(message = 'Tripo task failed') {
    super(message);
    this.name = 'TripoFailedError';
  }
}

export class TripoFormatError extends Error {
  constructor(message = 'Tripo response missing expected fields') {
    super(message);
    this.name = 'TripoFormatError';
  }
}

interface PollOpts {
  maxWaitMs?: number;
  // Injectable for tests so fake-timers can advance without real wall clock.
  sleep?: (ms: number) => Promise<void>;
}

interface ClientOpts {
  /** Per-request HTTP timeout (AbortSignal). Distinct from pollTask's maxWaitMs which bounds the whole loop. Default 30s. */
  requestTimeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

export class TripoClient {
  private requestTimeoutMs: number;

  constructor(private apiKey: string, opts: ClientOpts = {}) {
    if (!apiKey) throw new Error('TRIPO_API_KEY required');
    this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private signal(): AbortSignal {
    // AbortSignal.timeout(ms) auto-aborts at ms. Node 22 LTS supports it natively.
    return AbortSignal.timeout(this.requestTimeoutMs);
  }

  async submitTask(prompt: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${TRIPO_BASE}/task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          type: 'text_to_model',
          // D-024: Turbo-v1.0 over v2.5/v3.0/P1 for speed+cost (≈15s, ≈15cr).
          // Quality acceptable for racing-car base mesh; backend material-swap
          // produces N variants downstream, so per-call quality<<perceived speed.
          model_version: 'Turbo-v1.0-20250506',
          prompt,
          face_limit: 5000,
          texture: false,
          output_format: 'glb',
        }),
        signal: this.signal(),
      });
    } catch (e) {
      if (isAbortError(e)) {
        throw new TripoTimeoutError(`Tripo submitTask timed out after ${this.requestTimeoutMs}ms`);
      }
      throw e;
    }

    if (res.status === 401) throw new TripoAuthError();
    if (!res.ok) {
      // Truncate so a CloudFlare/nginx 5xx HTML page (typically 10-50 KB)
      // doesn't bloat error logs or fill structured-log fields. 200 chars
      // captures a JSON error object or the start of an HTML body.
      const errBody = (await res.text().catch(() => '')).slice(0, 200);
      throw new TripoFailedError(`Tripo submitTask returned ${res.status}: ${errBody}`);
    }

    const body = (await res.json()) as { data?: { task_id?: string } };
    const taskId = body?.data?.task_id;
    if (!taskId || typeof taskId !== 'string') {
      throw new TripoFormatError('Tripo submitTask response missing data.task_id');
    }
    return taskId;
  }

  async pollTask(taskId: string, opts: PollOpts = {}): Promise<{ url: string }> {
    const maxWaitMs = opts.maxWaitMs ?? 60_000;
    const sleep = opts.sleep ?? defaultSleep;
    const delays = [1000, 2000, 4000, 8000, 10_000];
    let elapsed = 0;
    let attempt = 0;

    while (elapsed < maxWaitMs) {
      let res: Response;
      try {
        res = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          signal: this.signal(),
        });
      } catch (e) {
        if (isAbortError(e)) {
          throw new TripoTimeoutError(
            `Tripo pollTask request timed out after ${this.requestTimeoutMs}ms (task ${taskId})`,
          );
        }
        throw e;
      }
      if (res.status === 401) throw new TripoAuthError();
      if (!res.ok) throw new TripoFailedError(`Tripo pollTask returned ${res.status}`);

      const body = (await res.json()) as {
        data?: {
          status?: string;
          output?: Record<string, unknown>;
        };
      };
      const status = (body?.data?.status ?? '').toLowerCase();

      if (DONE_STATUSES.has(status)) {
        const output = body?.data?.output ?? {};
        // Tripo's GLB URL field has shifted across API revisions; try the known
        // names in order of likelihood before declaring a format error.
        const url =
          (output.pbr_model as string | undefined) ||
          (output.glb_url as string | undefined) ||
          (output.model_url as string | undefined) ||
          (output.output_url as string | undefined);
        if (!url) throw new TripoFormatError('Tripo task done but no model URL field found');
        return { url };
      }
      if (FAIL_STATUSES.has(status)) {
        throw new TripoFailedError(`Tripo task ${taskId} status=${status}`);
      }

      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 10_000;
      const remaining = maxWaitMs - elapsed;
      if (delay >= remaining) break;
      await sleep(delay);
      elapsed += delay;
      attempt += 1;
    }

    throw new TripoTimeoutError(`Tripo task ${taskId} did not finish within ${maxWaitMs}ms`);
  }

  async downloadGlb(url: string): Promise<Uint8Array> {
    let res: Response;
    try {
      res = await fetch(url, { signal: this.signal() });
    } catch (e) {
      if (isAbortError(e)) {
        throw new TripoTimeoutError(`Tripo downloadGlb timed out after ${this.requestTimeoutMs}ms`);
      }
      throw e;
    }
    if (!res.ok) throw new TripoFailedError(`Tripo downloadGlb returned ${res.status}`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}
