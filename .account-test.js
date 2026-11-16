const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = [...fs.readFileSync('Nudema Account.dc.html', 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

async function account(api, localPreview = false) {
  const elements = new Map();
  function node(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set(id === 'accountLoading' ? [] : ['hidden']);
    const element = { textContent: '', innerHTML: '', value: '', classList: {
      add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
    }, addEventListener() {}, append() {}, appendChild() {} };
    elements.set(id, element); return element;
  }
  vm.runInNewContext(source, {
    URLSearchParams, location: { search: '', reload() {} },
    document: { getElementById: node, createElement: () => node(Math.random()) },
    NudemaStore: { localPreview, read: () => [] },
    NudemaAuth: { api, showOauthError() {}, showMessage: (element, message) => { element.textContent = message; }, money: v => String(v), statusLabel: v => v, setBusy() {} },
  });
  await new Promise(resolve => setImmediate(resolve));
  return node;
}

for (const status of [401, 404, 503]) test(`account HTTP ${status} displays login instead of an empty error screen`, async () => {
  const node = await account(() => Promise.reject(Object.assign(new Error('Unavailable'), { status })), status === 404);
  assert.equal(node('accountLoading').classList.contains('hidden'), true);
  assert.equal(node('loginSection').classList.contains('hidden'), false);
  if (status === 404) assert.match(node('accountError').textContent, /Локал/);
});

test('signed-in account still displays the real customer profile', async () => {
  const node = await account(() => Promise.resolve({ user: { name: 'QA', email: 'qa@example.invalid' }, orders: [], stats: { orders: 0, spent: 0, points: 0 } }));
  assert.equal(node('profileSection').classList.contains('hidden'), false);
  assert.equal(node('loginSection').classList.contains('hidden'), true);
  assert.equal(node('accountName').textContent, 'QA');
});
