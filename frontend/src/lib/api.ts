import type {
  GenerateParams,
  GenerateResponse,
  ShapeCatalog,
} from '@overflow2026/shared';

export async function fetchShapes(): Promise<ShapeCatalog> {
  const res = await fetch('/api/shapes');
  if (!res.ok) throw new Error(`fetchShapes: HTTP ${res.status}`);
  return (await res.json()) as ShapeCatalog;
}

export async function generate(params: GenerateParams): Promise<GenerateResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`generate: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as GenerateResponse;
}

export const previewUrl = (id: string) => `/api/preview/${encodeURIComponent(id)}`;
