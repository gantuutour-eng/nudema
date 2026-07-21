import { createSession, hashPassword, normalizeEmail, randomHex, sha256 } from '../../../_auth.js';
import { dbFrom, ensureSchema } from '../../../_lib.js';

function authRedirect(request, path, errorCode, extraHeaders = {}) {
  const url = new URL(path || '/Nudema Account.dc.html', request.url);
  if (errorCode) url.searchParams.set('oauth_error', errorCode);
  return new Response(null, { status: 302, headers: { Location: url.toString(), ...extraHeaders } });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const query = new URL(request.url).searchParams;
  if (query.get('error')) return authRedirect(request, '/Nudema Login.dc.html', 'cancelled');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return authRedirect(request, '/Nudema Login.dc.html', 'not_configured');
  }

  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state) return authRedirect(request, '/Nudema Login.dc.html', 'invalid_response');

  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    const stateHash = await sha256(state);
    const oauthState = await db.prepare(
      'SELECT code_verifier, return_to FROM oauth_states WHERE state_hash = ? AND expires_at > ?',
    ).bind(stateHash, new Date().toISOString()).first();
    await db.prepare('DELETE FROM oauth_states WHERE state_hash = ?').bind(stateHash).run();
    if (!oauthState) return authRedirect(request, '/Nudema Login.dc.html', 'expired');

    const redirectUri = env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', request.url).toString();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: oauthState.code_verifier,
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) throw new Error('token_exchange_failed');

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
    });
    const profile = await profileResponse.json();
    const email = normalizeEmail(profile.email);
    if (!profileResponse.ok || !profile.sub || !email || profile.email_verified !== true) {
      return authRedirect(request, '/Nudema Login.dc.html', 'unverified_email');
    }

    let identity = await db.prepare(
      `SELECT u.id FROM oauth_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = 'google' AND i.provider_user_id = ?`,
    ).bind(String(profile.sub)).first();

    if (!identity) {
      let user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (!user) {
        const id = crypto.randomUUID();
        const unusablePassword = await hashPassword(randomHex(48));
        const phone = `google_${(await sha256(String(profile.sub))).slice(0, 20)}`;
        const name = String(profile.name || profile.given_name || email.split('@')[0])
          .trim().replace(/\s+/g, ' ').slice(0, 120) || 'Google user';
        await db.prepare(
          `INSERT INTO users (id, email, phone, name, password_hash, password_salt, marketing)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
        ).bind(id, email, phone, name, unusablePassword.hash, unusablePassword.salt).run();
        user = { id };
      }
      await db.prepare(
        `INSERT INTO oauth_identities (provider, provider_user_id, user_id, email)
         VALUES ('google', ?, ?, ?)`,
      ).bind(String(profile.sub), user.id, email).run();
      identity = user;
    }

    const cookie = await createSession(db, request, identity.id, true);
    return authRedirect(
      request,
      oauthState.return_to || '/Nudema Account.dc.html',
      '',
      { 'Set-Cookie': cookie },
    );
  } catch {
    return authRedirect(request, '/Nudema Login.dc.html', 'callback_failed');
  }
}
