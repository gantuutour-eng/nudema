(function () {
  'use strict';
  if (window.NudemaInstall) return;
  let pendingPrompt = null, installed = false, prompting = false, banner;
  const DISMISS_KEY = 'nudema_install_dismissed_until';
  const standalone = () => installed || navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  // Only advertise installation after the browser supplies a real, one-use prompt.
  const available = () => !!pendingPrompt && !prompting && !standalone();
  const dismissed = () => { try { return Number(localStorage.getItem(DISMISS_KEY)) > Date.now(); } catch { return false; } };
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 86400000)); } catch {} if (banner) banner.hidden = true; };
  function refresh() {
    const ready = available();
    if (banner) banner.hidden = !ready || dismissed();
    document.querySelectorAll('[data-install-launcher]').forEach(button => { button.hidden = !ready; });
    if (ready) launcher();
  }
  async function install() {
    if (!available()) return false;
    const prompt = pendingPrompt; pendingPrompt = null; prompting = true; refresh();
    try {
      // Call before any await so the browser retains the button's user activation.
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') installed = true;
      else dismiss();
      return choice.outcome === 'accepted';
    } catch { return false; }
    finally { prompting = false; refresh(); }
  }
  window.NudemaInstall = { open: install };
  window.addEventListener('beforeinstallprompt', event => { if (typeof event.prompt !== 'function') return; event.preventDefault(); pendingPrompt = event; refresh(); });
  window.addEventListener('appinstalled', () => { installed = true; pendingPrompt = null; refresh(); });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', refresh);
  function launcher() {
    const footer = document.querySelector('footer[data-nudema-common="1"]') || document.querySelector('footer:not([data-nudema-legacy])');
    if (!footer || footer.querySelector('[data-install-launcher]') || !available()) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'nd-install-launcher'; button.dataset.installLauncher = '1'; button.textContent = 'Nudema апп суулгах'; button.addEventListener('click', install);
    (footer.querySelector('nav') || footer).appendChild(button);
  }
  function boot() {
    if (document.querySelector('x-dc') && !document.getElementById('dc-root')) return setTimeout(boot, 50);
    banner = document.createElement('aside'); banner.className = 'nd-install-banner'; banner.hidden = true; banner.setAttribute('aria-label', 'Nudema апп суулгах');
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
