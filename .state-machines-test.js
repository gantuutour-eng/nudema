const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const owner = { status: 'active', role: 'owner', email: 'private@example.invalid' };
function storeFixture(fetcher) {
  const memory = new Map(), events = [];
  const window = { location: { hostname: 'example.invalid', protocol: 'https:', pathname: '/admin', port: '' }, addEventListener() {}, removeEventListener() {}, dispatchEvent: event => events.push(event) };
  vm.runInNewContext(fs.readFileSync('nudema-store.js', 'utf8'), { window, fetch: fetcher, Promise, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, localStorage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) }, setTimeout() {}, setInterval() {} });
  return { store: window.NudemaStore, events };
}
const loaded = () => Response.json({ identity: owner, data: { products: [], settings: {}, orders: [] } });

test('all writes, including catalog, are serialized with immutable snapshots and server acknowledgements', async () => {
  const requests = [], pending = [];
  const { store } = storeFixture((url, options) => { if (options?.method !== 'PUT') return Promise.resolve(loaded()); const d = deferred(); requests.push({ url, body: JSON.parse(options.body) }); pending.push(d); return d.promise; });
  await store.sync();
  const settings = { storeName: 'first' }, first = store.writeAsync('settings', settings); settings.storeName = 'mutated';
  const second = store.catalog.saveAsync({ categories: ['New'] }, []);
  const third = store.writeAsync('settings', { storeName: 'last' });
  assert.equal(store.inspect().pending, 3); await tick(); assert.equal(requests.length, 1);
  assert.equal(requests[0].body.value.storeName, 'first');
  pending[0].resolve(Response.json({ ok: true })); assert.equal(await first, true); await tick();
  assert.match(requests[1].url, /catalog$/); assert.equal(requests.length, 2);
  pending[1].resolve(Response.json({ ok: true })); assert.equal(await second, true); await tick();
  assert.equal(requests[2].body.value.storeName, 'last');
  pending[2].resolve(Response.json({ ok: true })); assert.equal(await third, true);
  assert.equal(store.inspect().pending, 0); assert.equal(store.inspect().save, 'saved');
});

test('one successful resource cannot hide another failed save; polling preserves edits and retry sends the retained snapshot', async () => {
  let fail = true, reads = 0; const writes = [];
  const { store } = storeFixture(async (url, options) => {
    if (options?.method !== 'PUT') { reads++; return loaded(); }
    writes.push({ url, body: JSON.parse(options.body) });
    return url.endsWith('/settings') && fail ? Response.json({ error: 'Offline' }, { status: 503 }) : Response.json({ ok: true });
  });
  await store.sync(); assert.equal(await store.writeAsync('settings', { storeName: 'Keep me' }), false);
  assert.equal(await store.writeAsync('content', { slides: [] }), true);
  assert.equal(store.remoteStatus.error, 'Offline'); assert.equal(store.inspect().save, 'failed');
  assert.equal(await store.sync(), false); assert.equal(reads, 1); assert.equal(store.read('settings').storeName, 'Keep me');
  fail = false; assert.equal(await store.retryWrites(), true); await store.whenIdle();
  assert.equal(writes.at(-1).body.value.storeName, 'Keep me'); assert.equal(store.inspect().retryable, 0);
  assert.equal(store.remoteStatus.error, ''); assert.equal(store.inspect().save, 'saved');
});

test('logout invalidates late acknowledgements and queued writes cannot restore a privileged session', async () => {
  const pending = deferred(); let writes = 0;
  const { store } = storeFixture((_url, options) => { if (options?.method !== 'PUT') return Promise.resolve(loaded()); writes++; return pending.promise; });
  await store.sync(); const first = store.writeAsync('orders', [{ no: 'private-order' }]);
  const second = store.writeAsync('content', { slides: [] }); await tick(); store.endSession();
  pending.resolve(Response.json({ ok: true }));
  assert.equal(await first, false); assert.equal(await second, false); assert.equal(writes, 1);
  assert.equal(store.remoteStatus.identity, null); assert.equal(store.remoteStatus.ready, false); assert.equal(store.read('orders').length, 0);
});

test('a catalog acknowledgement cannot overwrite a newer optimistic product edit', async () => {
  const d = deferred(); let writes = 0;
  const { store } = storeFixture((_url, options) => options?.method !== 'PUT' ? Promise.resolve(loaded()) : ++writes === 1 ? d.promise : Promise.resolve(Response.json({ ok: true })));
  await store.sync(); const catalog = store.catalog.saveAsync({ categories: ['A'] }, [{ id: 1, title: 'Before' }]);
  const product = store.writeAsync('products', [{ id: 1, title: 'After' }]);
  d.resolve(Response.json({ ok: true })); await catalog; await product;
  assert.equal(store.read('products')[0].title, 'After');
});

