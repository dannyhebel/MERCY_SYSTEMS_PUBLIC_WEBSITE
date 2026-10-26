'use strict';
(function () {
  var L = window.ANY2K_LINKS || {};
  // Subscribe buttons: Stripe when set, otherwise the email fallback already in the HTML.
  var checkout = (L.STRIPE_CHECKOUT_URL || '').trim();
  document.querySelectorAll('[data-subscribe]').forEach(function (a) {
    a.href = checkout || L.SUBSCRIBE_FALLBACK_URL || a.getAttribute('href');
  });
  // Placeholder links: real URL when set, otherwise a visible "Coming soon" tag.
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var url = (L[a.getAttribute('data-link')] || '').trim();
    if (url) {
      a.href = url;
      a.classList.remove('is-todo');
      a.removeAttribute('aria-disabled');
    } else {
      a.classList.add('is-todo');
      a.setAttribute('aria-disabled', 'true');
      a.removeAttribute('href');
    }
  });
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
