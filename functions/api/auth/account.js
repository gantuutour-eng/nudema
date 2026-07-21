import { publicUser, sessionUser } from '../../_auth.js';
import { dbFrom, ensureSchema, error, json } from '../../_lib.js';

export async function onRequestGet(context) {
  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    const user = await sessionUser(db, context.request);
    if (!user) return error('Нэвтрэх шаардлагатай.', 401);
    const result = await db.prepare(
      `SELECT o.payload FROM orders o
       JOIN user_orders uo ON uo.order_no = o.order_no
       WHERE uo.user_id = ?
       ORDER BY o.created_at DESC LIMIT 50`,
    ).bind(user.id).all();
    const orders = (result.results || []).flatMap((row) => {
      try { return [JSON.parse(row.payload)]; } catch { return []; }
    });
    const active = orders.filter((order) => order.status !== 'cancelled');
    const spent = active.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
    return json({
      ok: true,
      user: publicUser(user),
      stats: { orders: orders.length, spent, points: Math.floor(spent * 0.02) },
      orders: orders.slice(0, 10),
    });
  } catch (cause) {
    return error('Бүртгэлийн мэдээллийг ачаалж чадсангүй.', 500);
  }
}
