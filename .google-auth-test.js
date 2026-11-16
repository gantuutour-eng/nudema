const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync('functions/api/auth/google/callback.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');

async function callback(options = {}) {
  const writes = [];
  const db = { prepare(sql) { return { bind(...values) { return {
    async first() {
      if (sql.includes('FROM oauth_states')) return options.expired ? null : { code_verifier: 'verifier', return_to: '/account' };
      if (sql.includes('FROM oauth_identities')) return options.identity || null;
      if (sql.includes('FROM users')) return options.user || null;
      throw new Error(`Unexpected query: ${sql}`);
    },
    async run() { writes.push({ sql, values }); },
  }; } }; } };
  const context = {
    URL, URLSearchParams, Response, crypto: webcrypto,
    dbFrom: () => db, ensureSchema: async () => {},
    // Reproduce the production-only failure if OAuth tries to derive a password.
    hashPassword: async () => { throw new Error('PBKDF2 iterations above 100000 are unsupported'); },
    normalizeEmail: value => String(value || '').trim().toLowerCase(),
    randomHex: size => Buffer.from(webcrypto.getRandomValues(new Uint8Array(size))).toString('hex'),
    sha256: async value => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex'),
    createSession: async (_db, _request, userId) => `nudema_session=${userId}; HttpOnly; Secure; SameSite=Lax`,
    fetch: async url => url.includes('/token')
      ? Response.json(options.tokenFailure ? { error: 'invalid_grant' } : { access_token: 'test-access-token' }, { status: options.tokenFailure ? 400 : 200 })
      : Response.json({ sub: 'test-google-id', email: 'TEST@example.invalid', name: 'Test User', email_verified: !options.unverified }),
  };
  vm.runInNewContext(`${source}\nthis.onRequestGet = onRequestGet;`, context);
  const response = await context.onRequestGet({
    env: { DB: db, GOOGLE_CLIENT_ID: 'test-id', GOOGLE_CLIENT_SECRET: 'test-secret' },
    request: new Request('https://shop.example.invalid/api/auth/google/callback?code=test-code&state=test-state'),
  });
  return { response, writes };
}

test('new Google customer signs in when Workers password derivation is unavailable', async () => {
  const { response, writes } = await callback();
  assert.equal(response.headers.get('Location'), 'https://shop.example.invalid/account');
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/);
  const insert = writes.find(row => row.sql.includes('INSERT INTO users'));
  assert.equal(insert.values[1], 'test@example.invalid');
  assert.match(insert.values[4], /^[0-9a-f]{64}$/);
  assert.match(insert.values[5], /^[0-9a-f]{32}$/);
  assert.ok(writes.some(row => row.sql.includes('INSERT INTO oauth_identities')));
});

test('existing customer links Google without replacing their password', async () => {
  const { response, writes } = await callback({ user: { id: 'existing-user' } });
  assert.match(response.headers.get('Set-Cookie'), /existing-user/);
  assert.equal(writes.some(row => /INSERT INTO users|UPDATE users/.test(row.sql)), false);
});

for (const [name, options, error] of [
  ['expired state', { expired: true }, 'expired'],
  ['unverified email', { unverified: true }, 'unverified_email'],
  ['failed token exchange', { tokenFailure: true }, 'callback_failed'],
]) test(`${name} cannot create a customer or session`, async () => {
  const { response, writes } = await callback(options);
  assert.equal(new URL(response.headers.get('Location')).searchParams.get('oauth_error'), error);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(writes.some(row => row.sql.includes('INSERT INTO users')), false);
});
