/* Trial form: POST /api/trial {email, agreed}. The key is delivered by email only. */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('trial-form');
    if (!form) return;
    var email = form.querySelector('input[name="email"]');
    var agree = form.querySelector('input[name="agree"]');
    var status = form.querySelector('.status');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      status.className = 'status'; status.textContent = '';
      if (!email.value || !email.checkValidity()) { status.className = 'status error'; status.textContent = 'Please enter a valid email address.'; email.focus(); return; }
      if (!agree.checked) { status.className = 'status error'; status.textContent = 'Please tick "I agree to the License Agreement" to start your trial.'; agree.focus(); return; }
      button.disabled = true;
      status.textContent = 'Sending...';
      fetch('/api/trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value.trim(), agreed: true }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, code: r.status, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            status.className = 'status ok';
            status.textContent = res.j.message || 'Check your inbox: your trial key is on its way.';
            form.reset();
            return;
          }
          button.disabled = false;
          status.className = 'status error';
          status.textContent = res.code === 429 ? 'Too many requests. Please try again later.' : (res.j.error || 'Something went wrong. Please try again.');
        })
        .catch(function () { button.disabled = false; status.className = 'status error'; status.textContent = 'Network problem. Please try again.'; });
    });
  });
})();
