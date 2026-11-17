export function inventoryError(message, status = 409) {
  const cause = new Error(message); cause.status = status; return cause;
}

export async function readCatalog(db) {
  const row = await db.prepare("SELECT value FROM app_state WHERE name='products'").first();
  return { raw: row ? row.value : null, products: row ? JSON.parse(row.value) : [] };
}

// A normal product/category edit must not put sold units back into stock.
export async function saveProducts(db, incoming, before, taxonomy) {
  const snapshot = await readCatalog(db);
  const products = incoming.map(p => {
    const current = snapshot.products.find(old => String(old.id) === String(p.id));
    if (!current) return p;
    if (taxonomy) return { ...p, stock: current.stock };
    const base = before && before[String(p.id)];
    if (base !== undefined && Number(p.stock) === Number(base)) return { ...p, stock: current.stock };
    if (Number(current.stock) !== Number(base === undefined ? p.stock : base)) {
      throw inventoryError('Үлдэгдэл өөрчлөгдсөн. Хуудсыг шинэчлээд дахин хадгална уу.');
    }
    return p;
  });
  const value = JSON.stringify(products);
  const write = snapshot.raw === null
    ? db.prepare("INSERT OR IGNORE INTO app_state (name,value) VALUES ('products',?)").bind(value)
    : db.prepare("UPDATE app_state SET value=?,updated_at=datetime('now') WHERE name='products' AND value=?").bind(value, snapshot.raw);
  const statements = [write];
  if (taxonomy) statements.push(db.prepare(`INSERT INTO app_state (name,value,updated_at)
    SELECT 'taxonomy',?,datetime('now') WHERE changes()>0
    ON CONFLICT(name) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(JSON.stringify(taxonomy)));
  const result = await db.batch(statements);
  if (!result[0].meta.changes) throw inventoryError('Үлдэгдэл өөрчлөгдсөн. Хуудсыг шинэчлээд дахин хадгална уу.');
  return products;
}

export function adjustStock(products, items, direction) {
  const totals = new Map();
  for (const item of items) totals.set(String(item.pid), (totals.get(String(item.pid)) || 0) + Number(item.qty));
  const next = products.map(p => {
    const qty = totals.get(String(p.id)) || 0;
    const stock = Number(p.stock) + direction * qty;
    if (stock < 0) throw inventoryError('Барааны үлдэгдэл хүрэлцэхгүй байна.');
    totals.delete(String(p.id));
    return qty ? { ...p, stock } : p;
  });
  // A deleted product cannot be sold again; cancellation still works for it.
  if (direction < 0 && totals.size) throw inventoryError('Захиалгын бараа олдсонгүй.');
  return next;
}

export async function createStockOrder(db, snapshot, order) {
  const products = adjustStock(snapshot.products, order.items, -1);
  const result = await db.batch([
    db.prepare("UPDATE app_state SET value=?,updated_at=datetime('now') WHERE name='products' AND value=?")
      .bind(JSON.stringify(products), snapshot.raw),
    db.prepare(`INSERT INTO orders (order_no,status,customer_email,customer_phone,payload,created_at,updated_at)
      SELECT ?,?,?,?,?,?,datetime('now') WHERE changes()>0`)
      .bind(order.no, order.status, order.email, order.phone, JSON.stringify(order), order.createdAt),
  ]);
  if (!result[1].meta.changes) throw inventoryError('Үлдэгдэл эсвэл үнэ өөрчлөгдсөн. Сагсаа шинэчлээд дахин оролдоно уу.');
}

const cancelled = status => status === 'cancel' || status === 'cancelled';
export async function updateOrder(db, no, status) {
  if (!['pending','paid','shipping','done','cancel','cancelled'].includes(status)) throw inventoryError('Захиалгын төлөв буруу байна.', 400);
  const row = await db.prepare('SELECT payload FROM orders WHERE order_no=?').bind(no).first();
  if (!row) throw inventoryError('Захиалга олдсонгүй.', 404);
  const order = JSON.parse(row.payload);
  const next = { ...order, status: cancelled(status) ? 'cancel' : status };
  if (next.status === order.status) return { order };
  const tracked = typeof order.inventoryDeducted === 'boolean';
  const stockChange = tracked && order.inventoryDeducted === cancelled(next.status);
  let products;
  let result;
  if (stockChange) {
    const snapshot = await readCatalog(db);
    products = adjustStock(snapshot.products, order.items || [], cancelled(next.status) ? 1 : -1);
    next.inventoryDeducted = !cancelled(next.status);
    result = await db.batch([
      db.prepare(`UPDATE app_state SET value=?,updated_at=datetime('now') WHERE name='products' AND value=?
        AND EXISTS (SELECT 1 FROM orders WHERE order_no=? AND payload=?)`)
        .bind(JSON.stringify(products), snapshot.raw, no, row.payload),
      db.prepare(`UPDATE orders SET status=?,payload=?,updated_at=datetime('now')
        WHERE order_no=? AND payload=? AND changes()>0`).bind(next.status, JSON.stringify(next), no, row.payload),
    ]);
    if (!result[1].meta.changes) throw inventoryError('Захиалга эсвэл үлдэгдэл өөрчлөгдсөн. Дахин шинэчилнэ үү.');
  } else {
    result = await db.prepare("UPDATE orders SET status=?,payload=?,updated_at=datetime('now') WHERE order_no=? AND payload=?")
      .bind(next.status, JSON.stringify(next), no, row.payload).run();
    if (!result.meta.changes) throw inventoryError('Захиалга өөрчлөгдсөн. Дахин шинэчилнэ үү.');
  }
  return { order: next, ...(products ? { products } : {}) };
}
