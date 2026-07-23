import { adminSessionIdentity } from '../../_admin-auth.js';
import { error, json } from '../../_lib.js';

export async function onRequestGet(context) {
  const identity = await adminSessionIdentity(context.request, context.env);
  if (!identity) return error('Admin authentication is required.', 401);
  return json({ ok: true, identity });
}
