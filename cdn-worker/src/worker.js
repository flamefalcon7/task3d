/**
 * Tusk3D Walrus read-path CDN — Cloudflare Worker (Method B, D-073 / plan-018).
 *
 * Fronts a public Walrus aggregator at cdn.tusk3d.space. A server-side fetch()
 * to the aggregator uses the aggregator's OWN host/SNI, which sidesteps the two
 * reasons Method A (a proxied CNAME) was impossible:
 *   1. the aggregator is itself on Cloudflare -> a proxied cross-account CNAME
 *      triggers Error 1014 "CNAME Cross-User Banned";
 *   2. the aggregator returns 403 to an unrecognized Host header (which a CF
 *      reverse proxy would forward).
 *
 * Walrus blob content is immutable (content-addressed by blob ID), so successful
 * reads are cached in the edge Cache API with a 1-year immutable TTL. The blob ID
 * in the path IS the cache key; no invalidation is ever needed.
 *
 * Scope: read path only. GET|HEAD on /v1/blobs/* . Everything else 404s.
 */

const DEFAULT_AGGREGATORS = ['https://aggregator.walrus-testnet.walrus.space'];

// Successful immutable reads cache for one year.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function aggregatorsFrom(env) {
  const raw = env && typeof env.WALRUS_AGGREGATORS === 'string' ? env.WALRUS_AGGREGATORS : '';
  const list = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length ? list : DEFAULT_AGGREGATORS;
}

/** Drop a body for HEAD while preserving status + headers. */
function headOf(resp) {
  return new Response(null, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
}

export default {
  async fetch(request, env, ctx) {
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    const url = new URL(request.url);
    // Only the Walrus blob read endpoints are proxied.
    if (!url.pathname.startsWith('/v1/blobs/')) {
      return new Response('Not Found', { status: 404 });
    }

    const cache = caches.default;
    // Cache key is always a GET on this URL — the path identifies immutable content.
    const cacheKey = new Request(url.toString(), { method: 'GET' });

    const hit = await cache.match(cacheKey);
    if (hit) {
      const resp = new Response(hit.body, hit);
      resp.headers.set('x-tusk-cache', 'HIT');
      return method === 'HEAD' ? headOf(resp) : resp;
    }

    const aggregators = aggregatorsFrom(env);
    let lastError = 'no aggregators configured';

    for (const base of aggregators) {
      const originUrl = base + url.pathname + url.search;
      try {
        // Outbound subrequest: uses the aggregator's own host/SNI -> no 403, no 1014.
        const origin = await fetch(originUrl, { method: 'GET', headers: { accept: '*/*' } });

        if (origin.ok) {
          const resp = new Response(origin.body, origin);
          resp.headers.set('cache-control', IMMUTABLE_CACHE_CONTROL);
          resp.headers.set('x-tusk-cache', 'MISS');
          resp.headers.set('x-tusk-origin', base);
          resp.headers.delete('set-cookie');
          // Populate the edge cache without blocking the response.
          ctx.waitUntil(cache.put(cacheKey, resp.clone()));
          return method === 'HEAD' ? headOf(resp) : resp;
        }

        // A 404 means the blob is genuinely absent — failing over won't help.
        if (origin.status === 404) {
          return new Response('Blob not found', {
            status: 404,
            headers: { 'x-tusk-origin': base, 'cache-control': 'no-store' },
          });
        }

        // Any other non-OK status: record and try the next aggregator.
        lastError = `origin ${base} -> HTTP ${origin.status}`;
      } catch (err) {
        lastError = `origin ${base} threw: ${err}`;
      }
    }

    return new Response(`Bad Gateway: all aggregators failed (${lastError})`, {
      status: 502,
      headers: { 'cache-control': 'no-store' },
    });
  },
};
