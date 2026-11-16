// Reconstruct missing legacy taxonomy entries from the products that still use them.
// This is a read projection; explicit catalog edits still reject new orphan products.
export function reconcileTaxonomy(value, products = []) {
  const tax = value && typeof value === 'object' ? value : {};
  const defaults = ['Гоо сайхан', 'Эмнэлгийн хэрэгсэл', 'Гэр ахуй', 'Бусад'];
  const departments = Array.isArray(tax.departments) && tax.departments.length ? [...tax.departments] : defaults;
  const categories = Array.isArray(tax.categories) ? [...tax.categories] : [];
  const links = { ...(tax.categoryDepartments || {}) };
  for (const product of products) {
    const category = typeof product.category === 'string' ? product.category.trim() : '';
    if (!category) continue;
    if (!categories.includes(category)) categories.push(category);
    const preferred = ({ beauty: defaults[0], medical: defaults[1], household: defaults[2] })[product.productType] || defaults[0];
    if (!departments.includes(links[category])) links[category] = departments.includes(preferred) ? preferred : departments.at(-1);
  }
  for (const category of categories) if (!departments.includes(links[category])) links[category] = departments.includes(defaults[0]) ? defaults[0] : departments.at(-1);
  return { ...tax, departments, categories, categoryDepartments: links, badges: Array.isArray(tax.badges) ? [...tax.badges] : [] };
}

export function validateProducts(products) {
  if (!Array.isArray(products)) return 'products must be an array.';
  const ids = new Set(), skus = new Set();
  for (const p of products) {
    if (!p || typeof p !== 'object' || !p.id || typeof p.title !== 'string' || !p.title.trim()) return 'Each product needs an ID and title.';
    if (ids.has(String(p.id))) return 'Duplicate product ID.';
    ids.add(String(p.id));
    if (!Number.isSafeInteger(p.price) || p.price <= 0 || !Number.isSafeInteger(p.stock) || p.stock < 0) return 'Price and stock must be valid whole numbers.';
    const sku = String(p.sku || '').trim().toLocaleLowerCase();
    if (sku && skus.has(sku)) return 'Duplicate SKU.';
    if (sku) skus.add(sku);
    if (p.productType && !['general', 'beauty', 'medical', 'household'].includes(p.productType)) return 'Invalid product type.';
    if (p.specifications !== undefined && (!Array.isArray(p.specifications) || p.specifications.length > 20 || p.specifications.some(s => !s || typeof s.name !== 'string' || typeof s.value !== 'string'))) return 'Invalid product specifications.';
  }
  return '';
}

export function validateTaxonomy(tax) {
  if (!tax || typeof tax !== 'object') return 'Invalid taxonomy.';
  for (const key of ['categories', 'badges', ...(tax.departments === undefined ? [] : ['departments'])]) {
    const list = tax[key];
    if (!Array.isArray(list) || list.some(v => typeof v !== 'string' || !v.trim() || v.length > 100)) return `Invalid ${key}.`;
    if (new Set(list.map(v => v.trim().toLocaleLowerCase())).size !== list.length) return `Duplicate ${key}.`;
  }
  if (tax.departments) {
    if (!tax.departments.length) return 'At least one department is required.';
    if (tax.categories.some(c => !Object.hasOwn(tax.categoryDepartments || {}, c) || !tax.departments.includes(tax.categoryDepartments[c]))) return 'Every category needs a valid department.';
  }
  return '';
}
