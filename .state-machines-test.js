const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function idle(store) { for (let i = 0; i < 30 && store.remoteStatus.pendingWrites; i++) await tick(); assert.equal(store.remoteStatus.pendingWrites, 0); }
async function save(store, name, value) { assert.equal(store.write(name, value), true); await idle(store); }
const owner = { status: 'active', role: 'owner', email: 'private@example.invalid' };
function storeFixture(fetcher) {
  const memory = new Map(), events = [];
  const window = { location: { hostname: 'example.invalid', protocol: 'https:', pathname: '/admin', port: '' }, addEventListener() {}, removeEventListener() {}, dispatchEvent: event => events.push(event) };
  vm.runInNewContext(fs.readFileSync('nudema-store.js', 'utf8'), { window, fetch: fetcher, Promise, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, localStorage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) }, setTimeout() {}, setInterval() {} });
  return { store: window.NudemaStore, events };
}
const loaded = () => Response.json({ identity: owner, data: { products: [], settings: {}, orders: [] } });
test('single-order status saves preserve the other rows and their display order', async () => {
  const requests = [], orders = [{ no: 'NEW', status: 'pending' }, { no: 'OLD', status: 'pending' }];
  const { store } = storeFixture(async (url, options) => {
    requests.push({ url, method: options?.method });
    return options?.method === 'PATCH' ? Response.json({ ok: true, order: { no: 'OLD', status: 'paid' } }) : Response.json({ identity: owner, data: { orders } });
  });
  await store.sync(); assert.equal(await store.updateOrderStatus('OLD', 'paid'), true);
  assert.equal(JSON.stringify(store.read('orders')), JSON.stringify([{ no: 'NEW', status: 'pending' }, { no: 'OLD', status: 'paid' }]));
  assert.deepEqual(requests.at(-1), { url: '/api/admin/orders/OLD', method: 'PATCH' });
});

test('normal admin writes and catalog saves retain call order and submitted values', async () => {
  const requests = [], pending = [];
  const { store } = storeFixture((url, options) => { if (options?.method !== 'PUT') return Promise.resolve(loaded()); const d = deferred(); requests.push({ url, body: JSON.parse(options.body) }); pending.push(d); return d.promise; });
  await store.sync();
  const settings = { storeName: 'first' }; store.write('settings', settings); settings.storeName = 'mutated';
  const catalog = store.catalog.saveAsync({ categories: ['New'] }, []);
  store.write('settings', { storeName: 'last' });
  assert.equal(store.remoteStatus.pendingWrites, 3); await tick(); assert.equal(requests.length, 1);
  assert.equal(requests[0].body.value.storeName, 'first');
  pending[0].resolve(Response.json({ ok: true })); await tick();
  assert.match(requests[1].url, /catalog$/); assert.equal(requests.length, 2);
  pending[1].resolve(Response.json({ ok: true })); assert.equal(await catalog, true); await tick();
  assert.equal(requests[2].body.value.storeName, 'last');
  pending[2].resolve(Response.json({ ok: true })); await idle(store);
  assert.equal(store.remoteStatus.saveState, 'saved');
});

test('unrelated success and polling preserve a failed edit until the user retries', async () => {
  let fail = true, reads = 0; const writes = [];
  const { store } = storeFixture(async (url, options) => {
    if (options?.method !== 'PUT') { reads++; return loaded(); }
    writes.push({ url, body: JSON.parse(options.body) });
    return url.endsWith('/settings') && fail ? Response.json({ error: 'Offline' }, { status: 503 }) : Response.json({ ok: true });
  });
  await store.sync(); await save(store, 'settings', { storeName: 'Keep me' });
  assert.equal(store.remoteStatus.saveState, 'failed');
  await save(store, 'content', { slides: [] });
  assert.equal(store.remoteStatus.error, 'Offline'); assert.equal(store.remoteStatus.saveState, 'failed');
  assert.equal(await store.sync(), false); assert.equal(reads, 1); assert.equal(store.read('settings').storeName, 'Keep me');
  fail = false; assert.equal(await store.retryWrites(), true);
  assert.equal(writes.at(-1).body.value.storeName, 'Keep me'); assert.equal(store.remoteStatus.retryableWrites, 0);
  assert.equal(store.remoteStatus.error, ''); assert.equal(store.remoteStatus.saveState, 'saved');
});

test('catalog completion cannot replace the product edit queued immediately after it', async () => {
  const d = deferred(); let writes = 0;
  const { store } = storeFixture((_url, options) => options?.method !== 'PUT' ? Promise.resolve(loaded()) : ++writes === 1 ? d.promise : Promise.resolve(Response.json({ ok: true })));
  await store.sync(); const catalog = store.catalog.saveAsync({ categories: ['A'] }, [{ id: 1, title: 'Before' }]);
  store.write('products', [{ id: 1, title: 'After' }]);
  d.resolve(Response.json({ ok: true })); await catalog; await idle(store);
  assert.equal(store.read('products')[0].title, 'After');
});