test('an obsolete poll failure does not sign out a session after a newer successful mutation', async () => {
  const pending = deferred(); let reads = 0;
  const { store } = storeFixture((_url, options) => options?.method === 'PUT' ? Promise.resolve(Response.json({ ok: true })) : ++reads === 1 ? Promise.resolve(loaded()) : pending.promise);
  await store.sync(); const poll = store.sync(); await store.writeAsync('settings', { storeName: 'New' });
  pending.resolve(Response.json({ error: 'Old failure' }, { status: 401 })); await poll;
  assert.equal(store.remoteStatus.ready, true); assert.equal(store.remoteStatus.identity.role, 'owner');
});

test('diagnostics are detached, bounded and contain no identity or saved payload', async () => {
  const { store } = storeFixture(async (_url, options) => options?.method === 'PUT' ? Response.json({ ok: true }) : loaded()); await store.sync();
  for (let i = 0; i < 14; i++) await store.writeAsync('settings', { bankAccount: 'SECRET-ACCOUNT' });
  const snapshot = store.inspect(); assert.equal(snapshot.trace.length, 30);
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET-ACCOUNT|private@|bankAccount/);
  snapshot.resources[0].state = 'tampered'; snapshot.trace[0].state = 'tampered';
  assert.doesNotMatch(JSON.stringify(store.inspect()), /tampered/);
});
test('an HTTP 200 HTML/error page is not a successful save acknowledgement', async () => {
  const { store } = storeFixture(async (_url, options) => options?.method === 'PUT' ? new Response('<html>proxy error</html>') : loaded());
  await store.sync(); assert.equal(await store.writeAsync('settings', { shopName: 'Keep draft' }), false);
  assert.equal(store.inspect().save, 'failed'); assert.equal(store.inspect().retryable, 1);
  assert.equal(store.remoteStatus.errorStatus, 502); assert.equal(store.remoteStatus.identity.role, 'owner');
});

function elementClasses(file, fetcher) {
  const classes = {}, events = [];
  class Element { constructor() { this.dataset = {}; } setAttribute(name, value) { this[name] = value; } dispatchEvent(e) { events.push(e); } }
  const window = { NudemaStore: { localPreview: false }, addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, document: { readyState: 'loading', addEventListener() {} }, HTMLElement: Element, customElements: { get: n => classes[n], define: (n, c) => { classes[n] = c; } }, fetch: fetcher, AbortController, clearTimeout, setTimeout, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
  return { classes, events };
}
function pickerFixture(fetcher) {
  const { classes, events } = elementClasses('address-picker.js', fetcher), picker = new classes['nudema-address-picker']();
  picker.input = { value: 'Ulaanbaatar', focus() {} }; picker.searchButton = {}; picker.status = {};
  picker.results = { innerHTML: '', replaceChildren() { this.innerHTML = ''; }, querySelectorAll() { return []; } };
  picker.selection = { hidden: true, querySelector() { return this.span ||= {}; } };
  return { picker, events };
}
test('clearing or selecting an address invalidates a response even when fetch ignores AbortSignal', async () => {
  for (const action of ['clear', 'pick']) {
    const d = deferred(), { picker } = pickerFixture(() => d.promise); const request = picker.search();
    if (action === 'clear') picker.clear(); else picker.pick({ lat: 47.9, lng: 106.9, label: 'Chosen' }, false);
    const status = picker.status.textContent;
    d.resolve(Response.json({ places: [{ name: 'Stale', label: 'Old' }] })); await request;
    assert.equal(picker.status.textContent, status); assert.equal(picker.results.innerHTML, '');
    assert.equal(picker.dataset.selectionState, action === 'pick' ? 'selected' : 'empty'); assert.equal(picker['aria-busy'], 'false');
  }
});
test('an old address failure cannot replace newer results or unlock their in-flight request', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const { picker } = pickerFixture(() => ++calls === 1 ? old.promise : current.promise);
  const first = picker.search(); picker.input.value = 'New address'; const second = picker.search();
  old.reject(new Error('Stale error')); await first;
  assert.equal(picker.searchState, 'searching'); assert.equal(picker.searchButton.disabled, true);
  current.resolve(Response.json({ places: [] })); await second; assert.equal(picker.searchState, 'empty');
});
test('address disconnection removes map references and rejects invalid numeric selections', () => {
  const { picker, events } = pickerFixture(); let removed = 0;
  picker.map = { remove() { removed++; } }; picker.marker = {};
  picker.pick({ lat: NaN, lng: 106, label: 'Invalid' }); assert.equal(events.length, 0);
  picker.disconnectedCallback(); assert.equal(removed, 1); assert.equal(picker.map, null); assert.equal(picker.marker, null);
  assert.equal(picker.dataset.searchState, 'disconnected');
});
test('team tab changes and disconnects ignore older successful and failed loads', async () => {
  const { classes } = elementClasses('admin-team.js'), team = new classes['nudema-admin-team']();
  team.render = () => {}; team.entries = []; team.tab = 'members';
  const old = deferred(), current = deferred(); let calls = 0;
  team.request = () => ++calls === 1 ? old.promise : current.promise;
  const first = team.load(), second = team.load(); current.resolve({ members: ['Latest'], identity: owner }); await second;
  old.reject(new Error('Stale')); await first; assert.equal(team.members[0], 'Latest'); assert.equal(team.error, undefined);
  const last = deferred(); team.request = () => last.promise; const third = team.load(); team.disconnectedCallback();
  last.resolve({ members: ['After disconnect'], identity: owner }); await third; assert.equal(team.members[0], 'Latest');
});

