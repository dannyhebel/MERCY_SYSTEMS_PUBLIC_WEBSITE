/* Success page: fetch the license key(s) for this Checkout Session from the server. */
(function () {
  'use strict';
  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get('session_id') || '';
  var status = document.getElementById('key-status');
  var list = document.getElementById('keys');
  var emailNote = document.getElementById('email-note');
  var attempts = 0;
  var MAX_ATTEMPTS = 20;

  function show(msg, cls) { status.className = 'status ' + (cls || ''); status.textContent = msg; }

  function render(data) {
    list.innerHTML = '';
    data.licenses.forEach(function (l) {
      var li = document.createElement('li');
      var label = document.createElement('span');
      label.textContent = data.licenses.length > 1 ? 'Seat ' + l.seat + ':' : 'License key:';
      var key = document.createElement('span');
      key.className = 'key'; key.id = 'key-' + l.seat; key.textContent = l.key;
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn btn-outline copy-btn';
      btn.setAttribute('data-copy-target', key.id);
      btn.setAttribute('aria-label', 'Copy license key');
      btn.textContent = 'Copy';
      li.appendChild(label); li.appendChild(key); li.appendChild(btn);
      list.appendChild(li);
    });
    if (window.AMCDT) window.AMCDT.setupCopy(list);
    var plan = { monthly: 'Monthly subscription ($59/month)', annual: 'Annual subscription ($590/year)', perpetual: 'One-time perpetual license ($1,490)' }[data.plan] || 'AMCDT license';
    show(plan + '. Your license key is below.', 'ok');
    var to = data.email || 'the address you used at checkout';
    emailNote.textContent = data.emailed
      ? 'We also emailed this key to ' + to + '.'
      : 'We are also emailing this key to ' + to + '. If it does not arrive within an hour, check your spam folder or email danny@mercysystems.com.';
  }

  function poll() {
    attempts++;
    fetch('/api/license?session_id=' + encodeURIComponent(sessionId), { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { code: r.status, j: j }; }); })
      .then(function (res) {
        if (res.code === 200 && res.j.status === 'ready') return render(res.j);
        if (res.code === 202 || res.code === 503) {
          if (attempts < MAX_ATTEMPTS) { show('Payment received. Preparing your license key' + '.'.repeat(1 + attempts % 3)); return setTimeout(poll, 3000); }
          return show('This is taking longer than usual. Your key will arrive by email shortly. If not, email danny@mercysystems.com.', 'error');
        }
        if (res.code === 402) return show('We have not received payment for this checkout. If you were charged, email danny@mercysystems.com.', 'error');
        if (res.code === 410) return show(res.j.error || 'Please check your email for your key.', 'error');
        if (res.code === 429) return show('Too many requests. Please wait a few minutes and reload this page.', 'error');
        show((res.j && res.j.error) || 'We could not find this purchase. Please check your email or email danny@mercysystems.com.', 'error');
      })
      .catch(function () {
        if (attempts < MAX_ATTEMPTS) return setTimeout(poll, 3000);
        show('Network problem. Your key will also arrive by email.', 'error');
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      show('This page needs a checkout reference. If you just paid, your key has been emailed to you.', 'error');
      return;
    }
    poll();
  });
})();
