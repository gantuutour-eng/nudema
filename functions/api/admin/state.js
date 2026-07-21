import {
  ADMIN_STATE_NAMES,
  dbFrom,
  ensureSchema,
  json,
  error,
  readState,
  readOrders,
  writeState,
  replaceOrders,
} from '../../_lib.js';

export async function onRequestGet(context) {
  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    const storedNames = ADMIN_STATE_NAMES.filter((name) => name !== 'orders');
    const state = await readState(db, storedNames);
    state.data.orders = await readOrders(db);
    return json({
      ok: true,
      ...state,
      empty: Object.keys(state.data).filter((name) => name !== 'orders').length === 0 && state.data.orders.length === 0,
    });
  } catch (cause) {
    return error('Admin data is temporarily unavailable.', 503, cause.message);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const data = body && body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return error('A data object is required.');
    }

    const db = dbFrom(context);
    await ensureSchema(db);
    for (const name of ADMIN_STATE_NAMES) {
      if (!Object.prototype.hasOwnProperty.call(data, name)) continue;
      if (name === 'orders') {
        if (!Array.isArray(data.orders)) return error('orders must be an array.');
        await replaceOrders(db, data.orders);
      } else {
        await writeState(db, name, data[name]);
      }
    }
    return json({ ok: true });
  } catch (cause) {
    return error('Could not initialize D1 data.', 500, cause.message);
  }
}
