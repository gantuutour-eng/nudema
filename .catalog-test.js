const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function environment(location = { hostname: 'localhost', port: '4321', protocol: 'http:' }) {
  const mem = new Map(), listeners = {}, timers = new Set();
  const localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const window = { location, localStorage, addEventListener: (n, f) => (listeners[n] ||= []).push(f), removeEventListener() {}, dispatchEvent: e => (listeners[e.type] || []).forEach(f => f(e)) };
  const context = vm.createContext({ window, localStorage, console, URLSearchParams, CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } }, setTimeout: f => { timers.add(f); return 0; }, clearTimeout() {}, setInterval() {}, clearInterval() {} });
  vm.runInContext(fs.readFileSync('nudema-store.js', 'utf8'), context);
  context.NudemaStore = window.NudemaStore;
  vm.runInContext('class DCLogic { constructor() {this.props={};} setState(p) {Object.assign(this.state, typeof p === "function" ? p(this.state) : p);} }', context);
  return { context, mem, store: window.NudemaStore };
}
function component(env, file) {
  const source = fs.readFileSync(file, 'utf8');
  const script = source.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  return vm.runInContext(`(function(){${script};return new Component({});})()`, env.context);
}

test('legacy categories migrate without losing products; all departments remain extensible', () => {
  const { store } = environment();
  const catalog = store.catalog, original = store.read('products');
  let tax = store.read('taxonomy');
  assert.equal(tax.categories.length, 6);
  assert.equal(tax.categoryDepartments[tax.categories[0]], 'Гоо сайхан');
  let result = catalog.editTaxonomy(tax, original, 'categories', -1, 'Анхны тусламж', 'Эмнэлгийн хэрэгсэл');
  assert.equal(result.error, undefined);
  assert.equal(result.taxonomy.categoryDepartments['Анхны тусламж'], 'Эмнэлгийн хэрэгсэл');
  assert.equal(result.products, original);
  assert.ok(catalog.editTaxonomy(result.taxonomy, original, 'categories', -1, 'АНХНЫ ТУСЛАМЖ', 'Гэр ахуй').error);
  assert.ok(catalog.removeTaxonomy(result.taxonomy, original, 'departments', 1).error);
  result = catalog.editTaxonomy(result.taxonomy, original, 'departments', 1, 'Эрүүл мэнд');
  assert.equal(result.taxonomy.categoryDepartments['Анхны тусламж'], 'Эрүүл мэнд');
  result = catalog.editTaxonomy(result.taxonomy, original, 'categories', 0, 'Арчилгааны багц', 'Гоо сайхан');
  assert.equal(result.products[0].category, 'Арчилгааны багц');
  assert.equal(result.products[0].cat, 'Арчилгааны багц');
  assert.ok(catalog.removeTaxonomy(result.taxonomy, result.products, 'categories', 0).error);
  assert.ok(catalog.editTaxonomy(result.taxonomy, original, 'departments', -1, 'Хүнс').taxonomy.departments.includes('Хүнс'));
});

