(function () {
  'use strict';
  if (customElements.get('nudema-address-picker')) return;
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const bounds = [[41.5, 87.7], [52.2, 119.9]];

  class AddressPicker extends HTMLElement {
    connectedCallback() {
      if (this.closest('x-dc') || this.initialized) return;
      this.initialized = true;
      this.innerHTML = '<div class="nd-address-search"><label>Газрын зураг дээр хаяг хайх</label><div class="nd-address-query"><input type="search" aria-label="Газрын зураг дээр хаяг хайх" placeholder="Гудамж, байр эсвэл газрын нэр" autocomplete="off"><button type="button">Хайх</button></div><p class="nd-address-status" role="status" aria-live="polite">Хаягаа хайх эсвэл газрын зураг дээр дарж байршлаа сонгоно уу.</p><div class="nd-address-results" aria-label="Хаягийн хайлтын үр дүн"></div><div class="nd-address-map" role="region" aria-label="Хүргэлтийн байршлын газрын зураг"></div><div class="nd-address-selection" hidden><span></span><button type="button" aria-label="Сонгосон байршлыг арилгах">×</button></div><p class="nd-address-hint">Байршлын тэмдгийг хөдөлгөж орцоо нарийвчлан заана уу. Байр, давхар, тоотоо доор бичнэ үү.</p></div>';
      this.input = this.querySelector('input');
      this.searchButton = this.querySelector('.nd-address-query button');
      this.status = this.querySelector('[role="status"]');
      this.results = this.querySelector('.nd-address-results');
      this.selection = this.querySelector('.nd-address-selection');
      this.input.addEventListener('input', event => {
        clearTimeout(this.searchTimer);
        if (!event.isComposing && this.input.value.trim().length >= 3) this.searchTimer = setTimeout(() => this.search(), 1000);
      });
      this.searchButton.addEventListener('click', () => this.search());
      this.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.search(); } });
      this.selection.querySelector('button').addEventListener('click', () => this.clear());
      if (!window.L) { this.status.textContent = 'Газрын зураг ачаалагдсангүй. Хүргэлтийн хаягаа доор гараар оруулж болно.'; return; }
      this.map = L.map(this.querySelector('.nd-address-map'), { scrollWheelZoom: false, maxBounds: bounds, minZoom: 5 }).setView([47.9189, 106.917], 12);
      L.tileLayer(this.getAttribute('tile-url') || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(this.map);
      this.map.on('click', e => this.pick({ lat: e.latlng.lat, lng: e.latlng.lng, label: 'Газрын зураг дээр сонгосон байршил' }, false));
      this.resizeObserver = new ResizeObserver(() => this.map && this.map.invalidateSize());
      this.resizeObserver.observe(this);
    }
    disconnectedCallback() {
      clearTimeout(this.searchTimer);
      if (this.controller) this.controller.abort();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      if (this.map) this.map.remove();
      this.initialized = false;
    }
    async search() {
      clearTimeout(this.searchTimer);
      const q = this.input.value.trim();
      if (q.length < 3) { this.status.textContent = 'Хайх хаягаа 3-аас дээш тэмдэгтээр оруулна уу.'; this.input.focus(); return; }
      if (this.controller) this.controller.abort();
      const controller = this.controller = new AbortController();
      this.searchButton.disabled = true;
      this.status.textContent = 'Хаяг хайж байна…'; this.results.replaceChildren();
      try {
        const response = await fetch('/api/geocode?q=' + encodeURIComponent(q), { signal: controller.signal, headers: { 'Accept': 'application/json' } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Хаяг хайх боломжгүй байна.');
        if (this.controller !== controller) return;
        const places = data.places || [];
        this.status.textContent = places.length ? places.length + ' хаяг олдлоо. Хүргэлтийн байршлаа сонгоно уу.' : 'Хаяг олдсонгүй. Өөр нэрээр хайх эсвэл газрын зураг дээр сонгоно уу.';
        this.results.innerHTML = places.map((p, i) => '<button type="button" data-place="' + i + '"><span class="nd-address-result-pin">⌖</span><span><strong>' + esc(p.name) + '</strong><small>' + esc(p.label) + '</small></span><span>›</span></button>').join('');
        this.results.querySelectorAll('button').forEach((button, i) => button.addEventListener('click', () => { this.pick(places[i], true); this.results.replaceChildren(); }));
      } catch (error) {
        if (error.name !== 'AbortError') this.status.textContent = error.message || 'Хаяг хайж чадсангүй. Дахин оролдоно уу.';
      } finally { if (this.controller === controller) this.searchButton.disabled = false; }
    }
    pick(place, center) {
      if (place.lat < bounds[0][0] || place.lat > bounds[1][0] || place.lng < bounds[0][1] || place.lng > bounds[1][1]) return;
      this.place = { lat: Number(place.lat.toFixed(6)), lng: Number(place.lng.toFixed(6)), label: place.label };
      if (this.map) {
        if (!this.marker) {
          const icon = L.divIcon({ className: 'nd-map-marker', html: '<span></span>', iconSize: [30, 38], iconAnchor: [15, 37] });
          this.marker = L.marker([place.lat, place.lng], { icon, draggable: true, title: 'Хүргэлтийн байршил' }).addTo(this.map);
          this.marker.on('dragend', () => { const p = this.marker.getLatLng(); this.pick({ lat: p.lat, lng: p.lng, label: this.place.label }, false); });
        } else this.marker.setLatLng([place.lat, place.lng]);
        if (center) this.map.setView([place.lat, place.lng], 16);
      }
      this.selection.hidden = false;
      this.selection.querySelector('span').textContent = place.label + ' · ' + this.place.lat.toFixed(5) + ', ' + this.place.lng.toFixed(5);
      this.status.textContent = 'Байршил сонгогдлоо. Тэмдгийг хөдөлгөж орцоо нарийвчлан зааж болно.';
      this.dispatchEvent(new CustomEvent('nudema:address-selected', { bubbles: true, detail: { ...this.place } }));
    }
    clear() {
      this.place = null; if (this.marker) { this.marker.remove(); this.marker = null; }
      this.selection.hidden = true; this.results.replaceChildren();
      this.status.textContent = 'Хаягаа хайх эсвэл газрын зураг дээр дарж байршлаа сонгоно уу.';
      this.dispatchEvent(new CustomEvent('nudema:address-selected', { bubbles: true, detail: null }));
    }
  }
  customElements.define('nudema-address-picker', AddressPicker);
})();
