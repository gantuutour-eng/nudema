import { dbFrom, ensureSchema, json, error, makeOrderNo, readState } from '../_lib.js';
import { sessionUser } from '../_auth.js';

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length || items.length > 30) return error('At least one valid item is required.');

    const db = dbFrom(context);
    await ensureSchema(db);
    const account = await sessionUser(db, context.request);
    const state = await readState(db, ['products', 'settings']);
    const products = Array.isArray(state.data.products) ? state.data.products : [];
    const settings = state.data.settings || {};
    if (!products.length) return error('The product catalog has not been initialized.', 503);

    const normalizedItems = [];
    let subtotal = 0;
    for (const requested of items) {
      const product = products.find((item) => Number(item.id) === Number(requested.id));
      const qty = Math.max(1, Math.min(99, Number(requested.qty) || 1));
      if (!product) return error(`Unknown product: ${requested.id}`);
      if (Number(product.stock) < qty) return error(`Not enough stock: ${product.title}`);
      const options = Array.isArray(product.options) ? product.options.filter((option) => option && option.label) : [];
      const optionIndex = Math.min(Math.max(0, Number(requested.optionIndex) || 0), Math.max(0, options.length - 1));
      const option = options[optionIndex] || null;
      const unit = (Number(product.price) || 0) + (option ? Number(option.add) || 0 : 0);
      subtotal += unit * qty;
      normalizedItems.push({ pid: Number(product.id), qty, optionIndex, unit, title: product.title });
    }

    const customer = body.customer || {};
    const name = cleanText(customer.name, 120);
    const phone = cleanText(customer.phone, 40);
    const email = account ? account.email : cleanText(customer.email, 160);
    const address = cleanText(customer.address, 500);
    if (!phone) return error('Phone number is required.');
    if (!name || !address) return error('Name and delivery address are required.');

    const shippingFee = Math.max(0, Number(String(settings.shippingFee || '').replace(/[^\d]/g, '')) || 0);
    const freeThreshold = Math.max(0, Number(String(settings.freeThreshold || '').replace(/[^\d]/g, '')) || 0);
    const shipping = shippingFee > 0 && !(freeThreshold > 0 && subtotal >= freeThreshold) ? shippingFee : 0;
    const now = new Date();
    const order = {
      no: makeOrderNo(),
      customer: name,
      email,
      phone,
      address,
      note: cleanText(customer.note, 500),
      date: now.toISOString().slice(0, 10),
      createdAt: now.toISOString(),
      hour: now.getUTCHours(),
      minute: now.getUTCMinutes(),
      method: 'Данс шилжүүлэг',
      items: normalizedItems.map(({ pid, qty, optionIndex, unit }) => ({ pid, qty, optionIndex, unit })),
      subtotal,
      shipping,
      total: subtotal + shipping,
      status: 'pending',
    };

    await db.prepare(
      `INSERT INTO orders
       (order_no, status, customer_email, customer_phone, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(order.no, order.status, order.email, order.phone, JSON.stringify(order), order.createdAt).run();
    if (account) {
      await db.prepare('INSERT INTO user_orders (order_no, user_id) VALUES (?, ?)').bind(order.no, account.id).run();
    }

    return json({ ok: true, order }, 201);
  } catch (cause) {
    if (cause && cause.message && cause.message.includes('UNIQUE')) {
      return error('Please retry the order.', 409);
    }
    return error('Could not create the order.', 500, cause.message);
  }
}
