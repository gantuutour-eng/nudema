(function () {
  if (customElements.get('nudema-menu')) return;

  const LINKS = [
    { label: 'BEST', href: 'Nudema%20Mongolia.dc.html' },
    { label: 'Анхны худалдан авалт', href: 'Nudema%20Mongolia.dc.html' },
    { label: 'Төрлөөр', href: 'Nudema%20Mongolia.dc.html' },
    { label: 'Арьсны асуудлаар', href: 'Nudema%20Mongolia.dc.html' },
    { label: 'Бэлэглэх', href: 'Nudema%20Mongolia.dc.html' },
    { label: 'Эвент', href: 'Nudema%20Mongolia.dc.html' },
  ];
  const SUB = [
    { label: 'Брэндийн түүх', href: 'Nudema%20Brand%20Story.dc.html' },
    { label: 'Хайх', href: 'Nudema%20Search.dc.html' },
    { label: 'Миний хуудас', href: 'Nudema%20Account.dc.html' },
    { label: 'Сагс', href: 'Nudema%20Cart.dc.html' },
  ];

  class NudemaMenu extends HTMLElement {
    connectedCallback() {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          :host { display: inline-flex; }
          .burger { display:flex; flex-direction:column; gap:4px; cursor:pointer; background:none; border:none; padding:0; }
          .burger span { width:22px; height:2px; background:#1a1c1a; display:block; transition:transform .25s, opacity .2s; }
          .open .burger span:nth-child(1){ transform:translateY(6px) rotate(45deg); }
          .open .burger span:nth-child(2){ opacity:0; }
          .open .burger span:nth-child(3){ transform:translateY(-6px) rotate(-45deg); }
          .scrim { position:fixed; inset:0; background:rgba(16,37,95,.42); opacity:0; pointer-events:none; transition:opacity .3s; z-index:998; }
          .open .scrim { opacity:1; pointer-events:auto; }
          .drawer { position:fixed; top:0; left:0; height:100%; width:320px; max-width:82vw; background:#fff; box-shadow:2px 0 30px rgba(16,37,95,.18);
                    transform:translateX(-100%); transition:transform .32s cubic-bezier(.4,0,.2,1); z-index:999; display:flex; flex-direction:column;
                    font-family:'Manrope',-apple-system,sans-serif; }
          .open .drawer { transform:translateX(0); }
          .dhead { display:flex; align-items:center; justify-content:space-between; padding:22px 24px; border-bottom:1px solid #eee; }
          .logo { font-size:22px; font-weight:800; letter-spacing:.08em; color:#2a54e6; text-decoration:none; }
          .close { background:none; border:none; font-size:26px; line-height:1; color:#1a1c1a; cursor:pointer; }
          nav { padding:12px 8px; overflow:auto; flex:1; }
          nav a { display:block; padding:15px 18px; font-size:16px; font-weight:700; color:#16255f; text-decoration:none; border-radius:10px; }
          nav a:hover { background:#f2f5ff; color:#2a54e6; }
          .sep { height:1px; background:#eee; margin:12px 16px; }
          .sub a { font-size:14px; font-weight:600; color:#5c6660; padding:12px 18px; }
        </style>
        <div class="wrap">
          <button class="burger" aria-label="Цэс"><span></span><span></span><span></span></button>
          <div class="scrim"></div>
          <aside class="drawer" role="dialog" aria-label="Цэс">
            <div class="dhead">
              <a class="logo" href="Nudema%20Mongolia.dc.html">NUDEMA</a>
              <button class="close" aria-label="Хаах">&times;</button>
            </div>
            <nav>
              ${LINKS.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}
              <div class="sep"></div>
              <div class="sub">${SUB.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}</div>
            </nav>
          </aside>
        </div>`;
      const wrap = root.querySelector('.wrap');
      const open = () => wrap.classList.add('open');
      const close = () => wrap.classList.remove('open');
      root.querySelector('.burger').addEventListener('click', open);
      root.querySelector('.close').addEventListener('click', close);
      root.querySelector('.scrim').addEventListener('click', close);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }
  }
  customElements.define('nudema-menu', NudemaMenu);
})();
