import { error } from '../../_lib.js';

export async function onRequestGet(context) {
  try {
    const bucket = context.env && context.env.IMAGES;
    if (!bucket) return error('R2 binding "IMAGES" is not configured.', 503);

    const key = String(context.params.key || '');
    if (!/^[a-zA-Z0-9._-]{1,180}$/.test(key)) return error('Invalid image key.', 400);

    const object = await bucket.get(key);
    if (!object) return error('Image not found.', 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { headers });
  } catch (cause) {
    return error('Could not load the image.', 500, cause.message);
  }
}

