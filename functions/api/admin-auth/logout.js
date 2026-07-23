import { clearAdminSession } from '../../_admin-auth.js';
import { json } from '../../_lib.js';

export async function onRequestPost(context) {
  return json({ ok: true }, 200, { 'Set-Cookie': clearAdminSession(context.request) });
}
