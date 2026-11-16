(function () {
  if (customElements.get('nudema-categories')) return;
  class CatalogNavigation extends HTMLElement {
    connectedCallback() {
      this.render();
      this.unsubscribe = NudemaStore.subscribe(name => { if (!name || name === 'taxonomy') this.render(); });
    }
    disconnectedCallback() { if (this.unsubscribe) this.unsubscribe(); }
    render() {
      const tax = NudemaStore.catalog.normalizeTaxonomy(NudemaStore.read('taxonomy'));
      const nav = document.createElement('nav');
      nav.setAttribute('aria-label', 'Барааны бүлэг');
      nav.className = 'nd-category-tabs';
      [{ name: 'Зөвлөмж', href: '/' }].concat(tax.departments.map(name => ({ name, href: '/search?department=' + encodeURIComponent(name) }))).forEach((item, i) => {
        const a = document.createElement('a');
        a.href = item.href; a.textContent = item.name;
        if (i === 0) a.setAttribute('aria-current', 'page');
        nav.appendChild(a);
      });
      this.replaceChildren(nav);
    }
  }
  customElements.define('nudema-categories', CatalogNavigation);
})();
