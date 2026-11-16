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
