const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { guidance } = require('./pwa-install');

test('customer pages use one release of the store before rendering and expose install metadata', () => {
  for (const file of fs.readdirSync('.').filter(f => /^Nudema .*\.html$/.test(f) && !f.includes('Admin'))) {
    const html = fs.readFileSync(file, 'utf8'), head = html.split('</head>')[0];
    assert.match(head, /src="\/nudema-store\.js\?v=20261116-r2"/, file);
    assert.match(head, /rel="manifest" href="\/manifest.webmanifest"/, file);
    for (const match of html.matchAll(/(?:src|href)="[^"?]*\/(?:nudema-store|storefront-ui|user-ui)\.js(?:\?([^"#]*))?"/g)) assert.equal(match[1], 'v=20261116-r2', file);
  }
});
test('manifest includes valid PNG icons, home scope and standalone launch', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) {
    const png = fs.readFileSync('.' + icon.src), size = Number(icon.sizes.split('x')[0]);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
});
test('Safari, other iOS browsers and iPad get Share instructions; Samsung and in-app browsers get their own instructions', () => {
  for (const ua of ['iPhone Safari', 'iPhone CriOS', 'iPad FxiOS', 'iPod EdgiOS']) assert.match(guidance(ua, '', 0).steps.join(' '), /Share/);
  assert.match(guidance('Macintosh Safari', 'MacIntel', 5).steps.join(' '), /Share/);
  assert.match(guidance('Android SamsungBrowser/27', '', 5).title, /Samsung/);
  assert.match(guidance('Android Chrome', '', 5).steps.join(' '), /Install app/);
  assert.match(guidance('iPhone Instagram', '', 5).title, /хөтөчдөө/);
});
function installHarness() {
  const events = {}, mem = new Map();
  const window = { addEventListener: (name, fn) => { events[name] = fn; }, matchMedia: () => ({ matches: false, addEventListener() {} }), isSecureContext: false };
  vm.runInNewContext(fs.readFileSync('pwa-install.js', 'utf8'), { window, navigator: { userAgent: 'Android Chrome', platform: '', maxTouchPoints: 1 }, document: { readyState: 'loading', addEventListener() {} }, localStorage: { getItem: key => mem.get(key), setItem: (key, value) => mem.set(key, value) }, Date, setTimeout });
  return { window, events, mem };
}
for (const outcome of ['accepted', 'dismissed']) test(`native install prompt is user-triggered and handles ${outcome}`, async () => {
  const { window, events, mem } = installHarness(); let prompts = 0, prevented = false;
  events.beforeinstallprompt({ preventDefault: () => { prevented = true; }, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome }) });
  assert.equal(prompts, 0); assert.equal(prevented, true);
  await window.NudemaInstall.open(); assert.equal(prompts, 1);
  assert.equal(mem.has('nudema_install_dismissed_until'), outcome === 'dismissed');
  if (outcome === 'accepted') { await window.NudemaInstall.open(); assert.equal(prompts, 1); }
});
test('service worker never intercepts customer/admin APIs, auth, foreign requests or POSTs', () => {
  const listeners = {};
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), { self: { location: { origin: 'https://shop.example.invalid' }, addEventListener: (name, fn) => { listeners[name] = fn; } }, URL });
  for (const path of ['/api/storefront', '/api/orders', '/api/auth/google/callback?code=private', '/admin', '/account', '/login', '/Nudema%20Admin.dc.html', '/Nudema%20Account.dc']) {
    let intercepted = false;
    listeners.fetch({ request: { url: 'https://shop.example.invalid' + path, mode: 'navigate', method: 'GET' }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
  for (const request of [{ url: 'https://foreign.example.invalid/', method: 'GET', mode: 'navigate' }, { url: 'https://shop.example.invalid/checkout', method: 'POST', mode: 'navigate' }, { url: 'https://shop.example.invalid/private.json', method: 'GET', mode: 'cors' }]) listeners.fetch({ request, respondWith() { assert.fail('private/foreign request intercepted'); } });
});
test('offline fallback is used only when a shopping page network request fails; live content is not cached', async () => {
  const listeners = {}, offline = { offline: true }; let offlineReads = 0, isOffline = false;
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), { self: { location: { origin: 'https://shop.example.invalid' }, addEventListener: (name, fn) => { listeners[name] = fn; } }, URL, Response, fetch: async () => { if (isOffline) throw new Error('offline'); return { fresh: true }; }, caches: { match: async () => { offlineReads++; return offline; } } });
  const event = () => ({ request: { url: 'https://shop.example.invalid/product?id=1', mode: 'navigate', method: 'GET' }, respondWith(promise) { this.result = promise; } });
  const online = event(); listeners.fetch(online); assert.equal((await online.result).fresh, true); assert.equal(offlineReads, 0);
  isOffline = true; const disconnected = event(); listeners.fetch(disconnected); assert.equal(await disconnected.result, offline);
});

function productComponent() {
  const mem = new Map();
  const window = { location: { hostname: 'localhost', protocol: 'http:', search: '?id=1', hash: '' }, addEventListener() {}, removeEventListener() {}, localStorage: { getItem: key => mem.get(key) ?? null, setItem: (key, value) => mem.set(key, value) } };
  const context = vm.createContext({ window, localStorage: window.localStorage, URLSearchParams, setInterval() {}, setTimeout() {}, clearTimeout() {}, console });
  vm.runInContext(fs.readFileSync('nudema-store.js', 'utf8'), context);
  context.NudemaStore = window.NudemaStore;
  vm.runInContext('class DCLogic {setState(p){Object.assign(this.state,typeof p === "function" ? p(this.state):p)}}', context);
  const js = fs.readFileSync('Nudema Product.dc.html', 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  return { product: vm.runInContext(`(function(){${js};return new Component({});})()`, context), store: window.NudemaStore };
}
test('product waits for remote data and reports a network error without claiming the product was deleted', () => {
  const { product, store } = productComponent(); product.state.products = [];
  Object.assign(store.remoteStatus, { enabled: true, ready: false, error: '' });
  assert.equal(product.renderVals().loadingProduct, true); assert.equal(product.renderVals().notFound, false);
  store.remoteStatus.error = 'network'; assert.equal(product.renderVals().productLoadError, true); assert.equal(product.renderVals().notFound, false);
  store.remoteStatus.ready = true; assert.equal(product.renderVals().notFound, true);
});
test('long product details render three blocks at a time and preserve quantity interaction', () => {
  const { product, store } = productComponent();
  const products = store.read('products'); products[0].detailBlocks = Array.from({ length: 100 }, (_, i) => ({ type: 'image', img: '/api/images/' + i + '.webp' })); store.write('products', products);
  let values = product.renderVals(); assert.equal(values.detailBlocks.length, 3); assert.equal(values.hasMoreDetailBlocks, true);
  values.inc(); assert.equal(product.renderVals().qty, 2);
  values.moreDetails(); values = product.renderVals(); assert.equal(values.detailBlocks.length, 6); assert.equal(values.qty, 2);
});
