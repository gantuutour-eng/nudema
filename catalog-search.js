(function () {
  'use strict';
  var input = document.getElementById('searchInput');
  var results = document.getElementById('results'), empty = document.getElementById('empty'), summary = document.getElementById('summary');
  var group = document.getElementById('departmentFilter'), category = document.getElementById('categoryFilter');
  var tax, products;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function options(values, selected, label) {
    return '<option value="">' + label + '</option>' + values.map(function (v) { return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
  }
  function categories(selected) {
    category.innerHTML = options(tax.categories.filter(function (c) { return !group.value || tax.categoryDepartments[c] === group.value; }), selected, 'Бүх ангилал');
  }
  function load() {
    var query = new URLSearchParams(location.search);
    products = NudemaStore.read('products') || [];
    tax = NudemaStore.catalog.normalizeTaxonomy(NudemaStore.read('taxonomy'));
    input.value = query.get('q') || '';
    group.innerHTML = options(tax.departments, query.get('department') || '', 'Бүх бүлэг');
    categories(query.get('category') || '');
    render(false);
  }
  function render(updateUrl) {
    var filtered = NudemaStore.catalog.filterProducts(products, tax, { q: input.value, department: group.value, category: category.value });
    results.innerHTML = filtered.map(function (p) {
      return '<nudema-product-card product-id="' + esc(p.id) + '"></nudema-product-card>';
    }).join('');
    summary.textContent = filtered.length + ' бүтээгдэхүүн'; empty.style.display = filtered.length ? 'none' : 'block'; results.style.display = filtered.length ? 'grid' : 'none';
    if (updateUrl) {
      var url = new URL(location.href);
      [['q', input.value.trim()], ['department', group.value], ['category', category.value]].forEach(function (pair) { if (pair[1]) url.searchParams.set(pair[0], pair[1]); else url.searchParams.delete(pair[0]); });
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }
  input.addEventListener('input', function () { render(true); });
  group.addEventListener('change', function () { categories(''); render(true); });
  category.addEventListener('change', function () { render(true); });
  window.addEventListener('popstate', load);
  results.addEventListener('click', function (e) {
    var button = e.target.closest('[data-add]'); if (!button || button.disabled) return;
    NudemaCart.add(button.getAttribute('data-add'), 1, 0); button.textContent = '✓ Нэмэгдлээ';
    setTimeout(function () { button.textContent = 'Сагсанд нэмэх'; }, 900);
  });
  NudemaStore.subscribe(function (name) { if (!name || name === 'products' || name === 'taxonomy') load(); });
  load();
})();
