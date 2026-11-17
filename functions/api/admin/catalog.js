import { dbFrom, ensureSchema, json, error } from '../../_lib.js';
import { validateProducts, validateTaxonomy } from '../../_catalog.js';
import { saveProducts } from '../../_inventory.js';

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
    const products = await saveProducts(db, body.products, body.stockBefore, body.taxonomy);
    return json({ ok: true, products });
  } catch (cause) {
    if (cause.status) return error(cause.message, cause.status);
    return error('Could not save catalog.', 500, cause.message);
  }
}
