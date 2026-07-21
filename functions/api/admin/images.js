import { json, error } from '../../_lib.js';

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function onRequestPost(context) {
  try {
    const bucket = context.env && context.env.IMAGES;
    if (!bucket) return error('R2 binding "IMAGES" is not configured.', 503);

    const form = await context.request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return error('An image file is required.');
    if (!TYPES[file.type]) return error('Only JPEG, PNG, WebP, and GIF images are allowed.');
    if (file.size > 12 * 1024 * 1024) return error('The image must be smaller than 12MB.');

    const id = crypto.randomUUID().replaceAll('-', '');
    const key = `${Date.now()}-${id}.${TYPES[file.type]}`;
    await bucket.put(key, file.stream(), {
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

