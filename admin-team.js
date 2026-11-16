(function () {
  'use strict';
  const modules = { products: 'Бүтээгдэхүүн, ангилал', orders: 'Захиалга', customers: 'Хэрэглэгчид', reviews: 'Сэтгэгдэл', content: 'Контент', analytics: 'Статистик', settings: 'Тохиргоо' };
  const roles = { owner: 'Үндсэн эзэмшигч', admin: 'Администратор', operator: 'Оператор' };
  function can(identity, section) {
    if (!identity || identity.status !== 'active') return false;
    if (identity.role === 'owner' || identity.role === 'admin') return true;
    const permissions = identity.permissions || [];
    if (section === 'dashboard') return permissions.includes('orders');
    return Object.hasOwn(modules, section) && permissions.includes(section);
  }
  const errors = { not_configured: 'Google нэвтрэлт хараахан тохируулагдаагүй байна.', invalid_state: 'Нэвтрэх хүсэлт хүчингүй. Дахин Google-ээр нэвтэрнэ үү.', expired: 'Нэвтрэх хүсэлтийн хугацаа дууслаа. Дахин оролдоно уу.', cancelled: 'Google нэвтрэлтийг цуцаллаа.', google_failed: 'Google нэвтрэлт амжилтгүй боллоо. Дахин оролдоно уу.', unverified: 'Gmail эсвэл баталгаажсан Google Workspace бүртгэл ашиглана уу.', not_invited: 'Энэ Google бүртгэлд администраторын урилга байхгүй байна.', invitation_expired: 'Урилгын хугацаа дууссан. Администратороос урилгаа шинэчлүүлэхийг хүснэ үү.', suspended: 'Таны администраторын эрх зогсоогдсон байна.', unavailable: 'Нэвтрэх үйлчилгээнд түр холбогдож чадсангүй. Дахин оролдоно уу.' };
  const access = { modules, roles, can, first: identity => ['dashboard', ...Object.keys(modules), 'team'].find(s => can(identity, s)) || 'products', errorMessage: code => errors[code] || '' };
  if (typeof module === 'object' && module.exports) { module.exports = access; return; }
  if (window.NudemaAdminAccess) return;
  let startupTimer;
  access.reveal = function () {
    document.body.classList.remove('nd-admin-booting');
    const startup = document.getElementById('nd-admin-startup');
    if (startup) startup.hidden = true;
    clearTimeout(startupTimer);
  };
  function startupFallback() {
    const button = document.getElementById('nd-admin-startup-retry');
    if (!button) return;
    button.addEventListener('click', () => location.reload());
    startupTimer = setTimeout(() => {
      if (!document.body.classList.contains('nd-admin-booting')) return;
      document.getElementById('nd-admin-startup-message').textContent = 'Ачаалж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.';
      button.hidden = false;
    }, 20000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startupFallback, { once: true });
  else startupFallback();
  window.NudemaAdminAccess = access;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const statuses = { invited: 'Урилга илгээсэн', active: 'Идэвхтэй', suspended: 'Түр зогсоосон', revoked: 'Эрх цуцалсан' };
  const actions = { 'team.invite': 'Администратор урьсан', 'team.update': 'Администраторын эрх өөрчилсөн', 'team.accept': 'Урилга хүлээн авсан', 'auth.google': 'Google-ээр нэвтэрсэн', 'put.products': 'Бүтээгдэхүүн хадгалсан', 'put.orders': 'Захиалга хадгалсан', 'put.content': 'Контент хадгалсан', 'put.settings': 'Тохиргоо хадгалсан', 'put.reviews': 'Сэтгэгдэл хадгалсан', 'post.images': 'Зураг байршуулсан', 'delete.images': 'Зураг устгасан' };
  const date = value => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')) : '—';
  function describe(details) {
    let value; try { value = JSON.parse(details); } catch { return ''; }
    const summary = state => [roles[state.role], statuses[state.status], ...(state.permissions || []).map(key => modules[key])].filter(Boolean).join(' · ');
    return value.before && value.after ? summary(value.before) + ' → ' + summary(value.after) : [value.email, summary(value)].filter(Boolean).join(' · ');
  }
  const style = `:host{display:block;font:14px/1.5 Manrope,Inter,system-ui,sans-serif;color:#263238}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #81ddec;outline-offset:2px}.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:22px}h2,h3,p{margin:0}h2{font-size:20px}h3{font-size:16px}.muted{color:#7b8b93;font-size:12px;margin-top:5px}.primary,.secondary,.danger{border:0;border-radius:10px;padding:11px 17px;font-weight:700}.primary{background:#00b6d4;color:white}.secondary{background:#effbfe;color:#008ca5}.danger{background:#fff0f0;color:#c33030}.tabs{display:flex;gap:8px;margin-bottom:20px}.tab{border:1px solid #e0e9ed;border-radius:20px;background:white;padding:8px 15px;color:#647b84}.tab[aria-pressed=true]{background:#142e3a;color:white;border-color:#142e3a}.panel{background:white;border:1px solid #e3eaee;border-radius:16px;padding:22px;margin-bottom:20px;box-shadow:0 3px 16px #233b4805}.notice{background:#effbfe;border:1px solid #cfeef4;color:#22778c;border-radius:10px;padding:12px 15px;margin-bottom:18px}.error{background:#fff1f1;border-color:#f5cece;color:#b32b2b}.success{background:#f0fbf6;border-color:#cbeadb;color:#277b57}.table{overflow:auto}table{border-collapse:collapse;width:100%;min-width:670px;text-align:left}th{font-size:11px;color:#82919b;background:#f7f9fa;white-space:nowrap}td,th{padding:14px 12px;border-bottom:1px solid #edf1f4}td{font-size:13px;vertical-align:top}.name{font-weight:700}.mail{color:#778992;font-size:12px;overflow-wrap:anywhere}.pill{display:inline-block;border-radius:12px;font-size:11px;font-weight:700;background:#f2f5f7;color:#6e7e88;padding:4px 9px;white-space:nowrap}.active{background:#eaf9f0;color:#26754a}.invited{background:#fff7df;color:#8d7629}.suspended,.revoked{background:#fff0f0;color:#b44c4c}.tag{display:inline-block;font-size:10px;border:1px solid #e3e9ed;border-radius:5px;padding:2px 5px;margin:3px 3px 0 0;color:#778a94}label{display:block;font-size:12px;font-weight:700;color:#637982;margin-top:18px}input[type=email],select{display:block;width:100%;height:44px;border:1px solid #dce6eb;border-radius:9px;padding:0 12px;background:white;color:#263238;margin-top:7px}fieldset{border:1px solid #e3eaee;border-radius:10px;margin:18px 0;padding:13px}legend{font-size:12px;font-weight:700;color:#637982}.checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.checks label{display:flex;gap:8px;align-items:center;margin:0;font-weight:500}input[type=checkbox]{accent-color:#00b6d4;width:16px;height:16px}.buttons{display:flex;gap:10px;margin-top:23px;flex-wrap:wrap}.editor{max-width:580px}.empty{padding:30px;text-align:center;color:#7c929b}.audit{display:grid;gap:0}.event{display:grid;grid-template-columns:1fr auto;gap:8px;padding:15px 0;border-bottom:1px solid #edf1f4}.event small{color:#84969f}.event details{grid-column:1/-1;font-size:11px;overflow-wrap:anywhere;color:#6a7f89}.link{border:0;background:none;color:#009db7;font:inherit;padding:0;text-decoration:underline}[hidden]{display:none!important}@media(max-width:640px){.panel{padding:16px}.bar h2{font-size:18px}.event{grid-template-columns:1fr}.checks{grid-template-columns:1fr}.primary,.secondary{padding:10px 13px}table{min-width:620px}}`;
  class AdminTeam extends HTMLElement {
    connectedCallback() {
      if (this.started) return; this.started = true;
      this.root = this.attachShadow({ mode: 'open' }); this.members = []; this.entries = []; this.tab = 'members';
      this.root.addEventListener('click', event => this.click(event));
      this.root.addEventListener('submit', event => { event.preventDefault(); this.save(event.target); });
      this.root.addEventListener('change', event => { if (event.target.name === 'role') this.root.querySelector('fieldset').hidden = event.target.value === 'admin'; });
      this.load();
    }
    async request(path, options = {}) {
      const response = await fetch('/api/admin/' + path, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 401) window.NudemaStore?.sync(); throw new Error(body.error || 'Үйлчилгээнд холбогдож чадсангүй.'); }
      return body;
    }
    async load() {
      if (window.NudemaStore?.localPreview) { this.local = true; this.render(); return; }
      this.loading = true; this.render();
      try {
        const body = await this.request('team'); this.members = body.members; this.identity = body.identity;
        if (this.tab === 'audit') this.entries = (await this.request('audit')).entries;
      } catch (error) { this.error = error.message; }
      this.loading = false; this.render();
    }
    async click(event) {
      const button = event.target.closest('button'); if (!button || this.busy) return;
      if (button.dataset.tab) { this.tab = button.dataset.tab; this.editing = null; this.error = ''; this.load(); }
      if (button.dataset.action === 'reload') { this.error = ''; this.load(); }
      if (button.dataset.action === 'invite') { this.editing = { id: '', email: '', role: 'operator', permissions: ['products'], status: 'invited' }; this.error = ''; this.success = ''; this.render(); this.root.querySelector('input[type=email]').focus(); }
      if (button.dataset.edit) { this.editing = this.members.find(m => m.id === button.dataset.edit); this.error = ''; this.success = ''; this.render(); this.root.querySelector('select').focus(); }
      if (button.dataset.action === 'cancel') { this.editing = null; this.error = ''; this.render(); }
      if (button.dataset.action === 'copy') { try { await navigator.clipboard.writeText(location.origin + '/admin'); button.textContent = 'Хууллаа ✓'; } catch { button.textContent = location.origin + '/admin'; } }
    }
    async save(form) {
      if (this.busy) return;
      const fields = new FormData(form), old = this.editing;
      const body = { email: fields.get('email') || old.email, role: fields.get('role'), permissions: fields.getAll('permissions'), status: fields.get('status') || 'invited', ...(old.id ? { id: old.id, revision: old.revision } : {}) };
      this.busy = true; this.error = '';
      form.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        await this.request('team', { method: old.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        this.editing = null; this.success = old.id ? 'Эрх шинэчлэгдлээ. Өөрчлөлт даруй үйлчилнэ.' : body.email + ' бүртгэлд урилга үүсгэлээ. 7 хоногийн дотор /admin хуудаст Google-ээр нэвтэрч хүлээн авна.';
      } catch (error) { this.error = error.message; this.editing = { ...old, ...body }; }
      this.busy = false; this.load();
    }
    editor() {
      const member = this.editing, owner = this.identity.role === 'owner';
      const checks = Object.entries(modules).filter(([key]) => this.identity.permissions.includes(key)).map(([key, label]) => `<label><input type="checkbox" name="permissions" value="${key}" ${member.permissions.includes(key) ? 'checked' : ''}>${label}</label>`).join('');
      return `<form class="panel editor"><h3>${member.id ? 'Эрх өөрчлөх' : 'Шинэ администратор урих'}</h3><p class="muted">${member.id ? escape(member.email) : 'Уригдсан Google бүртгэлээр нэвтэрсний дараа эрх идэвхжинэ.'}</p>${member.id ? '' : '<label>Google и-мэйл<input type="email" name="email" autocomplete="off" required maxlength="160" placeholder="name@gmail.com" value="' + escape(member.email) + '"></label>'}<label>Эрхийн түвшин<select name="role">${owner ? '<option value="admin" ' + (member.role === 'admin' ? 'selected' : '') + '>Администратор — оператор урих боломжтой</option>' : ''}<option value="operator" ${member.role === 'operator' ? 'selected' : ''}>Оператор — сонгосон цэс</option></select></label><fieldset ${member.role === 'admin' ? 'hidden' : ''}><legend>Ашиглах цэс</legend><div class="checks">${checks}</div></fieldset>${member.id ? '<label>Төлөв<select name="status">' + Object.entries(statuses).filter(([key]) => key !== 'active' || member.lastLoginAt).map(([key, label]) => '<option value="' + key + '" ' + (member.status === key ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></label>' : ''}<div class="buttons"><button class="primary" type="submit">${member.id ? 'Өөрчлөлт хадгалах' : 'Урилга үүсгэх'}</button><button class="secondary" type="button" data-action="cancel">Цуцлах</button></div></form>`;
    }
    render() {
      if (!this.root) return;
      if (this.local) { this.root.innerHTML = '<style>' + style + '</style><div class="notice">Администратор удирдах хэсэг нь Cloudflare дээр Google-ээр нэвтэрсний дараа ажиллана.</div>'; return; }
      const notice = this.error ? `<div class="notice error" role="alert">${escape(this.error)}</div>` : this.success ? `<div class="notice success" role="status">${escape(this.success)} <button class="link" data-action="copy">Нэвтрэх холбоос хуулах</button></div>` : '';
      const rows = this.members.map(member => {
        const editable = member.role !== 'owner' && (this.identity.role === 'owner' || member.role === 'operator');
        return `<tr><td><div class="name">${escape(member.name)}</div><div class="mail">${escape(member.email)}</div></td><td>${roles[member.role]}<div>${member.role === 'operator' ? member.permissions.map(key => '<span class="tag">' + modules[key] + '</span>').join('') : '<span class="tag">Бүх цэс</span>'}</div></td><td><span class="pill ${member.status}">${statuses[member.status]}</span>${member.status === 'invited' ? '<div class="muted">' + escape(date(member.inviteExpiresAt)) + '</div>' : ''}</td><td>${escape(date(member.lastLoginAt))}</td><td>${editable ? '<button class="secondary" data-edit="' + escape(member.id) + '">Эрх өөрчлөх</button>' : '<span class="muted">' + (member.role === 'owner' ? 'Хамгаалагдсан' : '—') + '</span>'}</td></tr>`;
      }).join('');
      const audit = this.entries.map(entry => {
        const target = this.members.find(member => member.id === entry.target)?.email || modules[entry.target.replace('store/', '')] || (entry.target.startsWith('images') ? 'Зураг' : entry.target === 'catalog' ? 'Бүтээгдэхүүн, ангилал' : '');
        const details = describe(entry.details);
        return `<div class="event"><div><strong>${escape(actions[entry.action] || entry.action)}</strong><div class="mail">${escape(entry.actor_email)}${target ? ' · ' + escape(target) : ''}</div></div><small>${escape(date(entry.created_at))}</small>${details ? '<details><summary>Дэлгэрэнгүй</summary>' + escape(details) + '</details>' : ''}</div>`;
      }).join('');
      this.root.innerHTML = `<style>${style}</style><div class="bar"><div><h2>Администратор удирдах</h2><p class="muted">Google бүртгэл · эрхийн түвшин · хандалтын удирдлага</p></div><button class="primary" data-action="invite" ${this.loading || !this.identity ? 'disabled' : ''}>+ Администратор урих</button></div><div class="tabs"><button class="tab" data-tab="members" aria-pressed="${this.tab === 'members'}">Администраторууд</button><button class="tab" data-tab="audit" aria-pressed="${this.tab === 'audit'}">Үйлдлийн түүх</button><button class="tab" data-action="reload" aria-label="Жагсаалт шинэчлэх">↻</button></div>${notice}${this.editing && this.identity ? this.editor() : ''}${this.loading ? '<div class="panel empty" role="status">Ачаалж байна…</div>' : this.tab === 'audit' ? '<div class="panel audit">' + (audit || '<p class="empty">Одоогоор бүртгэл алга.</p>') + '</div>' : '<div class="panel table"><table><thead><tr><th>Google бүртгэл</th><th>Эрх / Цэс</th><th>Төлөв</th><th>Сүүлд нэвтэрсэн</th><th>Удирдах</th></tr></thead><tbody>' + rows + '</tbody></table></div>'}`;
    }
  }
  if (!customElements.get('nudema-admin-team')) customElements.define('nudema-admin-team', AdminTeam);
})();
