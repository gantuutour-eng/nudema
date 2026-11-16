import { dbFrom, ensureSchema, json, error } from '../../_lib.js';
import { validateProducts, validateTaxonomy } from '../../_catalog.js';

export async function onRequestPut(context) {
  let body;
  try { body = await context.request.json(); } catch { return error('Invalid JSON.'); }
  if (!body) return error('Catalog data is required.');
  const issue = validateTaxonomy(body.taxonomy) || validateProducts(body.products);
  if (issue) return error(issue);
  if (body.products.some(p => !body.taxonomy.categories.includes(p.category))) return error('Бүтээгдэхүүний ангилал бүртгэлгүй байна. Ангиллын жагсаалтыг шинэчлээд дахин оролдоно уу.');
  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    await db.batch(['taxonomy', 'products'].map(name => db.prepare(
      `INSERT INTO app_state (name, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(name, JSON.stringify(body[name]))));
    return json({ ok: true });
  } catch (cause) {
    return error('Could not save catalog.', 500, cause.message);
  }
}
