import { deleteSession } from '../../_auth.js';
import { dbFrom, ensureSchema, json } from '../../_lib.js';

export async function onRequestPost(context) {
  const db = dbFrom(context);
  await ensureSchema(db);
  const cookie = await deleteSession(db, context.request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}
