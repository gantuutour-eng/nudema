const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

for (const file of ['Nudema Admin.dc.html', 'Nudema Admin Mobile.dc.html']) test(`${file}: upload pipeline encodes WebP and preserves readable detail quality`, async () => {
  let uploaded, encoded;
  const context = vm.createContext({
    DCLogic: class {}, window: { URL: true }, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Image: class { width = 3000; height = 12000; set src(_) { this.onload(); } },
    document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob(callback, type, quality) { encoded = { type, quality }; callback(new Blob(['webp'], { type })); } }) },
    NudemaStore: { remoteStatus: { enabled: true }, uploadImage: async (blob, name, meta) => { uploaded = { blob, name, meta }; return { url: '/api/images/test.webp' }; } },
  });
  const js = fs.readFileSync(file, 'utf8').match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
  const admin = vm.runInContext(`(function(){${js};return new Component({});})()`, context);
  await new Promise((resolve, reject) => admin.readImageFile({ type: 'image/png', size: 10000, name: 'photo.png' }, (error, url) => error ? reject(new Error(error)) : (assert.equal(url, '/api/images/test.webp'), resolve()), { mode: 'detail' }));
  assert.equal(encoded.type, 'image/webp'); assert.equal(encoded.quality, .96);
  assert.equal(uploaded.blob.type, 'image/webp'); assert.equal(uploaded.name, 'photo.webp'); assert.equal(uploaded.meta.width, 2000); assert.equal(uploaded.meta.height, 8000);
  assert.equal(admin.imageResizePlan(4000, 3000, 'standard').width, 1600);
  assert.equal(admin.imageResizePlan(4000, 3000, 'standard').quality, .82);
});

const uploadJs = fs.readFileSync('functions/api/admin/images.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
async function upload(type, bytes, profile = 'standard-v1') {
  let stored;
  const context = { crypto: webcrypto, json: (data, status = 200) => Response.json(data, { status }), error: (message, status = 400) => Response.json({ error: message }, { status }) };
  vm.runInNewContext(`${uploadJs};this.upload=onRequestPost;`, context);
  const form = new FormData(); form.set('file', new Blob([bytes], { type }), 'photo.webp'); form.set('profile', profile); form.set('width', '1000'); form.set('height', '1000');
  const response = await context.upload({ env: { IMAGES: { put: async (key, body, metadata) => { stored = { key, body, metadata }; } } }, data: { admin: { email: 'test@example.invalid' } }, request: new Request('https://shop.example.invalid/api/admin/images', { method: 'POST', body: form }) });
  return { response, stored };
}
test('R2 stores uploaded WebP bytes with image MIME and immutable caching', async () => {
  const { response, stored } = await upload('image/webp', Buffer.from('5249464614000000574542505650382000000000', 'hex'));
  assert.equal(response.status, 201); assert.match(stored.key, /\.webp$/); assert.equal(stored.metadata.httpMetadata.contentType, 'image/webp'); assert.match(stored.metadata.httpMetadata.cacheControl, /immutable/);
});
for (const [name, type, bytes] of [['PNG', 'image/png', 'not webp'], ['spoofed WebP', 'image/webp', 'not webp']]) test(`${name} cannot bypass WebP validation`, async () => {
  const { response, stored } = await upload(type, bytes); assert.equal(response.status, 400); assert.equal(stored, undefined);
});

test('public immutable images reuse the edge cache without storing customer cookies', async () => {
  const source = fs.readFileSync('functions/api/images/[key].js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
  const saved = new Map(), pending = []; let reads = 0;
  const context = { URL, Request, Headers, Response, error: (message, status = 400) => Response.json({ error: message }, { status }), caches: { default: { match: async request => saved.get(request.url)?.clone(), put: async (request, response) => { assert.equal(request.headers.get('Cookie'), null); saved.set(request.url, response); } } } };
  vm.runInNewContext(`${source};this.read=onRequestGet;`, context);
  const request = { request: new Request('https://shop.example.invalid/api/images/photo.webp?tracking=one', { headers: { Cookie: 'private-session' } }), params: { key: 'photo.webp' }, env: { IMAGES: { get: async () => { reads++; return { body: 'webp', size: 4, httpEtag: 'tag', writeHttpMetadata(headers) { headers.set('Content-Type', 'image/webp'); } }; } } }, waitUntil: promise => pending.push(promise) };
  const first = await context.read(request); assert.equal(await first.text(), 'webp'); await Promise.all(pending);
  request.request = new Request('https://shop.example.invalid/api/images/photo.webp?tracking=two');
  const second = await context.read(request); assert.equal(await second.text(), 'webp'); assert.equal(reads, 1); assert.match(second.headers.get('Cache-Control'), /immutable/);
});
