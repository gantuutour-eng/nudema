import { dbFrom, json, error } from '../../_lib.js';
import { publicAdmin, ADMIN_MODULES } from '../../_admin-auth.js';
import { inviteAdmin, updateAdmin } from '../../_admin-team.js';

export async function onRequestGet(context) {
  const db = dbFrom(context);
  const rows = await db.prepare('SELECT * FROM admin_members ORDER BY created_at,id').all();
  return json({ ok: true, members: rows.results.map(publicAdmin), identity: context.data.admin, modules: ADMIN_MODULES });
}
async function save(context, update) {
  try {
    const body = await context.request.json();
    if (!body || typeof body !== 'object') return error('Invalid JSON.');
    const member = await (update ? updateAdmin : inviteAdmin)(dbFrom(context), context.data.admin, body);
    return json({ ok: true, member }, update ? 200 : 201);
  } catch (cause) { return error(cause.status ? cause.message : 'Администраторыг хадгалж чадсангүй.', cause.status || 500); }
}
export const onRequestPost = context => save(context, false);
export const onRequestPut = context => save(context, true);
