const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { handleRequest } = require('./serve');

test('local page routing serves real templates without a redirect loop', async (t) => {
  const server = http.createServer(handleRequest);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const cases = [
    ['/', 'Nudema Mongolia.dc.html'],
    ['/?v=pc', 'Nudema Mongolia.dc.html', { 'User-Agent': 'iPhone Mobile' }],
    ['/?v=mobile', 'Nudema Mobile.dc.html'],
    ['/', 'Nudema Mobile.dc.html', { 'User-Agent': 'iPhone Mobile' }],
    ['/', 'Nudema Mobile.dc.html', { 'Sec-CH-UA-Mobile': '?1' }],
    ['/index.html?v=pc', 'Nudema Mongolia.dc.html'],
    ['/admin', 'Nudema Admin.dc.html'],
    ['/admin?v=mobile', 'Nudema Admin Mobile.dc.html'],
    ['/product?id=1', 'Nudema Product.dc.html'],
    ['/search?q=test', 'Nudema Search.dc.html'],
    ['/cart', 'Nudema Cart.dc.html'],
    ['/checkout', 'Nudema Checkout.dc.html'],
    ['/login', 'Nudema Login.dc.html'],
    ['/signup', 'Nudema Signup.dc.html'],
    ['/account', 'Nudema Account.dc.html'],
    ['/privacy', 'Nudema Privacy.dc.html'],
    ['/terms', 'Nudema Terms.dc.html'],
    ['/oauth-home', 'oauth-home.html'],
    ['/Nudema%20Mongolia.dc', 'Nudema Mongolia.dc.html'],
    ['/Nudema%20Mongolia.dc.html', 'Nudema Mongolia.dc.html'],
    ['/assets/vendor/react-18.3.1.production.min.js', 'assets/vendor/react-18.3.1.production.min.js'],
    ['/manifest.webmanifest', 'manifest.webmanifest'],
    ['/sw.js', 'sw.js'],
    ['/offline.html', 'offline.html'],
    ['/pwa-install.js', 'pwa-install.js'],
    ['/pwa-install.css', 'pwa-install.css'],
  ];

  for (const [route, file, headers] of cases) {
    const response = await fetch(origin + route, { headers, redirect: 'manual' });
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('location'), null, route);
    assert.equal(response.headers.get('cache-control'), 'no-store', route);
    assert.equal(await response.text(), fs.readFileSync(path.join(__dirname, file), 'utf8'), route);
  }
  const head = await fetch(origin + '/?v=pc', { method: 'HEAD' });
  assert.match((await fetch(origin + '/manifest.webmanifest')).headers.get('content-type'), /application\/manifest\+json/);
  assert.equal(head.status, 200);
  assert.match(head.headers.get('content-type'), /text\/html/);
  assert.equal(await head.text(), '');
  const missing = await fetch(origin + '/missing');
  assert.equal(missing.status, 404);
  const traversal = await fetch(origin + '/..%2foutside');
  assert.equal(traversal.status, 403);
  console.log(`Verified ${cases.length} page/asset routes, HEAD, 404 and traversal handling.`);
});
