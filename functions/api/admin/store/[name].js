import {
  ADMIN_STATE_NAMES,
  dbFrom,
  ensureSchema,
  json,
  error,
  writeState,
  replaceOrders,
} from '../../../_lib.js';
import { validateProducts, validateTaxonomy } from '../../../_catalog.js';

export async function onRequestPut(context) {
  try {
    const name = context.params.name;
    if (!ADMIN_STATE_NAMES.includes(name)) return error('Unknown store name.', 404);

    const body = await context.request.json();
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'value')) {
      return error('A value is required.');
    }

    const issue = name === 'products' ? validateProducts(body.value) : name === 'taxonomy' ? validateTaxonomy(body.value) : '';
    if (issue) return error(issue);

    const db = dbFrom(context);
    await ensureSchema(db);
    if (name === 'orders') {
      if (!Array.isArray(body.value)) return error('orders must be an array.');
      await replaceOrders(db, body.value);
    } else {
      await writeState(db, name, body.value);
    }

    return json({ ok: true, name });
  } catch (cause) {
    return error('Could not save data.', 500, cause.message);
  }
}
