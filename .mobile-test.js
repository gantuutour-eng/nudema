const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('customer pages use one release of the store before rendering and expose install metadata', () => {
  for (const file of fs.readdirSync('.').filter(f => /^Nudema .*\.html$/.test(f) && !f.includes('Admin'))) {
    const html = fs.readFileSync(file, 'utf8'), head = html.split('</head>')[0];
    assert.match(head, /src="\/nudema-store\.js\?v=20261117-r3"/, file);
    assert.match(head, /rel="manifest" href="\/manifest.webmanifest"/, file);
    assert.match(head, /src="\/pwa-install\.js\?v=20261116-r3"/, file);
    assert.match(head, /href="\/pwa-install\.css\?v=20261116-r3"/, file);
    for (const match of html.matchAll(/(?:src|href)="[^"?]*\/(nudema-store|storefront-ui|user-ui)\.js(?:\?([^"#]*))?"/g)) assert.equal(match[2], match[1] === 'nudema-store' ? 'v=20261117-r3' : match[1] === 'storefront-ui' ? 'v=20261117-r8' : 'v=20261117-r7', file);
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
function installHarness({ standalone = false, footerInitiallyPresent = true } = {}) {
  const events = {}, mem = new Map(), created = [], bodyChildren = [], footerChildren = [];
  let mutationCallback, footerPresent = footerInitiallyPresent;
  const element = tag => {
    const listeners = {}, children = new Map();
    const el = { tag, hidden: false, dataset: {}, listeners, setAttribute() {}, addEventListener: (name, fn) => { listeners[name] = fn; }, querySelector: selector => children.get(selector) || null };
    if (tag === 'aside') for (const selector of ['.nd-install-close', '.nd-install-button']) children.set(selector, element('button'));
    created.push(el); return el;
  };
  const footer = { querySelector: selector => selector === 'nav' ? { appendChild: button => footerChildren.push(button) } : footerChildren.find(b => b.dataset.installLauncher) };
  const document = {
    readyState: 'complete',
    createElement: element,
    querySelector: selector => selector.startsWith('footer') && footerPresent ? footer : null,
    querySelectorAll: () => footerChildren,
    body: { prepend: el => bodyChildren.unshift(el) }
  };
  const window = { addEventListener: (name, fn) => { events[name] = fn; }, matchMedia: () => ({ matches: standalone, addEventListener() {} }), isSecureContext: false };
  vm.runInNewContext(fs.readFileSync('pwa-install.js', 'utf8'), { window, navigator: {}, document, localStorage: { getItem: key => mem.get(key), setItem: (key, value) => mem.set(key, value) }, Date, setTimeout() {}, MutationObserver: class { constructor(fn) { mutationCallback = fn; } observe() {} } });
  return { window, events, mem, created, banner: bodyChildren[0], footerChildren, addFooter() { footerPresent = true; mutationCallback(); } };
}
test('no install buttons or fallback dialog appear without an actual browser install prompt', async () => {
  const { window, banner, footerChildren, created } = installHarness();
  assert.equal(banner.hidden, true); assert.equal(footerChildren.length, 0);
  const count = created.length;
  assert.equal(await window.NudemaInstall.open(), false);
  assert.equal(created.length, count); assert.equal(banner.hidden, true);
});
for (const outcome of ['accepted', 'dismissed']) test(`native install prompt is user-triggered and handles ${outcome}`, async () => {
  const { window, events, mem, banner, footerChildren } = installHarness(); let prompts = 0, prevented = false;
  events.beforeinstallprompt({ preventDefault: () => { prevented = true; }, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome }) });
  assert.equal(prompts, 0); assert.equal(prevented, true);
  assert.equal(banner.hidden, false); assert.equal(footerChildren.length, 1);
  const result = banner.querySelector('.nd-install-button').listeners.click();
  assert.equal(prompts, 1, 'prompt must run synchronously in the click handler');
  assert.equal(banner.hidden, true); assert.equal(footerChildren[0].hidden, true);
  assert.equal(await result, outcome === 'accepted');
  assert.equal(mem.has('nudema_install_dismissed_until'), outcome === 'dismissed');
  await window.NudemaInstall.open(); assert.equal(prompts, 1, 'consumed prompts cannot be reused');
  if (outcome === 'dismissed') {
    events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    assert.equal(banner.hidden, true, 'dismissed banner stays hidden for seven days');
    assert.equal(footerChildren[0].hidden, false, 'a fresh native prompt can still be requested from the footer');
    await footerChildren[0].listeners.click(); assert.equal(prompts, 2);
  }
});
test('prompt failures never open instructions; a fresh browser event can recover', async () => {
  const { window, events, banner, created } = installHarness();
  events.beforeinstallprompt({ preventDefault() {}, prompt() { throw new Error('no activation'); } });
  const count = created.length;
  assert.equal(await window.NudemaInstall.open(), false);
  assert.equal(created.length, count); assert.equal(banner.hidden, true);
  events.beforeinstallprompt({ preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(banner.hidden, false); assert.equal(await window.NudemaInstall.open(), true);
});
test('installed apps stay hidden and asynchronous footer rendering retains the native install action', () => {
  const installed = installHarness({ standalone: true });
  installed.events.beforeinstallprompt({ preventDefault() {}, prompt() {} });
  assert.equal(installed.banner.hidden, true); assert.equal(installed.footerChildren.length, 0);
  const later = installHarness({ footerInitiallyPresent: false });
  later.events.beforeinstallprompt({ preventDefault() {}, prompt() {} }); later.addFooter();
  assert.equal(later.footerChildren.length, 1); assert.equal(later.banner.hidden, false);
  later.events.appinstalled();
  assert.equal(later.banner.hidden, true); assert.equal(later.footerChildren[0].hidden, true);
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
