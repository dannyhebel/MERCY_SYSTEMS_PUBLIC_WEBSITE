/* Any Video to 4K page links: the ONE place to edit them.
 * Empty string = not ready yet. The page then keeps its safe fallback:
 *   - Subscribe buttons email danny@mercysystems.com (SUBSCRIBE_FALLBACK_URL);
 *   - every other link shows a small "Coming soon" tag and does nothing.
 * No secret keys ever go in this file: it is public. A Stripe Payment Link
 * (https://buy.stripe.com/...) is a public URL and is safe to paste here.
 */
window.ANY2K_LINKS = {
  // TODO(Stripe): paste the Stripe Payment Link / Checkout URL for "$4.99/month for UNLIMITED 4K videos".
  STRIPE_CHECKOUT_URL: '',
  SUBSCRIBE_FALLBACK_URL: 'mailto:danny@mercysystems.com?subject=Subscribe%20to%20Any%20Video%20to%204K',

  // TODO(downloads): public download URLs (for example a GitHub Release on a PUBLIC repo, or DigitalOcean Spaces).
  ANDROID_DOWNLOAD_URL: '',
  WINDOWS_DOWNLOAD_URL: '',

  // TODO(Stripe): Stripe customer portal login link (https://billing.stripe.com/p/login/...).
  MANAGE_SUBSCRIPTION_URL: '',

  // TODO(legal): Any Video to 4K Privacy Policy and Terms pages.
  PRIVACY_URL: '',
  TERMS_URL: '',

  // TODO(source): PUBLIC GPL source code location. Never the private repository.
  SOURCE_CODE_URL: ''
};
