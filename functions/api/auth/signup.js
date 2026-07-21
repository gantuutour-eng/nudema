import { createSession, hashPassword, normalizeEmail, normalizePhone, publicUser } from '../../_auth.js';
import { dbFrom, ensureSchema, error, json } from '../../_lib.js';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Зөв и-мэйл хаяг оруулна уу.');
    if (name.length < 2) return error('Нэрээ оруулна уу.');
    if (!/^\d{8,15}$/.test(phone)) return error('Зөв утасны дугаар оруулна уу.');
    if (password.length < 8 || password.length > 128) return error('Нууц үг 8–128 тэмдэгт байх ёстой.');
    if (body.terms !== true) return error('Үйлчилгээний нөхцөлийг зөвшөөрнө үү.');

    const db = dbFrom(context);
    await ensureSchema(db);
    const duplicate = await db.prepare('SELECT email, phone FROM users WHERE email = ? OR phone = ?').bind(email, phone).first();
    if (duplicate) return error(duplicate.email === email ? 'Энэ и-мэйл бүртгэлтэй байна.' : 'Энэ утасны дугаар бүртгэлтэй байна.', 409);

    const id = crypto.randomUUID();
    const passwordData = await hashPassword(password);
    await db.prepare(
      `INSERT INTO users (id, email, phone, name, password_hash, password_salt, marketing)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, email, phone, name, passwordData.hash, passwordData.salt, body.marketing === true ? 1 : 0).run();
    const user = await db.prepare('SELECT id, email, phone, name, marketing, created_at FROM users WHERE id = ?').bind(id).first();
    const cookie = await createSession(db, context.request, id, true);
    return json({ ok: true, user: publicUser(user) }, 201, { 'Set-Cookie': cookie });
  } catch (cause) {
    if (cause && cause.message && cause.message.includes('UNIQUE')) return error('И-мэйл эсвэл утасны дугаар бүртгэлтэй байна.', 409);
    return error('Бүртгэл үүсгэж чадсангүй.', 500);
  }
}
