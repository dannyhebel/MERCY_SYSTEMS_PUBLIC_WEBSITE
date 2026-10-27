/* Any Video to 4K page links: the ONE place to edit them.
 * Empty string = not ready yet. The page then keeps its safe fallback:
 *   - Subscribe buttons email danny@mercysystems.com (SUBSCRIBE_FALLBACK_URL);
 *   - every other link shows a small "Coming soon" tag and does nothing.
 * No secret keys ever go in this file: it is public. A Stripe Payment Link
 * (https://buy.stripe.com/...) is a public URL and is safe to paste here.
 *
 * NOTE: The Stripe Payment Link below will be activated in the Dashboard
 * right after this page is pushed live. Until then it may return inactive.
 */
window.ANY2K_LINKS = {
  // Stripe Payment Link for "$4.99/month for UNLIMITED 4K videos".
  STRIPE_CHECKOUT_URL: 'https://buy.stripe.com/5kQfZggFBacC0rT1Rnak000',
  SUBSCRIBE_FALLBACK_URL: 'mailto:danny@mercysystems.com?subject=Subscribe%20to%20Any%20Video%20to%204K',

  // Direct downloads from the public GitHub Release any2k-v1.1.0.
  ANDROID_DOWNLOAD_URL: 'https://github.com/dannyhebel/MERCY_SYSTEMS_PUBLIC_WEBSITE/releases/download/any2k-v1.1.0/Any-Video-to-4K-1.1.0-Android.apk',
  WINDOWS_DOWNLOAD_URL: 'https://github.com/dannyhebel/MERCY_SYSTEMS_PUBLIC_WEBSITE/releases/download/any2k-v1.1.0/Any-Video-to-4K-1.1.0-Setup-x64.exe',

  // Stripe customer portal login (account-wide; cancellation enabled at period end).
  MANAGE_SUBSCRIPTION_URL: 'https://billing.stripe.com/p/login/5kQfZggFBacC0rT1Rnak000',

  PRIVACY_URL: '/4k/privacy.html',
  TERMS_URL: '/4k/terms.html',

  // GPL source for bundled FFmpeg/x264 (public release tag — never the private app repo).
  SOURCE_CODE_URL: 'https://github.com/dannyhebel/MERCY_SYSTEMS_PUBLIC_WEBSITE/releases/tag/any2k-v1.1.0'
};
