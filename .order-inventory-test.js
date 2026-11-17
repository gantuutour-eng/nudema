const { test } = require('node:test');
const assert = require('node:assert/strict');
const database = require('./.test-db.cjs');
const origin = 'https://example.invalid';
const product = { id: 1, title: 'Test', price: 100, stock: 2, category: 'A' };
async function fixture(stock = 2) {
  const db = database(), lib = await import('./functions/_lib.js'); await lib.ensureSchema(db);
  await lib.writeState(db, 'products', [{ ...product, stock }]);
  return { db, lib, env: { DB: db } };
}
async function order(f, qty = 1) {
  const { onRequestPost } = await import('./functions/api/orders.js');
  const response = await onRequestPost({ env: f.env, request: new Request(origin + '/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ id: 1, qty }], customer: { name: 'Test', phone: '00000000', address: 'Local test' } }) }) });
  return { status: response.status, body: await response.json() };
}
const catalog = f => JSON.parse(f.db.sqlite.prepare("SELECT value FROM app_state WHERE name='products'").get().value);
async function patch(f, no, status) {
  const { onRequestPatch } = await import('./functions/api/admin/orders/[no].js');
  const response = await onRequestPatch({ env: f.env, params: { no }, request: new Request(origin + '/api/admin/orders/' + no, { method: 'PATCH', body: JSON.stringify({ status }) }) });
  return { status: response.status, body: await response.json() };
}
test('order creation deducts stock and cannot sell the same remaining unit twice', async () => {
  const f = await fixture(1); const first = await order(f); assert.equal(first.status, 201);
  assert.equal(first.body.order.inventoryDeducted, true); assert.equal(catalog(f)[0].stock, 0);
  assert.equal((await order(f)).status, 400);
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1); f.db.sqlite.close();
});
test('two checkouts using the same catalog snapshot cannot both deduct the last unit', async () => {
  const f = await fixture(1), { readCatalog, createStockOrder } = await import('./functions/_inventory.js');
  const snapshot = await readCatalog(f.db);
  const make = no => ({ no, status: 'pending', email: '', phone: '', createdAt: '2026-11-17', inventoryDeducted: true, items: [{ pid: 1, qty: 1 }] });
  const results = await Promise.allSettled([createStockOrder(f.db, snapshot, make('A')), createStockOrder(f.db, snapshot, make('B'))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(catalog(f)[0].stock, 0); assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1); f.db.sqlite.close();
});
test('updating order A preserves a newer order B and the member link of A', async () => {
  const f = await fixture(5), a = (await order(f)).body.order, b = (await order(f)).body.order;
  f.db.sqlite.exec("INSERT INTO users(id,email,phone,name,password_hash,password_salt) VALUES('user','test@example.invalid','0','Test','','')");
  f.db.sqlite.prepare("INSERT INTO user_orders(order_no,user_id) VALUES(?,'user')").run(a.no);
  assert.equal((await patch(f, a.no, 'paid')).status, 200);
  assert.ok(f.db.sqlite.prepare('SELECT 1 FROM orders WHERE order_no=?').get(b.no));
  assert.ok(f.db.sqlite.prepare('SELECT 1 FROM user_orders WHERE order_no=?').get(a.no));
  assert.equal(catalog(f)[0].stock, 3); f.db.sqlite.close();
});
test('cancel restores once; reopening consumes once and checks remaining stock', async () => {
  const f = await fixture(1), a = (await order(f)).body.order;
  assert.equal((await patch(f, a.no, 'cancel')).status, 200); assert.equal(catalog(f)[0].stock, 1);
  assert.equal((await patch(f, a.no, 'cancel')).status, 200); assert.equal(catalog(f)[0].stock, 1);
  assert.equal((await patch(f, a.no, 'paid')).status, 200); assert.equal(catalog(f)[0].stock, 0);
  await patch(f, a.no, 'cancel'); await order(f);
  assert.equal((await patch(f, a.no, 'paid')).status, 409); assert.equal(catalog(f)[0].stock, 0);
  assert.equal(JSON.parse(f.db.sqlite.prepare('SELECT payload FROM orders WHERE order_no=?').get(a.no).payload).status, 'cancel'); f.db.sqlite.close();
});
test('legacy orders never add unrecorded deductions back into stock', async () => {
  const f = await fixture(2); await f.lib.replaceOrders(f.db, [{ no: 'LEGACY', status: 'pending', items: [{ pid: 1, qty: 20 }] }]);
  assert.equal((await patch(f, 'LEGACY', 'cancel')).status, 200); assert.equal(catalog(f)[0].stock, 2); f.db.sqlite.close();
});
test('legacy bulk order/status writes are rejected without deleting new orders', async () => {
  const f = await fixture(2); await order(f); const { onRequestPut } = await import('./functions/api/admin/store/[name].js');
  for (const name of ['orders','statuses']) {
    const response = await onRequestPut({ env: f.env, params: { name }, request: new Request(origin + '/api/admin/store/' + name, { method: 'PUT', body: JSON.stringify({ value: [] }) }) });
    assert.equal(response.status, 409);
  }
  assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 1); f.db.sqlite.close();
});
test('a product description save preserves stock already sold by a new order', async () => {
  const f = await fixture(2), before = catalog(f); await order(f);
  const { onRequestPut } = await import('./functions/api/admin/store/[name].js');
  const put = value => onRequestPut({ env: f.env, params: { name: 'products' }, request: new Request(origin + '/api/admin/store/products', { method: 'PUT', body: JSON.stringify(value) }) });
  assert.equal((await put({ value: [{ ...before[0], title: 'Edited' }], stockBefore: { 1: 2 } })).status, 200);
  assert.equal(catalog(f)[0].stock, 1); assert.equal(catalog(f)[0].title, 'Edited');
  assert.equal((await put({ value: [{ ...product, stock: 10 }], stockBefore: { 1: 2 } })).status, 409);
  assert.equal(catalog(f)[0].stock, 1);
  assert.equal((await put({ value: [{ ...product, stock: 10 }], stockBefore: { 1: 1 } })).status, 200); assert.equal(catalog(f)[0].stock, 10); f.db.sqlite.close();
});
test('category rename preserves sold stock and commits the matching taxonomy', async () => {
  const f = await fixture(2), before = catalog(f); await order(f);
  const { onRequestPut } = await import('./functions/api/admin/catalog.js');
  const response = await onRequestPut({ env: f.env, request: new Request(origin + '/api/admin/catalog', { method: 'PUT', body: JSON.stringify({ products: [{ ...before[0], category: 'B' }], taxonomy: { categories: ['B'], badges: [] }, stockBefore: { 1: 2 } }) }) });
  assert.equal(response.status, 200); assert.equal(catalog(f)[0].stock, 1); assert.equal(catalog(f)[0].category, 'B');
  assert.deepEqual(JSON.parse(f.db.sqlite.prepare("SELECT value FROM app_state WHERE name='taxonomy'").get().value).categories, ['B']); f.db.sqlite.close();
});
test('known unimplemented default promises are corrected while custom copy is retained', async () => {
  const { storeCopy } = await import('./functions/_store-copy.js');
  for (const separator of ['\n','\\n']) {
    const result = storeCopy('content', { membershipBanner: { title: 'Гишүүн болоод' + separator + 'бүх захиалгад 15% хямдрал', description: 'Бүртгэл үнэгүй · Төрсөн өдрийн купон · Үнэгүй хүргэлт' } });
    assert.doesNotMatch(result.membershipBanner.title, /15%/); assert.doesNotMatch(result.membershipBanner.description, /купон/);
  }
  const custom = { membershipBanner: { title: 'Custom promotion', description: 'Custom terms' } }; assert.deepEqual(storeCopy('content', custom), custom);
  const settings = storeCopy('settings', { bankNote: 'Гүйлгээний утгад захиалагчийн нэрийг заавал бичнэ үү. Төлбөр 24 цагийн дотор баталгаажаагүй бол захиалга автоматаар цуцлагдана.', orderNotify: true });
  assert.doesNotMatch(settings.bankNote, /24/); assert.equal(settings.orderNotify, false);
});
