import { randomHex, sha256, normalizeEmail } from './_auth.js';
import { dbFrom } from './_lib.js';
import { ensureAdminSchema, adminCookieValue, createAdminSession, recordAdminAudit } from './_admin-auth.js';

const STATE_COOKIE = 'nudema_admin_oauth';
function stateCookie(request, state = '', seconds = 0) {
  return `${STATE_COOKIE}=${state}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
function redirect(context, error = '', sessionCookie = '') {
  const url = new URL('/admin', context.request.url);
  if (error) url.searchParams.set('admin_error', error);
  const headers = new Headers({ Location: url.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  headers.append('Set-Cookie', stateCookie(context.request));
  if (sessionCookie) headers.append('Set-Cookie', sessionCookie);
  return new Response(null, { status: 302, headers });
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }

export async function startAdminGoogle(context) {
  const { env, request } = context;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return redirect(context, 'not_configured');
  try {
    const db = dbFrom(context); await ensureAdminSchema(db);
    const state = 'adm_' + randomHex(32), verifier = randomHex(48);
    await db.prepare('DELETE FROM admin_oauth_states WHERE expires_at <= ?').bind(new Date().toISOString()).run();
    await db.prepare('INSERT INTO admin_oauth_states (state_hash,code_verifier,expires_at) VALUES (?,?,?)')
      .bind(await sha256(state), verifier, new Date(Date.now() + 600000).toISOString()).run();
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const params = { client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', request.url).toString(), response_type: 'code', scope: 'openid email profile', state, code_challenge: base64(digest), code_challenge_method: 'S256', prompt: 'select_account' };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return new Response(null, { status: 302, headers: { Location: url.toString(), 'Set-Cookie': stateCookie(request, state, 600), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return redirect(context, 'unavailable'); }
}

export async function finishAdminGoogle(context) {
  const { request, env } = context;
  const query = new URL(request.url).searchParams, state = query.get('state') || '';
  if (!state || state !== adminCookieValue(request, STATE_COOKIE)) return redirect(context, 'invalid_state');
  try {
    const db = dbFrom(context); await ensureAdminSchema(db);
    const oauth = await db.prepare('DELETE FROM admin_oauth_states WHERE state_hash=? AND expires_at>? RETURNING code_verifier')
      .bind(await sha256(state), new Date().toISOString()).first();
    if (!oauth) return redirect(context, 'expired');
    if (query.get('error')) return redirect(context, 'cancelled');
    if (!query.get('code')) return redirect(context, 'invalid_state');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: query.get('code'), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', request.url).toString(), grant_type: 'authorization_code', code_verifier: oauth.code_verifier }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) return redirect(context, 'google_failed');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' } });
    const profile = await profileResponse.json(), email = normalizeEmail(profile.email), sub = String(profile.sub || '');
    if (!profileResponse.ok || !sub || !email || profile.email_verified !== true) return redirect(context, 'unverified');
    let member = await db.prepare('SELECT * FROM admin_members WHERE google_sub=?').bind(sub).first();
    if (!member) {
      member = await db.prepare('SELECT * FROM admin_members WHERE email=? COLLATE NOCASE').bind(email).first();
      if (!member || member.google_sub || member.status !== 'invited') return redirect(context, 'not_invited');
      if (member.role !== 'owner' && member.invite_expires_at <= new Date().toISOString()) return redirect(context, 'invitation_expired');
      // Google is authoritative for Gmail and Workspace, not arbitrary third-party mailboxes.
      if (!email.endsWith('@gmail.com') && !profile.hd) return redirect(context, 'unverified');
      const claim = await db.prepare(`UPDATE admin_members SET google_sub=?,name=?,
        status=CASE WHEN role='owner' THEN 'active' ELSE 'invited' END,updated_at=datetime('now')
        WHERE id=? AND google_sub IS NULL AND status='invited' RETURNING *`)
        .bind(sub, String(profile.name || '').slice(0, 120), member.id).first();
      if (!claim) return redirect(context, 'not_invited');
      member = claim;
    }
    if (!['active', 'invited'].includes(member.status)) return redirect(context, 'suspended');
    if (member.status === 'invited' && member.invite_expires_at <= new Date().toISOString()) return redirect(context, 'invitation_expired');
    await db.prepare("UPDATE admin_members SET last_login_at=datetime('now') WHERE id=?").bind(member.id).run();
    await recordAdminAudit(db, member, 'auth.google', member.id);
    return redirect(context, '', await createAdminSession(db, request, member.id));
  } catch { return redirect(context, 'unavailable'); }
}
