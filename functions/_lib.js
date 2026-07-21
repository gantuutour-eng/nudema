const PUBLIC_STATE_NAMES = ['products', 'settings', 'taxonomy', 'reviews', 'content'];
const ADMIN_STATE_NAMES = [...PUBLIC_STATE_NAMES, 'orders', 'statuses', 'admin'];

export { PUBLIC_STATE_NAMES, ADMIN_STATE_NAMES };

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export function error(message, status = 400, details) {
  return json({ ok: false, error: message, ...(details ? { details } : {}) }, status);
}

export function dbFrom(context) {
  const db = context.env && context.env.DB;
  if (!db) throw new Error('D1 binding "DB" is not configured.');
  return db;
}

export async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS app_state (
      name TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      order_no TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      customer_email TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      marketing INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_orders (
      order_no TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_no) REFERENCES orders(order_no) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_user_orders_user ON user_orders(user_id)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_identities (
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (provider, provider_user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      return_to TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at)'),
  ]);
}

export function isLocalRequest(request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function adminIdentity(request, env = {}) {
  const email = (request.headers.get('Cf-Access-Authenticated-User-Email') || '').trim().toLowerCase();
  const allowed = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return null;
  if (allowed.length && !allowed.includes(email)) return null;
  return { email };
}

export async function readState(db, names) {
  const placeholders = names.map(() => '?').join(',');
  const result = await db.prepare(
    `SELECT name, value, updated_at FROM app_state WHERE name IN (${placeholders})`,
  ).bind(...names).all();

  const data = {};
  const updatedAt = {};
  for (const row of result.results || []) {
    try {
      data[row.name] = JSON.parse(row.value);
      updatedAt[row.name] = row.updated_at;
    } catch {
      // Ignore a damaged row so one bad value does not take down the storefront.
    }
  }
  return { data, updatedAt };
}

export async function readOrders(db) {
  const result = await db.prepare(
    'SELECT payload FROM orders ORDER BY created_at DESC, order_no DESC',
  ).all();
  return (result.results || []).flatMap((row) => {
    try { return [JSON.parse(row.payload)]; } catch { return []; }
  });
}

export async function writeState(db, name, value) {
  await db.prepare(
    `INSERT INTO app_state (name, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(name, JSON.stringify(value)).run();
}

export async function replaceOrders(db, orders) {
  const statements = [db.prepare('DELETE FROM orders')];
  for (const order of orders) {
    statements.push(db.prepare(
      `INSERT INTO orders
       (order_no, status, customer_email, customer_phone, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      String(order.no || ''),
      String(order.status || 'pending'),
      String(order.email || ''),
      String(order.phone || ''),
      JSON.stringify(order),
      order.createdAt || (order.date ? `${order.date}T00:00:00.000Z` : new Date().toISOString()),
    ));
  }
  await db.batch(statements);
}

export function makeOrderNo() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0].toString().slice(-6).padStart(6, '0');
  return `NDM-${date}-${suffix}`;
}
