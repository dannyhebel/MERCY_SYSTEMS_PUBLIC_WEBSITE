/* Shared page behaviour: fills values from config.js, logo fallback, checkout (one license per purchase). */
(function () {
  'use strict';
  var C = window.AMCDT_CONFIG || {};

  // 1) Fill [data-config] placeholders, e.g. <span data-config="productVersion">[VERSION]</span>
  function fillConfig() {
    var nodes = document.querySelectorAll('[data-config]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute('data-config');
      if (!(key in C)) continue;
      var val = C[key];
      el.textContent = val;
    }
    var hrefs = document.querySelectorAll('[data-href-template]');
    for (var j = 0; j < hrefs.length; j++) {
      hrefs[j].setAttribute('href', hrefs[j].getAttribute('data-href-template').replace('{VERSION}', C.productVersion || '[VERSION]'));
    }
  }

  // 2) Logo image: use assets/logo.png if present, otherwise keep the text "M".
  function logo() {
    var marks = document.querySelectorAll('.brand-mark');
    if (!marks.length) return;
    var probe = new Image();
    probe.onload = function () {
      for (var i = 0; i < marks.length; i++) {
        var img = document.createElement('img');
        img.src = probe.src; img.alt = '';
        marks[i].appendChild(img);
        marks[i].className += ' has-img';
      }
    };
    var base = document.querySelector('.brand-mark').getAttribute('data-logo') || 'assets/logo.png';
    probe.src = base;
  }

  // 3) Checkout: any form with [data-checkout] posts {plan, agreed, trial_license_id}.
  function setupCheckout() {
    var forms = document.querySelectorAll('form[data-checkout]');
    var params = new URLSearchParams(window.location.search);
    var trialId = params.get('trial');
    if (trialId && !/^[0-9a-fA-F-]{36}$/.test(trialId)) trialId = null;

    var agree = document.getElementById('agree');
    var agreeStatus = document.getElementById('agree-status');

    for (var i = 0; i < forms.length; i++) (function (form) {
      var status = form.querySelector('.status');
      var button = form.querySelector('button[type="submit"]');

      function selectedPlan() {
        var fixed = form.getAttribute('data-plan');
        if (fixed) return fixed;
        var r = form.querySelector('input[name="plan"]:checked');
        return r ? r.value : null;
      }

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var formAgree = form.querySelector('input[name="agree"]') || agree;
        status.className = 'status';
        status.textContent = '';
        if (!formAgree || !formAgree.checked) {
          var msg = 'Please tick "I agree to the License Agreement" before continuing.';
          status.className = 'status error'; status.textContent = msg;
          if (agreeStatus) { agreeStatus.className = 'status error'; agreeStatus.textContent = msg; }
          if (formAgree) formAgree.focus();
          return;
        }
        var plan = selectedPlan();
        if (['monthly', 'annual', 'perpetual'].indexOf(plan) < 0) { status.className = 'status error'; status.textContent = 'Please choose Monthly, Annual or One-time.'; return; }
        button.disabled = true;
        status.textContent = 'Opening secure checkout...';
        // One purchase = one license: no quantity is sent.
        var body = { plan: plan, agreed: true };
        if (trialId) body.trial_license_id = trialId;
        fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            if (res.ok && res.j.url) { window.location.assign(res.j.url); return; }
            throw new Error(res.j && res.j.error ? res.j.error : 'Could not start checkout.');
          })
          .catch(function (err) {
            button.disabled = false;
            status.className = 'status error';
            status.textContent = (err && err.message) || 'Could not start checkout. Please try again.';
          });
      });
    })(forms[i]);

    if (agree && agreeStatus) agree.addEventListener('change', function () { if (agree.checked) { agreeStatus.textContent = ''; agreeStatus.className = 'status'; } });
  }

  // 4) Copy-to-clipboard buttons: <button data-copy-target="id">
  function setupCopy(root) {
    var btns = (root || document).querySelectorAll('[data-copy-target], [data-copy-text]');
    for (var i = 0; i < btns.length; i++) (function (b) {
      b.addEventListener('click', function () {
        var text = b.getAttribute('data-copy-text');
        if (!text) { var t = document.getElementById(b.getAttribute('data-copy-target')); text = t ? t.textContent : ''; }
        var done = function () { var old = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = old; }, 1500); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () {});
        else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(ta); }
      });
    })(btns[i]);
  }

  window.AMCDT = { setupCopy: setupCopy, config: C };

  document.addEventListener('DOMContentLoaded', function () {
    fillConfig(); logo(); setupCheckout(); setupCopy();
    var y = document.querySelectorAll('[data-year]');
    for (var i = 0; i < y.length; i++) y[i].textContent = String(new Date().getFullYear());
  });
})();
