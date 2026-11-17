const { test } = require('node:test');
const assert = require('node:assert/strict');

test('address results contain named locations in Mongolia only', async () => {
  const { normalizePlaces } = await import('./functions/api/geocode.js');
  const feature = (coordinates, properties) => ({ geometry: { coordinates }, properties });
  const result = normalizePlaces([
    feature([106.9169, 47.9188], { countrycode: 'MN', name: 'Сүхбаатарын талбай', city: 'Улаанбаатар' }),
    feature([127, 37], { countrycode: 'KR', name: 'Seoul' }),
    feature([100, 45], { countrycode: 'CN', name: 'Foreign result inside bounding box' }),
    feature([106, 47], {}),
    feature(['bad', 47], { name: 'Invalid point' }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].label, 'Сүхбаатарын талбай, Улаанбаатар');
});

test('invalid queries do not call the geocoder', async () => {
  const { onRequestGet } = await import('./functions/api/geocode.js');
  const response = await onRequestGet({ request: new Request('https://example.invalid/api/geocode?q=x') });
  assert.equal(response.status, 400);
});

function database() {
  let saved;
  return {
    get saved() { return saved; },
    async batch(statements) { for (const statement of statements) await statement.run(); },
    prepare(sql) {
      let args;
      return {
        bind(...values) { args = values; return this; },
        async all() { return { results: [
          { name: 'products', value: JSON.stringify([{ id: 1, title: 'Test', price: 500, stock: 10 }]) },
          { name: 'settings', value: '{}' },
        ] }; },
        async run() { if (/INSERT INTO orders/.test(sql)) saved = JSON.parse(args[4]); return { success: true }; },
      };
    },
  };
}

test('selected delivery coordinates and label survive order persistence', async () => {
  const { onRequestPost } = await import('./functions/api/orders.js');
  const db = database();
  const request = new Request('https://example.invalid/api/orders', { method: 'POST', body: JSON.stringify({
    items: [{ id: 1, qty: 1 }], customer: { name: 'QA', phone: '00000000', address: 'Test only', location: { lat: 47.9188126, lng: 106.9168967, label: 'Сүхбаатарын талбай' } },
  }) });
  const response = await onRequestPost({ request, env: { DB: db } });
  assert.equal(response.status, 201);
  assert.deepEqual(db.saved.location, { lat: 47.918813, lng: 106.916897, label: 'Сүхбаатарын талбай' });
  assert.deepEqual((await response.json()).order.location, db.saved.location);
});

test('order API rejects delivery coordinates outside Mongolia', async () => {
  const { onRequestPost } = await import('./functions/api/orders.js');
  const db = database();
  const request = new Request('https://example.invalid/api/orders', { method: 'POST', body: JSON.stringify({
    items: [{ id: 1, qty: 1 }], customer: { name: 'QA', phone: '00000000', address: 'Test only', location: { lat: 37, lng: 127 } },
  }) });
  assert.equal((await onRequestPost({ request, env: { DB: db } })).status, 400);
  assert.equal(db.saved, undefined);
});
