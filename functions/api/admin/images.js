import { json, error } from '../../_lib.js';

export async function onRequestPost(context) {
  try {
    const bucket = context.env && context.env.IMAGES;
    if (!bucket) return error('R2 binding "IMAGES" is not configured.', 503);

    const form = await context.request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return error('An image file is required.');
    if (file.type !== 'image/webp') return error('Only optimized WebP images are allowed.');
    if (file.size > 12 * 1024 * 1024) return error('The image must be smaller than 12MB.');

    const bytes = await file.arrayBuffer();
    const signature = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
    const ascii = String.fromCharCode(...signature);
    if (signature.length < 12 || ascii.slice(0, 4) !== 'RIFF' || ascii.slice(8, 12) !== 'WEBP') {
      return error('The uploaded file is not a valid WebP image.');
    }

    const id = crypto.randomUUID().replaceAll('-', '');
    const key = `${Date.now()}-${id}.webp`;
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: {
        uploadedBy: context.data.admin && context.data.admin.email ? context.data.admin.email : 'local-admin',
        originalName: String(file.name || '').slice(0, 180),
      },
    });

    return json({ ok: true, key, url: `/api/images/${encodeURIComponent(key)}` }, 201);
  } catch (cause) {
    return error('Could not upload the image.', 500, cause.message);
  }
}
