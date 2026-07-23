import {
  ADMIN_STATE_NAMES,
  dbFrom,
  ensureSchema,
  json,
  error,
  readState,
  readOrders,
} from '../../_lib.js';

export async function onRequestGet(context) {
  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    // Хуучин client-side demo нэвтрэлтийн plaintext credential row-ийг устгана.
    await db.prepare('DELETE FROM app_state WHERE name = ?').bind('admin').run();
    const storedNames = ADMIN_STATE_NAMES.filter((name) => name !== 'orders');
    const state = await readState(db, storedNames);
    state.data.orders = await readOrders(db);
    return json({
      ok: true,
      identity: context.data.admin,
      ...state,
      empty: Object.keys(state.data).filter((name) => name !== 'orders').length === 0 && state.data.orders.length === 0,
    });
  } catch (cause) {
    return error('Admin data is temporarily unavailable.', 503, cause.message);
  }
}
