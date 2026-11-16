(function () {
  'use strict';
  if (customElements.get('nudema-shop-header')) return;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5 5"/>',
    cart: '<path d="M4 8h16l-1.5 13h-13L4 8Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 5 8 15 8 15S25 10 20 5Z"/>',
    home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';

  class ShopHeader extends HTMLElement {
    connectedCallback() {
      if (this.closest('x-dc')) return;
      this.render();
      this.unsubscribe = NudemaStore.subscribe(name => { if (!name || name === 'settings' || name === 'content') this.render(); });
    }
    disconnectedCallback() { if (this.unsubscribe) this.unsubscribe(); }
    render() {
      const query = this.querySelector('input')?.value || new URLSearchParams(location.search).get('q') || '';
      const settings = NudemaStore.read('settings');
      const content = NudemaStore.read('content');
      const notice = (content.marquee || []).filter(Boolean).join(' · ') || settings.shopName || 'Nudema in Mongolia';
      this.innerHTML = '<div class="nd-top-banner">' + esc(notice) + '</div><div class="nd-utility"><a href="/">⌂ Нүүр</a><div><a href="/account">Миний хуудас</a><span> | </span><a href="/login">Нэвтрэх</a></div></div><header class="nd-header"><div class="nd-header-inner"><a class="nd-wordmark" href="/" aria-label="Nudema нүүр"><img class="nd-brand-logo" src="/assets/brand/nudema-logo.svg" alt="Nudema"></a>' +
        '<form class="nd-search" role="search" action="/search"><input type="search" name="q" aria-label="Бүтээгдэхүүн хайх" placeholder="Бүтээгдэхүүний нэр, ангилал..." autocomplete="off"><button type="submit" aria-label="Хайх">' + icon('search') + '</button></form>' +
        '<div class="nd-header-actions"><a href="/account" aria-label="Миний хуудас">' + icon('user') + '<span>Миний хуудас</span></a><a href="/terms">' + icon('grid') + '<span>Үйлчилгээний нөхцөл</span></a><a href="/cart" aria-label="Сагс">' + icon('cart') + '<span>Сагс</span><span class="nd-cart-count" data-cart-count hidden>0</span></a></div></div></header>';
      this.querySelector('input').value = query;
      if (window.NudemaCart) NudemaCart.updateBadges();
    }
  }

  function artFor(product) {
    if (product.productType === 'medical') return '/assets/storefront/medical.svg';
    if (product.productType === 'household') return '/assets/storefront/household.svg';
    if (/Крем|крем/.test(product.category || product.title)) return '/assets/storefront/cream.svg';
    if (/Серум|серум|ретинол/i.test(product.category || product.title)) return '/assets/storefront/serum.svg';
    return '/assets/storefront/care.svg';
  }

  class ProductCard extends HTMLElement {
    static get observedAttributes() { return ['product-id']; }
    connectedCallback() {
      if (this.closest('x-dc')) return;
      this.render();
      this.unsubscribe = NudemaStore.subscribe(name => { if (!name || name === 'products') this.render(); });
    }
    disconnectedCallback() { if (this.unsubscribe) this.unsubscribe(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
      if (this.closest('x-dc')) return;
      const product = NudemaStore.read('products').find(p => String(p.id) === this.getAttribute('product-id'));
      if (!product) { this.replaceChildren(); return; }
      const img = product.img || (Array.isArray(product.images) && product.images[0]) || '';
      const discount = product.original > product.price ? Math.round((1 - product.price / product.original) * 100) : 0;
      const available = Number(product.stock) > 0;
      const href = '/product?id=' + encodeURIComponent(product.id);
      this.innerHTML = '<article class="nd-card"><a class="nd-card-photo' + (img ? '' : ' nd-card-illustration') + '" href="' + href + '"><img src="' + esc(img || artFor(product)) + '" loading="lazy" alt="' + esc(img ? product.title : 'Бүтээгдэхүүний зураг бэлтгэгдэж байна') + '">' +
        (product.badge ? '<span class="nd-card-badge">' + esc(product.badge) + '</span>' : '') + (!available ? '<span class="nd-stock-out">Дууссан</span>' : '') + '</a>' +
        '<button type="button" class="nd-card-add" aria-label="' + esc(product.title) + ' — сагсанд нэмэх"' + (!available ? ' disabled' : '') + '>' + icon('cart') + '<span>' + (available ? 'Сагслах' : 'Дууссан') + '</span></button>' +
        '<a class="nd-card-name" href="' + href + '">' + esc(product.title) + '</a>' +
        (discount ? '<div class="nd-card-original">' + NudemaStore.money(product.original) + '₮</div>' : '') +
        '<div class="nd-card-price">' + (discount ? '<span>' + discount + '%</span> ' : '') + NudemaStore.money(product.price) + '₮</div>' +
        (Number(product.count && String(product.count).replace(/,/g, '')) > 0 ? '<div class="nd-card-review"><span>★</span> ' + esc(product.rating || '') + ' <span>· ' + esc(product.count) + '</span></div>' : '') + '</article>';
      const button = this.querySelector('button');
      button.addEventListener('click', () => {
        if (!available || !window.NudemaCart) return;
        const row = NudemaCart.read().find(item => item.productId === Number(product.id) && item.optionIndex === 0);
        const message = row && row.qty >= Number(product.stock) ? 'Нөөцийн хязгаарт хүрлээ' : 'Сагсанд нэмлээ';
        if (!row || row.qty < Number(product.stock)) NudemaCart.add(product.id, 1, 0);
        announce(message);
      });
    }
  }

  function announce(message) {
    let toast = document.getElementById('nd-shopping-status');
    if (!toast) {
      toast = document.createElement('div'); toast.id = 'nd-shopping-status'; toast.className = 'nd-toast';
      toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); document.body.appendChild(toast);
    }
    toast.textContent = message; toast.classList.add('is-visible');
    clearTimeout(announce.timer); announce.timer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  class DepartmentShortcuts extends HTMLElement {
    connectedCallback() {
      if (this.closest('x-dc')) return;
      this.render();
      this.unsubscribe = NudemaStore.subscribe(name => { if (!name || name === 'taxonomy') this.render(); });
    }
    disconnectedCallback() { if (this.unsubscribe) this.unsubscribe(); }
    render() {
      const tax = NudemaStore.catalog.normalizeTaxonomy(NudemaStore.read('taxonomy'));
      const icons = ['heart', 'plus', 'home', 'grid'];
      this.innerHTML = '<nav class="nd-shortcuts" aria-label="Дээд бүлгээр үзэх">' + tax.departments.map((name, i) =>
        '<a href="/search?department=' + encodeURIComponent(name) + '"><span class="nd-shortcut-icon nd-shortcut-' + (i % 4) + '">' + icon(icons[i % 4]) + '</span><span>' + esc(name) + '</span></a>').join('') +
        '<a href="/search"><span class="nd-shortcut-icon">' + icon('grid') + '</span><span>Бүгдийг үзэх</span></a></nav>';
    }
  }
  customElements.define('nudema-shop-header', ShopHeader);
  customElements.define('nudema-product-card', ProductCard);
  customElements.define('nudema-department-shortcuts', DepartmentShortcuts);

  class StoreElement extends HTMLElement {
    connectedCallback() {
      if (this.closest('x-dc')) return;
      this.render();
      this.unsubscribe = NudemaStore.subscribe(name => { if (!name || ['products', 'taxonomy', 'settings'].includes(name)) this.render(); });
    }
    disconnectedCallback() { if (this.unsubscribe) this.unsubscribe(); }
  }
  class CategorySidebar extends StoreElement {
    render() {
      const tax = NudemaStore.catalog.normalizeTaxonomy(NudemaStore.read('taxonomy'));
      this.innerHTML = '<aside class="nd-sidebar"><a class="nd-sidebar-all" href="/search">Бүх бүтээгдэхүүн үзэх ›</a>' + tax.departments.map((name, i) =>
        '<a class="nd-sidebar-group" href="/search?department=' + encodeURIComponent(name) + '"><span class="nd-side-icon nd-side-' + i % 4 + '">' + icon(['heart', 'plus', 'home', 'grid'][i % 4]) + '</span>' + esc(name) + '<span>›</span></a>').join('') +
        '<div class="nd-sidebar-separator"></div>' + tax.categories.slice(0, 6).map(name => '<a class="nd-sidebar-leaf" href="/search?category=' + encodeURIComponent(name) + '">' + esc(name) + '</a>').join('') + '</aside>';
    }
  }
  class Curation extends StoreElement {
    render() {
      const tax = NudemaStore.catalog.normalizeTaxonomy(NudemaStore.read('taxonomy'));
      const products = NudemaStore.read('products');
      const department = tax.departments.includes(this.department) ? this.department : '';
      const categories = tax.categories.filter(c => !department || tax.categoryDepartments[c] === department);
      if (!categories.includes(this.category)) this.category = '';
      const filtered = NudemaStore.catalog.filterProducts(products.filter(p => p.showOnHome), tax, { department, category: this.category });
      const visible = filtered.slice(0, 5);
      const columns = Math.min(Math.max(products.filter(p => p.showOnHome).length, 4), 5);
      this.innerHTML = '<div class="nd-curation-panel"><div class="nd-curation-events">' + tax.departments.slice(0, 4).map((name, i) =>
        '<button type="button" class="nd-event nd-event-' + i + (name === department ? ' is-selected' : '') + '" data-department="' + esc(name) + '" aria-pressed="' + (name === department) + '"><span>' + icon(['heart', 'plus', 'home', 'grid'][i % 4]) + '</span><strong>' + esc(name) + '</strong></button>').join('') + '</div><div class="nd-curation-filters"><button type="button" data-category="" aria-pressed="' + !this.category + '">Бүгд</button>' + categories.map(name => '<button type="button" data-category="' + esc(name) + '" aria-pressed="' + (this.category === name) + '">' + esc(name) + '</button>').join('') + '</div><div class="nd-products nd-curation-products" style="--nd-card-columns:' + columns + '">' + visible.map(p => '<nudema-product-card product-id="' + esc(p.id) + '"></nudema-product-card>').join('') + '</div>' +
        (!visible.length ? '<p class="nd-empty">Энэ ангилалд онцлох бүтээгдэхүүн хараахан нэмэгдээгүй байна.</p>' : '') + '<a class="nd-curation-more" href="/search' + (department ? '?department=' + encodeURIComponent(department) : '') + '">+ Бүтээгдэхүүн цааш үзэх <strong>' + filtered.length + '</strong></a></div>';
      this.querySelectorAll('[data-department]').forEach(button => button.addEventListener('click', () => { this.department = this.department === button.dataset.department ? '' : button.dataset.department; this.category = ''; this.render(); }));
      this.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { this.category = button.dataset.category; this.render(); }));
    }
  }
  const RECENT_KEY = 'nudema_recent_products';
  function recentIds() {
    try { const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(list) ? list.map(String).slice(0, 8) : []; } catch { return []; }
  }
  class RecentProducts extends StoreElement {
    render() {
      const products = NudemaStore.read('products');
      const recent = recentIds().map(id => products.find(p => String(p.id) === id)).filter(Boolean).slice(0, 5);
      this.innerHTML = !recent.length ? '' : '<section class="nd-content"><div class="nd-section-heading"><h2>Сүүлд үзсэн бүтээгдэхүүн</h2><a href="/search">Бүгдийг үзэх ›</a></div><div class="nd-recent-layout"><div class="nd-recent-banner"><span>Nudema in Mongolia</span><strong>Танд тохирох<br>сонголтууд</strong>' + icon('heart') + '</div><div class="nd-products">' + recent.map(p => '<nudema-product-card product-id="' + esc(p.id) + '"></nudema-product-card>').join('') + '</div></div></section>';
    }
  }
  class CustomerSupport extends StoreElement {
    render() {
      const settings = NudemaStore.read('settings');
      this.innerHTML = '<section class="nd-support-area"><div class="nd-support-inner"><div><h2>Хэрэглэгчийн төв</h2>' + (settings.phone ? '<a class="nd-support-phone" href="tel:' + esc(String(settings.phone).replace(/[^+\d-]/g, '')) + '">' + esc(settings.phone) + '</a>' : '') + (settings.email ? '<a href="mailto:' + esc(settings.email) + '">' + esc(settings.email) + '</a>' : '') + '</div><div class="nd-support-links"><a href="/account" aria-label="Миний хуудас">' + icon('user') + '<span>Миний хуудас</span></a><a href="/terms">' + icon('grid') + '<span>Үйлчилгээний нөхцөл</span></a><a href="/privacy">' + icon('heart') + '<span>Хувийн мэдээлэл</span></a></div></div></section>';
    }
  }
  class MarketPromotions extends StoreElement {
    render() {
      const tax = NudemaStore.catalog.normalizeTaxonomy(NudemaStore.read('taxonomy'));
      const departments = tax.departments.slice(1, 3);
      const products = NudemaStore.read('products');
      const brands = [...new Set(products.map(p => String(p.brand || '').trim()).filter(Boolean))].slice(0, 8);
      this.innerHTML = '<section class="nd-content"><div class="nd-market-banners">' + departments.map((name, i) =>
        '<a class="nd-market-banner" href="/search?department=' + encodeURIComponent(name) + '"><div><small>Nudema in Mongolia</small><strong>' + esc(name) + '</strong><span>Бүтээгдэхүүнтэй танилцах →</span></div><img src="/assets/storefront/' + (i ? 'household' : 'medical') + '.svg" alt="" loading="lazy"></a>').join('') + '</div></section>' +
        (brands.length ? '<section class="nd-content"><div class="nd-section-heading"><h2>Санал болгох брэндүүд</h2><a href="/search">Бүгдийг үзэх ›</a></div><div class="nd-brand-strip">' + brands.map(name => '<a href="/search?q=' + encodeURIComponent(name) + '">' + esc(name) + '</a>').join('') + '</div></section>' : '');
    }
  }
  class QuickActions extends HTMLElement {
    connectedCallback() {
      if (this.closest('x-dc')) return;
      this.innerHTML = '<aside class="nd-quick-actions" aria-label="Шуурхай үйлдэл"><a class="nd-quick-cart" href="/cart" aria-label="Сагс">' + icon('cart') + '<span data-cart-count hidden>0</span></a><a href="#customer-support" aria-label="Хэрэглэгчийн төв">' + icon('user') + '</a><button type="button" aria-label="Дээш очих">↑</button></aside>';
      this.querySelector('button').addEventListener('click', () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
      if (window.NudemaCart) NudemaCart.updateBadges();
    }
  }
  customElements.define('nudema-category-sidebar', CategorySidebar);
  customElements.define('nudema-curation', Curation);
  customElements.define('nudema-recent-products', RecentProducts);
  customElements.define('nudema-customer-support', CustomerSupport);
  customElements.define('nudema-market-promotions', MarketPromotions);
  customElements.define('nudema-quick-actions', QuickActions);
  function rememberProduct() {
    if (!/^\/product\/?$|Nudema.*Product\.dc/i.test(decodeURIComponent(location.pathname))) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id || !window.NudemaStore || !NudemaStore.read('products').some(p => String(p.id) === id)) return;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([id].concat(recentIds().filter(value => value !== id)).slice(0, 8))); } catch (ignore) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rememberProduct, { once: true }); else rememberProduct();
  window.addEventListener('nudema:remote', rememberProduct);
})();
