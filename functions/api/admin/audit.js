import { dbFrom, json } from '../../_lib.js';
export async function onRequestGet(context) {
  const rows = await dbFrom(context).prepare('SELECT * FROM admin_audit ORDER BY created_at DESC,id DESC LIMIT 100').all();
  return json({ ok: true, entries: rows.results });
}
