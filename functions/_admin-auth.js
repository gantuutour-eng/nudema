const encoder = new TextEncoder();
const ADMIN_COOKIE = 'nudema_admin_session';
const SESSION_SECONDS = 12 * 60 * 60;

function allowedEmails(env = {}) {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function configurationError(env = {}) {
  if (!allowedEmails(env).length) return 'ADMIN_EMAILS is not configured.';
  if (String(env.ADMIN_PASSWORD || '').length < 12) return 'ADMIN_PASSWORD must contain at least 12 characters.';
  if (String(env.ADMIN_SESSION_SECRET || '').length < 32) return 'ADMIN_SESSION_SECRET must contain at least 32 characters.';
  return '';
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function encodePayload(value) {
  return toBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodePayload(value) {
  try {
    const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

function constantTimeEqual(left, right) {
  const a = typeof left === 'string' ? encoder.encode(left) : left;
  const b = typeof right === 'string' ? encoder.encode(right) : right;
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}

async function signature(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}

function cookieValue(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ADMIN_COOKIE) return rest.join('=');
  }
  return '';
}

function cookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function verifyAdminCredentials(emailValue, passwordValue, env = {}) {
  const error = configurationError(env);
  if (error) return { ok: false, configurationError: error };

  const email = String(emailValue || '').trim().toLowerCase();
  const supplied = await sha256(passwordValue || '');
  const expected = await sha256(env.ADMIN_PASSWORD);
  const emailAllowed = allowedEmails(env).includes(email);
  return { ok: emailAllowed && constantTimeEqual(supplied, expected), email };
}

export async function createAdminSession(request, email, env = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodePayload({ email, iat: now, exp: now + SESSION_SECONDS, version: 1 });
  const token = `${payload}.${await signature(payload, String(env.ADMIN_SESSION_SECRET || ''))}`;
  return cookie(request, token, SESSION_SECONDS);
}

export async function adminSessionIdentity(request, env = {}) {
  if (configurationError(env)) return null;
  const token = cookieValue(request);
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = await signature(payload, env.ADMIN_SESSION_SECRET);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

  const decoded = decodePayload(payload);
  const email = String(decoded && decoded.email || '').trim().toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  if (!decoded || decoded.version !== 1 || !Number.isFinite(decoded.exp) || decoded.exp <= now) return null;
  if (!allowedEmails(env).includes(email)) return null;
  return { email };
}

export function clearAdminSession(request) {
  return cookie(request, '', 0);
}
