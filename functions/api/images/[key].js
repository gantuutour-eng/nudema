import { error } from '../../_lib.js';

export async function onRequestGet(context) {
  try {
    const bucket = context.env && context.env.IMAGES;
    if (!bucket) return error('R2 binding "IMAGES" is not configured.', 503);

    const key = String(context.params.key || '');
    if (!/^[a-zA-Z0-9._-]{1,180}$/.test(key)) return error('Invalid image key.', 400);

    // Public uploads have immutable, unique keys. Reuse them at the edge without
    // carrying customer cookies or caching any account/catalog API response.
    const edge = typeof caches !== 'undefined' ? caches.default : null;
    const imageUrl = new URL(context.request.url);
    imageUrl.search = '';
    const cacheKey = new Request(imageUrl.toString());
    if (edge) {
      const cached = await edge.match(cacheKey).catch(() => null);
      if (cached) return cached;
    }

    const object = await bucket.get(key);
    if (!object) return error('Image not found.', 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');
    if (Number.isFinite(object.size)) headers.set('Content-Length', String(object.size));
    const response = new Response(object.body, { headers });
    if (edge && context.waitUntil) context.waitUntil(edge.put(cacheKey, response.clone()).catch(() => {}));
    return response;
  } catch (cause) {
    return error('Could not load the image.', 500, cause.message);
  }
}

