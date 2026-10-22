/*
 * AMCDT website settings - the one place to edit what the pages display.
 *
 * PRICES (locked by the owner): Monthly $59/month, Annual $590/year,
 * One-time $1,490. Each purchase = one license (one seat).
 * The amount actually CHARGED is set by the three Prices on the "AMCDT"
 * product in Stripe; keep these display values identical to them.
 * (The HTML pages also contain these prices as plain text so they show even
 *  without JavaScript; if prices ever change, update the pages too:
 *  grep -rn '\$59\|\$590\|1,490' site/)
 */
window.AMCDT_CONFIG = {
  priceMonthly: '$59',
  priceAnnual: '$590',
  pricePerpetual: '$1,490',

  // Downloadable package - replace before going live
  productVersion: '1.0.0',                     // e.g. "1.0.0" -> amcdt_1.0.0_amd64.deb
  debSha256: '917f220139532f0f9fe4782013ff5309f4d8eec1bf9d196b9bf0f81b6a03395d',                // output of: sha256sum amcdt_1.0.0_amd64.deb
  systemRequirements: '64-bit Intel/AMD PC running Ubuntu 22.04 or newer, or Debian 12 or newer; about 270 MB of disk space (53 MB download); a web browser (Chrome or Chromium for PDF export)', // e.g. "Ubuntu 22.04/24.04 or Debian 12, 64-bit (amd64), 8 GB RAM"

  // Must match LICENSE_AGREEMENT_VERSION in the server .env and the agreement text.
  licenseAgreementVersion: '1.0',

  trialDays: 14,

  // Optional: Stripe no-code customer portal login link (https://billing.stripe.com/p/login/...).
  // When set, manage.html also offers "sign in with your email". Same value as STRIPE_PORTAL_LOGIN_URL.
  portalLoginUrl: 'https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000'
};
