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
import { adminStateNames, canAdmin } from '../../_admin-auth.js';

export async function onRequestGet(context) {
  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    // Хуучин client-side demo нэвтрэлтийн plaintext credential row-ийг устгана.
    await db.prepare('DELETE FROM app_state WHERE name = ?').bind('admin').run();
    const allowedNames = adminStateNames(context.data.admin);
    const storedNames = ADMIN_STATE_NAMES.filter((name) => name !== 'orders' && allowedNames.includes(name));
    const state = await readState(db, storedNames);
    if (allowedNames.includes('orders')) {
      const orders = await readOrders(db);
      state.data.orders = canAdmin(context.data.admin, 'orders') || canAdmin(context.data.admin, 'customers')
        ? orders
        : orders.map(o => ({ no: o.no, date: o.date, createdAt: o.createdAt, status: o.status, total: o.total,
          customer: '—', email: '', phone: '', address: '',
          items: (o.items || []).map(it => ({ pid: it.pid, id: it.id, qty: it.qty, optionIndex: it.optionIndex })) }));
    }
    // Анхны bootstrap-ийн "empty" шалгуурыг сэтгэгдлийн seed-ээс өмнө тооцно —
    // үгүй бол шинэ D1 дээр client өөрийн өгөгдлөө байршуулахгүй өнгөрнө.
    const empty = Object.keys(state.data).filter((name) => name !== 'orders').length === 0
      && (!state.data.orders || state.data.orders.length === 0);
    if (!empty && allowedNames.includes('reviews')) await ensureReviewsSeeded(db, state.data);
    return json({
      ok: true,
      identity: context.data.admin,
      allowedStores: allowedNames,
      ...state,
      empty,
    });
  } catch (cause) {
    return error('Admin data is temporarily unavailable.', 503, cause.message);
  }
}
