import { dbFrom, ensureSchema, json, error } from '../_lib.js';

export async function onRequestGet(context) {
  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    await db.prepare('SELECT COUNT(*) AS count FROM app_state').first();
    return json({ ok: true, service: 'nudema-api', database: 'connected' });
  } catch (cause) {
    return error('Cloudflare D1 is not ready.', 503, cause.message);
  }
}
