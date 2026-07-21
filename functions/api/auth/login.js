import { createSession, normalizeEmail, normalizePhone, publicUser, verifyPassword } from '../../_auth.js';
import { dbFrom, ensureSchema, error, json } from '../../_lib.js';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const identifier = String(body.identifier || '').trim();
    const password = String(body.password || '');
    if (!identifier || !password) return error('И-мэйл/утас болон нууц үгээ оруулна уу.');

    const db = dbFrom(context);
    await ensureSchema(db);
    const email = normalizeEmail(identifier);
    const phone = normalizePhone(identifier);
    const row = await db.prepare(
      `SELECT id, email, phone, name, marketing, created_at, password_hash, password_salt
       FROM users WHERE email = ? OR phone = ?`,
    ).bind(email, phone).first();
    if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
      return error('И-мэйл/утас эсвэл нууц үг буруу байна.', 401);
    }
    const cookie = await createSession(db, context.request, row.id, body.remember !== false);
    return json({ ok: true, user: publicUser(row) }, 200, { 'Set-Cookie': cookie });
  } catch (cause) {
    return error('Нэвтэрч чадсангүй.', 500);
  }
}
