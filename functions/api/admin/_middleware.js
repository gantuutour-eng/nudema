import { adminSessionIdentity } from '../../_admin-auth.js';
import { error, isLocalRequest } from '../../_lib.js';

export async function onRequest(context) {
  if (isLocalRequest(context.request) && context.env.ALLOW_LOCAL_ADMIN !== 'false') {
    context.data.admin = { email: 'local-development@nudema.local', local: true };
    return context.next();
  }

  const identity = await adminSessionIdentity(context.request, context.env);
  if (!identity) {
    return error('Admin authentication is required.', 401);
  }
  context.data.admin = identity;
  return context.next();
}
