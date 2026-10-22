/* Buy page: preselect the plan from the URL, e.g. buy?trial=<id>&plan=monthly|annual|perpetual */
(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    var plan = new URLSearchParams(window.location.search).get('plan');
    if (['monthly', 'annual', 'perpetual'].indexOf(plan) >= 0) {
      var r = document.querySelector('input[name="plan"][value="' + plan + '"]');
      if (r) r.checked = true;
    }
  });
})();
