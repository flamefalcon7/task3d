import type {
  GenerateResponse,
  LineageRecord,
  TripoParams,
} from '@overflow2026/shared';

export interface GenerateResult {
  glbBytes: Uint8Array;
  lineageJson: Uint8Array;
  lineageStub: Partial<LineageRecord>;
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

  const requestBody = paymentDigest ? { ...params, paymentDigest } : params;
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`generate: HTTP ${res.status} ${text}`);
  }
  const body = (await res.json()) as GenerateResponse;
  return {
    glbBytes: base64ToBytes(body.glbBytes),
    lineageJson: new TextEncoder().encode(body.lineageJson),
    lineageStub: body.lineageStub,
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
