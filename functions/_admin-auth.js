import { randomHex, sha256, normalizeEmail } from './_auth.js';
import { ADMIN_SCHEMA } from './_admin-schema.js';

export const ADMIN_MODULES = ['products', 'orders', 'customers', 'reviews', 'content', 'analytics', 'settings'];
export const PRIMARY_OWNER_EMAIL = 'gantuutour@gmail.com';
const COOKIE = 'nudema_admin_session';
const SESSION_SECONDS = 12 * 60 * 60;
const initialized = new WeakMap();

export async function ensureAdminSchema(db) {
  if (initialized.has(db)) return initialized.get(db);
  const promise = (async () => {
  await db.batch(ADMIN_SCHEMA.map(sql => db.prepare(sql)));
  // Provision only the specifically authorized owner. Claiming still requires Google.
  // Never re-enable an account or change an existing membership during provisioning.
  await db.prepare(`INSERT OR IGNORE INTO admin_members (id,email,role,status)
    VALUES ('nudema-primary-owner',?,'owner','invited')`).bind(PRIMARY_OWNER_EMAIL).run();
  })().catch(cause => { initialized.delete(db); throw cause; });
  initialized.set(db, promise);
  return promise;
}

export function adminCookieValue(request, name = COOKIE) {
  const parts = (request.headers.get('Cookie') || '').split(';');
  for (const part of parts) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

export function adminCookie(request, token, seconds = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

export function publicAdmin(member) {
  let permissions = [];
  try { permissions = JSON.parse(member.permissions); } catch {}
  if (!Array.isArray(permissions)) permissions = [];
  return {
    id: member.id, email: member.email, name: member.name || member.email.split('@')[0],
    role: member.role, status: member.status, revision: Number(member.revision),
    permissions: member.role === 'operator' ? ADMIN_MODULES.filter(p => permissions.includes(p)) : [...ADMIN_MODULES],
    inviteExpiresAt: member.invite_expires_at, lastLoginAt: member.last_login_at,
    createdAt: member.created_at,
  };
}

export function canAdmin(identity, permission) {
  if (!identity || identity.status !== 'active') return false;
  if (identity.role === 'owner' || identity.role === 'admin') return true;
  if (permission === 'team' || permission === 'audit') return false;
  if (permission === 'dashboard') return identity.permissions.includes('orders');
  return identity.permissions.includes(permission);
}

export function adminStateNames(identity) {
  // Catalog and store settings are already public, and used by every admin view.
  const names = ['products', 'taxonomy', 'settings'];
  if (canAdmin(identity, 'content')) names.push('content');
  if (canAdmin(identity, 'reviews')) names.push('reviews');
  if (['orders', 'customers', 'analytics'].some(p => canAdmin(identity, p))) names.push('orders', 'statuses');
  return names;
}

export function sameOriginMutation(request) {
  const origin = request.headers.get('Origin');
  return origin === new URL(request.url).origin;
}

export async function createAdminSession(db, request, memberId) {
  const token = randomHex(32);
  await db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();
  await db.prepare('INSERT INTO admin_sessions (token_hash,member_id,expires_at) VALUES (?,?,?)')
    .bind(await sha256(token), memberId, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString()).run();
  return adminCookie(request, token);
}

export async function adminSessionIdentity(request, env = {}, { allowInvitation = false } = {}) {
  const token = adminCookieValue(request);
  if (!/^[0-9a-f]{64}$/.test(token) || !env.DB) return null;
  await ensureAdminSchema(env.DB);
  const member = await env.DB.prepare(`SELECT m.* FROM admin_sessions s
    JOIN admin_members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(await sha256(token), new Date().toISOString()).first();
  if (!member || !member.google_sub) return null;
  if (member.status !== 'active' && !(allowInvitation && member.status === 'invited' && member.invite_expires_at > new Date().toISOString())) return null;
  return publicAdmin(member);
}

export async function deleteAdminSession(db, request) {
  const token = adminCookieValue(request);
  if (token && db) await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await sha256(token)).run();
  return adminCookie(request, '', 0);
}

export const clearAdminSession = request => adminCookie(request, '', 0);

export function auditStatement(db, actor, action, target = '', details = {}) {
  return db.prepare('INSERT INTO admin_audit (id,actor_id,actor_email,action,target,details) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), actor.id || 'local', normalizeEmail(actor.email), action, String(target).slice(0, 200), JSON.stringify(details));
}

export async function recordAdminAudit(db, actor, action, target, details) {
  await auditStatement(db, actor, action, target, details).run();
}