for (const file of ['Nudema Admin.dc.html', 'Nudema Admin Mobile.dc.html']) {
  test(`${file}: category → medical product → edit preserves metadata → customer search/detail`, () => {
    const env = environment(), { store } = env, admin = component(env, file);
    admin.reload();
    admin.startTaxEdit('categories', -1);
    admin.setState({ taxDraft: 'Анхны тусламж', taxDepartment: 'Эмнэлгийн хэрэгсэл' });
    admin.commitTaxEdit();
    assert.equal(admin.state.taxError, '');
    admin.setState({ form: admin.blankForm(), editId: null });
    let values = admin.renderVals();
    values.onFDepartment({ target: { value: 'Эмнэлгийн хэрэгсэл' } });
    assert.equal(admin.form().category, 'Анхны тусламж');
    assert.equal(admin.form().productType, 'medical');
    admin.updForm({ title: 'Ариун боолт TEST', price: '4,500', stock: '12', sku: 'MED-001', brand: 'Test Brand', manufacturer: 'Test Maker', country: 'KR', unit: 'хайрцаг', expiryDate: '2028-12-31', specifications: [{ name: 'Бүртгэлийн дугаар', value: 'TEST-123' }] });
    admin.saveProduct();
    assert.equal(admin.state.formError, '');
    let product = store.read('products').find(p => p.sku === 'MED-001');
    assert.ok(product);
    assert.equal(product.specifications[0].value, 'TEST-123');
    assert.equal(product.productType, 'medical');
    admin.openEditProduct(product.id);
    assert.equal(admin.form().manufacturer, 'Test Maker');
    admin.updForm({ title: 'Ариун боолт TEST edited' });
    admin.saveProduct();
    product = store.read('products').find(p => p.sku === 'MED-001');
    assert.equal(product.expiryDate, '2028-12-31');
    assert.equal(store.catalog.productInfo(product).some(s => s.name === 'Бүртгэлийн дугаар' && s.value === 'TEST-123'), true);
    const tax = store.read('taxonomy');
    assert.equal(store.catalog.filterProducts(store.read('products'), tax, { department: 'Эмнэлгийн хэрэгсэл' }).length, 1);
    assert.equal(store.catalog.filterProducts(store.read('products'), tax, { q: 'MED-001' }).length, 1);
    assert.equal(store.catalog.filterProducts(store.read('products'), tax, { q: 'TEST-123' }).length, 1);
    assert.equal(store.catalog.filterProducts(store.read('products'), tax, { department: 'Гэр ахуй', q: 'MED-001' }).length, 0);
    admin.setState({ q: 'MED-001', pDepartment: 'Эмнэлгийн хэрэгсэл' });
    assert.equal(admin.renderVals().productList.length, 1);
    admin.setState({ q: '', pDepartment: '' });
    admin.setState({ form: { ...admin.blankForm(), title: 'Duplicate', price: '100', stock: '1', sku: 'med-001' }, editId: null });
    admin.saveProduct();
    assert.match(admin.state.formError, /SKU/);
    admin.updForm({ sku: '', price: '-100' }); admin.saveProduct(); assert.ok(admin.state.formError);
    admin.updForm({ price: '100', stock: '1.5' }); admin.saveProduct(); assert.ok(admin.state.formError);
    admin.updForm({ stock: '0', category: 'Missing' }); admin.saveProduct(); assert.ok(admin.state.formError);
  });
}

test('server rejects malformed catalog data and duplicate SKUs', async () => {
  const { validateProducts, validateTaxonomy } = await import('./functions/_catalog.js');
  const { store } = environment();
  assert.equal(validateProducts(store.read('products')), '');
  assert.equal(validateTaxonomy(store.read('taxonomy')), '');
  assert.ok(validateProducts([{ id: 1, title: 'x', price: -1, stock: 0 }]));
  assert.ok(validateProducts([{ id: 1, title: 'x', price: 1, stock: 0, sku: 'A' }, { id: 2, title: 'y', price: 1, stock: 1, sku: 'a' }]));
  assert.ok(validateTaxonomy({ categories: ['x'], badges: [], departments: ['A'], categoryDepartments: { x: 'unknown' } }));
});

test('local demo entry is unavailable on deployed hosts', () => {
  const env = environment({ hostname: 'nudema-mongolia.com', port: '', protocol: 'https:' });
  const admin = component(env, 'Nudema Admin.dc.html');
  admin.openLocalPreview();
  assert.equal(admin.state.authed, false);
  assert.equal(env.store.localPreview, false);
});

test('quota failures roll back taxonomy and products together', () => {
  const env = environment(), { store } = env;
  store.write('products', store.read('products'));
  store.write('taxonomy', store.read('taxonomy'));
  const before = [...env.mem.entries()];
  const storage = env.context.localStorage, realSet = storage.setItem;
  let failOnce = true;
  storage.setItem = (key, value) => { if (failOnce && key === store.KEYS.products) { failOnce = false; throw new Error('quota'); } realSet(key, value); };
  assert.equal(store.catalog.save({ categories: ['New'] }, []), false);
  assert.deepEqual([...env.mem.entries()], before);
});

test('catalog endpoint batches linked category renames and rejects orphan products', async () => {
  const { onRequestPut } = await import('./functions/api/admin/catalog.js');
  const { store } = environment();
  const db = require('./.test-db.cjs')();
  const context = payload => ({ env: { DB: db }, request: new Request('https://example.com/api/admin/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) });
  const products = store.read('products'), taxonomy = store.read('taxonomy');
  const result = await onRequestPut(context({ products, taxonomy }));
  assert.equal(result.status, 200);
  const rows = db.sqlite.prepare('SELECT name,value FROM app_state ORDER BY name').all();
  assert.deepEqual(rows.map(row => row.name), ['products', 'taxonomy']);
  assert.deepEqual(JSON.parse(rows[0].value), JSON.parse(JSON.stringify(products)));
  assert.deepEqual(JSON.parse(rows[1].value), JSON.parse(JSON.stringify(taxonomy)));
  const rejected = await onRequestPut(context({ taxonomy, products: [{ ...products[0], category: 'Orphan' }] }));
  assert.equal(rejected.status, 400);
  assert.deepEqual(db.sqlite.prepare('SELECT name,value FROM app_state ORDER BY name').all(), rows);
  db.sqlite.close();
});
