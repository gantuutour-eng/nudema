(function () {
  'use strict';

  function pageName() {
    try { return decodeURIComponent(location.pathname.split('/').pop() || '').toLowerCase(); }
    catch (ignore) { return String(location.pathname || '').toLowerCase(); }
  }

  function activeTab() {
    var page = pageName();
    if (/search/.test(page)) return 'search';
    if (/cart|checkout/.test(page)) return 'cart';
    if (/account|login|signup/.test(page)) return 'account';
    if (/mobile|mongolia|^index/.test(page)) return 'home';
    return '';
  }

  function storeSettings() {
    try {
      if (window.NudemaStore) return window.NudemaStore.read('settings') || {};
    } catch (ignore) {}
    return {};
  }

  function footerHtml() {
    var settings = storeSettings();
    var shop = String(settings.shopName || 'Nudema Mongolia');
    var email = String(settings.email || 'help@nudema.mn');
    var phone = String(settings.phone || '7011-5007');
    return '<div class="nudema-footer-inner"><div class="nudema-footer-logo">NUDEMA</div>' +
      '<nav class="nudema-footer-links" aria-label="Footer">' +
      '<a href="Nudema%20Terms.dc.html">Үйлчилгээний нөхцөл</a>' +
      '<a class="company-link" href="Nudema%20Mongolia.dc.html#brand-story">Компанийн мэдээлэл</a>' +
      '<a href="Nudema%20Privacy.dc.html">Хувийн мэдээлэл</a>' +
      '<a href="mailto:' + email + '">Хэрэглэгчийн төв</a></nav>' +
      '<div class="nudema-footer-row"><div class="nudema-footer-info">' + shop + ' ХХК · Улаанбаатар хот' +
      '<span class="nudema-footer-extra">, Сүхбаатар дүүрэг, Энх тайваны өргөн чөлөө 12<br>Захирал: Б.Оюунбилэг · Улсын бүртгэлийн дугаар: 106-86-43373</span><br>' +
      'И-мэйл: ' + email + ' · Утас: ' + phone + '<span class="nudema-footer-extra"> · Ажлын цаг: Даваа–Баасан 09:00–18:00</span><br>' +
      'NUDEMA MONGOLIA LLC. ALL RIGHTS RESERVED.</div>' +
      '<div class="nudema-footer-social"><a href="mailto:' + email + '" aria-label="Email">◎</a><a href="mailto:' + email + '" aria-label="Support">TALK</a><a href="Nudema%20Mongolia.dc.html#brand-story" aria-label="Brand video">▶</a></div></div></div>';
  }

  function navLink(key, href, label, svg, badge) {
    return '<a' + (activeTab() === key ? ' class="active"' : '') + ' href="' + href + '">' + svg +
      (badge ? '<span class="nudema-nav-badge" data-cart-count hidden>0</span>' : '') + label + '</a>';
  }

  function navHtml() {
    return navLink('home', 'Nudema%20Mobile.dc.html', 'Нүүр', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>') +
      navLink('search', 'Nudema%20Search.dc.html', 'Хайх', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>') +
      navLink('cart', 'Nudema%20Cart.dc.html', 'Сагс', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.3 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20.5 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>', true) +
      navLink('account', 'Nudema%20Account.dc.html', 'Профайл', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>');
  }

  function fixActions() {
    document.querySelectorAll('.auth-row span').forEach(function (item) {
      if (item.textContent.trim() !== 'Нууц үг мартсан?') return;
      var link = document.createElement('a');
      link.className = 'auth-link';
      link.href = 'mailto:help@nudema.mn?subject=NUDEMA%20password%20reset';
      link.textContent = item.textContent;
      item.replaceWith(link);
    });
    document.querySelectorAll('.auth-social button[disabled]').forEach(function (button) {
      if (/Kakao/i.test(button.textContent)) button.remove();
    });
  }

  function apply() {
    fixActions();
    var footer = document.querySelector('footer');
    if (footer && !footer.dataset.nudemaCommon) {
      footer.className = (footer.className ? footer.className + ' ' : '') + 'nudema-common-footer';
      footer.innerHTML = footerHtml();
      footer.dataset.nudemaCommon = '1';
    }

    if (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) {
      var oldNav = document.querySelector('.m-bottom-nav,.product-bottom-nav,nav.bottom,.nudema-mobile-nav');
      if (!oldNav || !oldNav.classList.contains('nudema-mobile-nav')) {
        var nav = document.createElement('nav');
        nav.className = 'nudema-mobile-nav';
        nav.setAttribute('aria-label', 'Mobile navigation');
        nav.innerHTML = navHtml();
        if (oldNav) oldNav.replaceWith(nav); else document.body.appendChild(nav);
      }
      document.body.classList.add('nudema-has-mobile-nav');
      try { if (window.NudemaCart) window.NudemaCart.updateBadges(); } catch (ignore) {}
    }
  }

  function start() {
    if (window.__nudemaUserUiStarted) return;
    var target = document.documentElement || document.body;
    if (!target || !target.nodeType) {
      setTimeout(start, 25);
      return;
    }
    window.__nudemaUserUiStarted = true;
    apply();
    var observer = new MutationObserver(function () {
      var mobile = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
      if (!document.querySelector('footer[data-nudema-common="1"]') ||
          (mobile && !document.querySelector('.nudema-mobile-nav'))) apply();
    });
    observer.observe(target, { childList: true, subtree: true });
    setTimeout(function () { apply(); observer.disconnect(); }, 4000);
  }

  function scheduleStart() {
    var hasDcRuntime = document.querySelector('x-dc') || document.querySelector('script[data-dc-script]');
    if (hasDcRuntime && !document.getElementById('dc-root')) {
      setTimeout(scheduleStart, 25);
      return;
    }
    if (document.readyState === 'loading' && !hasDcRuntime) {
      document.addEventListener('DOMContentLoaded', start, { once: true });
      return;
    }
    start();
  }

  scheduleStart();
}());
