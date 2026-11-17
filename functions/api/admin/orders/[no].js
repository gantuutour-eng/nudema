import { dbFrom, ensureSchema, error, json } from '../../../_lib.js';
import { updateOrder } from '../../../_inventory.js';

export async function onRequestPatch(context) {
  try {
    const body = await context.request.json();
    const db = dbFrom(context); await ensureSchema(db);
    return json({ ok: true, ...await updateOrder(db, context.params.no, body.status) });
  } catch (cause) {
    return error(cause.status ? cause.message : 'Захиалгыг шинэчилж чадсангүй.', cause.status || 500);
  }
}
