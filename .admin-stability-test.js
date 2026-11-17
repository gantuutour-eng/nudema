const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const owner = { role: 'owner', status: 'active', email: 'owner@example.invalid', permissions: ['products'] };
function component(file, extra = {}) {
  const store = { remoteStatus: { enabled: true, identity: owner, ready: true }, read: key => ['settings', 'content', 'taxonomy', 'statuses'].includes(key) ? {} : [], ...extra };
  const context = vm.createContext({ window: { location: { search: '' }, NudemaAdminAccess: require('./admin-team.js') }, URLSearchParams, Promise, NudemaStore: store, DCLogic: class { setState(p) { Object.assign(this.state, p); } } });
  const script = fs.readFileSync(file, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  const admin = vm.runInContext(`(function(){${script};return new Component({});})()`, context);
  Object.assign(admin.state, { authed: true, sessionVerified: true, authLoading: false, adminIdentity: owner, taxDraft: 'My category', taxEdit: 'categories:-1', form: { title: 'Unsaved product' } });
  return { admin, store, context };
}
for (const file of ['Nudema Admin.dc.html', 'Nudema Admin Mobile.dc.html']) {
  for (const status of [0, 400, 403, 503]) test(`${file}: HTTP ${status} preserves login and unsaved category/product edits`, () => {
    const { admin } = component(file);
    admin.handleRemoteError({ detail: { status, authExpired: false, message: 'Save failed', operation: 'save' } });
    assert.equal(admin.state.authed, true); assert.equal(admin.state.sessionVerified, true);
    assert.equal(admin.state.taxDraft, 'My category'); assert.equal(admin.state.form.title, 'Unsaved product');
    assert.equal(admin.state.remoteNotice, 'Save failed'); assert.equal(admin.state.loginError, '');
  });
  test(`${file}: only an actual HTTP 401 returns to sign-in`, () => {
    const { admin } = component(file);
    admin.handleRemoteError({ detail: { status: 401, authExpired: true, message: 'Unauthorized' } });
    assert.equal(admin.state.authed, false); assert.equal(admin.state.sessionVerified, false);
    assert.equal(admin.state.adminIdentity, null);
  });
  test(`${file}: initial data failure offers retry without asking for Google login again`, async () => {
    const { admin, store } = component(file, { sync: async () => false });
    Object.assign(store.remoteStatus, { errorStatus: 503, error: 'Network error' });
    await admin.finishAuthentication(owner);
    assert.equal(admin.state.sessionVerified, true); assert.equal(admin.state.authed, false);
    assert.ok(admin.state.dataError); assert.equal(admin.state.loginError, '');
  });
  test(`${file}: taxonomy is committed only after server confirmation and rejected drafts stay editable`, async () => {
    let settle; const { admin } = component(file, { catalog: { saveAsync: () => new Promise(resolve => { settle = resolve; }) } });
    const result = { taxonomy: { categories: ['New category'] }, products: [] };
    const first = admin.persistTaxonomy(result);
    assert.equal(admin.state.taxSaving, true); assert.equal(admin.state.taxDraft, 'My category'); assert.equal(admin.state.taxEdit, 'categories:-1');
    settle(false); await first;
    assert.equal(admin.state.taxSaving, false); assert.equal(admin.state.taxDraft, 'My category'); assert.equal(admin.state.authed, true);
    const second = admin.persistTaxonomy(result); settle(true); await second;
    assert.equal(admin.state.taxDraft, ''); assert.equal(admin.state.taxEdit, ''); assert.deepEqual(admin.state.taxonomy, result.taxonomy);
  });
  test(`${file}: raw templates and provisional screens stay hidden until an authentication verdict`, () => {
    const { admin, context } = component(file); let revealed = 0;
    context.window.NudemaAdminAccess = { reveal() { revealed++; } };
    admin.state.authLoading = true; admin.componentDidUpdate(); assert.equal(revealed, 0);
    admin.state.authLoading = false; admin.componentDidUpdate(); assert.equal(revealed, 1);
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.indexOf('id="nd-admin-startup"') < html.indexOf('<x-dc>'));
    assert.match(html.split('</head>')[0], /nd-admin-booting #dc-root\{visibility:hidden!important\}/);
  });
}
function remoteStore(fetcher) {
  const memory = new Map(), events = [];
  const localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  const window = { location: { hostname: 'shop.example.invalid', port: '', protocol: 'https:', pathname: '/admin' }, addEventListener() {}, removeEventListener() {}, dispatchEvent: e => events.push(e) };
  const context = vm.createContext({ window, localStorage, fetch: fetcher, Promise, console, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, setTimeout() {}, setInterval() {} });
  vm.runInContext(fs.readFileSync('nudema-store.js', 'utf8'), context);
  return { store: window.NudemaStore, events, memory };
}
test('polling failures retain last good data and identity; 401 clears privileged data', async () => {
  let status = 200;
  const { store, events } = remoteStore(async () => status === 200 ? Response.json({ identity: owner, data: { products: [{ id: 1 }], orders: [{ no: 'private-order' }] } }) : Response.json({ error: 'Request failed' }, { status }));
  await store.sync(); const first = JSON.stringify(store.read('products'));
  status = 503; assert.equal(await store.sync(), false);
  assert.equal(store.remoteStatus.ready, true); assert.equal(store.remoteStatus.identity.email, owner.email); assert.equal(JSON.stringify(store.read('products')), first);
  assert.equal(events.at(-1).detail.authExpired, false); assert.equal(events.at(-1).detail.status, 503);
  status = 401; await store.sync();
  assert.equal(store.remoteStatus.ready, false); assert.equal(store.remoteStatus.identity, null); assert.equal(store.read('orders').length, 0);
  assert.equal(events.at(-1).detail.authExpired, true);
});
test('failed category saves preserve the previously confirmed catalog and session', async () => {
  const { store, events } = remoteStore(async (url, options) => options?.method === 'PUT' ? Response.json({ error: 'Invalid category' }, { status: 400 }) : Response.json({ identity: owner, data: { products: [{ id: 1, category: 'Existing' }], taxonomy: { categories: ['Existing'], badges: [] } } }));
  await store.sync();
  assert.equal(await store.catalog.saveAsync({ categories: ['Invalid'] }, []), false);
  assert.deepEqual(JSON.parse(JSON.stringify(store.read('taxonomy').categories)), ['Existing']);
  assert.equal(store.remoteStatus.identity.email, owner.email); assert.equal(store.remoteStatus.ready, true);
  const failure = events.findLast(event => event.type === 'nudema:remote-error');
  assert.equal(failure.detail.operation, 'save'); assert.equal(failure.detail.status, 400);
});
test('an older poll cannot overwrite a category that was just saved', async () => {
  let resolvePoll, reads = 0;
  const response = categories => Response.json({ identity: owner, data: { products: [], taxonomy: { categories, badges: [] } } });
  const { store } = remoteStore(async (_url, options) => {
    if (options?.method === 'PUT') return Response.json({ ok: true });
    if (++reads === 1) return response(['Old']);
    return new Promise(resolve => { resolvePoll = resolve; });
  });
  await store.sync(); const oldPoll = store.sync();
  assert.equal(await store.catalog.saveAsync({ categories: ['Old', 'New'], badges: [] }, []), true);
  resolvePoll(response(['Old'])); await oldPoll;
  assert.deepEqual(JSON.parse(JSON.stringify(store.read('taxonomy').categories)), ['Old', 'New']);
});
test('legacy empty taxonomy is reconstructed from existing product categories without changing products', async () => {
  const { reconcileTaxonomy, validateTaxonomy } = await import('./functions/_catalog.js');
  const products = [{ id: 1, category: 'Арьс арчилгааны багц', productType: 'beauty' }], original = JSON.stringify(products);
  const taxonomy = reconcileTaxonomy({ categories: [], badges: ['Эрэлттэй'] }, products);
  assert.deepEqual(taxonomy.categories, ['Арьс арчилгааны багц']); assert.equal(taxonomy.categoryDepartments[taxonomy.categories[0]], 'Гоо сайхан');
  assert.equal(validateTaxonomy(taxonomy), ''); assert.equal(JSON.stringify(products), original);
  const { store } = remoteStore(async () => Response.json({ identity: owner, data: { products, taxonomy: { categories: [], badges: [] } } }));
  await store.sync(); assert.equal(store.read('taxonomy').categories[0], 'Арьс арчилгааны багц');
});
