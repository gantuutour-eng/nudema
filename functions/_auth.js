const encoder = new TextEncoder();
const SESSION_COOKIE = 'nudema_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 120000;

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
  const text = String(value || '');
  if (!/^[0-9a-f]+$/i.test(text) || text.length % 2) return new Uint8Array();
  return new Uint8Array(text.match(/.{2}/g).map((pair) => parseInt(pair, 16)));
}

function randomHex(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function sha256(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 160);
}

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').replace(/^976(?=\d{8}$)/, '').slice(0, 20);
}

export async function hashPassword(password, saltHex = randomHex(16)) {
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: fromHex(saltHex),
    iterations: PBKDF2_ITERATIONS,
  }, material, 256);
  return { salt: saltHex, hash: toHex(new Uint8Array(bits)) };
}

export async function verifyPassword(password, salt, expectedHash) {
  const actual = await hashPassword(password, salt);
  const left = fromHex(actual.hash);
  const right = fromHex(expectedHash);
  if (left.length !== right.length || !left.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function cookieValue(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return '';
}

function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(db, request, userId, remember = true) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const days = remember ? SESSION_DAYS : 1;
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  await db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();
  await db.prepare(
    'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
  ).bind(tokenHash, userId, expiresAt).run();
  return sessionCookie(request, token, days * 86400);
}

export async function deleteSession(db, request) {
  const token = cookieValue(request);
  if (token) await db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return sessionCookie(request, '', 0);
}

export async function sessionUser(db, request) {
  const token = cookieValue(request);
  if (!token) return null;
  const row = await db.prepare(
    `SELECT u.id, u.email, u.phone, u.name, u.marketing, u.created_at
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), new Date().toISOString()).first();
  return row || null;
}

export function publicUser(row) {
  return row ? {
    id: row.id,
    email: row.email,
    phone: row.phone,
    name: row.name,
    marketing: Number(row.marketing) === 1,
    createdAt: row.created_at,
  } : null;
}
