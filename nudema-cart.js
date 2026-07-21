(function () {
  'use strict';

  var KEY = 'nudema_cart_v1';

  function read() {
    try {
      var parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(function (item) {
        return {
          productId: Number(item.productId),
          qty: Math.max(1, Math.min(99, Number(item.qty) || 1)),
          optionIndex: Math.max(0, Number(item.optionIndex) || 0),
        };
      }).filter(function (item) { return Number.isFinite(item.productId); });
    } catch (ignore) { return []; }
  }

  function write(items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('nudema:cart-change', { detail: { items: items } }));
      updateBadges();
      return true;
    } catch (ignore) { return false; }
  }

  function add(productId, qty, optionIndex) {
    var id = Number(productId);
    if (!Number.isFinite(id)) return false;
    var items = read();
    var option = Math.max(0, Number(optionIndex) || 0);
    var found = items.find(function (item) { return item.productId === id && item.optionIndex === option; });
    if (found) found.qty = Math.min(99, found.qty + Math.max(1, Number(qty) || 1));
    else items.push({ productId: id, qty: Math.max(1, Number(qty) || 1), optionIndex: option });
    return write(items);
  }

  function update(productId, optionIndex, qty) {
    var id = Number(productId);
    var option = Math.max(0, Number(optionIndex) || 0);
    var items = read();
    var found = items.find(function (item) { return item.productId === id && item.optionIndex === option; });
    if (!found) return false;
    found.qty = Math.max(1, Math.min(99, Number(qty) || 1));
    return write(items);
  }

  function remove(productId, optionIndex) {
    var id = Number(productId);
    var option = Math.max(0, Number(optionIndex) || 0);
    return write(read().filter(function (item) { return !(item.productId === id && item.optionIndex === option); }));
  }

  function clear() { return write([]); }

  function count() {
    return read().reduce(function (sum, item) { return sum + item.qty; }, 0);
  }

  function details(products) {
    var catalog = Array.isArray(products) ? products : [];
    return read().flatMap(function (item) {
      var product = catalog.find(function (candidate) { return Number(candidate.id) === item.productId; });
      if (!product) return [];
      var options = Array.isArray(product.options) ? product.options.filter(function (option) { return option && option.label; }) : [];
      var optionIndex = Math.min(item.optionIndex, Math.max(0, options.length - 1));
      var option = options[optionIndex] || null;
      var stock = Math.max(0, Number(product.stock) || 0);
      var qty = stock ? Math.min(item.qty, stock) : item.qty;
      var unit = (Number(product.price) || 0) + (option ? Number(option.add) || 0 : 0);
      return [{
        productId: item.productId,
        id: product.id,
        title: product.title,
        img: product.img || (Array.isArray(product.images) ? product.images[0] : '') || '',
        optionIndex: optionIndex,
        option: option ? option.label : 'Стандарт',
        qty: qty,
        unit: unit,
        original: (Number(product.original) || Number(product.price) || 0) + (option ? Number(option.add) || 0 : 0),
        stock: stock,
        product: product,
      }];
    });
  }

  function updateBadges() {
    var total = count();
    document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.hidden = total === 0;
    });
  }

  window.NudemaCart = { read: read, write: write, add: add, update: update, remove: remove, clear: clear, count: count, details: details, updateBadges: updateBadges };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateBadges);
  else updateBadges();
  window.addEventListener('storage', function (event) { if (event.key === KEY) updateBadges(); });
}());
