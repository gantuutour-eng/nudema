import { dbFrom, ensureSchema, readState } from './_lib.js';

const SITE_ORIGIN = 'https://nudema-mongolia.com';
const STATIC_URLS = [
  '/',
  '/Nudema%20Search.dc',
  '/Nudema%20Privacy.dc',
  '/Nudema%20Terms.dc',
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sitemapEntry(url, lastModified = '') {
  const lastmod = lastModified ? `<lastmod>${escapeXml(String(lastModified).slice(0, 10))}</lastmod>` : '';
  return `<url><loc>${escapeXml(url)}</loc>${lastmod}</url>`;
}

export async function onRequestGet(context) {
  let products = [];
  let productsUpdatedAt = '';

  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    const state = await readState(db, ['products']);
    products = Array.isArray(state.data.products) ? state.data.products : [];
    productsUpdatedAt = state.updatedAt.products || '';
  } catch {
    // Keep the static sitemap available even if D1 is temporarily unavailable.
  }

  const entries = STATIC_URLS.map((path) => sitemapEntry(`${SITE_ORIGIN}${path}`));
  for (const product of products) {
    const id = Number(product && product.id);
    if (!Number.isFinite(id) || id < 1 || !String(product.title || '').trim()) continue;
    entries.push(sitemapEntry(
      `${SITE_ORIGIN}/Nudema%20Product.dc?id=${encodeURIComponent(id)}`,
      productsUpdatedAt,
    ));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join('')}</urlset>\n`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
