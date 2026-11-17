import {
  ADMIN_STATE_NAMES,
  dbFrom,
  ensureSchema,
  json,
  error,
  writeState,
} from '../../../_lib.js';
import { validateProducts, validateTaxonomy } from '../../../_catalog.js';
import { saveProducts } from '../../../_inventory.js';

export async function onRequestPut(context) {
  try {
    const name = context.params.name;
    if (!ADMIN_STATE_NAMES.includes(name)) return error('Unknown store name.', 404);
    if (name === 'orders' || name === 'statuses') return error('Админ хуудсыг шинэчлээд захиалгын төлөвийг дахин сонгоно уу.', 409);

    const body = await context.request.json();
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'value')) {
      return error('A value is required.');
    }

    const issue = name === 'products' ? validateProducts(body.value) : name === 'taxonomy' ? validateTaxonomy(body.value) : '';
    if (issue) return error(issue);

    const db = dbFrom(context);
    await ensureSchema(db);
    if (name === 'products') {
      const products = await saveProducts(db, body.value, body.stockBefore);
      return json({ ok: true, name, products });
    } else {
      await writeState(db, name, body.value);
    }

    return json({ ok: true, name });
  } catch (cause) {
    if (cause.status) return error(cause.message, cause.status);
    return error('Could not save data.', 500, cause.message);
  }
}
