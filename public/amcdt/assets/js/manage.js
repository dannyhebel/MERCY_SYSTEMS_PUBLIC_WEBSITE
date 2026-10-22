/* Manage subscription: POST /api/billing-portal {email, license_key} -> redirect to Stripe's customer portal. */
(function () {
  'use strict';
  function showLogin(url) {
    if (!url || !/^https:\/\/billing\.stripe\.com\//.test(url)) return;
    var row = document.getElementById('portal-login-row');
    var a = document.getElementById('portal-login');
    if (row && a) { a.href = url; row.hidden = false; }
  }
  document.addEventListener('DOMContentLoaded', function () {
    var cfg = window.AMCDT_CONFIG || {};
    showLogin(cfg.portalLoginUrl);
    var form = document.getElementById('portal-form');
    if (!form) return;
    var email = form.querySelector('input[name="email"]');
    var key = form.querySelector('input[name="license_key"]');
    var status = form.querySelector('.status');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      status.className = 'status'; status.textContent = '';
      if (!email.value || !email.checkValidity()) { status.className = 'status error'; status.textContent = 'Please enter the email address you used at checkout.'; email.focus(); return; }
      if (!key.value.trim()) { status.className = 'status error'; status.textContent = 'Please enter one of your license keys.'; key.focus(); return; }
      button.disabled = true;
      status.textContent = 'Opening the billing portal...';
      fetch('/api/billing-portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value.trim(), license_key: key.value.trim() }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, code: r.status, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j.url) { window.location.assign(res.j.url); return; }
          button.disabled = false;
          status.className = 'status error';
          status.textContent = res.code === 429 ? 'Too many attempts. Please try again later.' : (res.j.error || 'Something went wrong. Please try again.');
          showLogin(res.j.portal_login_url);
        })
        .catch(function () { button.disabled = false; status.className = 'status error'; status.textContent = 'Network problem. Please try again.'; });
    });
  });
})();