function database() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  const statement = (sql, args = []) => ({ bind: (...v) => statement(sql, v), async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; } });
  return { sqlite, prepare: statement, async batch(statements) { sqlite.exec('BEGIN IMMEDIATE'); try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
}
test('order status updates preserve account links, original timestamps and replacement deletion semantics atomically', async () => {
  const { ensureSchema, replaceOrders } = await import('./functions/_lib.js'), db = database(); await ensureSchema(db);
  db.sqlite.exec("INSERT INTO users (id,email,phone,name,password_hash,password_salt) VALUES ('user','a@b','123','Test','','')");
  await replaceOrders(db, [{ no: 'A', status: 'pending', createdAt: '2020-01-01' }, { no: 'B', status: 'pending' }]);
  db.sqlite.exec("INSERT INTO user_orders (order_no,user_id) VALUES ('A','user'),('B','user')");
  await replaceOrders(db, [{ no: 'A', status: 'paid' }]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM user_orders').get().n, 1);
  const row = db.sqlite.prepare("SELECT * FROM orders WHERE order_no='A'").get(); assert.equal(row.status, 'paid'); assert.equal(row.created_at, '2020-01-01');
  await assert.rejects(replaceOrders(db, [{ no: 'A' }, { no: 'A' }]));
  db.sqlite.exec("CREATE TRIGGER reject_orders BEFORE UPDATE ON orders BEGIN SELECT RAISE(ABORT,'Test rollback'); END");
  await assert.rejects(replaceOrders(db, [{ no: 'C' }, { no: 'A', status: 'done' }]));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM orders WHERE order_no='C'").get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM user_orders').get().n, 1); db.sqlite.close();
});
test('legacy and current cancellation spellings have identical account semantics', async () => {
  const { isCancelled } = await import('./functions/_order-state.js');
  assert.equal(isCancelled('cancel'), true); assert.equal(isCancelled('cancelled'), true); assert.equal(isCancelled('pending'), false);
});
test('order creation and its member link roll back together if linking fails', async () => {
  const { onRequestPost } = await import('./functions/api/orders.js');
  const { ensureSchema, writeState } = await import('./functions/_lib.js');
  const { createSession } = await import('./functions/_auth.js'); const db = database(); await ensureSchema(db);
  db.sqlite.exec("INSERT INTO users (id,email,phone,name,password_hash,password_salt) VALUES ('user','a@b','123','Test','','')");
  await writeState(db, 'products', [{ id: 1, title: 'Test', price: 100, stock: 10 }]);
  const cookie = await createSession(db, new Request('https://example.invalid'), 'user');
  db.sqlite.exec("CREATE TRIGGER reject_link BEFORE INSERT ON user_orders BEGIN SELECT RAISE(ABORT,'Test rollback'); END");
  const response = await onRequestPost({ request: new Request('https://example.invalid/api/orders', { method: 'POST', headers: { Cookie: cookie.split(';')[0] }, body: JSON.stringify({ items: [{ id: 1, qty: 1 }], customer: { name: 'Test', phone: '123', address: 'Test' } }) }), env: { DB: db } });
  assert.equal(response.status, 500); assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0); db.sqlite.close();
});
test('stock checks combine all options/lines of one product and reject fractional quantities', async () => {
  const { onRequestPost } = await import('./functions/api/orders.js'); const { ensureSchema, writeState } = await import('./functions/_lib.js');
  const db = database(); await ensureSchema(db); await writeState(db, 'products', [{ id: 1, title: 'Only one', price: 100, stock: 1 }]);
  for (const items of [[{ id: 1, qty: 1 }, { id: 1, qty: 1 }], [{ id: 1, qty: 1.5 }]]) {
    const response = await onRequestPost({ request: new Request('https://example.invalid/api/orders', { method: 'POST', body: JSON.stringify({ items, customer: { name: 'Test', phone: '123', address: 'Test' } }) }), env: { DB: db } });
    assert.equal(response.status, 400);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0); db.sqlite.close();
});
test('the audit inventory has unique IDs and references repository-owned existing sources', () => {
  const inventory = JSON.parse(fs.readFileSync('docs/state-machines.json', 'utf8'));
  assert.equal(new Set(inventory.machines.map(m => m.id)).size, inventory.machines.length);
  for (const m of inventory.machines) {
    for (const file of m.files) assert.ok(fs.existsSync(file), m.id + ': ' + file);
    assert.ok(m.states.length && m.events.length && m.invariant && m.decision, m.id);
  }
});
