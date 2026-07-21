(function () {
  'use strict';

  function api(path, options) {
    return fetch(path, Object.assign({
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    }, options || {})).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          var error = new Error(body.error || 'Хүсэлтийг гүйцэтгэж чадсангүй.');
          error.status = response.status;
          throw error;
        }
        return body;
      });
    });
  }

  function showMessage(element, message) {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('show', !!message);
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = !!busy;
    button.textContent = busy ? busyLabel : button.dataset.label;
  }

  function money(value) {
    return '₮ ' + (Number(value) || 0).toLocaleString('en-US');
  }

  function statusLabel(status) {
    return ({ pending: 'Хүлээгдэж буй', paid: 'Төлбөр төлсөн', shipping: 'Хүргэлтэд', done: 'Хүргэгдсэн', cancelled: 'Цуцлагдсан' })[status] || status || 'Хүлээгдэж буй';
  }

  window.NudemaAuth = { api: api, showMessage: showMessage, setBusy: setBusy, money: money, statusLabel: statusLabel };
})();
