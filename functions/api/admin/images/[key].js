import { json, error } from '../../../_lib.js';

export async function onRequestDelete(context) {
  try {
    const bucket = context.env && context.env.IMAGES;
    if (!bucket) return error('R2 binding "IMAGES" is not configured.', 503);
    const key = String(context.params.key || '');
    if (!/^[a-zA-Z0-9._-]{1,180}$/.test(key)) return error('Invalid image key.', 400);
    await bucket.delete(key);
    return json({ ok: true, key });
  } catch (cause) {
    return error('Could not delete the image.', 500, cause.message);
  }
}

