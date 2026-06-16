// Cloudflare Pages Function — same-origin proxy for the browser app (D-105).
//
// The frontend calls the backend with RELATIVE paths (`fetch('/api/...')`); in
// dev these are proxied to localhost:3001 by Vite. In production the frontend is
// served by Cloudflare Pages at https://tusk3d.store, which has no backend — so
// this catch-all forwards every `/api/*` request to the DigitalOcean backend at
// https://api.tusk3d.store/api/*.
//
// Because the browser only ever talks to its own origin (tusk3d.store), there is
// NO cross-origin request and thus NO CORS preflight — the backend's CORS config
// is irrelevant to the browser app. Agents still hit api.tusk3d.store/mcp directly.
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  url.protocol = 'https:';
  url.hostname = 'api.tusk3d.store';
  url.port = '';
  // Preserve method, headers, and body; let the edge follow the proxied request.
  return fetch(new Request(url.toString(), request));
}
