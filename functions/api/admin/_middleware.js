import { adminSessionIdentity, ADMIN_MODULES, canAdmin, sameOriginMutation, recordAdminAudit } from '../../_admin-auth.js';
import { error, isLocalRequest } from '../../_lib.js';

function permissionFor(path, method) {
  if (path === 'state') return method === 'GET' ? 'session' : method === 'POST' ? 'owner' : null;
  if (path === 'team') return ['GET', 'POST', 'PUT'].includes(method) ? 'team' : null;
  if (path === 'audit') return method === 'GET' ? 'audit' : null;
  if (path === 'catalog') return method === 'PUT' ? 'products' : null;
  if (path === 'images' || path.startsWith('images/')) return ['POST', 'DELETE'].includes(method) ? 'images' : null;
  if (method === 'PUT' && path.startsWith('store/')) return ({ products: 'products', taxonomy: 'products', settings: 'settings', content: 'content', reviews: 'reviews', orders: 'orders', statuses: 'orders' })[path.slice(6)] || null;
  return null;
}
export async function onRequest(context) {
  const local = isLocalRequest(context.request) && context.env.ALLOW_LOCAL_ADMIN !== 'false';
  const identity = local
    ? { id: 'local', email: 'local-development@nudema.local', role: 'owner', status: 'active', permissions: ADMIN_MODULES, local: true }
    : await adminSessionIdentity(context.request, context.env);
  if (!identity) return error('Admin authentication is required.', 401);
  const method = context.request.method, path = new URL(context.request.url).pathname.replace(/^\/api\/admin\//, '').replace(/\/$/, '');
  if (!local && !['GET', 'HEAD'].includes(method) && !sameOriginMutation(context.request)) return error('Origin is not allowed.', 403);
  const permission = permissionFor(path, method);
  const allowed = permission === 'session' || (permission === 'owner' ? identity.role === 'owner' : permission === 'images' ? canAdmin(identity, 'products') || canAdmin(identity, 'content') : permission && canAdmin(identity, permission));
  if (!allowed) return error('Энэ үйлдлийг хийх эрхгүй.', 403);
  context.data.admin = identity;
  const response = await context.next();
  if (!local && response.ok && !['GET', 'HEAD'].includes(method) && path !== 'team') {
    // Log only the resource name, never customer payloads, credentials or image bytes.
    await recordAdminAudit(context.env.DB, identity, method.toLowerCase() + '.' + permission, path);
  }
  return response;
}
