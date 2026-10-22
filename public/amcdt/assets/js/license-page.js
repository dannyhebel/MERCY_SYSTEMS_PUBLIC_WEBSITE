/* Renders the plain-text License Agreement inside the page (the .txt link works without JavaScript too). */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var box = document.getElementById('agreement');
    if (!box) return;
    fetch(box.getAttribute('data-src'), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
      .then(function (t) { box.textContent = t; box.removeAttribute('aria-busy'); })
      .catch(function () { box.textContent = 'The agreement could not be displayed here. Please use the link above to open the text file.'; box.removeAttribute('aria-busy'); });
  });
})();
