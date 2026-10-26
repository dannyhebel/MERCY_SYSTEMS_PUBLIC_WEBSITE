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

  // After Stripe Payment Link success redirect: /4k/?subscribed=1
  try {
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('subscribed') === '1') {
      var banner = document.querySelector('[data-subscribed-banner]');
      if (banner) {
        banner.hidden = false;
        banner.setAttribute('tabindex', '-1');
        banner.focus({ preventScroll: true });
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  } catch (e) { /* ignore */ }
})();
