(function () {
  'use strict';
  function guidance(ua, platform, touchPoints) {
    const ios = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    const inApp = /FBAN|FBAV|Instagram|Line\/|KAKAOTALK|; wv\)/i.test(ua);
    if (inApp) return { title: 'Үндсэн хөтөчдөө нээнэ үү', steps: ['Энэ цэснээс «Хөтөчөөр нээх» (Open in browser) сонгоно уу.', ios ? 'Safari эсвэл Chrome-д нээгээд «Хуваалцах → Нүүр дэлгэцэнд нэмэх» сонгоно уу.' : 'Chrome эсвэл Samsung Internet-д нээгээд «Апп суулгах» эсвэл «Нүүр дэлгэцэнд нэмэх» сонгоно уу.'], copy: true };
    if (ios) return { title: 'Нүүр дэлгэцэндээ нэмээрэй', steps: ['Хөтчийн «Хуваалцах» (Share) товчийг дарна уу. Шаардлагатай бол эхлээд «⋯» цэсийг нээнэ үү.', '«Нүүр дэлгэцэнд нэмэх» (Add to Home Screen) сонгоно уу.', 'Байвал «Вэб апп болгон нээх» (Open as Web App)-ийг идэвхжүүлээд «Нэмэх» дарна уу.'], note: 'Сонголт харагдахгүй бол Safari-д нээгээд дахин оролдоно уу. Safari-д «Edit Actions»-оос энэ сонголтыг нэмж болно.', copy: true };
    if (/SamsungBrowser/i.test(ua)) return { title: 'Samsung Internet-д суулгах', steps: ['Хаягийн мөрийн суулгах тэмдэг эсвэл «☰» цэсийг нээнэ үү.', '«Хуудсыг нэмэх → Нүүр дэлгэц» (Add page to → Home screen) эсвэл «Апп суулгах» сонгоно уу.', '«Нэмэх» эсвэл «Суулгах» товчоор баталгаажуулна уу.'] };
    if (/Android/i.test(ua)) return { title: 'Nudema-г нүүр дэлгэцэндээ нэмэх', steps: ['Хөтчийн «⋮» эсвэл «☰» цэсийг нээнэ үү.', '«Апп суулгах» (Install app) эсвэл «Нүүр дэлгэцэнд нэмэх» (Add to Home screen) сонгоно уу.', '«Суулгах» эсвэл «Нэмэх» товчийг дарна уу.'], note: 'Энэ сонголт байхгүй бол холбоосыг Chrome эсвэл Samsung Internet-д нээнэ үү.', copy: true };
    return { title: 'Nudema-г суулгах', steps: ['Хөтчийн хаягийн мөрийн суулгах тэмдэг эсвэл үндсэн цэсийг нээнэ үү.', '«Апп суулгах» (Install app)-ыг сонгоод баталгаажуулна уу.'], note: 'Таны хөтөч энэ сонголтыг дэмжихгүй бол Chrome, Edge эсвэл Safari ашиглана уу.', copy: true };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { guidance }; return; }
  if (window.NudemaInstall) return;
  let pendingPrompt = null, installed = false, banner, modal, previousFocus;
  const DISMISS_KEY = 'nudema_install_dismissed_until';
  const standalone = () => installed || navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const dismissed = () => { try { return Number(localStorage.getItem(DISMISS_KEY)) > Date.now(); } catch { return false; } };
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 86400000)); } catch {} if (banner) banner.hidden = true; };
  function refresh() {
    if (!banner) return;
    banner.hidden = standalone() || dismissed();
    document.querySelectorAll('[data-install-launcher]').forEach(button => { button.hidden = standalone(); });
  }
  function closeGuide() { if (modal) modal.remove(); modal = null; if (previousFocus?.isConnected) previousFocus.focus(); }
  function showGuide() {
    closeGuide(); previousFocus = document.activeElement;
    const guide = guidance(navigator.userAgent, navigator.platform, navigator.maxTouchPoints || 0);
    modal = document.createElement('div'); modal.className = 'nd-install-dialog';
    const sheet = document.createElement('section'); sheet.className = 'nd-install-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'nd-install-title');
    sheet.innerHTML = '<button class="nd-install-close" type="button" aria-label="Хаах">×</button><img src="/assets/pwa/icon-192.png" alt="Nudema"><h2 id="nd-install-title"></h2><ol></ol>';
    sheet.querySelector('h2').textContent = guide.title;
    guide.steps.forEach(step => { const li = document.createElement('li'); li.textContent = step; sheet.querySelector('ol').appendChild(li); });
    if (guide.note) { const p = document.createElement('p'); p.textContent = guide.note; sheet.appendChild(p); }
    if (guide.copy) {
      const input = document.createElement('input'); input.className = 'nd-install-address'; input.value = location.origin + '/'; input.readOnly = true; input.setAttribute('aria-label', 'Дэлгүүрийн холбоос'); sheet.appendChild(input);
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'nd-install-button'; copy.textContent = 'Холбоос хуулах';
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(input.value); copy.textContent = 'Хууллаа ✓'; } catch { input.focus(); input.select(); copy.textContent = 'Холбоосыг сонгоод хуулна уу'; } }); sheet.appendChild(copy);
    }
    sheet.querySelector('button').addEventListener('click', closeGuide);
    modal.addEventListener('click', event => { if (event.target === modal) closeGuide(); });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeGuide();
      if (event.key === 'Tab') { const items = Array.from(sheet.querySelectorAll('button,input')); const first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    });
    modal.appendChild(sheet); document.body.appendChild(modal); sheet.querySelector('button').focus();
  }
  async function install() {
    if (standalone()) return;
    if (!pendingPrompt) return showGuide();
    const prompt = pendingPrompt; pendingPrompt = null;
    try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') { installed = true; refresh(); } else dismiss(); } catch { showGuide(); }
  }
  window.NudemaInstall = { open: install };
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pendingPrompt = event; refresh(); });
  window.addEventListener('appinstalled', () => { installed = true; pendingPrompt = null; refresh(); closeGuide(); });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', refresh);
  function launcher() {
    const footer = document.querySelector('footer[data-nudema-common="1"]') || document.querySelector('footer:not([data-nudema-legacy])');
    if (!footer || footer.querySelector('[data-install-launcher]') || standalone()) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'nd-install-launcher'; button.dataset.installLauncher = '1'; button.textContent = 'Nudema апп суулгах'; button.addEventListener('click', install);
    (footer.querySelector('nav') || footer).appendChild(button);
  }
  function boot() {
    if (document.querySelector('x-dc') && !document.getElementById('dc-root')) return setTimeout(boot, 50);
    banner = document.createElement('aside'); banner.className = 'nd-install-banner'; banner.setAttribute('aria-label', 'Nudema апп суулгах');
    banner.innerHTML = '<button class="nd-install-close" type="button" aria-label="Суулгах саналыг хаах">×</button><img class="nd-install-icon" src="/assets/pwa/icon-192.png" alt=""><div class="nd-install-copy">Нүүр дэлгэцэнд нэмээд<strong>Апп шиг ашиглаарай</strong></div><button class="nd-install-button" type="button">Суулгах</button>';
    banner.querySelector('.nd-install-close').addEventListener('click', dismiss); banner.querySelector('.nd-install-button').addEventListener('click', install); document.body.prepend(banner); refresh(); launcher();
    const observer = new MutationObserver(launcher); observer.observe(document.body, { childList: true, subtree: true }); setTimeout(() => observer.disconnect(), 5000);
    if (window.NudemaStore) NudemaStore.subscribe(name => { if (!name || name === 'settings') setTimeout(launcher, 0); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
  }
})();
