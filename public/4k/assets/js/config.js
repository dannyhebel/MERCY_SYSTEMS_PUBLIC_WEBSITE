/* Any Video to 4K page links: the ONE place to edit them.
 * Empty string = not ready yet. The page then keeps its safe fallback:
 *   - Subscribe buttons email danny@mercysystems.com (SUBSCRIBE_FALLBACK_URL);
 *   - every other link shows a small "Coming soon" tag and does nothing.
 * No secret keys ever go in this file: it is public. A Stripe Payment Link
 * (https://buy.stripe.com/...) is a public URL and is safe to paste here.
 *
 * NOTE: The Payment Link below exists (plink_1UUxblBfrlpQFrU7JwVkft1d) but is
 * currently INACTIVE in Stripe until unlock-key fulfillment is deployed.
 * After go-live: reactivate it in Stripe Dashboard, then push this page.
 */
window.ANY2K_LINKS = {
  // Stripe Payment Link for "$4.99/month for UNLIMITED 4K videos" (inactive until go-live).
  STRIPE_CHECKOUT_URL: 'https://buy.stripe.com/5kQfZggFBacC0rT1Rnak000',
  SUBSCRIBE_FALLBACK_URL: 'mailto:danny@mercysystems.com?subject=Subscribe%20to%20Any%20Video%20to%204K',

  // TODO(downloads): public download URLs (for example a GitHub Release on a PUBLIC repo, or DigitalOcean Spaces).
  ANDROID_DOWNLOAD_URL: '',
  WINDOWS_DOWNLOAD_URL: '',

  // Stripe customer portal login (account-wide; cancellation enabled at period end).
  MANAGE_SUBSCRIPTION_URL: 'https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000',

  // TODO(legal): Any Video to 4K Privacy Policy and Terms pages.
  PRIVACY_URL: '',
  TERMS_URL: '',

  // TODO(source): PUBLIC GPL source code location. Never the private repository.
  SOURCE_CODE_URL: ''
};
