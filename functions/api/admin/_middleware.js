import { adminIdentity, error, isLocalRequest } from '../../_lib.js';

export async function onRequest(context) {
  if (isLocalRequest(context.request) && context.env.ALLOW_LOCAL_ADMIN !== 'false') {
    return context.next();
  }

  const identity = adminIdentity(context.request, context.env);
  if (!identity) {
    return error('Cloudflare Access authentication is required.', 401);
  }
  context.data.admin = identity;
  return context.next();
}

