const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://shop.example.invalid';
const modules = Promise.all([import('./functions/_admin-auth.js'), import('./functions/_admin-team.js'), import('./functions/_admin-google.js'), import('./functions/api/admin/_middleware.js'), import('./functions/api/admin/state.js'), import('./functions/_lib.js')]);
function database() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  function statement(sql, args = []) { return {
    bind: (...values) => statement(sql, values),
    async run() { const value = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(value.changes) } }; },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  }; }
  return { sqlite, prepare: statement, async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
}
async function fixture(active = true) {
  const [auth, team, google, middleware, state, lib] = await modules, db = database();
  await auth.ensureAdminSchema(db);
  if (active) db.sqlite.prepare("UPDATE admin_members SET google_sub='owner-sub',status='active' WHERE role='owner'").run();
  const owner = auth.publicAdmin(db.sqlite.prepare("SELECT * FROM admin_members WHERE role='owner'").get());
  return { auth, team, google, middleware, state, lib, db, owner, env: { DB: db, GOOGLE_CLIENT_ID: 'test-id', GOOGLE_CLIENT_SECRET: 'test-secret' } };
}
async function invite(f, email = 'staff@gmail.com', role = 'operator', permissions = ['products']) {
  return f.team.inviteAdmin(f.db, f.owner, { email, role, permissions });
}
async function activate(f, member, sub = 'staff-sub') {
  f.db.sqlite.prepare("UPDATE admin_members SET google_sub=?,status='active' WHERE id=?").run(sub, member.id);
  return f.auth.publicAdmin(f.db.sqlite.prepare('SELECT * FROM admin_members WHERE id=?').get(member.id));
}
async function signedRequest(f, member, path = '/api/admin/state', method = 'GET', extra = {}) {
  const cookie = await f.auth.createAdminSession(f.db, new Request(origin + path), member.id);
  return new Request(origin + path, { method, headers: { Cookie: cookie.split(';')[0], Origin: origin, ...extra } });
}
async function googleLogin(f, profile = {}, { cookie = true, reuse, expired = false } = {}) {
  const start = reuse || await f.google.startAdminGoogle({ request: new Request(origin + '/api/admin-auth/google/start'), env: f.env });
  const redirect = new URL(start.headers.get('Location')), state = redirect.searchParams.get('state');
  if (expired) f.db.sqlite.prepare("UPDATE admin_oauth_states SET expires_at='2000-01-01'").run();
  const saved = global.fetch;
  global.fetch = async url => String(url).includes('/token') ? Response.json({ access_token: 'mock-token' }) : Response.json({ sub: 'owner-sub', email: 'gantuutour@gmail.com', name: 'Main Owner', email_verified: true, ...profile });
  try {
    const response = await f.google.finishAdminGoogle({ env: f.env, request: new Request(origin + '/api/auth/google/callback?code=test-code&state=' + state, { headers: cookie ? { Cookie: start.headers.get('Set-Cookie').split(';')[0] } : {} }) });
    return { response, start, authorize: redirect };
  } finally { global.fetch = saved; }
}
test('only the requested main owner is provisioned; provisioning never resets an existing account', async () => {
  const f = await fixture(false);
  assert.equal(f.owner.email, 'gantuutour@gmail.com'); assert.equal(f.owner.status, 'invited');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM admin_members').get().n, 1);
  await f.auth.ensureAdminSchema(f.db); assert.equal(f.db.sqlite.prepare('SELECT google_sub FROM admin_members').get().google_sub, null);
});
test('main owner Google login uses PKCE and a browser-bound state and creates a separate admin session', async () => {
  const f = await fixture(false), { response, authorize } = await googleLogin(f);
  assert.equal(authorize.searchParams.get('scope'), 'openid email profile');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('redirect_uri'), origin + '/api/auth/google/callback');
  assert.equal(response.headers.get('Location'), origin + '/admin');
  const cookie = response.headers.getSetCookie().find(c => c.startsWith('nudema_admin_session=')); assert.ok(cookie); assert.match(cookie, /HttpOnly; SameSite=Lax/);
  const identity = await f.auth.adminSessionIdentity(new Request(origin + '/admin', { headers: { Cookie: cookie.split(';')[0] } }), f.env);
  assert.equal(identity.role, 'owner'); assert.equal(identity.email, 'gantuutour@gmail.com');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM admin_audit').get().n, 1);
});
for (const [name, profile, options, expected] of [
  ['wrong browser state', {}, { cookie: false }, 'invalid_state'],
  ['expired state', {}, { expired: true }, 'expired'],
  ['unverified email', { email_verified: false }, {}, 'unverified'],
  ['uninvited Google account', { email: 'stranger@gmail.com', sub: 'stranger' }, {}, 'not_invited'],
]) test(name + ' cannot create an admin session', async () => {
  const f = await fixture(false), { response } = await googleLogin(f, profile, options);
  assert.equal(new URL(response.headers.get('Location')).searchParams.get('admin_error'), expected);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM admin_sessions').get().n, 0);
});
test('OAuth state cannot be replayed', async () => {
  const f = await fixture(false), first = await googleLogin(f);
  const replay = await googleLogin(f, {}, { reuse: first.start });
  assert.equal(new URL(replay.response.headers.get('Location')).searchParams.get('admin_error'), 'expired');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM admin_sessions').get().n, 1);
});
test('invited operator must accept before using admin APIs, and Google sub remains the identity if email changes', async () => {
  const f = await fixture(); const pending = await invite(f);
  const { response } = await googleLogin(f, { email: pending.email, sub: 'staff-sub' });
  const cookie = response.headers.getSetCookie().find(c => c.startsWith('nudema_admin_session='));
  const request = new Request(origin + '/admin', { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(await f.auth.adminSessionIdentity(request, f.env), null);
  const identity = await f.auth.adminSessionIdentity(request, f.env, { allowInvitation: true });
  assert.equal(identity.status, 'invited');
  await f.team.acceptAdminInvitation(f.db, identity);
  assert.equal((await f.auth.adminSessionIdentity(request, f.env)).status, 'active');
  const again = await googleLogin(f, { email: 'changed@gmail.com', sub: 'staff-sub' });
  assert.equal(again.response.headers.get('Location'), origin + '/admin');
});
test('expired invitations and previously bound but different Google identities cannot claim access', async () => {
  const f = await fixture(); const pending = await invite(f);
  f.db.sqlite.prepare("UPDATE admin_members SET invite_expires_at='2000-01-01' WHERE id=?").run(pending.id);
  assert.equal(new URL((await googleLogin(f, { email: pending.email, sub: 'staff-sub' })).response.headers.get('Location')).searchParams.get('admin_error'), 'invitation_expired');
  await activate(f, pending);
  assert.equal(new URL((await googleLogin(f, { email: pending.email, sub: 'other-sub' })).response.headers.get('Location')).searchParams.get('admin_error'), 'not_invited');
});
test('owner can invite admins; admin can only manage operators; operator cannot invite anyone', async () => {
  const f = await fixture(); const admin = await activate(f, await invite(f, 'manager@gmail.com', 'admin'), 'manager-sub');
  const operator = await f.team.inviteAdmin(f.db, admin, { email: 'operator@gmail.com', role: 'operator', permissions: ['orders'] });
  await assert.rejects(f.team.inviteAdmin(f.db, admin, { email: 'manager2@gmail.com', role: 'admin' }), e => e.status === 403);
  await assert.rejects(f.team.inviteAdmin(f.db, { ...operator, status: 'active' }, { email: 'other@gmail.com', role: 'operator', permissions: ['orders'] }), e => e.status === 403);
  await assert.rejects(f.team.inviteAdmin(f.db, f.owner, { email: 'owner2@gmail.com', role: 'owner' }), e => e.status === 400);
});
test('the main owner cannot be demoted, suspended or revoked, and concurrent edits are rejected', async () => {
  const f = await fixture();
  for (const status of ['suspended', 'revoked', 'active']) await assert.rejects(f.team.updateAdmin(f.db, f.owner, { ...f.owner, role: 'admin', status }), e => e.status === 403);
  const member = await invite(f);
  await f.team.updateAdmin(f.db, f.owner, { ...member, status: 'revoked' });
  await assert.rejects(f.team.updateAdmin(f.db, f.owner, { ...member, status: 'suspended' }), e => e.status === 409);
});
test('revocation and permission changes invalidate already issued sessions immediately', async () => {
  const f = await fixture(), staff = await activate(f, await invite(f));
  const request = await signedRequest(f, staff);
  assert.equal((await f.auth.adminSessionIdentity(request, f.env)).role, 'operator');
  await f.team.updateAdmin(f.db, f.owner, { ...staff, permissions: ['orders'], status: 'active' });
  assert.equal(await f.auth.adminSessionIdentity(request, f.env), null);
  const fresh = await signedRequest(f, staff);
  assert.deepEqual((await f.auth.adminSessionIdentity(fresh, f.env)).permissions, ['orders']);
});
test('a removed administrator cannot use a stale identity to invite users', async () => {
  const f = await fixture(); const admin = await activate(f, await invite(f, 'manager@gmail.com', 'admin'), 'manager-sub');
  await f.team.updateAdmin(f.db, f.owner, { ...admin, status: 'suspended' });
  await assert.rejects(f.team.inviteAdmin(f.db, admin, { email: 'late@gmail.com', role: 'operator', permissions: ['products'] }), e => e.status === 403);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM admin_members WHERE email='late@gmail.com'").get().n, 0);
});
test('password-era cookies and customer sessions never authorize admin access', async () => {
  const f = await fixture();
  for (const cookie of ['nudema_admin_session=old.signed.cookie', 'nudema_session=' + 'f'.repeat(64)]) assert.equal(await f.auth.adminSessionIdentity(new Request(origin + '/admin', { headers: { Cookie: cookie } }), f.env), null);
  const { onRequestPost } = await import('./functions/api/admin-auth/login.js'); assert.equal(onRequestPost().status, 410);
});
test('every admin endpoint enforces permissions and cross-origin writes are denied', async () => {
  const f = await fixture(), staff = await activate(f, await invite(f));
  for (const [path, method, expected] of [['state', 'GET', 200], ['catalog', 'PUT', 200], ['store/products', 'PUT', 200], ['images', 'POST', 200], ['team', 'GET', 403], ['audit', 'GET', 403], ['store/orders', 'PUT', 403], ['orders/TEST', 'PATCH', 403], ['store/settings', 'PUT', 403], ['unknown', 'GET', 403]]) {
    const request = await signedRequest(f, staff, '/api/admin/' + path, method);
    const response = await f.middleware.onRequest({ request, env: f.env, data: {}, next: async () => Response.json({ ok: true }) });
    assert.equal(response.status, expected, path);
  }
  const request = await signedRequest(f, f.owner, '/api/admin/store/products', 'PUT', { Origin: 'https://evil.example.invalid' });
  assert.equal((await f.middleware.onRequest({ request, env: f.env, data: {}, next: () => { throw Error('cross-origin write passed'); } })).status, 403);
});
test('server state hides unauthorized order data and analytics-only data omits customer details', async () => {
  const f = await fixture(); await f.lib.ensureSchema(f.db);
  const order = { no: 'TEST-1', customer: 'Private Name', phone: '99112233', email: 'private@example.invalid', address: 'Private Address', note: 'private', items: [{ pid: 1, qty: 1 }], date: '2026-11-16', status: 'paid', total: 100 };
  f.db.sqlite.prepare('INSERT INTO orders(order_no,payload) VALUES(?,?)').run(order.no, JSON.stringify(order));
  const operator = { role: 'operator', status: 'active', permissions: ['products'] };
  let response = await f.state.onRequestGet({ env: f.env, data: { admin: operator } });
  let body = await response.json(); assert.equal(body.data.orders, undefined); assert.equal(body.data.reviews, undefined);
  response = await f.state.onRequestGet({ env: f.env, data: { admin: { ...operator, permissions: ['analytics'] } } });
  body = await response.json(); const text = JSON.stringify(body);
  assert.equal(body.data.orders.length, 1);
  for (const value of ['Private Name', '99112233', 'private@example.invalid', 'Private Address']) assert.equal(text.includes(value), false);
});
test('membership updates and audit trail commit together; duplicate invites create no extra records', async () => {
  const f = await fixture(), member = await invite(f);
  await assert.rejects(invite(f), e => e.status === 409);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM admin_audit').get().n, 1);
  await f.team.updateAdmin(f.db, f.owner, { ...member, status: 'revoked' });
  const events = f.db.sqlite.prepare('SELECT * FROM admin_audit').all(); assert.equal(events.length, 2);
  assert.ok(events.some(e => e.action === 'team.update' && JSON.parse(e.details).after.status === 'revoked'));
});
test('PC and mobile navigation follow roles and keep Google invite acceptance behind the auth screen', async () => {
  const access = require('./admin-team.js');
  assert.equal(access.can({ role: 'operator', status: 'active', permissions: ['products'] }, 'team'), false);
  for (const file of ['Nudema Admin.dc.html', 'Nudema Admin Mobile.dc.html']) {
    const context = vm.createContext({ window: { NudemaAdminAccess: access }, DCLogic: class { constructor() {} setState(value) { Object.assign(this.state, value); } }, NudemaStore: { remoteStatus: { enabled: true, identity: { role: 'operator', status: 'active', permissions: ['products'] } } } });
    const source = fs.readFileSync(file, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
    const component = vm.runInContext(`(function(){${source};return new Component({});})()`, context);
    assert.equal(component.adminCan('products'), true); assert.equal(component.adminCan('orders'), false); assert.equal(component.adminCan('team'), false);
    await component.finishAuthentication({ status: 'invited', email: 'staff@gmail.com' });
    assert.equal(component.state.authed, false); assert.equal(component.state.adminInvitation.email, 'staff@gmail.com');
  }
});
test('restricted admin sync and sign-out never clear public storefront content or products', async () => {
  const storage = new Map([['nudema_products', '[{"id":99}]'], ['nudema_content', '{"marquee":"Public banner"}']]);
  const listeners = {};
  const window = { location: { hostname: 'shop.example.invalid', pathname: '/admin', protocol: 'https:', search: '', hash: '', port: '' }, addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {}, dispatchEvent() {} };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  window.localStorage = localStorage;
  let authorized = true;
  const context = vm.createContext({ window, localStorage, URLSearchParams, CustomEvent: class {}, console, setInterval() {}, setTimeout() {}, fetch: async () => authorized ? Response.json({ identity: { role: 'operator', permissions: ['products'], status: 'active' }, data: { products: [{ id: 1 }] } }) : Response.json({ error: 'Admin authentication is required.' }, { status: 401 }) });
  vm.runInContext(fs.readFileSync('nudema-store.js', 'utf8'), context);
  await window.NudemaStore.sync();
  assert.equal(storage.get('nudema_products'), '[{"id":99}]'); assert.equal(storage.get('nudema_content'), '{"marquee":"Public banner"}');
  assert.equal(window.NudemaStore.KEYS.products, 'nudema_admin_cache_products');
  authorized = false; await window.NudemaStore.sync();
  assert.equal(storage.get('nudema_products'), '[{"id":99}]'); assert.equal(storage.get('nudema_content'), '{"marquee":"Public banner"}');
  assert.equal(storage.get('nudema_admin_cache_orders'), '[]');
});
