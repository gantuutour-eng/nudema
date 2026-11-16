import { ADMIN_MODULES, publicAdmin } from './_admin-auth.js';
import { normalizeEmail } from './_auth.js';

export class AdminTeamError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const problem = (message, status) => { throw new AdminTeamError(message, status); };
function authority(actor, role, target) {
  if (!actor || actor.status !== 'active' || !['owner', 'admin'].includes(actor.role)) problem('Администратор удирдах эрхгүй.', 403);
  if (target?.role === 'owner') problem('Үндсэн эзэмшигчийн эрхийг өөрчлөх боломжгүй.', 403);
  if (!['admin', 'operator'].includes(role)) problem('Зөв эрх сонгоно уу.');
  if (actor.role === 'admin' && (role !== 'operator' || (target && target.role !== 'operator'))) problem('Зөвхөн операторын эрх удирдах боломжтой.', 403);
}
function permissionsFor(role, value, actor) {
  if (role === 'admin') return [...ADMIN_MODULES];
  if (!Array.isArray(value) || value.some(p => !ADMIN_MODULES.includes(p))) problem('Зөвшөөрөгдсөн цэс сонгоно уу.');
  const selected = [...new Set(value)];
  if (!selected.length) problem('Операторт дор хаяж нэг цэс сонгоно уу.');
  if (selected.some(p => !actor.permissions.includes(p))) problem('Өөрт байхгүй эрхийг олгох боломжгүй.', 403);
  return selected;
}
// Bind the mutation to the actor's current revision as well as their current role.
const ACTOR = "EXISTS (SELECT 1 FROM admin_members a WHERE a.id=? AND a.revision=? AND a.status='active' AND a.role IN ('owner','admin'))";
function mutationAudit(db, actor, action, target, mutation, details) {
  return db.prepare(`INSERT INTO admin_audit (id,actor_id,actor_email,action,target,details)
    SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM admin_members WHERE id=? AND last_mutation=?)`)
    .bind(crypto.randomUUID(), actor.id, actor.email, action, target, JSON.stringify(details), target, mutation);
}

export async function inviteAdmin(db, actor, body) {
  const email = normalizeEmail(body.email), role = body.role || 'operator'; authority(actor, role);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problem('Зөв Google и-мэйл оруулна уу.');
  const permissions = permissionsFor(role, body.permissions, actor);
  const id = crypto.randomUUID(), mutation = crypto.randomUUID();
  const expiry = new Date(Date.now() + 7 * 86400000).toISOString();
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO admin_members (id,email,role,permissions,status,invite_expires_at,invited_by,last_mutation)
        SELECT ?,?,?,?,'invited',?,?,? WHERE ${ACTOR}`)
        .bind(id, email, role, JSON.stringify(permissions), expiry, actor.id, mutation, actor.id, actor.revision),
      mutationAudit(db, actor, 'team.invite', id, mutation, { email, role, permissions }),
    ]);
    if (!result[0].meta.changes) problem('Таны эрх өөрчлөгдсөн. Дахин нэвтэрнэ үү.', 403);
  } catch (cause) {
    if (/UNIQUE constraint failed.*email/i.test(cause.message)) problem('Энэ и-мэйл аль хэдийн бүртгэлтэй. Жагсаалтаас эрхийг нь өөрчилнө үү.', 409);
    throw cause;
  }
  return publicAdmin(await db.prepare('SELECT * FROM admin_members WHERE id=?').bind(id).first());
}

export async function updateAdmin(db, actor, body) {
  const target = await db.prepare('SELECT * FROM admin_members WHERE id=?').bind(String(body.id || '')).first();
  if (!target) problem('Администратор олдсонгүй.', 404);
  authority(actor, body.role, target);
  const permissions = permissionsFor(body.role, body.permissions, actor);
  if (!['invited', 'active', 'suspended', 'revoked'].includes(body.status)) problem('Зөв төлөв сонгоно уу.');
  if (!target.google_sub && body.status === 'active') problem('Урилгыг Google бүртгэлээр хүлээн авах шаардлагатай.');
  if (Number(body.revision) !== Number(target.revision)) problem('Мэдээлэл өөрчлөгдсөн. Жагсаалтыг шинэчлээд дахин оролдоно уу.', 409);
  const mutation = crypto.randomUUID(), expiry = body.status === 'invited' ? new Date(Date.now() + 7 * 86400000).toISOString() : target.invite_expires_at;
  const result = await db.batch([
    db.prepare(`UPDATE admin_members SET role=?,permissions=?,status=?,invite_expires_at=?,
      revision=revision+1,last_mutation=?,updated_at=datetime('now')
      WHERE id=? AND revision=? AND role<>'owner' AND ${ACTOR}`)
      .bind(body.role, JSON.stringify(permissions), body.status, expiry, mutation, target.id, body.revision, actor.id, actor.revision),
    db.prepare(`DELETE FROM admin_sessions WHERE member_id=? AND EXISTS
      (SELECT 1 FROM admin_members WHERE id=? AND last_mutation=?)`)
      .bind(target.id, target.id, mutation),
    mutationAudit(db, actor, 'team.update', target.id, mutation, {
      before: { role: target.role, status: target.status, permissions: JSON.parse(target.permissions) },
      after: { role: body.role, status: body.status, permissions },
    }),
  ]);
  if (!result[0].meta.changes) problem('Эрх эсвэл мэдээлэл өөрчлөгдсөн. Жагсаалтыг шинэчилнэ үү.', 409);
  return publicAdmin(await db.prepare('SELECT * FROM admin_members WHERE id=?').bind(target.id).first());
}

export async function acceptAdminInvitation(db, identity) {
  const mutation = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(`UPDATE admin_members SET status='active',revision=revision+1,last_mutation=?,updated_at=datetime('now')
      WHERE id=? AND status='invited' AND google_sub IS NOT NULL AND invite_expires_at>?`)
      .bind(mutation, identity.id, new Date().toISOString()),
    mutationAudit(db, identity, 'team.accept', identity.id, mutation, {}),
  ]);
  if (!result[0].meta.changes) problem('Урилгын хугацаа дууссан эсвэл хүчингүй болсон.', 403);
  return publicAdmin(await db.prepare('SELECT * FROM admin_members WHERE id=?').bind(identity.id).first());
}
