import {
  ADMIN_STATE_NAMES,
  dbFrom,
  ensureSchema,
  json,
  error,
  readState,
  readOrders,
  ensureReviewsSeeded,
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
    // Анхны bootstrap-ийн "empty" шалгуурыг сэтгэгдлийн seed-ээс өмнө тооцно —
    // үгүй бол шинэ D1 дээр client өөрийн өгөгдлөө байршуулахгүй өнгөрнө.
    const empty = Object.keys(state.data).filter((name) => name !== 'orders').length === 0
      && state.data.orders.length === 0;
    if (!empty) await ensureReviewsSeeded(db, state.data);
    return json({
      ok: true,
      identity: context.data.admin,
      ...state,
      empty,
    });
  } catch (cause) {
    return error('Admin data is temporarily unavailable.', 503, cause.message);
  }
}
