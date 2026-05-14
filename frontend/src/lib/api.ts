import type {
  GenerateParams,
  GenerateResponse,
  LineageRecord,
  ShapeCatalog,
} from '@overflow2026/shared';

export interface GenerateResult {
  glbBytes: Uint8Array;
  lineageJson: Uint8Array;
  lineageStub: Partial<LineageRecord>;
}

export async function fetchShapes(): Promise<ShapeCatalog> {
  const res = await fetch('/api/shapes');
  if (!res.ok) throw new Error(`fetchShapes: HTTP ${res.status}`);
  return (await res.json()) as ShapeCatalog;
}

export async function generate(params: GenerateParams): Promise<GenerateResult> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
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
