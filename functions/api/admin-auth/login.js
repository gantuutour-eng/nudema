import { createAdminSession, verifyAdminCredentials } from '../../_admin-auth.js';
import { sha256 } from '../../_auth.js';
import { dbFrom, ensureSchema, error, json } from '../../_lib.js';

async function loginClientKey(request) {
  const address = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  return sha256(`admin-login:${address.split(',')[0].trim()}`);
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !password) return error('И-мэйл болон нууц үгээ оруулна уу.');

    const db = dbFrom(context);
    await ensureSchema(db);
    await db.prepare("DELETE FROM admin_login_attempts WHERE updated_at < datetime('now', '-1 day')").run();
    const clientKey = await loginClientKey(context.request);
    const attempt = await db.prepare(
      'SELECT failures, blocked_until FROM admin_login_attempts WHERE client_key = ?',
    ).bind(clientKey).first();
    const now = Math.floor(Date.now() / 1000);
    if (attempt && Number(attempt.blocked_until) > now) {
      const retryAfter = Math.max(1, Number(attempt.blocked_until) - now);
      return json({ ok: false, error: 'Олон удаа буруу оролдлоо. Түр хүлээгээд дахин оролдоно уу.' }, 429, {
        'Retry-After': String(retryAfter),
      });
    }

    const result = await verifyAdminCredentials(email, password, context.env);
    if (result.configurationError) {
      return error('Админ нэвтрэх тохиргоо дутуу байна.', 503, result.configurationError);
    }
    if (!result.ok) {
      const failures = Number(attempt && attempt.failures || 0) + 1;
      const blockSeconds = failures >= 5 ? Math.min(3600, 60 * (2 ** (failures - 5))) : 0;
      await db.prepare(
        `INSERT INTO admin_login_attempts (client_key, failures, blocked_until, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(client_key) DO UPDATE SET
           failures = excluded.failures,
           blocked_until = excluded.blocked_until,
           updated_at = excluded.updated_at`,
      ).bind(clientKey, failures, now + blockSeconds).run();
      return error('И-мэйл эсвэл нууц үг буруу байна.', 401);
    }

    await db.prepare('DELETE FROM admin_login_attempts WHERE client_key = ?').bind(clientKey).run();
    const sessionCookie = await createAdminSession(context.request, result.email, context.env);
    return json({ ok: true, identity: { email: result.email } }, 200, { 'Set-Cookie': sessionCookie });
  } catch {
    return error('Нэвтэрч чадсангүй. Дахин оролдоно уу.', 500);
  }
}
