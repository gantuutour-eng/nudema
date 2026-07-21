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

  function showOauthError(element) {
    var code = new URLSearchParams(location.search).get('oauth_error');
    if (!code) return;
    var messages = {
      not_configured: 'Google нэвтрэлт одоогоор тохируулагдаагүй байна.',
      cancelled: 'Google нэвтрэлтийг цуцаллаа.',
      expired: 'Нэвтрэх хүсэлтийн хугацаа дууссан. Дахин оролдоно уу.',
      unverified_email: 'Баталгаажсан Google и-мэйл шаардлагатай.',
      invalid_response: 'Google-ээс ирсэн нэвтрэх мэдээлэл дутуу байна.',
      start_failed: 'Google нэвтрэлтийг эхлүүлж чадсангүй.',
      callback_failed: 'Google нэвтрэлтийг дуусгаж чадсангүй. Дахин оролдоно уу.',
    };
    showMessage(element, messages[code] || 'Google нэвтрэлт амжилтгүй боллоо.');
    try {
      var clean = new URL(location.href);
      clean.searchParams.delete('oauth_error');
      history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
    } catch (ignore) {}
  }

  window.NudemaAuth = { api: api, showMessage: showMessage, showOauthError: showOauthError, setBusy: setBusy, money: money, statusLabel: statusLabel };
})();
