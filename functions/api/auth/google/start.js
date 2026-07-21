import { randomHex, sha256 } from '../../../_auth.js';
import { dbFrom, ensureSchema } from '../../../_lib.js';

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function safeReturnTo(value) {
  const path = String(value || '');
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/api/')
    ? path.slice(0, 500)
    : '/Nudema Account.dc.html';
}

function loginError(request, code) {
  const url = new URL('/Nudema Login.dc.html', request.url);
  url.searchParams.set('oauth_error', code);
  return Response.redirect(url.toString(), 302);
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return loginError(request, 'not_configured');

  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    const state = randomHex(32);
    const verifier = randomHex(48);
    const verifierDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get('return_to'));

    await db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(new Date().toISOString()).run();
    await db.prepare(
      'INSERT INTO oauth_states (state_hash, code_verifier, return_to, expires_at) VALUES (?, ?, ?, ?)',
    ).bind(await sha256(state), verifier, returnTo, expiresAt).run();

    const redirectUri = env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', request.url).toString();
    const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorize.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('scope', 'openid email profile');
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('code_challenge', base64Url(verifierDigest));
    authorize.searchParams.set('code_challenge_method', 'S256');
    authorize.searchParams.set('prompt', 'select_account');
    return Response.redirect(authorize.toString(), 302);
  } catch {
    return loginError(request, 'start_failed');
  }
}