function elementClasses(file, fetcher) {
  const classes = {};
  class Element { constructor() { this.dataset = {}; } setAttribute(name, value) { this[name] = value; } dispatchEvent() {} }
  const window = { NudemaStore: { localPreview: false }, addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, document: { readyState: 'loading', addEventListener() {} }, HTMLElement: Element, customElements: { get: n => classes[n], define: (n, c) => { classes[n] = c; } }, fetch: fetcher, AbortController, clearTimeout, setTimeout, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
  return classes;
}
function pickerFixture(fetcher) {
  const classes = elementClasses('address-picker.js', fetcher), picker = new classes['nudema-address-picker']();
  picker.input = { value: 'Ulaanbaatar', focus() {} }; picker.searchButton = {}; picker.status = {};
  picker.results = { innerHTML: '', replaceChildren() { this.innerHTML = ''; }, querySelectorAll() { return []; } };
  picker.selection = { hidden: true, querySelector() { return this.span ||= {}; } };
  return picker;
}
test('clearing or selecting an address cancels a search already in flight', async () => {
  for (const action of ['clear', 'pick']) {
    const d = deferred(), picker = pickerFixture(() => d.promise); const request = picker.search();
    if (action === 'clear') picker.clear(); else picker.pick({ lat: 47.9, lng: 106.9, label: 'Chosen' }, false);
    const status = picker.status.textContent;
    d.resolve(Response.json({ places: [{ name: 'Stale', label: 'Old' }] })); await request;
    assert.equal(picker.status.textContent, status); assert.equal(picker.results.innerHTML, '');
    assert.equal(picker.dataset.selectionState, action === 'pick' ? 'selected' : 'empty'); assert.equal(picker['aria-busy'], 'false');
  }
});
test('a previous address lookup error does not replace the current search state', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const picker = pickerFixture(() => ++calls === 1 ? old.promise : current.promise);
  const first = picker.search(); picker.input.value = 'New address'; const second = picker.search();
  old.reject(new Error('Stale error')); await first;
  assert.equal(picker.searchState, 'searching'); assert.equal(picker.searchButton.disabled, true);
  current.resolve(Response.json({ places: [] })); await second; assert.equal(picker.searchState, 'empty');
});
test('the latest team reload owns its result and error', async () => {
  const classes = elementClasses('admin-team.js'), team = new classes['nudema-admin-team']();
  team.render = () => {}; team.entries = []; team.tab = 'members';
  const old = deferred(), current = deferred(); let calls = 0;
  team.request = () => ++calls === 1 ? old.promise : current.promise;
  const first = team.load(), second = team.load(); current.resolve({ members: ['Latest'], identity: owner }); await second;
  old.reject(new Error('Stale')); await first; assert.equal(team.members[0], 'Latest'); assert.equal(team.error, undefined);
});

function database() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  const statement = (sql, args = []) => ({ bind: (...v) => statement(sql, v), async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; } });
  return { sqlite, prepare: statement, async batch(statements) { sqlite.exec('BEGIN IMMEDIATE'); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
}
test('order status updates preserve member links and original creation times', async () => {
  const { ensureSchema, replaceOrders } = await import('./functions/_lib.js'), db = database(); await ensureSchema(db);
  db.sqlite.exec("INSERT INTO users (id,email,phone,name,password_hash,password_salt) VALUES ('user','a@b','123','Test','','')");
  await replaceOrders(db, [{ no: 'A', status: 'pending', createdAt: '2020-01-01' }, { no: 'B', status: 'pending' }]);
  db.sqlite.exec("INSERT INTO user_orders (order_no,user_id) VALUES ('A','user'),('B','user')");
  await replaceOrders(db, [{ no: 'A', status: 'paid' }]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM user_orders').get().n, 1);
  const row = db.sqlite.prepare("SELECT * FROM orders WHERE order_no='A'").get(); assert.equal(row.status, 'paid'); assert.equal(row.created_at, '2020-01-01');
  await assert.rejects(replaceOrders(db, [{ no: 'A' }, { no: 'A' }]));
  db.sqlite.close();
});
test('account totals exclude both existing cancellation spellings', async () => {
  const { ensureSchema, replaceOrders } = await import('./functions/_lib.js');
  const { createSession } = await import('./functions/_auth.js');
  const { onRequestGet } = await import('./functions/api/auth/account.js'); const db = database(); await ensureSchema(db);
  db.sqlite.exec("INSERT INTO users (id,email,phone,name,password_hash,password_salt) VALUES ('user','a@b','123','Test','','')");
  await replaceOrders(db, [{ no: 'A', status: 'cancel', total: 100 }, { no: 'B', status: 'cancelled', total: 200 }, { no: 'C', status: 'paid', total: 300 }]);
  db.sqlite.exec("INSERT INTO user_orders (order_no,user_id) VALUES ('A','user'),('B','user'),('C','user')");
  const cookie = await createSession(db, new Request('https://example.invalid'), 'user');
  const response = await onRequestGet({ request: new Request('https://example.invalid/api/auth/account', { headers: { Cookie: cookie.split(';')[0] } }), env: { DB: db } });
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.stats.spent, 300); assert.equal(body.stats.points, 6); db.sqlite.close();
});
test('stock checks combine all normal cart options/lines of one product', async () => {
  const { onRequestPost } = await import('./functions/api/orders.js'); const { ensureSchema, writeState } = await import('./functions/_lib.js');
  const db = database(); await ensureSchema(db); await writeState(db, 'products', [{ id: 1, title: 'Only one', price: 100, stock: 1 }]);
  const response = await onRequestPost({ request: new Request('https://example.invalid/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ id: 1, qty: 1 }, { id: 1, qty: 1 }], customer: { name: 'Test', phone: '123', address: 'Test' } }) }), env: { DB: db } });
  assert.equal(response.status, 400); assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0); db.sqlite.close();
});
test('the audit inventory has unique IDs and existing repository sources', () => {
  const inventory = JSON.parse(fs.readFileSync('docs/state-machines.json', 'utf8'));
  assert.equal(new Set(inventory.machines.map(m => m.id)).size, inventory.machines.length);
  for (const m of inventory.machines) {
    for (const file of m.files) assert.ok(fs.existsSync(file), m.id + ': ' + file);
    assert.ok(m.states.length && m.events.length && m.invariant && m.decision, m.id);
  }
});
