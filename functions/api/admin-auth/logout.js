import { deleteAdminSession, sameOriginMutation } from '../../_admin-auth.js';
import { json, error } from '../../_lib.js';

export async function onRequestPost(context) {
  if (!sameOriginMutation(context.request)) return error('Origin is not allowed.', 403);
  return json({ ok: true }, 200, { 'Set-Cookie': await deleteAdminSession(context.env.DB, context.request) });
}
