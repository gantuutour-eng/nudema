import { adminSessionIdentity, sameOriginMutation } from '../../_admin-auth.js';
import { acceptAdminInvitation } from '../../_admin-team.js';
import { dbFrom, json, error } from '../../_lib.js';
export async function onRequestPost(context) {
  if (!sameOriginMutation(context.request)) return error('Origin is not allowed.', 403);
  try {
    const identity = await adminSessionIdentity(context.request, context.env, { allowInvitation: true });
    if (!identity || identity.status !== 'invited') return error('Урилга хүлээн авахын тулд Google-ээр нэвтэрнэ үү.', 401);
    return json({ ok: true, identity: await acceptAdminInvitation(dbFrom(context), identity) });
  } catch (cause) { return error(cause.status ? cause.message : 'Урилгыг хүлээн авч чадсангүй.', cause.status || 500); }
}
